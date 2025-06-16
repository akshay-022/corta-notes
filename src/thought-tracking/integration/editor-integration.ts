import { Editor } from '@tiptap/react'
import { ThoughtTracker, SupabaseStorageManager, EVENTS } from '../index'
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

    // Content tracking with stable snapshots
    let stableContent = editor.getJSON()
    let lastUpdateTime = Date.now()

    const trackContentChanges = async () => {
      const currentContent = editor.getJSON()

      // Find which specific paragraph changed
      const changedParagraph = findChangedParagraph(stableContent, currentContent)
      
      if (changedParagraph) {
        try {
          await tracker.trackEdit({
            paragraphId: `${pageUuid}-para-${changedParagraph.index}`,
            pageId: pageUuid,
            content: changedParagraph.content, // Only this paragraph's content  
            editType: changedParagraph.editType,
            metadata: {
              wordCount: changedParagraph.content.split(/\s+/).filter(word => word.length > 0).length,
              charCount: changedParagraph.content.length
            }
          })

          console.log(`🧠 Tracked ${changedParagraph.editType} for paragraph ${changedParagraph.index}:`, changedParagraph.content.substring(0, 50))

        } catch (error) {
          console.error('Error tracking thought changes:', error)
        }
      }

      // Update stable content snapshot
      stableContent = currentContent
      lastUpdateTime = Date.now()
    }

    // Helper function to find which specific paragraph changed
    const findChangedParagraph = (oldContent: any, newContent: any) => {
      const oldParagraphs = extractParagraphs(oldContent)
      const newParagraphs = extractParagraphs(newContent)
      
      const maxLength = Math.max(oldParagraphs.length, newParagraphs.length)
      
      // Find first changed paragraph
      for (let i = 0; i < maxLength; i++) {
        const oldPara = oldParagraphs[i] || ''
        const newPara = newParagraphs[i] || ''
        
        if (oldPara !== newPara) {
          let editType: 'create' | 'update' | 'delete'
          
          if (oldPara === '' && newPara !== '') {
            editType = 'create'
          } else if (newPara === '') {
            editType = 'delete'
          } else {
            editType = 'update'
          }
          
          return {
            index: i,
            content: newPara, // Empty string for delete
            editType
          }
        }
      }
      
      return null // No changes found
    }

    // Helper function to extract paragraphs
    const extractParagraphs = (content: any): string[] => {
      if (!content?.content) return []
      
      return content.content.map((node: any) => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          return node.content?.map((textNode: any) => textNode.text || '').join('').trim() || ''
        }
        return ''
      }).filter((para: string, index: number, arr: string[]) => 
        // Keep all paragraphs including empty ones to maintain position indexing
        index < arr.length
      )
    }

    // Set up debounced change tracking
    let changeTimeout: NodeJS.Timeout
    let quickChangeTimeout: NodeJS.Timeout
    
    const debouncedTrackChanges = () => {
      // Clear any existing timeouts
      clearTimeout(changeTimeout)
      clearTimeout(quickChangeTimeout)
      
      // Quick check for rapid changes (don't track these)
      quickChangeTimeout = setTimeout(() => {
        // Only set the main timeout if user is still editing
        changeTimeout = setTimeout(trackContentChanges, 2000) // 2 seconds for content changes
      }, 500) // 500ms quick debounce to avoid tracking rapid keystrokes
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
      window.addEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete)
      window.addEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError)
    }

    console.log('🧠 Thought tracking setup complete for page:', pageUuid)

    // Return cleanup function
    return () => {
      clearTimeout(changeTimeout)
      clearTimeout(quickChangeTimeout)
      editor.off('update', debouncedTrackChanges)
      editorTrackers.delete(pageUuid)
      
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete)
        window.removeEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError)
      }
    }

  } catch (error) {
    console.error('Failed to setup thought tracking:', error)
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