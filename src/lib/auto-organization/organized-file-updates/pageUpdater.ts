import { createClient } from '@/lib/supabase/supabase-client'
import { ContentProcessor } from '@/lib/auto-organization/organized-file-updates/helpers/contentProcessor'
import { ensureMetadataMarkedOrganized } from '@/lib/auto-organization/organized-file-updates/helpers/organized-file-metadata'
import logger from '@/lib/logger'
import { Page } from '@/lib/supabase/types'
import { 
  postFileHistoryUpdate, 
  FileHistoryItem, 
  postEnhancedFileUpdate,
  createEnhancedFileHistoryItem 
} from '@/components/left-sidebar/fileHistoryUtils'
import { addEnhancedHistoryItem } from './reverting-files'

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

  logger.info('📂 Path parsing details', {
    originalPath: filePath,
    segments,
    segmentCount: segments.length,
    lastSegmentWillBe: segments.length > 0 ? 'file' : 'unknown'
  })

  // iterate through segments
  for (let i = 0; i < segments.length; i++) {
    const title = segments[i]
    const isLast = i === segments.length - 1
    const type = isLast ? 'file' : 'folder'

    logger.info(`🔍 Looking for existing ${type}`, {
      segmentIndex: i,
      title,
      type,
      isLast,
      parentUuid: parentUuid?.substring(0, 8) || 'root'
    })

    // Look up existing - first try exact match, then case-insensitive
    let query = supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title)
      .eq('type', type)
      .eq('organized', true)
      .eq('is_deleted', false)

    if (parentUuid) {
      query = query.eq('parent_uuid', parentUuid)
    } else {
      query = query.is('parent_uuid', null)
    }

    let { data: exactResults, error: exactError } = await query

    let existing = null
    
    if (exactResults && exactResults.length > 0) {
      existing = exactResults[0] // Take the first exact match
      if (exactResults.length > 1) {
        logger.warn(`⚠️ Found ${exactResults.length} exact matches for "${title}", using first one`, {
          title,
          type,
          foundTitles: exactResults.map((r: any) => ({ title: r.title, uuid: r.uuid.substring(0, 8) }))
        })
      } else {
        logger.info(`✅ Found exact match for "${title}"`, {
          title,
          uuid: existing.uuid.substring(0, 8)
        })
      }
    } else {
      // If exact match failed, try case-insensitive search
      logger.info(`🔍 No exact match for "${title}", trying case-insensitive search`)
      
      let caseInsensitiveQuery = supabase
        .from('pages')
        .select('*')
        .eq('user_id', userId)
        .ilike('title', title) // Case-insensitive LIKE
        .eq('type', type)
        .eq('organized', true)
        .eq('is_deleted', false)

      if (parentUuid) {
        caseInsensitiveQuery = caseInsensitiveQuery.eq('parent_uuid', parentUuid)
      } else {
        caseInsensitiveQuery = caseInsensitiveQuery.is('parent_uuid', null)
      }

      const { data: caseInsensitiveResults } = await caseInsensitiveQuery
      
      if (caseInsensitiveResults && caseInsensitiveResults.length > 0) {
        existing = caseInsensitiveResults[0] // Take the first match
        if (caseInsensitiveResults.length > 1) {
          logger.warn(`⚠️ Found ${caseInsensitiveResults.length} case-insensitive matches for "${title}", using first one`, {
            searchedFor: title,
                         foundTitles: caseInsensitiveResults.map((r: any) => ({ title: r.title, uuid: r.uuid.substring(0, 8) }))
          })
        } else {
          logger.info(`✅ Found case-insensitive match`, {
            searchedFor: title,
            foundTitle: existing.title,
            uuid: existing.uuid.substring(0, 8)
          })
        }
      }
    }

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

export async function applyOrganizationChunks(
  chunks: OrganizedChunk[],
  supabaseParam?: any,
  userIdParam?: string
): Promise<ApplyResult> {
  const supabase = supabaseParam ?? createClient()

  let userId = userIdParam
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id
  }

  if (!userId) {
    logger.error('applyOrganizationChunks: no authenticated user')
    return { created: [], updated: [] }
  }

  logger.info('🚀 Starting parallel processing of organization chunks', {
    chunkCount: chunks.length,
    chunks: chunks.map(c => ({ path: c.targetFilePath, contentLength: c.content.length }))
  })

  // Process all chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      logger.info('📦 Starting chunk processing', {
        targetPath: chunk.targetFilePath,
        contentFirst100: chunk.content.substring(0, 100),
        contentLength: chunk.content.length
      })
      
      try {
        const { page, wasCreated } = await ensurePageForPath(userId!, chunk.targetFilePath, supabase)
        if (!page) return null
        
        logger.info('📄 ensurePageForPath result', {
          pageUuid: page.uuid.substring(0,8),
          pageTitle: page.title,
          wasCreated
        })

        const isNewFile = wasCreated

        console.log('🎯 === ORGANIZATION CHUNK PROCESSING ===')
        console.log('🎯 Chunk processing context:', {
          targetFilePath: chunk.targetFilePath,
          pageUuid: page.uuid.substring(0, 8),
          pageTitle: page.title,
          isNewFile,
          wasCreated,
          chunkContentLength: chunk.content.length,
          chunkContentPreview: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : '')
        })

        console.log('🎯 Existing page content analysis:', {
          hasPageContent: !!page.content,
          pageContentType: typeof page.content,
          pageContentHasContent: !!(page.content as any)?.content,
          pageContentLength: (page.content as any)?.content?.length,
          pageContentText: page.content_text?.substring(0, 200) + (page.content_text && page.content_text.length > 200 ? '...' : '')
        })

        let newContentJSON: any
        let newContentText: string

        // Get organization rules from page metadata (may be undefined for brand-new page)
        const pageMetadata = page.metadata as any
        const organizationRules = pageMetadata?.organizationRules || ''

        console.log('🎯 Organization rules:', {
          hasPageMetadata: !!pageMetadata,
          hasOrganizationRules: !!organizationRules,
          organizationRulesLength: organizationRules.length
        })

        // Capture old content for revert functionality
        const oldContent = page.content
        const oldContentText = page.content_text || ''

        if (isNewFile) {
          console.log('🎯 === NEW FILE PATH ===')
          // For brand-new files call smartMerge too (existing content may be empty)
          const baseContent = page.content || { type: 'doc', content: [] }
          console.log('🎯 Base content for new file:', {
            baseContentType: typeof baseContent,
            baseContentHasContent: !!(baseContent as any).content,
            baseContentLength: (baseContent as any).content?.length
          })
          
          newContentJSON = await contentProcessor.smartMergeTipTapContent(baseContent, chunk.content, page.uuid, organizationRules, page.title)
          newContentText = chunk.content
          
          console.log('🎯 New file processing result:', {
            newContentJSONType: typeof newContentJSON,
            newContentJSONHasContent: !!newContentJSON?.content,
            newContentJSONLength: newContentJSON?.content?.length,
            newContentTextLength: newContentText.length
          })
        } else {
          console.log('🎯 === EXISTING FILE PATH ===')
          console.log('🎯 About to call smartMergeTipTapContent with:', {
            existingContentType: typeof page.content,
            existingContentHasContent: !!(page.content as any)?.content,
            existingContentLength: (page.content as any)?.content?.length,
            newChunkLength: chunk.content.length
          })
          
          newContentJSON = await contentProcessor.smartMergeTipTapContent(page.content, chunk.content, page.uuid, organizationRules, page.title)
          newContentText = (page.content_text || '') + '\n\n' + chunk.content
          
          console.log('🎯 Existing file processing result:', {
            newContentJSONType: typeof newContentJSON,
            newContentJSONHasContent: !!newContentJSON?.content,
            newContentJSONLength: newContentJSON?.content?.length,
            newContentTextLength: newContentText.length
          })
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

        // Create enhanced history items with revert capability
        const enhancedHistoryItem = createEnhancedFileHistoryItem(
          page.uuid,
          page.title,
          isNewFile ? 'created' : 'updated',
          oldContent,
          newContentJSON,
          oldContentText,
          newContentText,
          chunk.targetFilePath
        )

        // Save to localStorage for revert functionality
        addEnhancedHistoryItem(enhancedHistoryItem)

        logger.info('📝 Processing organization chunk', {
          targetPath: chunk.targetFilePath,
          pageUuid: page.uuid.substring(0, 8),
          pageTitle: page.title,
          isNewFile: wasCreated,
          chunkContentLength: chunk.content.length
        })
        logger.info('✅ Finished chunk processing', {
          pageUuid: page.uuid.substring(0,8),
          action: wasCreated ? 'created' : 'updated'
        })

        return {
          historyItem: { 
            uuid: page.uuid, 
            title: page.title, 
            action: isNewFile ? 'created' as const : 'updated' as const, 
            timestamp: Date.now(), 
            path: chunk.targetFilePath 
          },
          isNewFile
        }
      } catch (err) {
        logger.error('Failed to apply chunk', { chunk, err })
        return null
      }
    })
  )

  // Filter out null results and separate created/updated
  const successfulResults = chunkResults.filter(result => result !== null)
  const created: FileHistoryItem[] = []
  const updated: FileHistoryItem[] = []

  successfulResults.forEach(result => {
    if (result!.isNewFile) {
      created.push(result!.historyItem)
    } else {
      updated.push(result!.historyItem)
    }
  })

  logger.info('🎉 Parallel processing complete', {
    totalChunks: chunks.length,
    successfulChunks: successfulResults.length,
    createdCount: created.length,
    updatedCount: updated.length
  })

  // Broadcast to sidebar UI
  if (created.length) postFileHistoryUpdate(created)
  if (updated.length) postFileHistoryUpdate(updated)

  return {
    created: created.map((c) => c.uuid),
    updated: updated.map((u) => u.uuid),
  }
} 