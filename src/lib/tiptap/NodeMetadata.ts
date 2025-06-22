import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Adds `id` and `metadata` attributes to all common block-level nodes so that
 * they persist even when using the stock TipTap extensions. This lets our
 * thought-tracking & date-divider logic work on headings, lists, etc.
 */
export const NodeMetadata = Extension.create({
  name: 'nodeMetadata',

  addGlobalAttributes() {
    return [
      {
        // All node types we want to decorate. Extend if you use more.
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
          'blockquote',
          'codeBlock',
          'horizontalRule',
          // add more built-ins or custom types here if needed
        ],
        attributes: {
          id: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-paragraph-id'),
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.id) return {}
              return { 'data-paragraph-id': attributes.id }
            },
          },
          metadata: {
            default: null,
            /** Try to parse JSON stored in the HTML attr */
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute('data-thought-metadata')
              if (!raw) return null
              try {
                return JSON.parse(raw)
              } catch {
                return null
              }
            },
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.metadata) return {}
              return { 'data-thought-metadata': JSON.stringify(attributes.metadata) }
            },
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('preventDuplicateNodeMetadata'),
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr
          let modified = false

          const seenIds = new Set<string>()

          newState.doc.descendants((node, pos) => {
            const metaId: string | undefined = node.attrs?.metadata?.id
            if (!metaId) return true // continue

            if (seenIds.has(metaId)) {
              // Duplicate ID found – clear metadata to prevent inheritance
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                metadata: null,
              })
              modified = true
            } else {
              seenIds.add(metaId)
            }

            return true
          })

          return modified ? tr : null
        },
      }),
    ]
  },
}) 