import { RefinementItem, LineEdit } from '@/thought-tracking/core/organization/types'
import { TIPTAP_FORMATTING_PROMPT } from '@/lib/promptTemplates'
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
${TIPTAP_FORMATTING_PROMPT}

EXISTING RECENT PARAGRAPHS (with IDs):
${recentBlockText}

NEW CONTENT TO INTEGRATE:
${newText}${organizationRulesSection}

TASK: Decide ABOVE WHICH paragraph ID the merged content should be inserted (that paragraph and everything after it stay below).
Create one cohesive, well-formatted section that combines both the recent paragraphs (you may rewrite them) and the new content.
IMPORTANT: Do NOT output any standalone page title or heading at the very top. Start directly with the merged content section.

CRITICAL REQUIREMENTS:
• Write like PERSONAL NOTES, not formal documents
• Keep the user's original voice and tone - if they write urgently, keep it urgent
• NO corporate speak, NO "Overview/Summary" sections, NO repetitive bullet points  
• BE CONCISE - eliminate all redundancy and fluff
• DO NOT DROP any important detail – the merged section must include every key idea from both recent paragraphs and new text
• Focus on WHAT MATTERS - actionable insights, not descriptions
• Use natural, conversational language like talking to yourself
• Preserve strong emotions, caps, urgency - don't sanitize the user's voice
• Combine similar ideas into single, clear statements
• Use simple formatting - basic bullets or numbered lists, not complex structures
• Prefer bullet points and short lists; break complex ideas into concise bullets for easy scanning — **no walls of text**
• Never output raw HTML tags like <br> – use real line breaks or Markdown only

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

      const mergedJSON = this.createTipTapContent(mergedText, pageUuid)
      // Metadata is already added by createTipTapContent, but ensure it's applied
      const mergedNodesWithMeta = mergedJSON.content

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
      return this.mergeIntoTipTapContent(existingContent, newText, pageUuid)
    }
  }
} 