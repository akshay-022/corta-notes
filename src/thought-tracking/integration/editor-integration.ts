import { Editor } from '@tiptap/react'
import { ThoughtTracker, SupabaseStorageManager } from '../index'
import { createClient } from '@/lib/supabase/supabase-client'
import { Page } from '@/lib/supabase/types'

// Store for editor instances and their trackers
const editorTrackers = new Map<string, ThoughtTracker>()

export async function setupThoughtTracking(
  editor: Editor,
  pageUuid: string,
  allPages: Page[] = [],
  pageRefreshCallback?: () => Promise<void>
) {
  try {
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
      '/api/organize'
    )

    await tracker.initialize()
    
    // Store tracker for this editor
    editorTrackers.set(pageUuid, tracker)

    // Set up content change tracking
    let lastContent = editor.getJSON()
    let lastTextContent = editor.getText()

    const trackChanges = async () => {
      const currentContent = editor.getJSON()
      const currentTextContent = editor.getText()

      // Check if content actually changed
      if (JSON.stringify(currentContent) !== JSON.stringify(lastContent)) {
        try {
          // Extract paragraph-level changes
          const paragraphChanges = extractParagraphChanges(
            lastContent,
            currentContent,
            lastTextContent,
            currentTextContent
          )

          // Track each paragraph change
          for (const change of paragraphChanges) {
            await tracker.trackEdit({
              paragraphId: change.paragraphId,
              pageId: pageUuid,
              content: change.content,
              editType: change.editType,
              previousContent: change.previousContent,
              metadata: {
                wordCount: change.content.split(/\s+/).length,
                charCount: change.content.length
              }
            })
          }

          // Update last content
          lastContent = currentContent
          lastTextContent = currentTextContent

        } catch (error) {
          console.error('Error tracking thought changes:', error)
        }
      }
    }

    // Set up debounced change tracking
    let changeTimeout: NodeJS.Timeout
    const debouncedTrackChanges = () => {
      clearTimeout(changeTimeout)
      changeTimeout = setTimeout(trackChanges, 2000) // Track changes after 2 seconds of inactivity
    }

    // Listen to editor updates
    editor.on('update', debouncedTrackChanges)

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
      window.addEventListener('thought-tracking:organization-complete', handleOrganizationComplete)
      window.addEventListener('thought-tracking:organization-error', handleOrganizationError)
    }

    console.log('🧠 Thought tracking setup complete for page:', pageUuid)

    // Return cleanup function
    return () => {
      clearTimeout(changeTimeout)
      editor.off('update', debouncedTrackChanges)
      editorTrackers.delete(pageUuid)
      
      if (typeof window !== 'undefined') {
        window.removeEventListener('thought-tracking:organization-complete', handleOrganizationComplete)
        window.removeEventListener('thought-tracking:organization-error', handleOrganizationError)
      }
    }

  } catch (error) {
    console.error('Failed to setup thought tracking:', error)
  }
}

// Extract paragraph-level changes from TipTap content
function extractParagraphChanges(
  oldContent: any,
  newContent: any,
  oldText: string,
  newText: string
) {
  const changes: Array<{
    paragraphId: string
    content: string
    editType: 'create' | 'update' | 'delete'
    previousContent?: string
  }> = []

  // Simple text-based change detection
  if (oldText !== newText) {
    // For now, treat the entire content as one paragraph change
    // You could make this more sophisticated by comparing individual paragraphs
    const paragraphId = `content-main-${Date.now()}`
    
    if (oldText === '' && newText !== '') {
      // New content created
      changes.push({
        paragraphId,
        content: newText,
        editType: 'create'
      })
    } else if (oldText !== '' && newText === '') {
      // Content deleted
      changes.push({
        paragraphId,
        content: '',
        editType: 'delete',
        previousContent: oldText
      })
    } else {
      // Content updated
      changes.push({
        paragraphId,
        content: newText,
        editType: 'update',
        previousContent: oldText
      })
    }
  }

  return changes
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