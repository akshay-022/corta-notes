import { Editor } from '@tiptap/react'
import { ThoughtTracker, SupabaseStorageManager, EVENTS } from '../index'
import { createClient } from '@/lib/supabase/supabase-client'
import { Page } from '@/lib/supabase/types'
import { 
  setNewParagraphIds,
  ParagraphMetadata
} from '@/components/editor/paragraph-metadata'

// Store for editor instances and their trackers
const editorTrackers = new Map<string, ThoughtTracker>()
const lineContentCache = new Map<string, Map<string, string>>() // pageUuid -> lineId -> lastContent

export async function setupThoughtTracking(
  editor: Editor,
  pageUuid: string,
  allPages: Page[] = [],
  pageRefreshCallback?: () => Promise<void>
) {
  try {
    // Check if tracker already exists for this page and clean it up
    const existingTracker = editorTrackers.get(pageUuid)
    if (existingTracker) {
      console.log('🧠 Cleaning up existing tracker for page:', pageUuid)
      existingTracker.dispose()
      editorTrackers.delete(pageUuid)
    }

    // Initialize line content cache for this page
    if (!lineContentCache.has(pageUuid)) {
      lineContentCache.set(pageUuid, new Map())
    }

    // Get current user ID
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user?.id) {
      console.warn('No authenticated user found for thought tracking')
      return
    }

    // Create storage manager and tracker
    const storageManager = new SupabaseStorageManager(supabase, user.id)
    const tracker = new ThoughtTracker(
      storageManager,
      '/api/summarize',
      '/api/organize-note',
      user.id
    )

    await tracker.initialize()
    
    // Store tracker for this editor
    editorTrackers.set(pageUuid, tracker)

    // Initialize line cache with current content
    await initializeLineCache(editor, pageUuid)

    // Set up real-time line tracking without debouncing
    const trackLineChanges = async () => {
      try {
        // Set IDs for block-level nodes that don't have them yet
        setNewParagraphIds(editor, pageUuid)

        // Track changes for each line with metadata
        await trackAllLinesInEditor(editor, pageUuid, tracker)
      } catch (error) {
        console.error('Error tracking line changes:', error)
      }
    }

    // Listen to editor updates - immediate tracking
    editor.on('update', trackLineChanges)

    // Listen for organization events
    const handleOrganizationComplete = async (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('🧠 Organization completed:', customEvent.detail)
      
      // Refresh pages if callback provided
      if (pageRefreshCallback) {
        await pageRefreshCallback()
      }
    }

    const handleOrganizationError = (event: Event) => {
      const customEvent = event as CustomEvent
      console.error('🧠 Organization failed:', customEvent.detail.error)
    }

    // Add event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete)
      window.addEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError)
    }

    console.log('🧠 Line-based thought tracking setup complete for page:', pageUuid)

    // Return cleanup function
    return () => {
      editor.off('update', trackLineChanges)
      editorTrackers.delete(pageUuid)
      lineContentCache.delete(pageUuid)
      
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete)
        window.removeEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError)
      }
    }

  } catch (error) {
    console.error('Failed to setup thought tracking:', error)
  }
}

/**
 * Initialize the line cache with current editor content
 */
async function initializeLineCache(editor: Editor, pageUuid: string): Promise<void> {
  const pageCache = lineContentCache.get(pageUuid)
  if (!pageCache) return

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.attrs?.metadata?.id) {
      const lineId = node.attrs.metadata.id
      const content = node.textContent || ''
      pageCache.set(lineId, content)
    }
  })

  console.log('🧠 Initialized line cache with', pageCache.size, 'lines for page:', pageUuid)
}

/**
 * Track all lines in the editor using the line mapping system
 */
async function trackAllLinesInEditor(editor: Editor, pageUuid: string, tracker: ThoughtTracker): Promise<void> {
  const pageCache = lineContentCache.get(pageUuid)
  if (!pageCache) return

  const currentLines = new Map<string, { content: string; metadata: ParagraphMetadata; position: number }>()
  
  // Collect current state of all lines
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.attrs?.metadata?.id) {
      const lineId = node.attrs.metadata.id
      const content = node.textContent || ''
      const metadata = node.attrs.metadata
      
      currentLines.set(lineId, { content, metadata, position: pos })
    }
  })

  // Check for changes, deletions, and new lines
  const linesToUpdate: Array<{
    lineId: string;
    content: string;
    editType: 'create' | 'update' | 'delete';
    metadata: ParagraphMetadata;
    position: number;
  }> = []

  // Check for new or updated lines
  for (const [lineId, { content, metadata, position }] of currentLines) {
    const cachedContent = pageCache.get(lineId)
    
    if (cachedContent === undefined) {
      // New line
      linesToUpdate.push({
        lineId,
        content,
        editType: 'create',
        metadata,
        position
      })
      pageCache.set(lineId, content)
    } else if (cachedContent !== content) {
      // Updated line
      linesToUpdate.push({
        lineId,
        content,
        editType: 'update',
        metadata,
        position
      })
      pageCache.set(lineId, content)
    }
  }

  // Check for deleted lines
  for (const [lineId, cachedContent] of pageCache) {
    if (!currentLines.has(lineId)) {
      // Line was deleted
      linesToUpdate.push({
        lineId,
        content: '', // Empty content for deleted lines
        editType: 'delete',
        metadata: { id: lineId }, // Minimal metadata for deleted lines
        position: 0
      })
      pageCache.delete(lineId)
    }
  }

  // Process all line updates using the new line mapping system
  for (const lineUpdate of linesToUpdate) {
    try {
             // Use the new line mapping system directly
       await tracker.updateLine({
         lineId: lineUpdate.lineId,
         pageId: pageUuid,
         content: lineUpdate.content,
         editType: lineUpdate.editType,
         metadata: {
           wordCount: lineUpdate.content.split(/\s+/).filter(word => word.length > 0).length,
           charCount: lineUpdate.content.length,
           position: lineUpdate.position
         },
         paragraphMetadata: lineUpdate.metadata
       })

      console.log(`🧠 Tracked ${lineUpdate.editType} for line:`, {
        lineId: lineUpdate.lineId,
        contentPreview: lineUpdate.content.substring(0, 50) + (lineUpdate.content.length > 50 ? '...' : ''),
        pageUuid,
        position: lineUpdate.position,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Error tracking line update:', error)
    }
  }
}

// Get tracker for a specific page
export function getTrackerForPage(pageUuid: string): ThoughtTracker | undefined {
  return editorTrackers.get(pageUuid)
}

// Manually trigger organization for current page
export async function triggerOrganizationForPage(pageUuid: string): Promise<void> {
  const tracker = editorTrackers.get(pageUuid)
  if (tracker) {
    await tracker.triggerManualOrganization()
  } else {
    console.warn('No tracker found for page:', pageUuid)
  }
}

// Get thought tracking stats for current page
export async function getThoughtTrackingStats(pageUuid: string) {
  const tracker = editorTrackers.get(pageUuid)
  if (tracker) {
    return await tracker.getStats()
  }
  return null
}

// Get line history for debugging
export async function getLineHistory(pageUuid: string, lineId: string) {
  const tracker = editorTrackers.get(pageUuid)
  if (tracker) {
    return await tracker.getLineHistory(lineId)
  }
  return []
}

// Get all lines for a page
export async function getPageLines(pageUuid: string) {
  const tracker = editorTrackers.get(pageUuid)
  if (tracker) {
    return await tracker.getLinesByPage(pageUuid)
  }
  return []
} 