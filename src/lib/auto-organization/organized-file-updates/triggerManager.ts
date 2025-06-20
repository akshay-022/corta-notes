import { Editor } from '@tiptap/react'
import logger from '@/lib/logger'
import { organizePage } from './organizer'

export function setupAutoOrganization(
  editor: Editor,
  pageUuid: string,
  pageTitle: string,
  idleMs: number = 30_000,
  doubleEnterMs: number = 400
) {
  let idleTimer: NodeJS.Timeout | null = null
  let lastTriggerTs = 0 // prevent rapid-fire

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(triggerOrganization, idleMs)
  }

  const triggerOrganization = () => {
    const now =Date.now()
    if (now - lastTriggerTs < 1000) return // debounce 1s
    lastTriggerTs = now
    organizePage({ editor, pageUuid, pageTitle })
  }

  const handleUpdate = () => {
    resetIdle()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    resetIdle()

    if (e.key === 'Enter') {
      // Wait for the doc to update after the Enter press
      setTimeout(() => {
        if (isDoubleEmptyParagraph(editor)) {
          triggerOrganization()
        }
      }, 0)
    }
  }

  // Attach listeners
  editor.on('update', handleUpdate)
  const dom = editor.view.dom as HTMLElement
  dom.addEventListener('keydown', handleKeyDown)

  // Start idle timer on mount
  resetIdle()

  logger.info('Auto-organization triggers installed', { pageUuid })

  return () => {
    editor.off('update', handleUpdate)
    dom.removeEventListener('keydown', handleKeyDown)
    if (idleTimer) clearTimeout(idleTimer)
  }
}

// Helper: detect if current and previous paragraph are empty, but previous previous is not.
function isDoubleEmptyParagraph(editor: Editor): boolean {
  const { state } = editor
  const { doc, selection } = state

  // Collect paragraphs and their positions in order
  const paragraphs: Array<{ node: any; pos: number }> = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push({ node, pos })
    }
  })

  // Find index of paragraph containing selection
  const selPos = selection.from
  const idx = paragraphs.findIndex((p) => selPos >= p.pos && selPos < p.pos + p.node.nodeSize)
  if (idx === -1) return false

  const isEmpty = (node: any) => node.textContent.trim() === ''

  const currEmpty = isEmpty(paragraphs[idx].node)
  const prevEmpty = idx > 0 ? isEmpty(paragraphs[idx - 1].node) : false
  const prevPrevNotEmpty = idx > 1 ? !isEmpty(paragraphs[idx - 2].node) : false

  return currEmpty && prevEmpty && prevPrevNotEmpty
} 