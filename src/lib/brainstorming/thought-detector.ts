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
    const contentBlocks: Array<{content: string, timestamp: Date, index: number}> = []
    
    editor.state.doc.content.content.forEach((node: { type: { name: string }, textContent: string, attrs: { lastUpdated?: string } }, index: number) => {
      // Get content from any node that has text
      const content = node.textContent.trim()
      if (content && node.attrs.lastUpdated) {
        const timestamp = new Date(node.attrs.lastUpdated)
        contentBlocks.push({ content, timestamp, index })
      }
    })

    // Sort by timestamp (most recent first), then by reverse index for same timestamps
    const recentContent = contentBlocks
      .sort((a, b) => {
        const timeDiff = b.timestamp.getTime() - a.timestamp.getTime()
        if (timeDiff !== 0) return timeDiff
        // If timestamps are the same, sort by reverse index (later positions first)
        return b.index - a.index
      })
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
  editor?: any,
  lastAiMessageTimestamp?: string
): string {
  let context =''
  
  // Get timestamps for context awareness
  let lastEditorUpdateTimestamp: Date | null = null
  
  // Get last thought from editor history and extract the most recent timestamp
  const lastThought = detectLastThought(editor)
  if (lastThought) {
    context += `MOST RECENT THOUGHT (This is EXTREMELY IMPORTANT, if the user has not given enough context, this line of thinking is the ONLY one you must complete) :\n${lastThought}\n\n\n\n`
    
    // Extract the most recent editor timestamp
    try {
      if (editor) {
        const contentBlocks: Array<{content: string, timestamp: Date, index: number}> = []
        
        editor.state.doc.content.content.forEach((node: { type: { name: string }, textContent: string, attrs: { lastUpdated?: string } }, index: number) => {
          const content = node.textContent.trim()
          // Only include nodes with actual content AND a timestamp
          if (content && content.length > 0 && node.attrs.lastUpdated) {
            const timestamp = new Date(node.attrs.lastUpdated)
            contentBlocks.push({ content, timestamp, index })
          }
        })

        // Get the most recent timestamp from non-empty paragraphs (with reverse index ordering for ties)
        if (contentBlocks.length > 0) {
          lastEditorUpdateTimestamp = contentBlocks
            .sort((a, b) => {
              const timeDiff = b.timestamp.getTime() - a.timestamp.getTime()
              if (timeDiff !== 0) return timeDiff
              // If timestamps are the same, sort by reverse index (later positions first)
              return b.index - a.index
            })[0].timestamp
        }
      }
    } catch (error) {
      console.error('Error extracting editor timestamp:', error)
    }
  }
  
  // Add timestamp context for AI awareness
  const timestampContext = []
  
  if (lastEditorUpdateTimestamp) {
    timestampContext.push(`LAST EDITOR UPDATE: ${lastEditorUpdateTimestamp.toISOString()}`)
  }
  
  if (lastAiMessageTimestamp) {
    const aiTimestamp = new Date(lastAiMessageTimestamp)
    timestampContext.push(`LAST AI MESSAGE: ${aiTimestamp.toISOString()}`)
  }
  
  if (timestampContext.length > 0) {
    context += `TIMING CONTEXT:\n${timestampContext.join('\n')}\n\n`
    
    // Add interpretation guidance
    if (lastEditorUpdateTimestamp && lastAiMessageTimestamp) {
      const editorTime = lastEditorUpdateTimestamp.getTime()
      const aiTime = new Date(lastAiMessageTimestamp).getTime()
      
      if (editorTime > aiTime) {
        context += `CONTEXT INTERPRETATION: User wrote in editor AFTER last AI message - likely referring to recent editor content.\n\n`
        context += `IMPORTANT: Since the editor update is most recent, you should probably reply in regard to what the user just wrote in the editor, not the previous chat messages.\n\n`
      } else {
        context += `CONTEXT INTERPRETATION: User's last AI message is more recent than editor updates - likely continuing current conversation.\n\n`
        context += `IMPORTANT: Since the chat conversation is more recent than editor updates, you should probably reply in regard to the previous messages in this chat conversation.\n\n`
      }
    }
    
    context += '\n\n'
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

  context = context + `

Some general guidelines for you again:

- Be helpful and concise
- If the user is asking something in line with their most recent thought, ONLY FOCUS ON THE MOST RECENT THOUGHT, and the question they asked. Do NOT add irrelevant things, or another summary of everything to them. BE SUPER considerte about what information you give. You MUST not overwhelm. 
- Use the timing context to understand if the user is referring to their recent editor writing or continuing the current AI conversation.

`
  
  return context.trim()
} 