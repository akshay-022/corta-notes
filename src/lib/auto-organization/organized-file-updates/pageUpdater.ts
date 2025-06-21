import { createClient } from '@/lib/supabase/supabase-client'
import { ContentProcessor } from '@/lib/auto-organization/organized-file-updates/helpers/contentProcessor'
import { ensureMetadataMarkedOrganized } from '@/lib/auto-organization/organized-file-updates/helpers/organized-file-metadata'
import logger from '@/lib/logger'
import { Page } from '@/lib/supabase/types'
import { postFileHistoryUpdate, FileHistoryItem } from '@/components/left-sidebar/fileHistoryUtils'

export interface OrganizedChunk {
  targetFilePath: string // e.g. "/Projects/AI Journal"
  content: string // refined text to insert
}

interface ApplyResult {
  created: string[] // page UUIDs
  updated: string[] // page UUIDs
}

const contentProcessor = new ContentProcessor()

/** Ensure the full folder hierarchy exists and return the page representing the final file */
async function ensurePageForPath(userId: string, filePath: string, supabase: any) {
  const segments = filePath.replace(/^\/+/, '').split('/')
  let parentUuid: string | null = null
  let currentPage: Page | null = null

  // iterate through segments
  for (let i = 0; i < segments.length; i++) {
    const title = segments[i]
    const isLast = i === segments.length - 1
    const type = isLast ? 'file' : 'folder'

    // Look up existing
    let query = supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title)
      .eq('type', type)
      .eq('is_deleted', false)

    query = parentUuid ? query.eq('parent_uuid', parentUuid) : query.is('parent_uuid', null)

    const { data: existingData, error } = await query.maybeSingle()

    const existing = existingData as Page | null

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (existing) {
      currentPage = existing
      parentUuid = existing.uuid
    } else {
      // create
      const insertObj: Partial<Page> = {
        title,
        type,
        parent_uuid: parentUuid,
        user_id: userId,
        organized: true,
        content: type === 'file' ? contentProcessor.createTipTapContent('') : null,
        content_text: '',
        visible: true,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data: newPageData, error: insertErr } = await supabase
        .from('pages')
        .insert(insertObj)
        .select()
        .single()

      const newPage = newPageData as Page

      if (insertErr) throw insertErr

      currentPage = newPage
      parentUuid = newPage.uuid
      logger.info('Created new page/folder', { title, type, uuid: newPage.uuid })
    }
  }

  return currentPage
}

export async function applyOrganizationChunks(chunks: OrganizedChunk[]): Promise<ApplyResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) {
    logger.error('applyOrganizationChunks: no authenticated user')
    return { created: [], updated: [] }
  }

  const created: FileHistoryItem[] = []
  const updated: FileHistoryItem[] = []

  for (const chunk of chunks) {
    try {
      const page = await ensurePageForPath(user.id, chunk.targetFilePath, supabase)
      if (!page) continue

      const isNewFile = page.content_text === ''

      let newContentJSON: any
      let newContentText: string

      if (isNewFile) {
        newContentJSON = contentProcessor.createTipTapContent(chunk.content)
        newContentText = chunk.content
      } else {
        // Get organization rules from page metadata
        const pageMetadata = page.metadata as any
        const organizationRules = pageMetadata?.organizationRules || ''
        
        newContentJSON = await contentProcessor.smartMergeTipTapContent(page.content, chunk.content, page.uuid, organizationRules)
        newContentText = (page.content_text || '') + '\n\n' + chunk.content
      }

      // Mark all content as organized after processing
      if (newContentJSON?.content) {
        newContentJSON.content = ensureMetadataMarkedOrganized(newContentJSON.content, page.uuid)
        logger.info('Applied ensureMetadataMarkedOrganized to content', { 
          pageUuid: page.uuid, 
          nodeCount: newContentJSON.content.length 
        })
      }

      const { error: upErr } = await supabase
        .from('pages')
        .update({
          content: newContentJSON,
          content_text: newContentText,
          updated_at: new Date().toISOString(),
        })
        .eq('uuid', page.uuid)

      if (upErr) throw upErr

      if (isNewFile) {
        created.push({ uuid: page.uuid, title: page.title, action: 'created', timestamp: Date.now() })
      } else {
        updated.push({ uuid: page.uuid, title: page.title, action: 'updated', timestamp: Date.now() })
      }

      logger.info('Updated page with organized chunk', {
        pageUuid: page.uuid,
        targetFilePath: chunk.targetFilePath,
        isNewFile,
      })
    } catch (err) {
      logger.error('Failed to apply chunk', { chunk, err })
    }
  }

  // Broadcast to sidebar UI
  if (created.length) postFileHistoryUpdate(created)
  if (updated.length) postFileHistoryUpdate(updated)

  return {
    created: created.map((c) => c.uuid),
    updated: updated.map((u) => u.uuid),
  }
} 