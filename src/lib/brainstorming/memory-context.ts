import { memoryService } from '@/lib/memory-providers/memory-service-supermemory'
import { MemoryDocument } from '@/lib/memory-providers/types'
import { createClient } from '@/lib/supabase/supabase-server'

export interface RelevantMemory {
  id: string
  title: string
  content: string
  score?: number
  pageUuid?: string | null
  metadata?: any
}

/**
 * Get current page context and recent unorganized pages
 */
async function getCurrentPageContext(currentPageUuid?: string): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return ''
    }

    let contextText = ''

    // Get current page if we have the UUID
    if (currentPageUuid) {
      const { data: currentPage } = await supabase
        .from('pages')
        .select('uuid, title, content_text, updated_at')
        .eq('uuid', currentPageUuid)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .single()

      if (currentPage) {
        contextText += `CURRENT PAGE (HIGHEST PRIORITY - especially focus on what's at the end):\n`
        contextText += `Title: ${currentPage.title}\n`
        contextText += `Content: ${currentPage.content_text}\n\n`
        contextText += `^^^ FOCUS HEAVILY ON THE END OF THIS CURRENT PAGE CONTENT ^^^\n\n`
      }
    }

    // Get 2 most recent unorganized pages (excluding current page)
    const { data: recentPages } = await supabase
      .from('pages')
      .select('uuid, title, content_text, updated_at')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .eq('organized', false)
      .neq('uuid', currentPageUuid || '')
      .order('updated_at', { ascending: false })
      .limit(2)

    if (recentPages && recentPages.length > 0) {
      contextText += `RECENT UNORGANIZED PAGES (for additional context only):\n\n`
      recentPages.forEach((page, index) => {
        contextText += `${index + 1}. ${page.title}\n`
        contextText += `${page.content_text.slice(0, 500)}...\n\n`
      })
    }

    return contextText

  } catch (error) {
    console.error('Error getting current page context:', error)
    return ''
  }
}

/**
 * Build enhanced search query with current page context
 */
async function buildEnhancedSearchQuery(userQuestion: string, currentPageUuid?: string): Promise<string> {
  try {
    const pageContext = await getCurrentPageContext(currentPageUuid)
    
    if (pageContext) {
      return `${userQuestion}\n\nCONTEXT:\n${pageContext}`
    }
    
    return userQuestion
    
  } catch (error) {
    console.error('Error building enhanced search query:', error)
    return userQuestion
  }
}

/**
 * Retrieves relevant memories from previous conversations
 * Used for cross-conversation memory search without page context
 * Filters out low-confidence results (below 30%)
 */
export async function getRelevantChatMemories(
  userQuestionAndSummary: string,
  maxResults: number = 5
): Promise<RelevantMemory[]> {
  try {
    // Check if memory service is configured
    if (!memoryService.isConfigured()) {
      console.log('Memory service not configured, skipping chat memory search')
      return []
    }

    console.log('Searching memory service for relevant chat memories...')
    
    // Get authenticated user for user-scoped search
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('No authenticated user found, skipping chat memory search')
      return []
    }

    // Direct search without page context enhancement
    const searchResults = await memoryService.search(userQuestionAndSummary, user.id, maxResults, ['chat'])

    if (!searchResults || searchResults.length === 0) {
      console.log('No chat memory search results found')
      return []
    }

    // Filter out low-confidence results (below 30%)
    const highConfidenceResults = searchResults.filter(doc => {
      const confidence = doc.score || 0
      return confidence >= 0.3 // Only include results with 30%+ confidence
    })
    
    console.log(`Found ${searchResults.length} chat memories, ${highConfidenceResults.length} with confidence >= 30%`)

    // Convert to our interface format
    return highConfidenceResults.map(doc => ({
      id: doc.id || '',
      title: doc.title || 'Untitled Document',
      content: doc.content || '',
      score: doc.score,
      pageUuid: doc.metadata?.pageUuid || null,
      metadata: doc.metadata || {}
    }))

  } catch (error) {
    console.error('Chat memory service search failed:', error)
    return [] // Return empty array if search fails
  }
}

/**
 * Retrieves relevant documents from SuperMemory based on current thought/question
 * Enhanced with current page context for better relevance
 * Filters out low-confidence results (below 30%)
 */
export async function getRelevantDocMemories(
  userQuestion: string,
  maxResults: number = 5,
  currentPageUuid?: string
): Promise<RelevantMemory[]> {
  try {
    // Check if memory service is configured
    if (!memoryService.isConfigured()) {
      console.log('Memory service not configured, skipping document memory search')
      return []
    }

    console.log('Searching memory service for relevant document memories...')
    
    // Get authenticated user for user-scoped search
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('No authenticated user found, skipping document memory search')
      return []
    }

    // Enhanced search query with current page context
    const enhancedQuery = await buildEnhancedSearchQuery(userQuestion, currentPageUuid)
    console.log('Enhanced search query with current page context')

    // Search SuperMemory for relevant documents
    const searchResults = await memoryService.search(enhancedQuery, user.id, maxResults)

    if (!searchResults || searchResults.length === 0) {
      console.log('No document memory search results found')
      return []
    }

    // Filter out low-confidence results (below 30%)
    const highConfidenceResults = searchResults.filter(doc => {
      const confidence = doc.score || 0
      return confidence >= 0.3 // Only include results with 30%+ confidence
    })
    
    console.log(`Found ${searchResults.length} document memories, ${highConfidenceResults.length} with confidence >= 30%`)

    // Convert to our interface format
    return highConfidenceResults.map(doc => ({
      id: doc.id || '',
      title: doc.title || 'Untitled Document',
      content: doc.content || '',
      score: doc.score,
      pageUuid: doc.metadata?.pageUuid || null,
      metadata: doc.metadata || {}
    }))

  } catch (error) {
    console.error('Document memory service search failed:', error)
    return [] // Return empty array if search fails
  }
}

/**
 * Formats memory documents into context text for AI consumption
 */
export function formatMemoryContext(memories: RelevantMemory[]): string {
  if (memories.length === 0) return ''
  
  return memories
    .map((doc, index) => `DOCUMENT ${index + 1} (${doc.title}):\n${doc.content}`)
    .join('\n\n---\n\n')
}

/**
 * Gets memory context as formatted text ready for AI prompt
 * Combines search and formatting in one convenient function
 * Uses document memory search with page context
 */  
export async function createMemoryContext(
  userQuestion: string,
  maxResults: number = 5,
  currentPageUuid?: string
): Promise<string> {
  const memories = await getRelevantDocMemories(userQuestion, maxResults, currentPageUuid)
  return formatMemoryContext(memories)
}

/**
 * Gets chat memory context as formatted text ready for AI prompt
 * Combines search and formatting in one convenient function
 * Uses chat memory search without page context
 */  
export async function createChatMemoryContext(
  userQuestion: string,
  maxResults: number = 5
): Promise<string> {
  const memories = await getRelevantChatMemories(userQuestion, maxResults)
  return formatMemoryContext(memories)
} 