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
      '/api/organize-note',
      user.id
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

        // Set IDs for block-level nodes that don't have them yet
        setNewParagraphIds(editor, pageUuid)

        // Find which specific paragraphs changed using actual node metadata
        const changedParagraphs = findChangedParagraphsWithMetadata(stableContent, currentContent, editor)
        
        for (const changedParagraph of changedParagraphs) {
          try {
            // Track the edit in thought tracking system using actual paragraph metadata
            await tracker.trackEdit({
              paragraphId: changedParagraph.paragraphMetadata?.id || `${pageUuid}-fallback-${Date.now()}`,
              pageId: pageUuid,
              content: changedParagraph.content,
              editType: changedParagraph.editType,
              paragraphMetadata: changedParagraph.paragraphMetadata || undefined,
              metadata: {
                wordCount: changedParagraph.content.split(/\s+/).filter(word => word.length > 0).length,
                charCount: changedParagraph.content.length,
                position: changedParagraph.position
              }
            })

            console.log(`🧠 Tracked ${changedParagraph.editType} for paragraph:`, {
              content: changedParagraph.content.substring(0, 50) + (changedParagraph.content.length > 50 ? '...' : ''),
              pageUuid,
              paragraphId: changedParagraph.paragraphMetadata?.id,
              position: changedParagraph.position,
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

    // Helper function to get paragraph metadata similar to getSelectedParagraphMetadata
    const getParagraphMetadataFromEditor = (editor: Editor, targetContent: string): {
      metadata: ParagraphMetadata | null;
      position: number;
    } | null => {
      let result: { metadata: ParagraphMetadata | null; position: number } | null = null;
      
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && node.textContent === targetContent) {
          result = {
            metadata: node.attrs?.metadata || null,
            position: pos
          };
          return false; // Stop traversal
        }
      });
      
      return result;
    };

    // Helper function to find changed paragraphs using actual metadata
    const findChangedParagraphsWithMetadata = (oldContent: any, newContent: any, editor: Editor) => {
      const changes: Array<{
        paragraphMetadata: ParagraphMetadata | null;
        content: string;
        editType: 'create' | 'update' | 'delete';
        position: number;
      }> = []

      // Extract paragraph content for comparison
      const oldParagraphs = extractParagraphsFromContent(oldContent)
      const newParagraphs = extractParagraphsFromContent(newContent)

      // Find paragraphs that have changed
      const maxLength = Math.max(oldParagraphs.length, newParagraphs.length)
      
      for (let i = 0; i < maxLength; i++) {
        const oldPara = oldParagraphs[i] || ''
        const newPara = newParagraphs[i] || ''
        
        if (oldPara !== newPara) {
          let editType: 'create' | 'update' | 'delete'
          let contentToUse = newPara
          
          if (oldPara === '' && newPara !== '') {
            editType = 'create'
          } else if (newPara === '') {
            editType = 'delete'
            contentToUse = oldPara // Use old content for delete operations
          } else {
            editType = 'update'
          }
          
          // Get metadata for this paragraph from the editor
          const paragraphInfo = getParagraphMetadataFromEditor(editor, contentToUse)
          
          if (paragraphInfo || editType === 'delete') {
            changes.push({
              paragraphMetadata: paragraphInfo?.metadata || null,
              content: newPara, // Always use new content (empty for delete)
              editType,
              position: paragraphInfo?.position || 0
            })
          }
        }
      }
      
      return changes
    }

    // Helper function to extract paragraphs from content JSON
    const extractParagraphsFromContent = (content: any): string[] => {
      if (!content?.content) return []
      
      return content.content.map((node: any) => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          return node.content?.map((textNode: any) => textNode.text || '').join('').trim() || ''
        }
        return ''
      })
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
        changeTimeout = setTimeout(trackContentChanges, 500) // 500ms for content changes
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