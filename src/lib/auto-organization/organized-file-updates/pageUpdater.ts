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
async function ensurePageForPath(userId: string, filePath: string, supabase: any): Promise<{ page: Page | null, wasCreated: boolean }> {
  logger.info('🔍 ensurePageForPath called', { filePath })
  
  const segments = filePath.replace(/^\/+/, '').split('/')
  let parentUuid: string | null = null
  let currentPage: Page | null = null
  let wasCreated = false

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

    if (parentUuid) {
      query = query.eq('parent_uuid', parentUuid)
    } else {
      query = query.is('parent_uuid', null)
    }

    const { data: existing } = await query.single()

    if (existing) {
      logger.info(`📁 Found existing ${type}`, { title, uuid: existing.uuid.substring(0, 8) })
      currentPage = existing
      parentUuid = existing.uuid
    } else {
      // Create new page/folder
      const newPage: Partial<Page> = {
        user_id: userId,
        title,
        type,
        parent_uuid: parentUuid,
        organized: true,
        content: isLast ? { type: 'doc', content: [] } : null,
        content_text: isLast ? '' : null,
      }

      const { data: created, error } = await supabase
        .from('pages')
        .insert(newPage)
        .select()
        .single()

      if (error) {
        logger.error(`🚨 Failed to create ${type}`, { title, error })
        return { page: null, wasCreated: false }
      }

      logger.info(`🆕 Creating new ${type}`, { title, uuid: (created as Page).uuid.substring(0, 8) })
      currentPage = created as Page
      parentUuid = (created as Page).uuid
      
      // Mark as created if this is the final file
      if (isLast) {
        wasCreated = true
      }
    }
  }

  return { page: currentPage, wasCreated }
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
      const { page, wasCreated } = await ensurePageForPath(user.id, chunk.targetFilePath, supabase)
      if (!page) continue

      const isNewFile = wasCreated

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
        created.push({ uuid: page.uuid, title: page.title, action: 'created', timestamp: Date.now(), path: chunk.targetFilePath })
      } else {
        updated.push({ uuid: page.uuid, title: page.title, action: 'updated', timestamp: Date.now(), path: chunk.targetFilePath })
      }

      logger.info('📝 Processing organization chunk', {
        targetPath: chunk.targetFilePath,
        pageUuid: page.uuid.substring(0, 8),
        pageTitle: page.title,
        isNewFile: wasCreated,
        chunkContentLength: chunk.content.length
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