import { Editor } from '@tiptap/react'
import { ThoughtTracker, SupabaseStorageManager, EVENTS } from '../index'
import { createClient } from '@/lib/supabase/supabase-client'
import { Page } from '@/lib/supabase/types'
import { 
  convertParagraphNumberToPosition, 
  setParagraphMetadata, 
  getParagraphMetadata,
  ensureCurrentParagraphId,
  ParagraphMetadata 
} from '@/components/editor/paragraph-metadata'

// Store for editor instances and their trackers
const editorTrackers = new Map<string, ThoughtTracker>()

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
      '/api/organize-note'
    )

    await tracker.initialize()
    
    // Store tracker for this editor
    editorTrackers.set(pageUuid, tracker)

    // Content tracking with stable snapshots
    let stableContent = editor.getJSON()
    let lastUpdateTime = Date.now()
    let isTracking = false // Add flag to prevent concurrent tracking

    const trackContentChanges = async () => {
      // Prevent concurrent tracking
      if (isTracking) {
        console.log('🧠 Tracking already in progress, skipping...')
        return
      }

      isTracking = true
      
      try {
        const currentContent = editor.getJSON()

        // Find which specific paragraph changed
        const changedParagraph = findChangedParagraph(stableContent, currentContent)
        
        if (changedParagraph) {
          try {
            // Update paragraph metadata
            await updateParagraphMetadata(editor, changedParagraph)

            // Track the edit in thought tracking system
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

            console.log(`🧠 Tracked ${changedParagraph.editType} for paragraph ${changedParagraph.index}:`, {
              content: changedParagraph.content.substring(0, 50) + (changedParagraph.content.length > 50 ? '...' : ''),
              pageUuid,
              paragraphId: `${pageUuid}-para-${changedParagraph.index}`,
              timestamp: new Date().toISOString()
            })

          } catch (error) {
            console.error('Error tracking thought changes:', error)
          }
        }

        // Update stable content snapshot
        stableContent = currentContent
        lastUpdateTime = Date.now()
      } finally {
        isTracking = false
      }
    }

    // Helper function to update paragraph metadata
    const updateParagraphMetadata = async (editor: Editor, changedParagraph: any) => {
      try {
        // Get the position of the changed paragraph
        const position = convertParagraphNumberToPosition(editor, changedParagraph.index)
        
        if (position > 0) {
          // Check if paragraph already has an ID
          const existingMetadata = getParagraphMetadata(editor, position)
          
          // Create metadata update
          const metadata: Partial<ParagraphMetadata> = {
            lastUpdated: new Date().toISOString(),
            organizationStatus: 'no', // Reset to unorganized when content changes
            isOrganized: false
          }
          
          // Only generate new ID if paragraph doesn't have one
          if (!existingMetadata?.id) {
            const randomHex = Math.random().toString(16).substring(2, 10) // 8 char hex
            const timestamp = Date.now() // raw timestamp 
            const paragraphId = `${pageUuid}-para-${timestamp}-${randomHex}`
            metadata.id = paragraphId
          }

          // Update the paragraph metadata
          const success = setParagraphMetadata(editor, position, metadata)
          
          if (success) {
            console.log(`📝 Updated metadata for paragraph ${changedParagraph.index}:`, {
              paragraphId: existingMetadata?.id || metadata.id || 'existing-id',
              editType: changedParagraph.editType,
              position
            })
          } else {
            console.warn(`📝 Failed to update metadata for paragraph ${changedParagraph.index}`)
          }
        }
      } catch (error) {
        console.error('Error updating paragraph metadata:', error)
      }
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
      })
      // Note: We keep all paragraphs including empty ones to maintain position indexing
      // This is important for tracking which specific paragraph changed
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
        changeTimeout = setTimeout(trackContentChanges, 500) // 2 seconds for content changes
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