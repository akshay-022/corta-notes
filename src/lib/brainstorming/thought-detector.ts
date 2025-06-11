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
    // Import here to avoid circular dependencies
    const { getBrainState } = require('@/lib/thought-tracking/brain-state')
    
    const brainState = getBrainState()
    const recentBuffer = brainState.recentBuffer.text
    
    if (recentBuffer.trim()) {
      // Return the last part of the buffer (most recent typing)
      const recentText = recentBuffer.slice(-200) // Last 200 chars for context
      return `Recent thoughts: "${recentText.trim()}"`
    }
    
    // Fallback to current editor content if buffer is empty
    if (editor && editor.getText) {
      const currentContent = editor.getText()
      if (currentContent.trim()) {
        const recentText = currentContent.slice(-200)
        return `Current content: "${recentText.trim()}"`
      }
    }
    
    return ''
    
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
  let context = ''
  
  // Get last thought from editor history
  const lastThought = detectLastThought(editor)
  if (lastThought) {
    context += `MOST RECENT THOUGHT:\n${lastThought}\n\n`
  }
  
  // Get organized brain state categories
  try {
    const { getBrainState } = require('@/lib/thought-tracking/brain-state')
    const brainState = getBrainState()
    
    const categories = Object.keys(brainState.thoughtCategories)
    if (categories.length > 0) {
             const organizedThoughts = categories.map(category => {
         const thoughts = brainState.thoughtCategories[category]
         const thoughtsList = thoughts.map((thought: any) => 
           `- ${thought.content.slice(0, 100)}${thought.content.length > 100 ? '...' : ''}`
         ).join('\n')
        
        return `${category.toUpperCase()}:\n${thoughtsList}`
      }).join('\n\n')
      
      context += `ORGANIZED THOUGHTS:\n${organizedThoughts}\n\n`
    }
  } catch (error) {
    console.error('Error getting brain state for context:', error)
  }
  
  // Current page content (highest priority)
  if (currentPage) {
    const pageContent = extractTextFromTipTap(currentPage.content)
    if (pageContent) {
      context += `CURRENT PAGE CONTENT:\n${pageContent}\n\n`
    }
  }
  
  return context.trim()
} 