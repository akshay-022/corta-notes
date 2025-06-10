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
 * Detects the last thought by analyzing TipTap history state
 * Returns what was written after the last undo (most recent thinking)
 */
export function detectLastThought(editor: any): string {
  if (!editor) return ''
  
  try {
    // Get the history state from TipTap
    const historyState = editor.state.plugins.find((plugin: any) => plugin.key === 'history$')?.getState?.(editor.state)
    
    if (!historyState) return ''
    
    // If there are undone steps, the user has undone something and then continued typing
    // This represents their most recent thought direction
    if (historyState.undone && historyState.undone.length > 0) {
      // Get the current document content
      const currentContent = editor.getText()
      
      // Get the content from before the last series of undos
      // This is a simplified approach - we could get more sophisticated
      const lastUndoneStep = historyState.undone[historyState.undone.length - 1]
      
      // For now, just return a indication that there was recent editing after undo
      return `[Recent editing detected after undo - current content length: ${currentContent.length} chars]`
    }
    
    // If no undos, check if there are recent changes in the done stack
    if (historyState.done && historyState.done.length > 0) {
      return `[Recent editing detected - ${historyState.done.length} changes in history]`
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
  
  // Get recent "soon" pages (3 most recent)
  const recentPages = allPages
    .filter(page => 
      !((page.metadata as any)?.isFolder) && 
      (page.metadata as any)?.organizeStatus === 'soon' &&
      page.uuid !== currentPage?.uuid
    )
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, 3)
  
  if (recentPages.length > 0) {
    const pagesContext = recentPages.map(page => {
      const content = extractTextFromTipTap(page.content)
      const preview = content.slice(0, 200) + (content.length > 200 ? '...' : '')
      return `"${page.title}": ${preview}`
    }).join('\n\n')
    
    context += `RECENT PAGES YOU'RE WORKING ON:\n${pagesContext}\n\n`
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