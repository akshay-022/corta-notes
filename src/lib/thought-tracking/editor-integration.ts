/**
 * Enhanced TipTap editor integration with 1:1 brain state synchronization
 */

import { Editor } from '@tiptap/core'
import { 
  processThought, 
  getBrainState, 
  syncPageWithBrainState,
  getThoughtsForPage,
  deleteThought,
  updateThought,
  getThoughtById,
  organizeThoughts,
  getUnorganizedThoughtsForPage,
  getOrganizationStats,
  updateOrganizationContext,
  configureAutoOrganization,
  getAutoOrganizationConfig,
  debugBrainState,
  testAddThought
} from './brain-state'
import { 
  updateParagraphMetadata, 
  getPositionParagraphNumber
} from './paragraph-metadata'
import { DEFAULT_AUTO_ORGANIZATION_CONFIG } from './constants'

let isThoughtTrackingEnabled = false
let isProcessingThoughts = false // Prevent infinite loops
export let isUpdatingMetadata = false // Prevent metadata update loops - exported for use in metadata functions
let metadataDebounceTimer: NodeJS.Timeout | null = null // For paragraph metadata updates
let syncTimer: NodeJS.Timeout | null = null // For content synchronization
let currentPageUuid: string | undefined
let lastEditorContent: string = '' // Track content changes
let isPageChanging = false // Prevent sync during page changes
let pageRefreshCallback: (() => Promise<void>) | undefined // Page refresh callback

// Export function to set metadata flag
export function setUpdatingMetadata(value: boolean) {
  isUpdatingMetadata = value
}

/**
 * Configure page refresh callback for editor integration
 */
export function configurePageRefresh(callback: () => Promise<void>): void {
  pageRefreshCallback = callback
  console.log('🔄 Page refresh callback configured for editor integration')
}

/**
 * Update the current page UUID for thought tracking
 */
export function updateCurrentPageUuid(pageUuid?: string, fileTree?: any[]): void {
  // Set page changing flag to prevent sync during transition
  isPageChanging = true
  
  // Clear any pending sync timers
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  
  currentPageUuid = pageUuid
  console.log('🧠 Updated current page UUID:', pageUuid)
  
  // Update organization context
  if (pageUuid) {
    updateOrganizationContext(pageUuid, fileTree)
    console.log('🗂️ Updated organization context for page:', pageUuid)
  }
  
  // Reset page changing flag after a short delay
  setTimeout(() => {
    isPageChanging = false
    console.log('🧠 Page change complete, sync re-enabled')
  }, 1000) // Give 1 second for page transition to complete
}

/**
 * Setup thought tracking on a TipTap editor with enhanced synchronization
 */
export function setupThoughtTracking(
  editor: Editor, 
  pageUuid?: string, 
  fileTree?: any[], 
  pageRefreshCallback?: () => Promise<void>
): void {
  console.log('🧠 setupThoughtTracking called with:', {
    hasEditor: !!editor,
    pageUuid,
    hasFileTree: !!fileTree,
    fileTreeLength: fileTree?.length,
    hasPageRefreshCallback: !!pageRefreshCallback
  })
  
  isThoughtTrackingEnabled = true
  currentPageUuid = pageUuid
  lastEditorContent = editor.getText()
  isPageChanging = false // Ensure page changing flag is reset
  
  // Configure page refresh callback if provided
  if (pageRefreshCallback) {
    configurePageRefresh(pageRefreshCallback)
  }
  
  // Configure auto-organization if we have the required context
  if (pageUuid && fileTree) {
    updateOrganizationContext(pageUuid, fileTree)
    configureAutoOrganization({
      ...DEFAULT_AUTO_ORGANIZATION_CONFIG,
      currentPageUuid: pageUuid,
      fileTree: fileTree,
      organizationCallback: async (fileTree: any[], instructions?: string) => {
        // Use organizeCurrentPageThoughts which updates the actual pages
        return await organizeCurrentPageThoughts(fileTree, instructions)
      },
      pageRefreshCallback: pageRefreshCallback // Add page refresh callback to brain state config
    })
    console.log('🗂️ Auto-organization configured for page:', pageUuid)
  } else {
    console.log('🗂️ Auto-organization NOT configured - missing pageUuid or fileTree:', {
      hasPageUuid: !!pageUuid,
      hasFileTree: !!fileTree,
      fileTreeLength: fileTree?.length
    })
  }
  
  // Track latest paragraph for optimization and context
  let latestParagraphChunk: { content: string, position: number } | null = null
  
  editor.on('update', ({ editor, transaction }) => {
    if (!isThoughtTrackingEnabled || isProcessingThoughts || isUpdatingMetadata || isPageChanging) return
    
    // Only process if there are actual content changes (user is typing)
    if (!transaction.docChanged) return
    
    const currentContent = editor.getText()
    
    // Only sync if content has actually changed from last known state
    if (currentContent === lastEditorContent) return
    
    // DISABLED: Automatic syncing to prevent accidental deletion of thoughts
    // The sync function was too aggressive and deleted thoughts when users were typing
    // Manual sync can still be triggered via forceSyncEditorWithBrainState()
    console.log('🔄 Auto-sync disabled - use manual sync if needed')
    lastEditorContent = currentContent
    
    // Removed double-enter detection - no longer needed
    
    // === PARAGRAPH METADATA SYSTEM ===
    
    // Debounced metadata updates (500ms) - only when user is actually typing
    if (metadataDebounceTimer) clearTimeout(metadataDebounceTimer)
    metadataDebounceTimer = setTimeout(() => {
      updateCurrentParagraphMetadata(editor)
    }, 500)

    // Detect Enter press / new paragraph creation
    const isEnterPressed = transaction.steps.some((step: any) => {
      // Check for exact Enter press signature: insertion that splits paragraph into 2
      return step.from === step.to &&                    // Insertion (not replacement)
             step.structure === true &&                  // Structural change
             step.slice?.content?.childCount === 2
    })

    
    if (isEnterPressed) {
      console.log('🔍 Enter detected - updating previous paragraph metadata and processing thought')
      updateCurrentParagraphMetadata(editor, true)
      
      // Process the previous paragraph content as a thought (the one that was just completed)
      processPreviousParagraph(editor)
    }

  })
  
  // Handle editor destruction - disabled final sync to prevent data loss
  editor.on('destroy', () => {
    console.log('🔄 Editor destroyed - auto-sync disabled to prevent data loss')
  })
  
  console.log('🧠 Enhanced thought tracking enabled with 1:1 synchronization')
}

/**
 * Sync editor content with brain state - handles deletions and updates
 * Only operates on thoughts that belong to the current page
 * ULTRA-CONSERVATIVE: Only deletes thoughts when we're absolutely certain they've been removed
 */
function syncEditorWithBrainState(editor: Editor, currentContent: string): void {
  if (!currentPageUuid || isPageChanging) {
    console.log('🔄 Skipping sync - no page UUID or page is changing')
    return
  }
  
  console.log('🔄 Syncing editor with brain state for page:', currentPageUuid)
  
  // Get current thoughts for this specific page only
  const existingThoughts = getThoughtsForPage(currentPageUuid)
  
  // If no thoughts exist for this page, nothing to sync
  if (existingThoughts.length === 0) {
    console.log('🔄 No existing thoughts for this page, skipping sync')
    return
  }
  
  // ULTRA-CONSERVATIVE APPROACH: Only sync if we're absolutely certain
  // Skip sync entirely if:
  // 1. Content is too short (likely page load)
  // 2. Content is too different from last known state
  // 3. Too many thoughts would be affected
  
  const contentSimilarity = calculateSimilarity(lastEditorContent, currentContent)
  
  if (currentContent.trim().length < 10) {
    console.log('🔄 Content too short, skipping sync to prevent data loss')
    return
  }
  
  if (contentSimilarity < 0.5) {
    console.log('🔄 Content too different from last known state, skipping sync to prevent data loss')
    console.log('🔄 Similarity:', contentSimilarity, 'Last content length:', lastEditorContent.length, 'Current length:', currentContent.length)
    return
  }
  
  // Split content into non-empty lines
  const currentLines = currentContent.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  
  // Only consider deletion if we have a substantial amount of content
  if (currentLines.length < 2) {
    console.log('🔄 Too few content lines, skipping deletion to prevent data loss')
    return
  }
  
  // Find thoughts that MIGHT no longer exist in editor content
  const thoughtsToConsiderForDeletion = existingThoughts.filter(thought => {
    const thoughtContent = thought.content.trim()
    return thought.pageUuid === currentPageUuid && 
           !currentLines.some(line => {
             // Check for exact match OR high similarity
             return line === thoughtContent || calculateSimilarity(line, thoughtContent) > 0.8
           })
  })
  
  // ULTRA-CONSERVATIVE: Only delete if very few thoughts are affected
  // This prevents accidental mass deletion
  if (thoughtsToConsiderForDeletion.length > 1 || thoughtsToConsiderForDeletion.length > existingThoughts.length * 0.2) {
    console.log('🔄 Too many thoughts would be deleted (' + thoughtsToConsiderForDeletion.length + '/' + existingThoughts.length + '), skipping deletion to prevent data loss')
    return
  }
  
  // Only delete if we're absolutely certain
  // Additional check: make sure the thought isn't just partially edited
  const thoughtsToDelete = thoughtsToConsiderForDeletion.filter(thought => {
    const thoughtContent = thought.content.trim()
    // Don't delete if any current line is similar to this thought
    return !currentLines.some(line => calculateSimilarity(line, thoughtContent) > 0.6)
  })
  
  // Delete thoughts that are definitely no longer in editor
  thoughtsToDelete.forEach(thought => {
    console.log('🗑️ Deleting thought confirmed not in editor (page: ' + currentPageUuid + '):', thought.content.substring(0, 30) + '...')
    deleteThought(thought.id)
    
    // Also update paragraph metadata if it has a thoughtId
    updateParagraphsWithThoughtId(editor, thought.id, { status: 'unprocessed', thoughtId: undefined })
  })
  
  // Find content that might have been updated (only for current page thoughts)
  const existingContents = existingThoughts
    .filter(t => t.pageUuid === currentPageUuid)
    .map(t => t.content.trim())
  const newLines = currentLines.filter(line => !existingContents.includes(line))
  
  // Check for potential updates (lines that are similar but not exact matches)
  existingThoughts
    .filter(thought => thought.pageUuid === currentPageUuid && !thoughtsToDelete.includes(thought))
    .forEach(thought => {
      const thoughtContent = thought.content.trim()
      if (!currentLines.includes(thoughtContent)) {
        // This thought might have been updated - find the most similar line
        const similarLine = findMostSimilarLine(thoughtContent, newLines)
        if (similarLine && calculateSimilarity(thoughtContent, similarLine) > 0.8) {
          console.log('📝 Updating thought content (page: ' + currentPageUuid + '):', {
            old: thoughtContent.substring(0, 30) + '...',
            new: similarLine.substring(0, 30) + '...'
          })
          updateThought(thought.id, similarLine)
          
          // Remove from newLines since it's been matched
          const index = newLines.indexOf(similarLine)
          if (index > -1) newLines.splice(index, 1)
        }
      }
    })
  
  console.log(`🔄 Sync complete for page ${currentPageUuid}: deleted ${thoughtsToDelete.length} thoughts, found ${newLines.length} new lines`)
}

/**
 * Find the most similar line to a given text
 */
function findMostSimilarLine(target: string, lines: string[]): string | null {
  if (lines.length === 0) return null
  
  let bestMatch = lines[0]
  let bestSimilarity = calculateSimilarity(target, bestMatch)
  
  for (let i = 1; i < lines.length; i++) {
    const similarity = calculateSimilarity(target, lines[i])
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = lines[i]
    }
  }
  
  return bestMatch
}

/**
 * Calculate similarity between two strings (simple Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * Update paragraphs that have a specific thoughtId
 */
function updateParagraphsWithThoughtId(editor: Editor, thoughtId: string, updates: any): void {
  setUpdatingMetadata(true)
  
  // Use ProseMirror transaction directly to avoid cursor movement
  const tr = editor.state.tr
  let hasChanges = false
  
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.attrs.thoughtId === thoughtId) {
      const newAttrs = { ...node.attrs, ...updates }
      tr.setNodeMarkup(pos, undefined, newAttrs)
      hasChanges = true
    }
  })
  
  if (hasChanges) {
    editor.view.dispatch(tr)
  }
  
  setTimeout(() => setUpdatingMetadata(false), 0)
}

/**
 * Check for double-enter pattern (debounced)
 */
// Removed checkForDoubleEnter function - no longer needed

/**
 * Process the current paragraph
 */
export function processCurrentParagraph(editor: Editor): void {
  // Get the current paragraph content, not the entire editor text
  let currentText = ''
  let { from } = editor.state.selection
  
  // Find the current paragraph content
  editor.state.doc.descendants((node, pos) => {
    if (pos <= from && from <= pos + node.nodeSize) {
      // This is the node containing the cursor
      currentText = node.textContent.trim()
      return false // Stop searching
    }
  })
  
  console.log('🧠 Processing current paragraph:', currentText.substring(0, 50) + (currentText.length > 50 ? '...' : ''))
  
  // Only process if we have meaningful content
  if (currentText && currentText.length > 5) {
    // Process the thought
    processThought(currentText, currentPageUuid)
      .then(() => {
        console.log('🧠 ✅ Paragraph processed successfully')
      })
      .catch(error => {
        console.error('🧠 ❌ Error processing paragraph:', error)
      })
  } else {
    console.log('🧠 ⚠️ Skipping paragraph processing - content too short or empty')
  }
}

/**
 * Process the previous paragraph (used when Enter is pressed to complete a thought)
 */
export function processPreviousParagraph(editor: Editor): void {
  let previousText = ''
  let { from } = editor.state.selection
  let foundPrevious = false
  
  // Find the previous paragraph content
  editor.state.doc.descendants((node, pos) => {
    if (foundPrevious || node.type.name !== 'paragraph') return
    
    // Check if this paragraph is before the current cursor position
    if (pos + node.nodeSize < from) {
      // This is a paragraph before the cursor, keep tracking it as potential previous
      previousText = node.textContent.trim()
    } else if (pos >= from) {
      // We've reached the current position, so we have the previous paragraph
      foundPrevious = true
      return false // Stop searching
    }
  })
  
  console.log('🧠 Processing previous paragraph (Enter pressed):', previousText.substring(0, 50) + (previousText.length > 50 ? '...' : ''))
  
  // Only process if we have meaningful content
  if (previousText && previousText.length > 5) {
    // Process the thought
    processThought(previousText, currentPageUuid)
      .then(() => {
        console.log('🧠 ✅ Previous paragraph processed successfully')
      })
      .catch(error => {
        console.error('🧠 ❌ Error processing previous paragraph:', error)
      })
  } else {
    console.log('🧠 ⚠️ Skipping previous paragraph processing - content too short or empty')
  }
}

/**
 * Get current editor state for debugging
 */
export function getEditorDebugInfo(editor: Editor) {
  return {
    text: editor.getText(),
    selection: editor.state.selection,
    thoughtTrackingEnabled: isThoughtTrackingEnabled,
    pageUuid: currentPageUuid,
    brainStateStats: getBrainState()
  }
}

/**
 * Update current paragraph's metadata with timestamp
 */
function updateCurrentParagraphMetadata(editor: Editor, isEnterJustPressed: boolean = false): void {
  try {
    let { from } = editor.state.selection

    if (isEnterJustPressed) {
      from = from - 1
    }


    // Get current paragraph content to check if it's worth tracking
    let paragraphText = ''
    let paragraphNode: any = null
    let currentParagraphNumber = 0
    
    // Find the current node and its number (counting ALL node types)
    editor.state.doc.descendants((node, pos) => {
      if (pos <= from) {
        // This node is at or before the cursor position
        if (pos === from || (from >= pos && from <= pos + node.nodeSize)) {
          // This is the node containing the cursor
          paragraphText = node.textContent.trim()
          paragraphNode = node
          return false // Stop searching
        }
        currentParagraphNumber++ // Count ALL nodes
      }
    })
    
    console.log('📝 Current paragraph detection', { 
      cursorPosition: from, 
      paragraphNumber: currentParagraphNumber, 
      paragraphText: paragraphText.substring(0, 50) + '...' 
    })
    
    // Only update metadata for non-empty paragraphs
    if (paragraphText.length > 0) {
      // Check if this paragraph is linked to a thought
      const thoughtId = paragraphNode?.attrs?.thoughtId
      if (thoughtId) {
        const thought = getThoughtById(thoughtId)
        if (thought && thought.content !== paragraphText) {
          // Content has changed - update the thought
          console.log('📝 Paragraph content changed, updating thought:', thoughtId)
          updateThought(thoughtId, paragraphText)
        }
      }
      
      updateParagraphMetadata(editor, currentParagraphNumber, {
        lastUpdated: new Date(),
        status: 'unprocessed', // Mark as unprocessed when edited
        contentHash: generateSimpleHash(paragraphText)
      })
      console.log('📝 Paragraph metadata updated for paragraph #' + currentParagraphNumber + ':', paragraphText.substring(0, 30) + '...')
    }
  } catch (error) {
    console.error('❌ Error updating paragraph metadata:', error)
  }
}

/**
 * Generate simple hash for content change detection
 */
function generateSimpleHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

// Removed processUnorganizedChunks and groupParagraphsIntoChunks - no longer needed 

/**
 * Force sync editor with brain state (for manual triggers)
 */
export function forceSyncEditorWithBrainState(editor: Editor): void {
  if (currentPageUuid) {
    syncEditorWithBrainState(editor, editor.getText())
  }
}

/**
 * Test function to debug auto-organization
 * Call this from browser console: window.testAutoOrganization()
 */
export function testAutoOrganization() {
  console.log('🧪 Testing Auto-Organization Debug Info...')
  
  const debugInfo = getAutoOrganizationDebugInfo()
  console.log('Debug Info:', debugInfo)
  
  if (!currentPageUuid) {
    console.log('❌ No current page UUID - cannot test auto-organization')
    return
  }
  
  console.log('🧪 Current page UUID:', currentPageUuid)
  console.log('🧪 Organization callback configured:', !!debugInfo.organizationConfig.hasCallback)
  
  if (debugInfo.organizationConfig.hasCallback) {
    console.log('✅ Auto-organization is properly configured to use organizeCurrentPageThoughts')
    console.log('🧪 This means organized thoughts will update actual pages/notes')
  } else {
    console.log('⚠️ Auto-organization will use fallback organizeThoughts (brain state only)')
  }
  
  console.log('🧪 To test auto-organization, you need to:')
  console.log('1. Make sure file tree is available')
  console.log('2. Call enableAutoOrganization(fileTree) with your file tree')
  console.log('3. Create some thoughts by typing in the editor')
}

/**
 * Organize unorganized thoughts for the current page
 */
export async function organizeCurrentPageThoughts(
  fileTree: any[], 
  organizationInstructions?: string
): Promise<{ success: boolean; organizedCount: number; error?: string; changedPaths?: string[] }> {
  if (!currentPageUuid) {
    return { success: false, organizedCount: 0, error: 'No current page UUID' }
  }
  
  console.log('🗂️ Organizing thoughts for current page:', currentPageUuid)
  
  try {
    const result = await organizeThoughts(currentPageUuid, fileTree, organizationInstructions)
    
    if (result.success && result.organizedCount > 0) {
      console.log(`🗂️ ✅ Successfully organized ${result.organizedCount} thoughts`)
      
      // Trigger page refresh if callback is available
      if (pageRefreshCallback) {
        console.log('🔄 Triggering page refresh after thought organization...')
        try {
          await pageRefreshCallback()
          console.log('🔄 ✅ Page refresh completed')
        } catch (error) {
          console.error('🔄 ❌ Page refresh failed:', error)
        }
      } else {
        console.warn('🔄 ⚠️ No page refresh callback configured - pages may not reflect changes')
      }
    }
    
    return result
  } catch (error) {
    console.error('❌ Error organizing current page thoughts:', error)
    return { 
      success: false, 
      organizedCount: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Get organization info for current page
 */
export function getCurrentPageOrganizationInfo() {
  if (!currentPageUuid) {
    return { unorganizedCount: 0, totalCount: 0, organizationRate: 0 }
  }
  
  const unorganizedThoughts = getUnorganizedThoughtsForPage(currentPageUuid)
  const allThoughts = getThoughtsForPage(currentPageUuid)
  
  return {
    unorganizedCount: unorganizedThoughts.length,
    totalCount: allThoughts.length,
    organizationRate: allThoughts.length > 0 ? ((allThoughts.length - unorganizedThoughts.length) / allThoughts.length) * 100 : 0
  }
}

/**
 * Get debug info about auto-organization status
 */
export function getAutoOrganizationDebugInfo() {
  const orgStats = getOrganizationStats()
  const pageInfo = getCurrentPageOrganizationInfo()
  const orgConfig = getAutoOrganizationConfig()
  
  return {
    currentPageUuid,
    isThoughtTrackingEnabled,
    pageInfo,
    globalStats: orgStats,
    organizationConfig: orgConfig,
    debugInfo: {
      hasCurrentPage: !!currentPageUuid,
      thoughtTrackingEnabled: isThoughtTrackingEnabled,
      isPageChanging,
      lastEditorContentLength: lastEditorContent.length
    }
  }
}

/**
 * Update the file tree context for organization
 */
export function updateFileTreeContext(fileTree: any[]): void {
  updateOrganizationContext(currentPageUuid, fileTree)
  console.log('🗂️ Updated file tree context:', { fileTreeLength: fileTree.length })
}

/**
 * Manually configure auto-organization with current context
 * Call this when file tree becomes available
 */
export function enableAutoOrganization(
  fileTree?: any[], 
  threshold: number = DEFAULT_AUTO_ORGANIZATION_CONFIG.threshold, 
  pageRefreshCallback?: () => Promise<void>
): void {
  if (!currentPageUuid) {
    console.log('🗂️ Cannot enable auto-organization: no current page UUID')
    return
  }
  
  if (!fileTree || fileTree.length === 0) {
    console.log('🗂️ Cannot enable auto-organization: no file tree provided')
    return
  }
  
  // Configure page refresh callback if provided
  if (pageRefreshCallback) {
    configurePageRefresh(pageRefreshCallback)
  }
  
  updateOrganizationContext(currentPageUuid, fileTree)
  configureAutoOrganization({
    ...DEFAULT_AUTO_ORGANIZATION_CONFIG,
    threshold: threshold,
    currentPageUuid: currentPageUuid,
    fileTree: fileTree,
    organizationCallback: async (fileTree: any[], instructions?: string) => {
      // Use organizeCurrentPageThoughts which updates the actual pages
      return await organizeCurrentPageThoughts(fileTree, instructions)
    },
    pageRefreshCallback: pageRefreshCallback || pageRefreshCallback // Use provided or existing callback
  })
  
  console.log('🗂️ ✅ Auto-organization manually enabled for page:', currentPageUuid, 'with', fileTree.length, 'file tree items')
}

/**
 * Auto-organize thoughts when certain conditions are met
 */
export async function autoOrganizeIfNeeded(
  editor: Editor, 
  fileTree: any[], 
  threshold: number = DEFAULT_AUTO_ORGANIZATION_CONFIG.threshold,
  pageRefreshCallback?: () => Promise<void>
): Promise<void> {
  if (!currentPageUuid) return
  
  // Configure page refresh callback if provided
  if (pageRefreshCallback) {
    configurePageRefresh(pageRefreshCallback)
  }
  
  // Update file tree context
  updateFileTreeContext(fileTree)
  
  const unorganizedThoughts = getUnorganizedThoughtsForPage(currentPageUuid)
  
  // Auto-organize if we have more than threshold unorganized thoughts
  if (unorganizedThoughts.length >= threshold) {
    console.log(`🗂️ Auto-organizing: ${unorganizedThoughts.length} unorganized thoughts found (threshold: ${threshold})`)
    
    const result = await organizeThoughts(
      currentPageUuid, 
      fileTree, 
      'Auto-organize these thoughts into appropriate categories and folders based on their content'
    )
    
    if (result.success) {
      console.log(`🗂️ ✅ Auto-organized ${result.organizedCount} thoughts`)
      
      // Trigger page refresh if callback is available
      if (pageRefreshCallback) {
        console.log('🔄 Triggering page refresh after auto-organization...')
        try {
          await pageRefreshCallback()
          console.log('🔄 ✅ Page refresh completed')
        } catch (error) {
          console.error('🔄 ❌ Page refresh failed:', error)
        }
      }
    } else {
      console.error('❌ Auto-organization failed:', result.error)
    }
  }
}

/**
 * Manually trigger page refresh
 */
export async function refreshPages(): Promise<void> {
  if (pageRefreshCallback) {
    console.log('🔄 Manually triggering page refresh...')
    try {
      await pageRefreshCallback()
      console.log('🔄 ✅ Manual page refresh completed')
    } catch (error) {
      console.error('🔄 ❌ Manual page refresh failed:', error)
    }
  } else {
    console.warn('🔄 ⚠️ No page refresh callback configured')
  }
}

/**
 * Get page refresh configuration status
 */
export function getPageRefreshStatus(): { configured: boolean; hasCallback: boolean } {
  return {
    configured: !!pageRefreshCallback,
    hasCallback: !!pageRefreshCallback
  }
}

/**
 * Debug function to test brain state from browser console
 * Usage: window.debugBrainState()
 */
export function debugBrainStateFromConsole(): void {
  console.log('🧠 === BRAIN STATE DEBUG (from console) ===')
  debugBrainState()
  
  console.log('🧠 Current page context:')
  console.log('🧠 - Current page UUID:', currentPageUuid)
  console.log('🧠 - Thought tracking enabled:', isThoughtTrackingEnabled)
  console.log('🧠 - Is processing thoughts:', isProcessingThoughts)
  console.log('🧠 - Is updating metadata:', isUpdatingMetadata)
  
  if (currentPageUuid) {
    const pageThoughts = getThoughtsForPage(currentPageUuid)
    const unorganizedThoughts = getUnorganizedThoughtsForPage(currentPageUuid)
    console.log('🧠 - Page thoughts:', pageThoughts.length)
    console.log('🧠 - Unorganized thoughts:', unorganizedThoughts.length)
  }
}

/**
 * Test adding a thought from browser console
 * Usage: window.testAddThoughtFromConsole("My test thought")
 */
export async function testAddThoughtFromConsole(content: string): Promise<void> {
  console.log('🧠 === TESTING THOUGHT FROM CONSOLE ===')
  
  if (!content || content.trim().length === 0) {
    console.error('🧠 ❌ Please provide content for the thought')
    return
  }
  
  try {
    await testAddThought(content, currentPageUuid)
    console.log('🧠 ✅ Test completed successfully!')
    
    // Show updated stats
    const stats = getBrainState()
    console.log('🧠 Updated brain state stats:')
    console.log('🧠 - Total thoughts:', Object.keys(stats.thoughtsById).length)
    console.log('🧠 - Total categories:', Object.keys(stats.categories).length)
    
  } catch (error) {
    console.error('🧠 ❌ Test failed:', error)
  }
}

/**
 * Test processing the current paragraph content (for debugging)
 * Usage: window.testProcessCurrentParagraph()
 */
export function testProcessCurrentParagraph(): void {
  console.log('🧠 === TESTING CURRENT PARAGRAPH PROCESSING ===')
  
  if (!currentPageUuid) {
    console.error('🧠 ❌ No current page UUID set')
    return
  }
  
  // Get some test content instead of relying on editor
  const testContent = "This is a test thought for debugging brain state processing"
  
  console.log('🧠 Test content:', testContent)
  console.log('🧠 Current page UUID:', currentPageUuid)
  
  processThought(testContent, currentPageUuid)
    .then(() => {
      console.log('🧠 ✅ Test processing completed')
      
      // Show results
      const brainState = getBrainState()
      console.log('🧠 Updated brain state:')
      console.log('🧠 - Total thoughts:', Object.keys(brainState.thoughtsById).length)
      console.log('🧠 - Total categories:', Object.keys(brainState.categories).length)
      console.log('🧠 - Page thoughts:', getThoughtsForPage(currentPageUuid!))
    })
    .catch(error => {
      console.error('🧠 ❌ Test processing failed:', error)
    })
}

// Make debug functions available globally for console access
if (typeof window !== 'undefined') {
  (window as any).debugBrainState = debugBrainStateFromConsole;
  (window as any).testAddThoughtFromConsole = testAddThoughtFromConsole;
  (window as any).testProcessCurrentParagraph = testProcessCurrentParagraph;
  (window as any).processCurrentParagraph = processCurrentParagraph;
  (window as any).processPreviousParagraph = processPreviousParagraph;
  (window as any).getBrainState = getBrainState;
  (window as any).testAutoOrganization = testAutoOrganization;
}



 