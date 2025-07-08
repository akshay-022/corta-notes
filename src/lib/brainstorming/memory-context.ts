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

    console.log(`Found ${searchResults.length} chat memories`)

    // Convert to our interface format
    return searchResults.map(doc => ({
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
  maxResults: number = 5,
  relevantPaths: any[] = []
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
    // Send separate requests for each path to get union (not intersection) of results
    const searchPromises = relevantPaths.map(path => 
      memoryService.search(userQuestion + ' ' + conversationSummary, user.id, maxResults, ['docs', path])
    );

    console.log(`🔍 Running ${searchPromises.length} parallel searches for specific paths: ${relevantPaths.join(', ')}`);
    
    const allSearchResults = await Promise.all(searchPromises);
    
    // Flatten all results without deduplication
    const allResults: any[] = [];
    allSearchResults.forEach((results, index) => {
      const searchType = `docs + ${relevantPaths[index]}`;
      console.log(`📊 Search "${searchType}" returned ${results.length} results`);
      allResults.push(...results);
    });

    console.log(`📊 Total combined results: ${allResults.length}`);

    const searchResults = allResults
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, maxResults);

    if (!searchResults || searchResults.length === 0) {
      console.log('No document memory search results found')
      return []
    }

    console.log('Search results:', searchResults)
    console.log(`Found ${searchResults.length} document memories`)


    // Convert to our interface format and extract content from chunks
    const docMemories = searchResults.map(doc => {
      // Extract content from SuperMemory chunks
      let extractedContent = '';
      if (doc.chunks && doc.chunks.length > 0) {
        // Combine all relevant chunks, sorted by score
        const sortedChunks = doc.chunks
          .filter((chunk: any) => chunk.isRelevant)
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
        
        extractedContent = sortedChunks
          .map((chunk: any) => chunk.content)
          .join('\n\n--- CHUNK BREAK ---\n\n');
        
        console.log(`📄 Extracted ${sortedChunks.length} chunks for "${doc.title}"`);
      }
      
      return {
        id: doc.id || '',
        title: doc.title || 'Untitled Document',
        content: extractedContent,
        score: doc.score,
        uuid: doc.metadata?.pageUuid || null,
        metadata: doc.metadata || {},
        // Preserve raw chunks for potential future use
        chunks: doc.chunks || []
      };
    });

    // Enrich with full document content from Supabase
    const enrichedMemories = await enrichDocMemoriesWithFullContent(docMemories);
    console.log('Enriched memories:', enrichedMemories)

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
    const { suggestPathsRelevantToSummary } = await import('@/lib/utils/pathSuggestionHelper')
    
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

    // Extract unique pageUuids from SuperMemory results metadata
    const pageUuids = [...new Set(
      superMemoryResults
        .map(doc => doc.metadata?.pageUuid)
        .filter(Boolean) as string[]
    )];

    console.log('📋 Extracted pageUuids from metadata:', pageUuids);

    if (pageUuids.length === 0) {
      console.log('⚠️ No pageUuids found in metadata, returning original results');
      return superMemoryResults;
    }

    // Get full document content from Supabase
    const supabase = await createClient();
    const { data: fullDocuments, error } = await supabase
      .from('pages')
      .select('uuid, title, content_text')
      .in('uuid', pageUuids)
      .eq('is_deleted', false);

    if (error) {
      console.error('❌ Error querying pages:', error);
      return superMemoryResults;
    }

    console.log('📄 Pages found:', fullDocuments?.map(p => ({ uuid: p.uuid, title: p.title, contentLength: p.content_text?.length })));

    if (!fullDocuments || fullDocuments.length === 0) {
      console.log('⚠️ No pages found for pageUuids');
      return superMemoryResults;
    }

    // Create a map for quick lookup
    const fullContentMap = new Map(
      fullDocuments.map(doc => [doc.uuid, { title: doc.title, content: doc.content_text, uuid: doc.uuid }])
    );

    // Replace chunk content with full content
    const enrichedResults = superMemoryResults.map(doc => {
      const pageUuid = doc.metadata?.pageUuid;
      const fullDoc = fullContentMap.get(pageUuid);
      
      if (fullDoc) {
        console.log(`✅ Enriching doc ${doc.id} with full content from "${fullDoc.title}"`);
        return {
          ...doc,
          title: fullDoc.title,
          content: fullDoc.content,
          chunk_content: doc.content, // Preserve original SuperMemory chunk content
          uuid: fullDoc.uuid
        };
      }
      
      console.log(`⚠️ No full content found for pageUuid ${pageUuid}, keeping original`);
      return doc; // Keep original if no full content found
    });

    console.log(`🎯 Returning ${enrichedResults.length} enriched results`);
    return enrichedResults;

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