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
 * Retrieves relevant memories from previous conversations
 * Used for cross-conversation memory search without page context
 * Filters out low-confidence results (below 30%)
 */
export async function getRelevantChatMemories(
  userQuestion: string,
  conversationSummary: string,
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
    const searchResults = await memoryService.search(userQuestion + ' ' + conversationSummary, user.id, maxResults, ['chat'])

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
  conversationSummary: string,
  maxResults: number = 5
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

    // Search SuperMemory for relevant documents
    const searchResults = await memoryService.search(userQuestion + ' ' + conversationSummary, user.id, maxResults, ['docs'])

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
    const docMemories = highConfidenceResults.map(doc => ({
      id: doc.id || '',
      title: doc.title || 'Untitled Document',
      content: doc.content || '',
      score: doc.score,
      pageUuid: doc.metadata?.pageUuid || null,
      metadata: doc.metadata || {}
    }));

    // Enrich with full document content from Supabase
    const enrichedMemories = await enrichDocMemoriesWithFullContent(docMemories);
    
    return enrichedMemories;

  } catch (error) {
    console.error('Document memory service search failed:', error)
    return [] // Return empty array if search fails
  }
}




/**
 * Retrieves relevant path memories by using the existing suggestion helper
 * to find the most relevant file paths in the current file tree
 */
export async function getRelevantPathMemories(
  userQuestion: string,
  conversationSummary: string,
  maxResults: number = 5
): Promise<RelevantMemory[]> {
  try {
    console.log('Finding relevant paths using suggestion helper...')
    
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('No authenticated user found, skipping path memory search')
      return []
    }

    // Import the suggestion helper function
    const { suggestPathsRelevantToSummary } = await import('@/lib/relevant-path-recommender/suggestionHelper')
    
    // Combine user question and conversation summary as the input text
    const combinedContent = `${userQuestion}\n\n${conversationSummary}`
    
    // Use the new summary-based suggestion function to find relevant paths
    const suggestions = await suggestPathsRelevantToSummary(combinedContent, maxResults)

    if (!suggestions || suggestions.length === 0) {
      console.log('No relevant path suggestions found')
      return []
    }

    // Convert suggestions to RelevantMemory format
    const pathMemories = suggestions.slice(0, maxResults).map(suggestion => ({
      id: suggestion.targetFilePath,
      title: suggestion.targetFilePath,
      content: `Relevant path: ${suggestion.targetFilePath}`,
      score: suggestion.relevance,
      pageUuid: null, // Path suggestions don't have specific page UUIDs
      metadata: {
        type: 'path_suggestion',
        targetFilePath: suggestion.targetFilePath,
        relevance: suggestion.relevance
      }
    }));

    console.log(`Found ${pathMemories.length} relevant path suggestions`)
    
    return pathMemories;

  } catch (error) {
    console.error('Path memory search failed:', error)
    return [] // Return empty array if search fails
  }
}






/**
 * Enriches SuperMemory search results with full document content from Supabase
 * SuperMemory returns chunks, but we want full document content for better AI context
 */
async function enrichDocMemoriesWithFullContent(superMemoryResults: RelevantMemory[]): Promise<RelevantMemory[]> {
  try {
    if (superMemoryResults.length === 0) return [];

    // Extract unique pageUuids from SuperMemory results
    const pageUuids = [...new Set(
      superMemoryResults
        .map(doc => doc.metadata?.pageUuid)
        .filter(Boolean) as string[]
    )];

    if (pageUuids.length === 0) return superMemoryResults;

    // Get full document content from Supabase
    const supabase = await createClient();
    const { data: fullDocuments } = await supabase
      .from('pages')
      .select('uuid, title, content_text')
      .in('uuid', pageUuids)
      .eq('is_deleted', false);

    if (!fullDocuments || fullDocuments.length === 0) return superMemoryResults;

    // Create a map for quick lookup
    const fullContentMap = new Map(
      fullDocuments.map(doc => [doc.uuid, { title: doc.title, content: doc.content_text }])
    );

    // Replace chunk content with full content
    return superMemoryResults.map(doc => {
      const pageUuid = doc.metadata?.pageUuid;
      const fullDoc = fullContentMap.get(pageUuid);
      
      if (fullDoc) {
        return {
          ...doc,
          title: fullDoc.title,
          content: fullDoc.content,
        };
      }
      
      return doc; // Keep original if no full content found
    });

  } catch (error) {
    console.error('Error enriching document memories with full content:', error);
    return superMemoryResults; // Return original results if enrichment fails
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