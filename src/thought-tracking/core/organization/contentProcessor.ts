import { RefinementItem, LineEdit } from './types';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Heading from '@tiptap/extension-heading';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import Code from '@tiptap/extension-code';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Markdown } from 'tiptap-markdown';

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
  Markdown.configure({
    html: false, // Don't allow HTML input
    transformPastedText: false,
    transformCopiedText: false,
  }),
];

export class ContentProcessor {
  /**
   * Apply refinements to content while preserving original meaning
   */
  applyRefinements(
    originalContent: string,
    refinements: RefinementItem[],
    edits: LineEdit[]
  ): { refinedContent: string; errors: string[] } {
    const errors: string[] = [];
    let refinedContent = originalContent;

    // Create a map of paragraph IDs to their content for verification
    const editMap = new Map<string, LineEdit>();
    edits.forEach(edit => editMap.set(edit.lineId, edit));

    for (const refinement of refinements) {
      const originalEdit = editMap.get(refinement.paragraphId);
      
      if (!originalEdit) {
        errors.push(`Refinement references unknown paragraph ID: ${refinement.paragraphId}`);
        continue;
      }

      // Verify that the original content matches
      if (originalEdit.content !== refinement.originalContent) {
        errors.push(`Content mismatch for paragraph ${refinement.paragraphId}`);
        // Use the actual content from the edit
        refinement.originalContent = originalEdit.content;
      }

      // Validate refinement quality
      const qualityCheck = this.validateRefinementQuality(
        refinement.originalContent,
        refinement.refinedContent
      );

      if (!qualityCheck.isValid) {
        errors.push(`Poor refinement quality for ${refinement.paragraphId}: ${qualityCheck.reason}`);
        // Fall back to original content
        refinement.refinedContent = refinement.originalContent;
      }
    }

    // Apply refinements to create the final content
    const refinedParagraphs: string[] = [];
    
    for (const edit of edits) {
      const refinement = refinements.find(r => r.paragraphId === edit.lineId);
      
      if (refinement) {
        refinedParagraphs.push(refinement.refinedContent);
      } else {
        // No refinement found, use original content
        refinedParagraphs.push(edit.content);
      }
    }

    refinedContent = refinedParagraphs.join('\n\n');

    return {
      refinedContent,
      errors
    };
  }

  /**
   * Validate the quality of a refinement
   */
  private validateRefinementQuality(
    original: string,
    refined: string
  ): { isValid: boolean; reason?: string } {
    // Check if content was significantly altered
    const originalWords = original.toLowerCase().split(/\s+/);
    const refinedWords = refined.toLowerCase().split(/\s+/);
    
    const commonWords = originalWords.filter(word => refinedWords.includes(word));
    const similarity = commonWords.length / Math.max(originalWords.length, refinedWords.length);
    
    if (similarity < 0.4) {
      return {
        isValid: false,
        reason: 'Content was significantly altered, preserving original'
      };
    }

    // Check for empty refinement
    if (!refined.trim()) {
      return {
        isValid: false,
        reason: 'Refinement is empty'
      };
    }

    // Check for reasonable length changes
    const lengthRatio = refined.length / original.length;
    if (lengthRatio > 3 || lengthRatio < 0.3) {
      return {
        isValid: false,
        reason: 'Refinement changed length too drastically'
      };
    }

    return { isValid: true };
  }

  /**
   * Create TipTap JSON from Markdown text using TipTap Markdown extension
   */
  createTipTapContent(text: string): any {
    try {
      // Create a temporary editor to parse Markdown
      const editor = new Editor({
        extensions,
        content: text, // TipTap with Markdown extension will parse this as Markdown
      })
      
      const json = editor.getJSON()
      editor.destroy() // Clean up
      return json
    } catch (error) {
      console.error('Error parsing markdown with TipTap:', error)
      // Fallback to simple paragraph structure
      return {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }]
        }]
      }
    }
  }

  /**
   * Merge content into existing TipTap structure using Markdown parsing
   */
  mergeIntoTipTapContent(existingContent: any, newText: string): any {
    // Use our Markdown parser to properly handle formatting
    const newContentJSON = this.createTipTapContent(newText);
    
    return {
      ...existingContent,
      content: [...(existingContent?.content || []), ...(newContentJSON?.content || [])]
    };
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