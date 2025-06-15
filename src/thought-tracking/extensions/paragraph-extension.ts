import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface ThoughtParagraphOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    thoughtParagraph: {
      /**
       * Set a paragraph node with thought tracking metadata
       */
      setThoughtParagraph: (attributes?: { id?: string, metadata?: any }) => ReturnType
    }
  }
}

export const ThoughtParagraph = Node.create<ThoughtParagraphOptions>({
  name: 'paragraph',

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      { tag: 'p' },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      'data-paragraph-id': node.attrs.id || `para-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      'data-thought-metadata': node.attrs.metadata ? JSON.stringify(node.attrs.metadata) : undefined,
    })

    return ['p', attrs, 0]
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-paragraph-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          return {
            'data-paragraph-id': attributes.id,
          }
        },
      },
      metadata: {
        default: null,
        parseHTML: element => {
          const metadata = element.getAttribute('data-thought-metadata')
          return metadata ? JSON.parse(metadata) : null
        },
        renderHTML: attributes => {
          if (!attributes.metadata) {
            return {}
          }
          return {
            'data-thought-metadata': JSON.stringify(attributes.metadata),
          }
        },
      },
    }
  },

  addCommands() {
    return {
      setThoughtParagraph: (attributes) => ({ commands }) => {
        return commands.setNode(this.name, attributes)
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setThoughtParagraph(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('thoughtParagraphAutoId'),
        appendTransaction: (transactions, oldState, newState) => {
          const tr = newState.tr
          let modified = false

          // Auto-assign IDs to paragraphs that don't have them
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'paragraph' && !node.attrs.id) {
              const id = `para-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id })
              modified = true
            }
          })

          return modified ? tr : null
        },
      }),
    ]
  },
}) 