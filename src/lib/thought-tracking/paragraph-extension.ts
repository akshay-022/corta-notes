/**
 * Custom TipTap paragraph extension with metadata for thought tracking
 */

import { Paragraph } from '@tiptap/extension-paragraph'
import { mergeAttributes } from '@tiptap/core'

export const ThoughtParagraph = Paragraph.extend({
  name: 'paragraph',
  
  addAttributes() {
    return {
      ...this.parent?.(),
      
      // Temporal tracking
      lastUpdated: {
        default: null,
        parseHTML: element => element.getAttribute('data-last-updated'),
        renderHTML: attributes => {
          if (!attributes.lastUpdated) return {}
          return { 'data-last-updated': attributes.lastUpdated }
        },
      },
      
      // Processing status
      processingStatus: {
        default: 'unprocessed',
        parseHTML: element => element.getAttribute('data-processing-status'),
        renderHTML: attributes => {
          if (!attributes.processingStatus) return {}
          return { 'data-processing-status': attributes.processingStatus }
        },
      },
      
      // Document mapping
      mappedDocs: {
        default: [],
        parseHTML: element => {
          const docs = element.getAttribute('data-mapped-docs')
          return docs ? JSON.parse(docs) : []
        },
        renderHTML: attributes => {
          if (!attributes.mappedDocs || attributes.mappedDocs.length === 0) return {}
          return { 'data-mapped-docs': JSON.stringify(attributes.mappedDocs) }
        },
      },
      
      // Brain activity tracking
      brainActivity: {
        default: [],
        parseHTML: element => {
          const activity = element.getAttribute('data-brain-activity')
          return activity ? JSON.parse(activity) : []
        },
        renderHTML: attributes => {
          if (!attributes.brainActivity || attributes.brainActivity.length === 0) return {}
          return { 'data-brain-activity': JSON.stringify(attributes.brainActivity) }
        },
      },
      
      // Action tracking
      actionTaken: {
        default: '',
        parseHTML: element => element.getAttribute('data-action-taken'),
        renderHTML: attributes => {
          if (!attributes.actionTaken) return {}
          return { 'data-action-taken': attributes.actionTaken }
        },
      },
      
      // Thought linking
      thoughtId: {
        default: null,
        parseHTML: element => element.getAttribute('data-thought-id'),
        renderHTML: attributes => {
          if (!attributes.thoughtId) return {}
          return { 'data-thought-id': attributes.thoughtId }
        },
      },
      
      // Content hash for change detection
      contentHash: {
        default: null,
        parseHTML: element => element.getAttribute('data-content-hash'),
        renderHTML: attributes => {
          if (!attributes.contentHash) return {}
          return { 'data-content-hash': attributes.contentHash }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0]
  },
}) 