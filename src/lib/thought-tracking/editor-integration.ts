/**
 * Simple TipTap editor integration for thought tracking
 */

import { Editor } from '@tiptap/core'
import { updateBuffer, processThought, saveBrainState, getBrainState } from './brain-state'
import { markParagraphAsProcessing, markParagraphAsProcessed, updateParagraphMetadata } from './paragraph-metadata'

let isThoughtTrackingEnabled = false
let isProcessingThoughts = false // Prevent infinite loops
let debounceTimer: NodeJS.Timeout | null = null
let currentPageUuid: string | undefined

/**
 * Setup thought tracking on a TipTap editor
 */
export function setupThoughtTracking(editor: Editor, pageUuid?: string): void {
  isThoughtTrackingEnabled = true
  currentPageUuid = pageUuid
  
  editor.on('update', ({ editor, transaction }) => {
    if (!isThoughtTrackingEnabled || isProcessingThoughts) return
    
    let shouldProcess = false
    let useCurrentParagraph = true
    
    // Check if current paragraph is empty (that means the change is because user pressed enter)
    const { from } = editor.state.selection
    let currentParagraphText =  ''
    editor.state.doc.nodesBetween(from, from, (node) => {
      if (node.type.name === 'paragraph') {
        currentParagraphText = node.textContent.trim()
        return false
      }
    })
    
    if (currentParagraphText === '') {
      console.log('🧠 Empty paragraph detected - processing immediately')
      useCurrentParagraph = false // use previous paragraph if current is empty
      processText(editor, useCurrentParagraph)
    } else {
      // Use 1-second pause for typing
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        console.log('🧠 Pause detected')
        processText(editor, true) // current paragraph
      }, 1000)
    }
  })
  
  async function processText(editor: Editor, useCurrentParagraph: boolean) {
    const { from } = editor.state.selection
    let paragraphText = ''
    
    // Get paragraph text
    if (useCurrentParagraph) {
      editor.state.doc.nodesBetween(from, from, (node) => {
        if (node.type.name === 'paragraph') {
          paragraphText = node.textContent.trim()
          return false
        }
      })
    } else {
      // Get previous paragraph (not current empty one)
      let foundParagraphs: string[] = []
      editor.state.doc.nodesBetween(0, from, (node) => {
        if (node.type.name === 'paragraph') {
          foundParagraphs.push(node.textContent.trim())
        }
      })
      
      // If last paragraph is empty (current), get the one before it
      if (foundParagraphs.length >= 2 && foundParagraphs[foundParagraphs.length - 1] === '') {
        paragraphText = foundParagraphs[foundParagraphs.length - 2]
      } else if (foundParagraphs.length >= 1) {
        // If current paragraph has content, it shouldn't reach here, but safety fallback
        paragraphText = foundParagraphs[foundParagraphs.length - 1]
      } else {
        paragraphText = ''
      }
    }
    
    
    // Get current buffer
    const brainState = getBrainState()
    let currentBuffer = brainState.recentBuffer.text || ''
    
    // Skip duplicates
    // Check if this paragraph is a continuation of the last line in buffer
    const lastLineOfBuffer = currentBuffer.trim().split('\n').pop() || ''
    if (paragraphText.trim().startsWith(lastLineOfBuffer.trim()) && lastLineOfBuffer.trim() !== '') {
      console.log('🧠 Duplicate - skipping')
      return
    }

    // Also here ideally we should have a detector for which paragraph it is so that backspaces are also detected but ignoring for now.
    
    // Add text to buffer
    console.log('🧠 Adding:', paragraphText.substring(0, 30) + '...')
    currentBuffer += (currentBuffer ? '\n\n' : '') + paragraphText
    
    // Check if this was a line break with empty previous paragraph
    if (!useCurrentParagraph && !paragraphText) {
      console.log('🧠 Line break detected with empty previous paragraph')
      
      // Only add separator if buffer doesn't already end with -------
      if (!currentBuffer.trim().endsWith('------')) {
        console.log('🧠 Adding separator and organizing')
        
        // Get the section before adding separator
        const sections = currentBuffer.split('-------')
        const latestSection = sections[sections.length - 1].trim()
        
        // Add separator
        currentBuffer += '\n-------\n'
        
        // Send latest section to brain for organization
        if (latestSection) {
          console.log('🧠 Organizing section:', latestSection.substring(0, 30) + '...')
          await processThought(latestSection, editor, currentPageUuid)
        }
      } else {
        console.log('🧠 Buffer already ends with separator - skipping')
      }
    }
    
    await updateBuffer(currentBuffer)
    await saveBrainState()
  console.log('🧠 ✅ Buffer updated')
  }
  
  console.log('🧠 Simple thought tracking enabled')
}

/**
 * Disable thought tracking
 */
export function disableThoughtTracking(): void {
  isThoughtTrackingEnabled = false
  console.log('Thought tracking disabled')
}

/**
 * Handle edit detection - mark edited paragraphs as unorganized
 */
function handleEditDetection(editor: Editor, transaction: any): void {
  if (!transaction.docChanged) return
  
  // Check if any previously organized paragraphs were edited
  transaction.steps.forEach((step: any) => {
    if (step.from !== undefined && step.to !== undefined) {
      // Find paragraphs in the edited range
      editor.state.doc.nodesBetween(step.from, step.to, (node: any, pos: number) => {
                 if (node.type.name === 'paragraph' && node.attrs.processingStatus === 'organized') {
          console.log('✏️ Previously organized paragraph edited - marking as unorganized')
          
          // Mark as unorganized so it gets re-processed
          updateParagraphMetadata(editor, pos, {
            status: 'unprocessed',
            actionTaken: 'edited - needs re-organization',
            lastUpdated: new Date()
          })
        }
      })
    }
  })
}

/**
 * Update current paragraph's last updated timestamp
 */
function updateCurrentParagraphTimestamp(editor: Editor): void {
  const { from } = editor.state.selection
  
  updateParagraphMetadata(editor, from, {
    lastUpdated: new Date()
  })
}

/**
 * Process thought if empty line is detected
 */
async function processThoughtIfNeeded(editor: Editor, currentText: string): Promise<void> {
  try {
    // Get current page UUID from editor (we'll need to pass this somehow)
    const currentPageUuid = getCurrentPageUuid(editor)
    
    // This will check for empty lines and process all unorganized paragraphs
    await processThought(currentText, editor, currentPageUuid)
    
  } catch (error) {
    console.error('Error processing thought:', error)
  }
}

/**
 * Get current page UUID
 */
function getCurrentPageUuid(editor: Editor): string | undefined {
  return currentPageUuid
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

 