export type TipTapDoc = {
  type: string
  content?: any[]
  [key: string]: any
}

/**
 * Insert date headings (### YYYY-MM-DD) whenever the lastUpdated day changes.
 * Returns a NEW TipTap doc – original object is not mutated.
 */
export function addDateDividers(doc: TipTapDoc): TipTapDoc {
  if (!doc?.content || !Array.isArray(doc.content)) return doc

  const newContent: any[] = []
  let previousDate: string | null = null

  const fmt = (iso: string) => iso.slice(0, 10) // YYYY-MM-DD

  for (const node of doc.content) {
    const dateIso: string | undefined = node?.attrs?.metadata?.lastUpdated
    const day = dateIso ? fmt(dateIso) : null

    if (day && day !== previousDate) {
      // Insert heading node
      newContent.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: day }],
      })
      previousDate = day
    }

    newContent.push(node)
  }

  return { ...doc, content: newContent }
} 