import { Page } from '@/lib/supabase/types'

/**
 * Extracts plain text content from TipTap JSON structure
 */
function extractTextFromTipTap(content: any): string {
  if (!content || !content.content) return ''
  
  return content.content.map((node: any) => {
    if (node.type === 'paragraph' && node.content) {
      return node.content.map((textNode: any) => textNode.text || '').join('')
    } else if (node.type === 'heading' && node.content) {
      const text = node.content.map((textNode: any) => textNode.text || '').join('')
      return `# ${text}`
    } else if (node.type === 'bulletList' && node.content) {
      return node.content.map((listItem: any) => {
        if (listItem.type === 'listItem' && listItem.content) {
          return listItem.content.map((item: any) => {
            if (item.type === 'paragraph' && item.content) {
              return `• ${item.content.map((textNode: any) => textNode.text || '').join('')}`
            }
            return ''
          }).filter(Boolean).join('\n')
        }
        return ''
      }).filter(Boolean).join('\n')
    } else if (node.type === 'orderedList' && node.content) {
      return node.content.map((listItem: any, index: number) => {
        if (listItem.type === 'listItem' && listItem.content) {
          return listItem.content.map((item: any) => {
            if (item.type === 'paragraph' && item.content) {
              return `${index + 1}. ${item.content.map((textNode: any) => textNode.text || '').join('')}`
            }
            return ''
          }).filter(Boolean).join('\n')
        }
        return ''
      }).filter(Boolean).join('\n')
    } else if (node.type === 'codeBlock' && node.content) {
      const code = node.content.map((textNode: any) => textNode.text || '').join('')
      return `\`\`\`\n${code}\n\`\`\``
    } else if (node.type === 'blockquote' && node.content) {
      return node.content.map((item: any) => {
        if (item.type === 'paragraph' && item.content) {
          return `> ${item.content.map((textNode: any) => textNode.text || '').join('')}`
        }
        return ''
      }).filter(Boolean).join('\n')
    }
    return ''
  }).filter(Boolean).join('\n\n')
}

/**
 * Detects the last thought using our brain state buffer
 * Returns the recent buffer content (last 600 characters)
 */
export function detectLastThought(editor: any): string {
  try {
    if (!editor) return ''

    // Get all content blocks with their metadata
    const contentBlocks: Array<{content: string, timestamp: Date}> = []
    
    editor.state.doc.content.content.forEach((node: { type: { name: string }, textContent: string, attrs: { lastUpdated?: string } }) => {
      // Get content from any node that has text
      const content = node.textContent.trim()
      if (content) {
        const timestamp = node.attrs.lastUpdated ? new Date(node.attrs.lastUpdated) : new Date()
        contentBlocks.push({ content, timestamp })
      }
    })

    // Sort by timestamp (most recent first) and take last 5
    const recentContent = contentBlocks
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5)
      .map(p => p.content)
      .join('\n\n')

    return 'MOST RECENT TO SLIGHTLY LESS RECENT ORDER : \n' + recentContent || ''
  } catch (error) {
    console.error('Error detecting last thought:', error)
    return ''
  }
}

/**
 * Creates context from recent pages and current thought
 * Simple, clean function that just gets what's needed
 */
export function createThoughtContext(
  allPages: Page[],
  currentPage?: Page,
  editor?: any
): string {
  let context =''
  
  // Get last thought from editor history
  const lastThought = detectLastThought(editor)
  if (lastThought) {
    context += `MOST RECENT THOUGHT (This is EXTREMELY IMPORTANT, if the user has not given enough context, this line of thinking is the ONLY one you must complete) :\n${lastThought}\n\n\n\n`
  }
  
  // Get organized brain state categories as a clean JSON
  try {
    const { getBrainState } = require('@/lib/thought-tracking/brain-state')
    const brainState = getBrainState()
    // Build a clean object: { category: [thoughtContent, ...] }
    const cleanCategories: Record<string, string[]> = {}
    for (const category of Object.keys(brainState.categories)) {
      cleanCategories[category] = brainState.categories[category]
        .map((thought: any) => thought.content)
    }
    // Stringify for LLM
    context += `CLEANED THOUGHTS (JSON):\n${JSON.stringify(cleanCategories, null, 2)}\n\n\n\n`
  } catch (error) {
    console.error('Error getting brain state for context:', error)
  }
  
  // Current page content (highest priority)
  if (currentPage) {
    const pageContent = extractTextFromTipTap(currentPage.content)
    if (pageContent) {
      context += `CURRENT PAGE CONTENT:\n${pageContent}\n\n\n\n`
    }
  }
  
  return context.trim()
} 