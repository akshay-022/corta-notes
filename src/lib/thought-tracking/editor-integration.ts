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
  getAutoOrganizationConfig
} from './brain-state'
import { 
  markParagraphAsProcessing, 
  markParagraphAsProcessed, 
  updateParagraphMetadata, 
  getUnprocessedParagraphs 
} from './paragraph-metadata'
import { DEFAULT_AUTO_ORGANIZATION_CONFIG } from './constants'

let isThoughtTrackingEnabled = false
let isProcessingThoughts = false // Prevent infinite loops
export let isUpdatingMetadata = false // Prevent metadata update loops - exported for use in metadata functions
let debounceTimer: NodeJS.Timeout | null = null
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
    
    // Debounced content synchronization (2000ms) - sync brain state with editor
    // Increased delay to prevent aggressive syncing
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      // Double-check we're not in a page change before syncing
      if (!isPageChanging && currentPageUuid) {
        syncEditorWithBrainState(editor, currentContent)
        lastEditorContent = currentContent
      }
    }, 2000)
    
    // Debounced double-enter detection (500ms)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      checkForDoubleEnter(editor)
    }, 500)
    
    // === PARAGRAPH METADATA SYSTEM ===
    
    // Debounced metadata updates (500ms) - only when user is actually typing
    if (metadataDebounceTimer) clearTimeout(metadataDebounceTimer)
    metadataDebounceTimer = setTimeout(() => {
      updateCurrentParagraphMetadata(editor)
      
      // Update latest paragraph tracking
      const { from } = editor.state.selection
      const fullTextContent = editor.getText()
      
      // Get current cursor position in the text
      const currentPosition = from
      
      // Find the paragraph by searching around cursor position
      let paragraphStart = fullTextContent.lastIndexOf('\n', currentPosition - 1)
      if (paragraphStart === -1) paragraphStart = 0
      else paragraphStart += 1 // Move past the \n
      
      let paragraphEnd = fullTextContent.indexOf('\n', currentPosition)
      if (paragraphEnd === -1) paragraphEnd = fullTextContent.length
      
      const paragraphText = fullTextContent.substring(paragraphStart, paragraphEnd).trim()
      
      if (paragraphText.length > 0) {
        latestParagraphChunk = { content: paragraphText, position: paragraphStart }
        console.log('📍 Latest paragraph updated:', paragraphText.substring(0, 30) + '...')
      }
    }, 500)
  })
  
  // Handle editor destruction - sync one final time
  editor.on('destroy', () => {
    if (currentPageUuid) {
      syncEditorWithBrainState(editor, editor.getText())
    }
  })
  
  console.log('🧠 Enhanced thought tracking enabled with 1:1 synchronization')
}

/**
 * Sync editor content with brain state - handles deletions and updates
 * Only operates on thoughts that belong to the current page
 * CONSERVATIVE: Only deletes thoughts when we're very confident they've been removed
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
  
  // Split content into non-empty lines
  const currentLines = currentContent.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  
  // CONSERVATIVE DELETION: Only delete if we're very sure
  // Check if the editor content is substantially different (not just a page load)
  const contentSimilarity = calculateSimilarity(lastEditorContent, currentContent)
  
  if (contentSimilarity < 0.3) {
    console.log('🔄 Content too different from last known state, skipping deletion to prevent data loss')
    console.log('🔄 Similarity:', contentSimilarity, 'Last content length:', lastEditorContent.length, 'Current length:', currentContent.length)
    return
  }
  
  // Find thoughts that no longer exist in editor content
  // Only delete thoughts that belong to the current page AND we're confident about
  const thoughtsToDelete = existingThoughts.filter(thought => {
    const thoughtContent = thought.content.trim()
    // Only consider for deletion if:
    // 1. The thought belongs to the current page
    // 2. It's not found in current content
    // 3. The content change seems intentional (not a page load)
    return thought.pageUuid === currentPageUuid && 
           !currentLines.some(line => line === thoughtContent) &&
           contentSimilarity > 0.5 // Only delete if content is reasonably similar to last state
  })
  
  // Only proceed with deletion if we found very few thoughts to delete
  // This prevents mass deletion during page loads
  if (thoughtsToDelete.length > Math.max(1, existingThoughts.length * 0.5)) {
    console.log('🔄 Too many thoughts would be deleted (' + thoughtsToDelete.length + '/' + existingThoughts.length + '), skipping to prevent data loss')
    return
  }
  
  // Delete thoughts that are no longer in editor (only for current page)
  thoughtsToDelete.forEach(thought => {
    console.log('🗑️ Deleting thought no longer in editor (page: ' + currentPageUuid + '):', thought.content.substring(0, 30) + '...')
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
    .filter(thought => thought.pageUuid === currentPageUuid)
    .forEach(thought => {
      const thoughtContent = thought.content.trim()
      if (!currentLines.includes(thoughtContent)) {
        // This thought might have been updated - find the most similar line
        const similarLine = findMostSimilarLine(thoughtContent, newLines)
        if (similarLine && calculateSimilarity(thoughtContent, similarLine) > 0.7) {
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
function checkForDoubleEnter(editor: Editor): void {
  try {
    const { from } = editor.state.selection
    let currentParagraphText = ''
    let previousParagraphText = ''
    
    // Get current paragraph
    editor.state.doc.nodesBetween(from, from, (node) => {
      if (node.type.name === 'paragraph') {
        currentParagraphText = node.textContent.trim()
        return false
      }
    })
    
    // Get previous paragraph
    let foundParagraphs: string[] = []
    editor.state.doc.nodesBetween(0, from, (node) => {
      if (node.type.name === 'paragraph') {
        foundParagraphs.push(node.textContent.trim())
      }
    })
    if (foundParagraphs.length >= 2) {
      previousParagraphText = foundParagraphs[foundParagraphs.length - 2]
    }
    
    // Double-enter detected: both current and previous paragraphs are empty
    if (currentParagraphText === '' && previousParagraphText === '') {
      console.log('🧠 Double-enter detected - processing unorganized paragraphs and organizing thoughts')
      processUnorganizedChunks(editor)
      
      // Also check if we should auto-organize thoughts
      // Note: This would need fileTree to be passed in, so we'll make it optional for now
      // In a real implementation, you'd want to pass fileTree through the setup or make it available globally
      console.log('🗂️ Double-enter detected - checking for auto-organization opportunity')
    }
  } catch (error) {
    console.error('❌ Error checking for double-enter:', error)
  }
}

/**
 * Process the current paragraph
 */
export function processCurrentParagraph(editor: Editor): void {
  const { from } = editor.state.selection
  const currentText = editor.getText()
  
  // Mark as processing
  markParagraphAsProcessing(editor, from)
  
  // Process the thought
  processThought(currentText, currentPageUuid)
    .then(() => {
      console.log('Paragraph processed successfully')
    })
    .catch(error => {
      console.error('Error processing paragraph:', error)
    })
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
function updateCurrentParagraphMetadata(editor: Editor): void {
  try {
    const { from } = editor.state.selection
    
    // Get current paragraph content to check if it's worth tracking
    let paragraphText = ''
    let paragraphNode: any = null
    editor.state.doc.nodesBetween(from, from, (node) => {
      if (node.type.name === 'paragraph') {
        paragraphText = node.textContent.trim()
        paragraphNode = node
        return false
      }
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
      
      updateParagraphMetadata(editor, from, {
        lastUpdated: new Date(),
        status: 'unprocessed', // Mark as unprocessed when edited
        contentHash: generateSimpleHash(paragraphText)
      })
      console.log('📝 Paragraph metadata updated:', paragraphText.substring(0, 30) + '...')
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

/**
 * Process unorganized paragraph chunks when double-enter is detected
 */
async function processUnorganizedChunks(editor: Editor): Promise<void> {
  try {
    console.log('📄 Double-enter detected - finding unorganized paragraph chunks...')
    
    // Get all unorganized paragraphs
    const unorganizedParagraphs = getUnprocessedParagraphs(editor)
    
    if (unorganizedParagraphs.length === 0) {
      console.log('📄 No unorganized paragraphs found')
      return
    }
    
    // Group consecutive paragraphs into chunks
    const chunks = groupParagraphsIntoChunks(editor, unorganizedParagraphs)
    
    console.log(`📄 Found ${chunks.length} unorganized chunks to process`)
    
    // Process each chunk
    for (const chunk of chunks) {
      // Combine chunk content into single text
      const chunkText = chunk.map(p => p.content).join('\n\n')
      
      console.log('📄 Processing chunk:', chunkText.substring(0, 50) + '...')
      console.log('📄 Chunk contains', chunk.length, 'paragraphs')
      
      // Mark all paragraphs in chunk as processing
      for (const paragraph of chunk) {
        markParagraphAsProcessing(editor, paragraph.position)
      }
      
      // Send chunk to AI for categorization
      await processThought(chunkText, currentPageUuid)
      
      // Mark paragraphs as processed and link to thoughts
      for (const paragraph of chunk) {
        // Find the thought that was just created for this content
        const pageThoughts = getThoughtsForPage(currentPageUuid || '')
        const matchingThought = pageThoughts.find(t => 
          t.content.includes(paragraph.content) || paragraph.content.includes(t.content)
        )
        
        if (matchingThought) {
          markParagraphAsProcessed(editor, paragraph.position, 'organized', matchingThought.id)
          
          // Link paragraph to thought without moving cursor using direct transaction
          setUpdatingMetadata(true)
          const tr = editor.state.tr
          const node = editor.state.doc.nodeAt(paragraph.position)
          if (node && node.type.name === 'paragraph') {
            const newAttrs = { ...node.attrs, thoughtId: matchingThought.id }
            tr.setNodeMarkup(paragraph.position, undefined, newAttrs)
            editor.view.dispatch(tr)
          }
          setTimeout(() => setUpdatingMetadata(false), 0)
        }
      }
      
      console.log('📄 ✅ Chunk processed successfully')
    }
    
    console.log('📄 ✅ All unorganized chunks processed')
    
  } catch (error) {
    console.error('❌ Error processing unorganized chunks:', error)
  }
}

/**
 * Group consecutive unorganized paragraphs into chunks
 */
function groupParagraphsIntoChunks(editor: Editor, unorganizedParagraphs: Array<{content: string, position: number}>): Array<Array<{content: string, position: number}>> {
  const chunks: Array<Array<{content: string, position: number}>> = []
  let currentChunk: Array<{content: string, position: number}> = []
  
  // Go through editor in order and find consecutive unorganized non-empty paragraphs
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const content = node.textContent.trim()
      const isUnorganized = node.attrs.processingStatus === 'unprocessed'
      const isEmpty = content.length === 0
      
      if (isUnorganized && !isEmpty) {
        // Found unorganized non-empty paragraph - add to current chunk
        currentChunk.push({ content, position: pos })
      } else {
        // Found organized paragraph or empty paragraph - end current chunk
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk])
          currentChunk = []
        }
      }
    }
  })
  
  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }
  
  return chunks
}

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



 