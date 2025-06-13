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
    // Return stringified JSON of currentContext
    return JSON.stringify(brainState.currentContext)
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
    context += `MOST RECENT THOUGHT (This is EXTREMELY IMPORTANT, if the user has not given enough context, this line of thinking is the ONLY one you must complete) :\n${lastThought}\n\n\n\n`
  }
  
  // Get organized brain state categories as a clean JSON
  try {
    const { getBrainState } = require('@/lib/thought-tracking/brain-state')
    const brainState = getBrainState()
    // Build a clean object: { category: [thoughtContent, ...] }
    const cleanCategories: Record<string, string[]> = {}
    for (const category of Object.keys(brainState.categories)) {
      cleanCategories[category] = (brainState.categories[category].thoughts || [])
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