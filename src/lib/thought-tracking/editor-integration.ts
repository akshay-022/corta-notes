/**
 * Simple TipTap editor integration for thought tracking
 */

import { Editor } from '@tiptap/core'
import { updateBuffer, processThought, saveBrainState, getBrainState } from './brain-state'
import { markParagraphAsProcessing, markParagraphAsProcessed, updateParagraphMetadata, getUnprocessedParagraphs } from './paragraph-metadata'

let isThoughtTrackingEnabled = false
let isProcessingThoughts = false // Prevent infinite loops
export let isUpdatingMetadata = false // Prevent metadata update loops - exported for use in metadata functions
let debounceTimer: NodeJS.Timeout | null = null
let metadataDebounceTimer: NodeJS.Timeout | null = null // For paragraph metadata updates
let currentPageUuid: string | undefined

// Export function to set metadata flag
export function setUpdatingMetadata(value: boolean) {
  isUpdatingMetadata = value
}

/**
 * Setup thought tracking on a TipTap editor
 */
export function setupThoughtTracking(editor: Editor, pageUuid?: string): void {
  isThoughtTrackingEnabled = true
  currentPageUuid = pageUuid
  
  // Track latest paragraph for optimization and context
  let latestParagraphChunk: { content: string, position: number } | null = null
  
  editor.on('update', ({ editor, transaction }) => {
    if (!isThoughtTrackingEnabled || isProcessingThoughts || isUpdatingMetadata) return
    
    // Only process if there are actual content changes (user is typing)
    if (!transaction.docChanged) return
    
    // Debounced double-enter detection (500ms)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      checkForDoubleEnter(editor)
    }, 500)
    
    // === NEW: PARAGRAPH METADATA SYSTEM ===
    
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
  

  
  console.log('🧠 Thought tracking enabled (simplified metadata system)')
}

/**
 * Disable thought tracking
 
export function disableThoughtTracking(): void {
  isThoughtTrackingEnabled = false
  console.log('Thought tracking disabled')
}*/


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
      console.log('🧠 Double-enter detected - organizing unorganized paragraphs')
      processUnorganizedChunks(editor)
    }
  } catch (error) {
    console.error('❌ Error checking for double-enter:', error)
  }
}



/**
 * Manual trigger to process current paragraph
 */
export function processCurrentParagraph(editor: Editor): void {
  const { from } = editor.state.selection
  const currentText = editor.getText()
  
  // Mark as processing
  markParagraphAsProcessing(editor, from)
  
  // Process the thought
  processThought(currentText)
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
    thoughtTrackingEnabled: isThoughtTrackingEnabled
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
    editor.state.doc.nodesBetween(from, from, (node) => {
      if (node.type.name === 'paragraph') {
        paragraphText = node.textContent.trim()
        return false
      }
    })
    
    // Only update metadata for non-empty paragraphs
    if (paragraphText.length > 0) {
      updateParagraphMetadata(editor, from, {
        lastUpdated: new Date(),
        status: 'unprocessed' // Mark as unprocessed when edited
      })
      console.log('📝 Paragraph metadata updated:', paragraphText.substring(0, 30) + '...')
    }
  } catch (error) {
    console.error('❌ Error updating paragraph metadata:', error)
  }
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



 