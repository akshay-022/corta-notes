import { RefinementItem, LineEdit } from '@/thought-tracking/core/organization/types'

// A lightweight copy of ContentProcessor to keep the organized-file-updates package self-contained
// Original source: src/thought-tracking/core/organization/contentProcessor.ts
// Only minor path fixes; logic is unchanged.
export class ContentProcessor {
  /** Apply refinements to content while preserving original meaning */
  applyRefinements(
    originalContent: string,
    refinements: RefinementItem[],
    edits: LineEdit[]
  ): { refinedContent: string; errors: string[] } {
    const errors: string[] = []
    let refinedContent = originalContent

    // Create a map of paragraph IDs to their content for verification
    const editMap = new Map<string, LineEdit>()
    edits.forEach((edit) => editMap.set(edit.lineId, edit))

    for (const refinement of refinements) {
      const originalEdit = editMap.get(refinement.paragraphId)
      if (!originalEdit) {
        errors.push(`Refinement references unknown paragraph ID: ${refinement.paragraphId}`)
        continue
      }

      // Verify that the original content matches
      if (originalEdit.content !== refinement.originalContent) {
        errors.push(`Content mismatch for paragraph ${refinement.paragraphId}`)
        // Use the actual content from the edit
        refinement.originalContent = originalEdit.content
      }

      // Validate refinement quality
      const qualityCheck = this.validateRefinementQuality(
        refinement.originalContent,
        refinement.refinedContent
      )

      if (!qualityCheck.isValid) {
        errors.push(`Poor refinement quality for ${refinement.paragraphId}: ${qualityCheck.reason}`)
        refinement.refinedContent = refinement.originalContent // fallback
      }
    }

    // Build final content string
    const refinedParagraphs: string[] = []
    for (const edit of edits) {
      const refinement = refinements.find((r) => r.paragraphId === edit.lineId)
      refinedParagraphs.push(refinement ? refinement.refinedContent : edit.content)
    }

    refinedContent = refinedParagraphs.join('\n\n')
    return { refinedContent, errors }
  }

  /** Very simple quality check to ensure we didn't lose meaning */
  private validateRefinementQuality(
    original: string,
    refined: string
  ): { isValid: boolean; reason?: string } {
    const originalWords = original.toLowerCase().split(/\s+/)
    const refinedWords = refined.toLowerCase().split(/\s+/)

    const common = originalWords.filter((w) => refinedWords.includes(w))
    const similarity = common.length / Math.max(originalWords.length, refinedWords.length)
    if (similarity < 0.4) {
      return { isValid: false, reason: 'Content was significantly altered' }
    }

    if (!refined.trim()) return { isValid: false, reason: 'Refinement is empty' }

    const lengthRatio = refined.length / original.length
    if (lengthRatio > 3 || lengthRatio < 0.3) {
      return { isValid: false, reason: 'Refinement changed length too drastically' }
    }

    return { isValid: true }
  }

  /** Create minimal TipTap JSON from plain text */
  createTipTapContent(text: string): any {
    const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0)
    return {
      type: 'doc',
      content: paragraphs.map((paragraph) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph.trim() }],
      })),
    }
  }

  /** Append new text to existing TipTap JSON */
  mergeIntoTipTapContent(existingContent: any, newText: string): any {
    const newParagraphs = newText
      .split('\n\n')
      .filter((p) => p.trim().length > 0)
      .map((paragraph) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph.trim() }],
      }))
    return {
      ...existingContent,
      content: [...(existingContent?.content || []), ...newParagraphs],
    }
  }

  /**
   * Extract text content from TipTap JSON
   */
  extractTextFromTipTap(content: any): string {
    if (!content?.content) return '';
    
    return content.content.map((node: any) => {
      if (node.type === 'paragraph' && node.content) {
        return node.content.map((textNode: any) => textNode.text || '').join('');
      }
      return '';
    }).join('\n\n');
  }
} 