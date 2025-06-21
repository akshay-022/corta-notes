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

  /**
   * Smart merge using LLM: takes recent (<=24h) paragraphs + new text and asks LLM to integrate
   */
  async smartMergeTipTapContent(existingContent: any, newText: string, pageUuid: string, organizationRules?: string): Promise<any> {
    try {
      const { ensureParagraphMetadata } = require('./organized-file-metadata')
      const allNodes = ensureParagraphMetadata(existingContent?.content || [], pageUuid)

      // Collect paragraph nodes after ensuring IDs
      const paragraphNodes = allNodes.filter((n: any) => n.type === 'paragraph')
      const recentNodes = paragraphNodes.length <= 30 ? paragraphNodes : paragraphNodes.slice(-30)

      const recentBlockText = recentNodes
        .map((node: any) => {
          const pid = node.attrs.id || node.attrs.metadata.id
          const text = (node.content || []).map((n: any) => n.text || '').join('')
          return `Paragraph ${pid}: ${text}`
        })
        .join('\n')

      const organizationRulesSection = organizationRules?.trim() ? 
        `\n\nORGANIZATION RULES FOR THIS PAGE:
${organizationRules}

Follow these rules when organizing and merging content.\n` : ''

      const prompt = `You are helping merge new content into an existing page that is sorted by recency.

EXISTING RECENT PARAGRAPHS (with IDs):
${recentBlockText}

NEW CONTENT TO INTEGRATE:
${newText}${organizationRulesSection}

TASK: Decide ABOVE WHICH paragraph ID the merged content should be inserted (that paragraph and everything after it stay below).
Create one cohesive, well-formatted section that combines both the recent paragraphs (you may rewrite them) and the new content.

CRITICAL REQUIREMENTS:
• Write like PERSONAL NOTES, not formal documents
• Keep the user's original voice and tone - if they write urgently, keep it urgent
• NO corporate speak, NO "Overview/Summary" sections, NO repetitive bullet points  
• BE CONCISE - eliminate all redundancy and fluff
• Focus on WHAT MATTERS - actionable insights, not descriptions
• Use natural, conversational language like talking to yourself
• Preserve strong emotions, caps, urgency - don't sanitize the user's voice
• Combine similar ideas into single, clear statements
• Use simple formatting - basic bullets or numbered lists, not complex structures

BAD EXAMPLE: "Overview: This section delivers a cohesive view of..." 
GOOD EXAMPLE: "Need to add annotation feature - users want control over where stuff goes"

Respond ONLY with valid JSON of the form:
{
  "insertAboveParagraphId": "<paragraphId>",
  "mergedText": "<your merged section text>"
}

`

      const res = await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: 'o3-mini' }),
      })
      if (!res.ok) throw new Error('LLM merge failed')
      const data = await res.json()
      const cleaned = (data.response || '')
        .replace(/```json\s*/i, '')
        .replace(/```/g, '')
        .trim()

      const parsed = JSON.parse(cleaned)
      const insertId: string = parsed.insertAboveParagraphId
      const mergedText: string = parsed.mergedText
      if (!insertId || !mergedText) throw new Error('LLM missing fields')

      const mergedJSON = this.createTipTapContent(mergedText)
      const mergedNodesWithMeta = ensureParagraphMetadata(mergedJSON.content, pageUuid)

      // Build new content array
      const newContentArray: any[] = []
      let inserted = false
      for (const node of allNodes) {
        const nid = node.attrs?.id || node.attrs?.metadata?.id
        if (!inserted && nid === insertId) {
          // Insert merged section before this node
          newContentArray.push(...mergedNodesWithMeta)
          inserted = true
        }
        if (inserted) {
          // Keep the rest of the nodes as-is
          newContentArray.push(node)
        }
      }

      // If insertId not found, prepend merged section
      if (!inserted) {
        newContentArray.unshift(...mergedNodesWithMeta)
      }

      return {
        ...(existingContent || { type: 'doc' }),
        content: newContentArray,
      }
    } catch (err) {
      console.error('smartMergeTipTapContent fallback', err)
      // fallback to simple append
      return this.mergeIntoTipTapContent(existingContent, newText)
    }
  }
} 