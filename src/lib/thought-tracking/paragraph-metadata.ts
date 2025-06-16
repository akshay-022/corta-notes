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
  paragraphNumber: number, 
  metadata: Partial<ParagraphMetadata>
): void {
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
  
  if (metadata.thoughtId) {
    updateData.thoughtId = metadata.thoughtId
  }
  
  if (metadata.contentHash) {
    updateData.contentHash = metadata.contentHash
  }
  
  // Set flag to prevent recursive transaction handling
  setUpdatingMetadata(true)
  
  // Find the specific paragraph by number (more efficient - stops early)
  let currentParagraphIndex = 0
  let targetParagraph: { node: any, pos: number } | null = null

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    // Count ALL nodes, not just paragraphs
    if (currentParagraphIndex === paragraphNumber) {
      // Found our target node!
      targetParagraph = { node, pos }
      return false // Stop traversing immediately
    }
    console.log('🔍 Current paragraph index:', currentParagraphIndex, 'content:', node.textContent.trim())
    currentParagraphIndex++
  })

  // Update the specific node directly
  if (targetParagraph) {
    const { node, pos } = targetParagraph
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
      ...(node as any).attrs,  // Keep existing attributes
      ...updateData   // Update with new metadata
    })
    editor.view.dispatch(tr)
  } else {
    console.warn(`⚠️ Node ${paragraphNumber} not found`)
  }
  
  // Reset flag after transaction completes
  setTimeout(() => {
    setUpdatingMetadata(false)
  }, 0)
  
  console.log('📝 Paragraph metadata updated for paragraph', paragraphNumber, ':', updateData)
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
  paragraphNumber: number,
  category: string,
  thoughtId: string
): void {
  updateParagraphMetadata(editor, paragraphNumber, {
    status: 'organized',
    actionTaken: `categorized as ${category}`,
    sentToCategory: category,
    lastUpdated: new Date()
  })
  
  // Also set the thought ID without moving cursor using direct transaction
  setUpdatingMetadata(true)
  const tr = editor.state.tr
  
  // Get all paragraphs to find the correct position using nodesBetween
  const paragraphs: Array<{ node: any, pos: number }> = []
  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push({ node, pos })
    }
  })
  
  if (paragraphs[paragraphNumber]) {
    const { node, pos } = paragraphs[paragraphNumber]
    const newAttrs = { ...node.attrs, thoughtId: thoughtId }
    tr.setNodeMarkup(pos, undefined, newAttrs)
    editor.view.dispatch(tr)
  }
  
  setTimeout(() => setUpdatingMetadata(false), 0)
  
  console.log(`✅ Paragraph marked as processed: "${category}" (ID: ${thoughtId})`)
}

/**
 * Mark paragraph as currently being processed
 */
export function markParagraphAsProcessing(editor: Editor, paragraphNumber: number): void {
  updateParagraphMetadata(editor, paragraphNumber, {
    status: 'organizing',
    actionTaken: 'processing...',
    lastUpdated: new Date()
  })
  
  console.log('🔄 Paragraph marked as processing at paragraph:', paragraphNumber)
}

/**
 * Get all unprocessed paragraphs in the editor with their paragraph numbers
 */
export function getUnprocessedParagraphs(editor: Editor): Array<{content: string, paragraphNumber: number}> {
  const unprocessed: Array<{content: string, paragraphNumber: number}> = []
  let paragraphNumber = 0
  let totalParagraphsFound = 0
  
  console.log('🔍 Starting to count ALL paragraphs in document...')
  console.log('🔍 Document size:', editor.state.doc.content.size)
  
  // Use nodesBetween to traverse the ENTIRE document from start to end
  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (node.type.name === 'paragraph') {
      totalParagraphsFound++
      const content = node.textContent.trim()
      const status = node.attrs.processingStatus
      
      console.log(`🔍 Paragraph #${paragraphNumber}: "${content.substring(0, 30)}..." (status: ${status}, empty: ${content.length === 0}, pos: ${pos})`)
      
      if (status === 'unprocessed' && content.length > 0) {
        unprocessed.push({
          content: node.textContent,
          paragraphNumber: paragraphNumber
        })
        console.log(`✅ Added paragraph #${paragraphNumber} to unprocessed list`)
      }
      paragraphNumber++
    }
  })
  
  console.log(`🔍 Total paragraphs found: ${totalParagraphsFound}`)
  console.log(`🔍 Unprocessed paragraphs: ${unprocessed.length}`)
  console.log(`🔍 Final paragraph numbers assigned:`, unprocessed.map(p => ({ num: p.paragraphNumber, content: p.content.substring(0, 20) + '...' })))
  
  return unprocessed
}

/**
 * Helper function to convert document position to paragraph number
 */
export function getPositionParagraphNumber(editor: Editor, position: number): number {
  let paragraphNumber = 0
  let found = false
  
  // Use nodesBetween to traverse the ENTIRE document from start to end
  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (node.type.name === 'paragraph') {
      if (pos <= position && position <= pos + node.nodeSize) {
        found = true
        return false // Stop searching
      }
      if (!found) {
        paragraphNumber++
      }
    }
  })
  
  console.log(`🔍 Position ${position} maps to paragraph #${paragraphNumber} (found: ${found})`)
  return found ? paragraphNumber : -1
}

/**
 * Update brain activity for current paragraph
 */
export function updateBrainActivity(editor: Editor, activities: string[]): void {
  const { from } = editor.state.selection
  
  // Use helper function to get current paragraph number
  const currentParagraphNumber = getPositionParagraphNumber(editor, from)
  
  if (currentParagraphNumber >= 0) {
    updateParagraphMetadata(editor, currentParagraphNumber, {
      brainActivity: activities,
      lastUpdated: new Date()
    })
  } else {
    console.warn('⚠️ Could not determine current paragraph number for brain activity update')
  }
} 