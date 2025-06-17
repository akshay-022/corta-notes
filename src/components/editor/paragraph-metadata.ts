import { Editor } from '@tiptap/react'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface ParagraphMetadata {
  id?: string
  timestamp?: string
  author?: string
  tags?: string[]
  status?: 'draft' | 'review' | 'final'
  priority?: 'low' | 'medium' | 'high'
  category?: string
  [key: string]: any // Allow custom metadata fields
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
    
    if (node.type.name === 'paragraph') {
      const currentMetadata = node.attrs.metadata || {}
      const newMetadata = { ...currentMetadata, ...metadata }
      
      editor.chain()
        .focus()
        .setNodeSelection(resolvedPos.pos - resolvedPos.parentOffset)
        .updateAttributes('paragraph', { metadata: newMetadata })
        .run()
      
      return true
    }
    
    return false
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
 * Find all paragraphs with specific metadata criteria
 */
export function findParagraphsWithMetadata(
  editor: Editor,
  criteria: Partial<ParagraphMetadata>
): Array<{ position: number; node: ProseMirrorNode; metadata: ParagraphMetadata }> {
  if (!editor) return []

  const results: Array<{ position: number; node: ProseMirrorNode; metadata: ParagraphMetadata }> = []
  
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.attrs.metadata) {
      const metadata = node.attrs.metadata as ParagraphMetadata
      
      // Check if metadata matches criteria
      const matches = Object.entries(criteria).every(([key, value]) => {
        if (Array.isArray(value) && Array.isArray(metadata[key])) {
          // For arrays, check if they have common elements
          return value.some(v => metadata[key].includes(v))
        }
        return metadata[key] === value
      })
      
      if (matches) {
        results.push({ position: pos, node, metadata })
      }
    }
  })
  
  return results
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
 * Add a tag to the current paragraph
 */
export function addTagToCurrentParagraph(editor: Editor, tag: string): boolean {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  const currentTags = currentMetadata.tags || []
  
  if (!currentTags.includes(tag)) {
    const newTags = [...currentTags, tag]
    return updateCurrentParagraphMetadata(editor, { tags: newTags })
  }
  
  return false // Tag already exists
}

/**
 * Remove a tag from the current paragraph
 */
export function removeTagFromCurrentParagraph(editor: Editor, tag: string): boolean {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  const currentTags = currentMetadata.tags || []
  
  if (currentTags.includes(tag)) {
    const newTags = currentTags.filter(t => t !== tag)
    return updateCurrentParagraphMetadata(editor, { tags: newTags })
  }
  
  return false // Tag doesn't exist
}

/**
 * Set the status of the current paragraph
 */
export function setCurrentParagraphStatus(
  editor: Editor, 
  status: 'draft' | 'review' | 'final'
): boolean {
  return updateCurrentParagraphMetadata(editor, { status })
}

/**
 * Set the priority of the current paragraph
 */
export function setCurrentParagraphPriority(
  editor: Editor, 
  priority: 'low' | 'medium' | 'high'
): boolean {
  return updateCurrentParagraphMetadata(editor, { priority })
}

/**
 * Add a unique ID to the current paragraph if it doesn't have one
 */
export function ensureCurrentParagraphId(editor: Editor): string | null {
  const currentMetadata = getCurrentParagraphMetadata(editor) || {}
  
  if (!currentMetadata.id) {
    const id = `para-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    updateCurrentParagraphMetadata(editor, { id })
    return id
  }
  
  return currentMetadata.id
} 