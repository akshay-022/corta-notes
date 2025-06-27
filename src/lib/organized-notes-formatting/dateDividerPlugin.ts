import { Extension } from '@tiptap/core'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Plugin } from 'prosemirror-state'

export const DateDividerPlugin = Extension.create({
  name: 'dateDivider',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const { doc } = state
            const decorations: Decoration[] = []

            let prevDate: string | null = null
            const fmt = (iso: string) => {
              const date = new Date(iso)
              // Format as local date YYYY-MM-DD
              const year = date.getFullYear()
              const month = String(date.getMonth() + 1).padStart(2, '0')
              const day = String(date.getDate()).padStart(2, '0')
              return `${year}-${month}-${day}`
            }

            doc.descendants((node, pos) => {
              // Only consider block nodes with metadata
              const dateIso = (node.attrs?.metadata as any)?.lastUpdated
              if (!dateIso) return true
              const day = fmt(dateIso)
              if (prevDate === null) {
                prevDate = day
                // first node gets a heading regardless
                decorations.push(
                  Decoration.widget(pos, () => {
                    const el = document.createElement('h3')
                    el.textContent = day
                    el.className = 'mt-6 mb-2 text-lg font-semibold'
                    return el
                  })
                )
              } else if (day !== prevDate && day < prevDate) {
                // day changed moving back in time; insert heading
                prevDate = day
                decorations.push(
                  Decoration.widget(pos, () => {
                    const el = document.createElement('h3')
                    el.textContent = day
                    el.className = 'mt-6 mb-2 text-lg font-semibold'
                    return el
                  })
                )
              }
              return true
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
}) 