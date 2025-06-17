import { Editor } from '@tiptap/react'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface ParagraphMetadata {
  id?: string
  lastUpdated?: string
  organizationStatus?: 'yes' | 'no'
  whereOrganized?: Array<{
    filePath: string
    paragraphId: string
    summary_stored?: string
  }>
  isOrganized?: boolean
  [key: string]: any // Allow custom metadata fields
}

/**
 * Convert paragraph number (0-based index) to editor position
 * Uses the EXACT same method as thought tracking - splits text by \n to get line numbers
 */
export function convertParagraphNumberToPosition(editor: Editor, paragraphNumber: number): number {
  if (!editor) return 0

  // Use the same method as your friend - get text and split by \n
  const fullText = editor.getJSON().content?.map(node => 
    node.content?.map(textNode => textNode.text || '').join('') || ''
  ).join('\n') || ''
  const lines = fullText.split('\n')
  
  if (paragraphNumber >= lines.length) return 0
  
  const targetLineText = lines[paragraphNumber].trim()
  if (!targetLineText) return 0

  // Now find this line text in the actual ProseMirror document
  let targetPosition = 0

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      // Check if this text node contains our target line
      if (node.text.trim() === targetLineText) {
        targetPosition = pos
        return false // Stop traversal
      }
    }
  })

  return targetPosition
}

/**
 * Convert editor position to paragraph number (0-based index)  
 * Uses the EXACT same method as thought tracking - splits text by \n to get line numbers
 */
export function convertPositionToParagraphNumber(editor: Editor, position: number): number {
  if (!editor) return 0

  try {
    // Use the same method as your friend - get text and split by \n
    const fullText = editor.getText()
    const lines = fullText.split('\n')
    
    // Get the text at the given position
    const resolvedPos = editor.state.doc.resolve(position)
    const nodeAtPosition = resolvedPos.nodeAfter || resolvedPos.nodeBefore
    
    if (!nodeAtPosition || !nodeAtPosition.isText) return 0
    
    const textAtPosition = nodeAtPosition.text?.trim()
    if (!textAtPosition) return 0

    // Find which line number this text corresponds to
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === textAtPosition) {
        return i
      }
    }

    return 0
  } catch (error) {
    console.error('Error converting position to paragraph number:', error)
    return 0
  }
}

/**
 * Get metadata for a specific paragraph by position
 */
export function getParagraphMetadata(editor: Editor, position: number): ParagraphMetadata | null {
  if (!editor) return null

  try {
    const resolvedPos = editor.state.doc.resolve(position)
    const node = resolvedPos.node()
    
    if (node.type.name === 'paragraph') {
      return node.attrs.metadata || null
    }
    
    return null
  } catch (error) {
    console.error('Error getting paragraph metadata:', error)
    return null
  }
}

/**
 * Get metadata for the current paragraph where the cursor is
 */
export function getCurrentParagraphMetadata(editor: Editor): ParagraphMetadata | null {
  if (!editor) return null

  const { from } = editor.state.selection
  return getParagraphMetadata(editor, from)
}

/**
 * Set metadata for a specific paragraph by position
 */
export function setParagraphMetadata(
  editor: Editor, 
  position: number, 
  metadata: Partial<ParagraphMetadata>
): boolean {
  if (!editor) return false

  try {
    const resolvedPos = editor.state.doc.resolve(position)
    const node = resolvedPos.node()
    
    const currentMetadata = node.attrs.metadata || {}
    const newMetadata = { 
    ...currentMetadata, 
    ...metadata,
    lastUpdated: new Date().toISOString() // Always update timestamp
    }
    
    
    editor.chain()
    .focus()
    .setNodeSelection(resolvedPos.pos - resolvedPos.parentOffset)
    .updateAttributes('paragraph', { metadata: newMetadata })
    .run()
      
    return true
    
  } catch (error) {
    console.error('Error setting paragraph metadata:', error)
    return false
  }
}

/**
 * Set metadata for the current paragraph where the cursor is
 */
export function setCurrentParagraphMetadata(
  editor: Editor, 
  metadata: Partial<ParagraphMetadata>
): boolean {
  if (!editor) return false

  const { from } = editor.state.selection
  return setParagraphMetadata(editor, from, metadata)
}

/**
 * Update specific metadata fields for the current paragraph
 */
export function updateCurrentParagraphMetadata(
  editor: Editor,
  updates: Partial<ParagraphMetadata>
): boolean {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  const newMetadata = { ...currentMetadata, ...updates }
  return setCurrentParagraphMetadata(editor, newMetadata)
}

/**
 * Remove metadata from a specific paragraph
 */
export function removeParagraphMetadata(editor: Editor, position: number): boolean {
  if (!editor) return false

  try {
    const resolvedPos = editor.state.doc.resolve(position)
    const node = resolvedPos.node()
    
    if (node.type.name === 'paragraph') {
      editor.chain()
        .focus()
        .setNodeSelection(resolvedPos.pos - resolvedPos.parentOffset)
        .updateAttributes('paragraph', { metadata: null })
        .run()
      
      return true
    }
    
    return false
  } catch (error) {
    console.error('Error removing paragraph metadata:', error)
    return false
  }
}

/**
 * Remove metadata from the current paragraph
 */
export function removeCurrentParagraphMetadata(editor: Editor): boolean {
  if (!editor) return false

  const { from } = editor.state.selection
  return removeParagraphMetadata(editor, from)
}

/**
 * Mark current paragraph as organized
 */
export function markCurrentParagraphAsOrganized(
  editor: Editor,
  filePath: string,
  paragraphId: string,
  summaryStored?: string
): boolean {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  const whereOrganized = currentMetadata.whereOrganized || []
  
  // Add new organization location
  whereOrganized.push({
    filePath,
    paragraphId,
    summary_stored: summaryStored
  })
  
  return updateCurrentParagraphMetadata(editor, {
    organizationStatus: 'yes',
    isOrganized: true,
    whereOrganized
  })
}

/**
 * Get all paragraphs with their metadata
 */
export function getAllParagraphsMetadata(editor: Editor): Array<{ 
  position: number; 
  content: string; 
  metadata: ParagraphMetadata | null 
}> {
  if (!editor) return []

  const results: Array<{ position: number; content: string; metadata: ParagraphMetadata | null }> = []
  
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      results.push({
        position: pos,
        content: node.textContent,
        metadata: node.attrs.metadata || null
      })
    }
  })
  
  return results
}

/**
 * Get all organized paragraphs
 */
export function getAllOrganizedParagraphs(editor: Editor): Array<{
  position: number;
  content: string;
  metadata: ParagraphMetadata;
}> {
  const allParagraphs = getAllParagraphsMetadata(editor)
  return allParagraphs.filter(p => p.metadata?.isOrganized === true) as Array<{
    position: number;
    content: string;
    metadata: ParagraphMetadata;
  }>
}

/**
 * Get all unorganized paragraphs
 */
export function getAllUnorganizedParagraphs(editor: Editor): Array<{
  position: number;
  content: string;
  metadata: ParagraphMetadata | null;
}> {
  const allParagraphs = getAllParagraphsMetadata(editor)
  return allParagraphs.filter(p => !p.metadata?.isOrganized)
}

/**
 * Add a unique ID to the current paragraph if it doesn't have one
 * Note: This function is deprecated - let thought tracking handle ID creation with pageUuid prefix
 */
export function ensureCurrentParagraphId(editor: Editor): string | null {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  
  // Return existing ID if present, but don't create new ones
  // Let thought tracking create proper pageUuid-para-timestamp-random IDs
  return currentMetadata.id || null
} 