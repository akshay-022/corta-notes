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
 * Extract the most recent editor timestamp from paragraph metadata
 */
function getLastEditorUpdateTimestamp(editor?: any): Date | null {
  if (!editor) return null
  
  try {
    const contentBlocks: Array<{content: string, timestamp: Date, index: number}> = []
    
    editor.state.doc.content.content.forEach((node: { type: { name: string }, textContent: string, attrs: { metadata?: { lastUpdated?: string } } }, index: number) => {
      const content = node.textContent.trim()
      // Only include nodes with actual content AND a timestamp
      if (content && content.length > 0 && node.attrs.metadata?.lastUpdated) {
        const timestamp = new Date(node.attrs.metadata.lastUpdated)
        contentBlocks.push({ content, timestamp, index })
      }
    })

    // Get the most recent timestamp from non-empty paragraphs (with reverse index ordering for ties)
    if (contentBlocks.length > 0) {
      return contentBlocks
        .sort((a, b) => {
          const timeDiff = b.timestamp.getTime() - a.timestamp.getTime()
          if (timeDiff !== 0) return timeDiff
          // If timestamps are the same, sort by reverse index (later positions first)
          return b.index - a.index
        })[0].timestamp
    }
  } catch (error) {
    console.error('Error extracting editor timestamp:', error)
  }
  
  return null
}

/**
 * Creates context from recent pages and current thought
 * Simple, clean function that just gets what's needed
 */
export function createThoughtContext(
  allPages: Page[],
  currentPage?: Page,
  editor?: any,
  lastAiMessageTimestamp?: string,
  lastUserMessageTimestamp?: string
): string {
  let context = ''
  
  // Get timestamps for context awareness
  const lastEditorUpdateTimestamp = getLastEditorUpdateTimestamp(editor)
  
  // Add timestamp context for AI awareness
  const timestampContext = []
  
  if (lastEditorUpdateTimestamp) {
    timestampContext.push(`LAST EDITOR UPDATE: ${lastEditorUpdateTimestamp.toISOString()}`)
  }
  
  if (lastAiMessageTimestamp) {
    const aiTimestamp = new Date(lastAiMessageTimestamp)
    timestampContext.push(`LAST AI MESSAGE: ${aiTimestamp.toISOString()}`)
  }
  
  if (lastUserMessageTimestamp) {
    const userTimestamp = new Date(lastUserMessageTimestamp)
    timestampContext.push(`LAST USER MESSAGE: ${userTimestamp.toISOString()}`)
  }
  
  if (timestampContext.length > 0) {
    context += `TIMING CONTEXT:\n${timestampContext.join('\n')}\n\n`
    
    // Enhanced interpretation guidance using the most recent user message
    const editorTime = lastEditorUpdateTimestamp?.getTime() || 0
    const userMessageTime = lastUserMessageTimestamp ? new Date(lastUserMessageTimestamp).getTime() : 0
    
    // Compare editor update time vs last user message time
    if (editorTime > 0 && userMessageTime > 0) {
      const timeDiffSeconds = Math.abs(editorTime - userMessageTime) / 1000
      console.log(`Brainstorming timestamp analysis: Editor=${new Date(editorTime).toISOString()}, UserMessage=${new Date(userMessageTime).toISOString()}, Diff=${timeDiffSeconds}s`)
      
      if (editorTime > userMessageTime) {
        context += `CONTEXT INTERPRETATION: User wrote in editor AFTER their last message - likely referring to recent editor content.\n\n`
        context += `IMPORTANT: Since the editor update is more recent than the user's last message, you should probably reply about what the user just wrote in the editor, not the previous chat messages.\n\n`
      } else {
        context += `CONTEXT INTERPRETATION: User's last message is more recent than editor updates - likely continuing current conversation.\n\n`
        context += `IMPORTANT: Since the user's last message is more recent than editor updates, you should probably reply about the previous chat conversation context.\n\n`
      }
    } else if (editorTime > 0) {
      context += `CONTEXT INTERPRETATION: User has recent editor activity - likely referring to editor content.\n\n`
    } else if (userMessageTime > 0) {
      context += `CONTEXT INTERPRETATION: User has chat history - likely continuing conversation.\n\n`
    }
    
    context += '\n\n'
  }
  
  // Get brain state summary
  try {
    const { getBrainState } = require('@/lib/thought-tracking/brain-state')
    const brainState = getBrainState()
    if (brainState?.summary) {
      context += `Here is a summary of the user's brain state until now:\n${brainState.summary}\n\n\n\n`
    }
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

Some general guidelines for you:

- Use the timing context to understand if the user is referring to their recent editor writing or continuing the current AI conversation.
- Provide comprehensive, detailed responses that help with brainstorming and idea development.

`
  
  return context.trim()
} 