import { RefinementItem, LineEdit } from '@/thought-tracking/core/organization/types'
import { TIPTAP_FORMATTING_PROMPT, FAITHFUL_MERGE_RULES, EDITING_USER_CONTENT_PRESERVE, MERGE_INCLUDE_ALL_TODAY } from '@/lib/promptTemplates'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import CodeBlock from '@tiptap/extension-code-block'
import Code from '@tiptap/extension-code'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Underline from '@tiptap/extension-underline'
import { NodeMetadata } from '@/lib/tiptap/NodeMetadata'
import { Markdown } from 'tiptap-markdown'

// TipTap extensions for markdown parsing
const extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  BulletList,
  OrderedList,
  ListItem,
  Heading,
  Blockquote,
  CodeBlock,
  Code,
  HardBreak,
  HorizontalRule,
  Underline,
  NodeMetadata,
  Markdown.configure({
    html: false, // Don't allow HTML input
    transformPastedText: false,
    transformCopiedText: false,
  }),
]

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

  /** Create TipTap JSON from Markdown text using TipTap Markdown extension */
  createTipTapContent(text: string, pageUuid?: string): any {
    // Check if we're on server-side (no document object)
    const isServerSide = typeof document === 'undefined';
    
    if (isServerSide) {
      // Server-side: Use simple markdown-to-TipTap conversion
      return this.createTipTapContentServerSide(text, pageUuid);
    }
    
    try {
      // Client-side: Use TipTap Editor for proper parsing
      const editor = new Editor({
        extensions,
        content: text, // TipTap with Markdown extension will parse this as Markdown
      })
      
      const json = editor.getJSON()
      editor.destroy() // Clean up
      
      // Add metadata to paragraphs if pageUuid is provided
      if (pageUuid && json?.content) {
        const { ensureParagraphMetadata } = require('./organized-file-metadata')
        json.content = ensureParagraphMetadata(json.content, pageUuid)
      }
      
      return json
    } catch (error) {
      console.error('Error parsing markdown with TipTap:', error)
      // Fallback to server-side method
      return this.createTipTapContentServerSide(text, pageUuid);
    }
  }

  /** Server-safe markdown to TipTap conversion */
  private createTipTapContentServerSide(text: string, pageUuid?: string): any {
    try {
      const lines = text.split('\n');
      const content: any[] = [];
      let currentParagraph: string[] = [];

      const flushParagraph = () => {
        if (currentParagraph.length > 0) {
          const paragraphText = currentParagraph.join('\n').trim();
          if (paragraphText) {
            content.push({
              type: 'paragraph',
              content: this.parseInlineMarkdown(paragraphText)
            });
          }
          currentParagraph = [];
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Handle headings
        if (trimmedLine.startsWith('### ')) {
          flushParagraph();
          content.push({
            type: 'heading',
            attrs: { level: 3 },
            content: this.parseInlineMarkdown(trimmedLine.substring(4))
          });
        } else if (trimmedLine.startsWith('## ')) {
          flushParagraph();
          content.push({
            type: 'heading',
            attrs: { level: 2 },
            content: this.parseInlineMarkdown(trimmedLine.substring(3))
          });
        } else if (trimmedLine.startsWith('# ')) {
          flushParagraph();
          content.push({
            type: 'heading',
            attrs: { level: 1 },
            content: this.parseInlineMarkdown(trimmedLine.substring(2))
          });
        } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          // Handle bullet lists
          flushParagraph();
          const listItems = [trimmedLine.substring(2)];
          
          // Collect consecutive list items
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j].trim();
            if (nextLine.startsWith('- ') || nextLine.startsWith('* ')) {
              listItems.push(nextLine.substring(2));
              j++;
            } else if (nextLine === '') {
              j++;
              break;
            } else {
              break;
            }
          }
          
          content.push({
            type: 'bulletList',
            content: listItems.map(item => ({
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: this.parseInlineMarkdown(item)
              }]
            }))
          });
          
          // Skip the lines we've processed
          i = j - 1;
        } else if (trimmedLine === '') {
          // Empty line - flush current paragraph
          flushParagraph();
        } else {
          // Regular text line - add to current paragraph
          currentParagraph.push(line);
        }
      }
      
      // Flush any remaining paragraph
      flushParagraph();

      // Add metadata to paragraphs if pageUuid is provided
      if (pageUuid && content.length > 0) {
        try {
          const { ensureParagraphMetadata } = require('./organized-file-metadata')
          content.forEach((node, index) => {
            if (node.type === 'paragraph') {
              node.attrs = node.attrs || {};
              node.attrs.metadata = node.attrs.metadata || {};
              node.attrs.metadata.id = `${pageUuid}-p-${index}`;
            }
          });
        } catch (error) {
          console.error('Error adding paragraph metadata:', error);
        }
      }

      return {
        type: 'doc',
        content: content.length > 0 ? content : [{
          type: 'paragraph',
          content: [{ type: 'text', text: text }]
        }]
      };
    } catch (error) {
      console.error('Error in server-side markdown parsing:', error);
      // Ultimate fallback
      return {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }]
        }]
      };
    }
  }

  /** Parse inline markdown (bold, italic, etc.) */
  private parseInlineMarkdown(text: string): any[] {
    const content: any[] = [];
    let currentText = '';
    let i = 0;

    const flushText = () => {
      if (currentText) {
        content.push({ type: 'text', text: currentText });
        currentText = '';
      }
    };

    while (i < text.length) {
      if (text.substring(i, i + 2) === '**') {
        // Bold text
        flushText();
        const endIndex = text.indexOf('**', i + 2);
        if (endIndex !== -1) {
          const boldText = text.substring(i + 2, endIndex);
          content.push({ 
            type: 'text', 
            text: boldText,
            marks: [{ type: 'bold' }]
          });
          i = endIndex + 2;
        } else {
          currentText += text[i];
          i++;
        }
      } else if (text[i] === '*' && text[i + 1] !== '*') {
        // Italic text
        flushText();
        const endIndex = text.indexOf('*', i + 1);
        if (endIndex !== -1) {
          const italicText = text.substring(i + 1, endIndex);
          content.push({ 
            type: 'text', 
            text: italicText,
            marks: [{ type: 'italic' }]
          });
          i = endIndex + 1;
        } else {
          currentText += text[i];
          i++;
        }
      } else {
        currentText += text[i];
        i++;
      }
    }

    flushText();
    return content.length > 0 ? content : [{ type: 'text', text }];
  }

  /** Append new text to existing TipTap JSON using Markdown parsing */
  mergeIntoTipTapContent(existingContent: any, newText: string, pageUuid?: string): any {
    // Use our Markdown parser to properly handle formatting
    const newContentJSON = this.createTipTapContent(newText, pageUuid)
    
    return {
      ...existingContent,
      content: [...(existingContent?.content || []), ...(newContentJSON?.content || [])],
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
   * Helper method to detect if content has duplicate sections
   */
  private detectDuplicateContent(text: string): boolean {
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const uniqueLines = new Set(lines)
    return lines.length !== uniqueLines.size
  }

  /**
   * Smart merge using LLM: takes recent (<=24h) paragraphs + new text and asks LLM to integrate
   */
  async smartMergeTipTapContent(existingContent: any, newText: string, pageUuid: string, organizationRules?: string, pageTitle?: string): Promise<any> {
    try {
      console.log('🚀 === SMART MERGE START ===')
      console.log('🚀 Input parameters:', {
        hasExistingContent: !!existingContent,
        existingContentType: typeof existingContent,
        newTextLength: newText.length,
        pageUuid: pageUuid.substring(0, 8),
        hasOrganizationRules: !!organizationRules
      })

      const { ensureParagraphMetadata } = require('./organized-file-metadata')
      const allNodes = ensureParagraphMetadata(existingContent?.content || [], pageUuid)

      console.log('📦 After ensureParagraphMetadata:', {
        allNodesType: typeof allNodes,
        allNodesIsArray: Array.isArray(allNodes),
        allNodesLength: allNodes.length,
        firstNodePreview: allNodes[0] ? {
          type: allNodes[0].type,
          hasAttrs: !!allNodes[0].attrs,
          hasMetadata: !!allNodes[0].attrs?.metadata,
          lastUpdated: allNodes[0].attrs?.metadata?.lastUpdated
        } : 'NO_FIRST_NODE'
      })

      // Get today's date boundaries (start and end of today) in LOCAL timezone
      const today = new Date()
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      // Find boundary: continuous today's content at top until first non-today node
      let boundaryIndex = 0
      for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
        const lastUpdated = allNodes[nodeIndex].attrs?.metadata?.lastUpdated
        console.log(`🔍 Node ${nodeIndex} lastUpdated:`, {
          lastUpdated,
          lastUpdatedType: typeof lastUpdated,
          lastUpdatedExists: !!lastUpdated
        })

        if (!lastUpdated) {
          console.log(`🔍 Node ${nodeIndex} has NO timestamp - BOUNDARY FOUND`)
          break
        }
        
        const nodeDate = new Date(lastUpdated)
        // Convert to local date for comparison (ignoring timezone)
        const nodeDateLocal = new Date(nodeDate.getFullYear(), nodeDate.getMonth(), nodeDate.getDate())
        const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        
        console.log(`🔍 Node ${nodeIndex} date analysis:`, {
          lastUpdated,
          nodeDate: nodeDate.toISOString(),
          nodeDateLocal: nodeDateLocal.toISOString(),
          todayLocal: todayLocal.toISOString(),
          isToday: nodeDateLocal.getTime() === todayLocal.getTime()
        })

        if (nodeDateLocal.getTime() === todayLocal.getTime()) {
          console.log(`🔍 Node ${nodeIndex} IS TODAY'S CONTENT - incrementing boundary`)
          boundaryIndex = nodeIndex + 1
          console.log(`🔍 New boundaryIndex: ${boundaryIndex}`)
        } else {
          console.log(`🔍 Node ${nodeIndex} is NOT today's content - BOUNDARY FOUND`)
          break
        }
      }


      const topTodayNodes = allNodes.slice(0, boundaryIndex)
      const everythingAfterBoundary = allNodes.slice(boundaryIndex)


      // Extract text from top today's content for LLM context
      const todayText = topTodayNodes
        .map((node: any) => {
          const text = (node.content || []).map((n: any) => n.text || '').join('')
          return text
        })
        .join('\n\n')

      console.log('🔍 Smart merge content analysis:', {
        todayTextLength: todayText.length,
        newTextLength: newText.length,
        todayTextPreview: todayText.substring(0, 200) + (todayText.length > 200 ? '...' : ''),
        newTextPreview: newText.substring(0, 200) + (newText.length > 200 ? '...' : ''),
        todayTextContainsNewText: todayText.includes(newText.substring(0, 50)),
        newTextContainsTodayText: newText.includes(todayText.substring(0, 50))
      })

      const organizationRulesSection = organizationRules?.trim() ? 
        `\n\nORGANIZATION RULES FOR THIS PAGE:
${organizationRules}

Follow these rules when organizing and merging content.\n` : ''

      const pageTitleSection = pageTitle ? `\n\nTARGET PAGE: "${pageTitle}"\n` : ''

      const prompt = `Merge and organize today's content with new content. Replace all of today's content with this merged result.${pageTitleSection}
CRITICAL: Only include content that is DIRECTLY RELEVANT to "${pageTitle || 'this page'}". If any content doesn't belong on this specific page, DO NOT include it in the merged result.

TODAY'S EXISTING CONTENT:
${todayText}

NEW CONTENT TO MERGE:
${newText}${organizationRulesSection}

${TIPTAP_FORMATTING_PROMPT}

${FAITHFUL_MERGE_RULES}

${MERGE_INCLUDE_ALL_TODAY}

${EDITING_USER_CONTENT_PRESERVE}

RELEVANCE FILTER:
• Everything you add MUST be related to "${pageTitle || 'this page'}"
• If content belongs on a different page, exclude it entirely
• Better to exclude unrelated content than pollute the page with irrelevant information
• Only merge content that makes sense together on this specific page

JSON output only:
{
  "mergedText": "<well-organized merged content that replaces all of today's content - ONLY content relevant to ${pageTitle || 'this page'}>"
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
      const mergedText: string = parsed.mergedText
      if (!mergedText) throw new Error('LLM missing mergedText field')

      console.log('🤖 LLM merge result analysis:', {
        mergedTextLength: mergedText.length,
        mergedTextPreview: mergedText.substring(0, 300) + (mergedText.length > 300 ? '...' : ''),
        mergedTextContainsDuplicates: this.detectDuplicateContent(mergedText),
        inputTodayLength: todayText.length,
        inputNewLength: newText.length,
        outputMergedLength: mergedText.length
      })

      // Create new content from merged text
      console.log('🏗️ === CONTENT ASSEMBLY START ===')
      const mergedJSON = this.createTipTapContent(mergedText, pageUuid)
      const mergedNodesWithMeta = mergedJSON.content

      console.log('🏗️ Merged JSON created:', {
        mergedJSONType: typeof mergedJSON,
        mergedJSONHasContent: !!mergedJSON.content,
        mergedNodesWithMetaType: typeof mergedNodesWithMeta,
        mergedNodesWithMetaIsArray: Array.isArray(mergedNodesWithMeta),
        mergedNodesWithMetaLength: mergedNodesWithMeta.length
      })

      // Create empty paragraph for spacing with today's metadata
      const spacingParagraph = {
        type: 'paragraph',
        content: [],
        attrs: {
          id: `${pageUuid}-spacing-${Date.now()}`,
          metadata: {
            id: `${pageUuid}-spacing-${Date.now()}`,
            isOrganized: false,
            lastUpdated: new Date().toISOString(),
            organizationStatus: 'no'
          }
        }
      }

      console.log('🏗️ Spacing paragraph created:', {
        spacingParagraphType: spacingParagraph.type,
        spacingParagraphId: spacingParagraph.attrs.id
      })

      // Build final content: new merged content at top + spacing + everything after boundary preserved
      console.log('🏗️ About to assemble final content:', {
        mergedNodesLength: mergedNodesWithMeta.length,
        spacingParagraphCount: 1,
        everythingAfterBoundaryLength: everythingAfterBoundary.length,
        totalExpectedLength: mergedNodesWithMeta.length + 1 + everythingAfterBoundary.length
      })

      const finalContent = [
        ...mergedNodesWithMeta,        // Today's new merged content at top
        spacingParagraph,              // Empty paragraph for spacing
        ...everythingAfterBoundary     // Everything after boundary preserved untouched
      ]

      console.log('🏗️ Final content assembled:', {
        finalContentType: typeof finalContent,
        finalContentIsArray: Array.isArray(finalContent),
        finalContentLength: finalContent.length,
        firstElementType: finalContent[0]?.type,
        lastElementType: finalContent[finalContent.length - 1]?.type
      })

      const result = {
        ...(existingContent || { type: 'doc' }),
        content: finalContent,
      }

      console.log('🏁 === SMART MERGE END ===')
      console.log('🏁 Final result:', {
        resultType: typeof result,
        resultHasContent: !!result.content,
        resultContentLength: result.content?.length,
        resultDocType: result.type
      })

      return result
    } catch (err) {
      console.error('smartMergeTipTapContent fallback', err)
      // fallback to simple append
      return this.mergeIntoTipTapContent(existingContent, newText, pageUuid)
    }
  }
} 