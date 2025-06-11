/**
 * Paragraph metadata management utilities
 */

import { Editor } from '@tiptap/core'
import { ParagraphMetadata } from './types'
import { setUpdatingMetadata } from './editor-integration'

/**
 * Update metadata for a specific paragraph
 */
export function updateParagraphMetadata(
  editor: Editor, 
  position: number, 
  metadata: Partial<ParagraphMetadata>
): void {
  editor.commands.setTextSelection(position)
  
  const updateData: any = {}
  
  if (metadata.lastUpdated) {
    updateData.lastUpdated = metadata.lastUpdated.toISOString()
  }
  
  if (metadata.status) {
    updateData.processingStatus = metadata.status
  }
  
  if (metadata.mappedDocs) {
    updateData.mappedDocs = metadata.mappedDocs
  }
  
  if (metadata.brainActivity) {
    updateData.brainActivity = metadata.brainActivity
  }
  
  if (metadata.actionTaken) {
    updateData.actionTaken = metadata.actionTaken
  }
  
  if (metadata.thoughtTimestamp) {
    updateData.thoughtId = `thought_${metadata.thoughtTimestamp.getTime()}`
  }
  
  // Set flag to prevent recursive transaction handling
  setUpdatingMetadata(true)
  
  editor.commands.updateAttributes('paragraph', updateData)
  
  // Reset flag after transaction completes
  setTimeout(() => {
    setUpdatingMetadata(false)
  }, 0)
  
  console.log('📝 Paragraph metadata updated at position', position, ':', updateData)
}

/**
 * Get metadata from current paragraph at cursor position
 */
export function getCurrentParagraphMetadata(editor: Editor): ParagraphMetadata | null {
  const { from } = editor.state.selection
  
  // Find the paragraph node at current position
  let paragraphNode: any = null
  editor.state.doc.nodesBetween(from, from, (node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphNode = node
      return false // Stop searching
    }
  })
  
  if (!paragraphNode) {
    console.log('📝 No paragraph node found at current position')
    return null
  }
  
  const attrs = paragraphNode.attrs
  
  return {
    brainActivity: attrs.brainActivity || [],
    mappedDocs: attrs.mappedDocs || [],
    lastUpdated: attrs.lastUpdated ? new Date(attrs.lastUpdated) : new Date(),
    thoughtTimestamp: new Date(), // Current time
    status: attrs.processingStatus || 'unprocessed',
    actionTaken: attrs.actionTaken || '',
    sentToCategory: '' // Will be set when categorized
  }
}

/**
 * Mark paragraph as processed with category info
 */
export function markParagraphAsProcessed(
  editor: Editor,
  position: number,
  category: string,
  thoughtId: string
): void {
  updateParagraphMetadata(editor, position, {
    status: 'organized',
    actionTaken: `categorized as ${category}`,
    sentToCategory: category,
    lastUpdated: new Date()
  })
  
  // Also set the thought ID
  editor.commands.setTextSelection(position)
  editor.commands.updateAttributes('paragraph', {
    thoughtId: thoughtId
  })
  
  console.log(`✅ Paragraph marked as processed: "${category}" (ID: ${thoughtId})`)
}

/**
 * Mark paragraph as currently being processed
 */
export function markParagraphAsProcessing(editor: Editor, position: number): void {
  updateParagraphMetadata(editor, position, {
    status: 'organizing',
    actionTaken: 'processing...',
    lastUpdated: new Date()
  })
  
  console.log('🔄 Paragraph marked as processing at position:', position)
}

/**
 * Get all unprocessed paragraphs in the editor
 */
export function getUnprocessedParagraphs(editor: Editor): Array<{content: string, position: number}> {
  const unprocessed: Array<{content: string, position: number}> = []
  
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && 
        node.attrs.processingStatus === 'unprocessed' &&
        node.textContent.trim().length > 0) {
      unprocessed.push({
        content: node.textContent,
        position: pos
      })
    }
  })
  
  console.log(`📊 Found ${unprocessed.length} unprocessed paragraphs`)
  return unprocessed
}

/**
 * Update brain activity for current paragraph
 */
export function updateBrainActivity(editor: Editor, activities: string[]): void {
  const { from } = editor.state.selection
  updateParagraphMetadata(editor, from, {
    brainActivity: activities,
    lastUpdated: new Date()
  })
} 