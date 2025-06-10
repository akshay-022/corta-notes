import { memoryService } from '@/lib/memory/memory-service-supermemory'
import { MemoryDocument } from '@/lib/memory/types'
import { createClient } from '@/lib/supabase/supabase-client'

export interface RelevantMemory {
  id: string
  title: string
  content: string
  score?: number
  pageUuid?: string | null
  metadata?: any
}

/**
 * Retrieves relevant documents from SuperMemory based on current thought/question
 * Filters out low-confidence results (below 30%)
 */
export async function getRelevantMemories(
  userQuestion: string,
  maxResults: number = 5
): Promise<RelevantMemory[]> {
  try {
    // Check if memory service is configured
    if (!memoryService.isConfigured()) {
      console.log('Memory service not configured, skipping memory search')
      return []
    }

    console.log('Searching memory service for relevant context...')
    
    // Get authenticated user for user-scoped search
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('No authenticated user found, skipping memory search')
      return []
    }

    // Search SuperMemory for relevant documents
    const searchResults = await memoryService.search(userQuestion, user.id, maxResults)

    if (!searchResults || searchResults.length === 0) {
      console.log('No memory search results found')
      return []
    }

    // Filter out low-confidence results (below 30%)
    const highConfidenceResults = searchResults.filter(doc => {
      const confidence = doc.score || 0
      return confidence >= 0.3 // Only include results with 30%+ confidence
    })
    
    console.log(`Found ${searchResults.length} documents, ${highConfidenceResults.length} with confidence >= 30%`)

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
    console.error('Memory service search failed:', error)
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
 */  
export async function createMemoryContext(
  userQuestion: string,
  maxResults: number = 5
): Promise<string> {
  const memories = await getRelevantMemories(userQuestion, maxResults)
  return formatMemoryContext(memories)
} 