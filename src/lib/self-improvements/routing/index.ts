import { createClient } from '@/lib/supabase/supabase-client'
import { RoutingPreferenceInsert } from '@/lib/supabase/types'
import { memoryService as memory } from '@/lib/memory-providers/memory-service-supermemory'
import logger from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * CLIENT-SIDE: Stores routing preference in database
 * Called from client components (TipTap editor)
 */
export async function storeRoutingPreferenceInDB({
  editorText,
  title,
  instruction,
  summary,
  pageUuid,
  organizedPageUuid
}: {
  editorText: string
  title: string
  instruction: string
  summary?: string
  pageUuid: string
  organizedPageUuid?: string
}): Promise<void> {
  try {
    logger.info('📚 Storing routing preference in database', {
      title,
      pageUuid: pageUuid.slice(0, 8),
      organizedPageUuid: organizedPageUuid?.slice(0, 8),
      instructionLength: instruction.length,
      editorTextLength: editorText.length
    })

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.error('❌ No authenticated user for storing routing preference', { authError })
      return
    }

    // Prepare the routing preference data
    const routingPreference: RoutingPreferenceInsert = {
      user_id: user.id,
      editor_text: editorText,
      title,
      instruction,
      summary: summary || null,
      page_uuid: pageUuid,
      organized_page_uuid: organizedPageUuid || null,
      lastUpdated: new Date().toISOString()
    }

    // Store in database
    const { error: dbError } = await supabase
      .from('routingPreferences')
      .insert(routingPreference)

    if (dbError) {
      logger.error('❌ Failed to store routing preference in database', { 
        error: dbError,
        pageUuid: pageUuid.slice(0, 8)
      })
      return
    }

    logger.info('✅ Successfully stored routing preference in database', {
      pageUuid: pageUuid.slice(0, 8),
      organizedPageUuid: organizedPageUuid?.slice(0, 8)
    })

  } catch (error) {
    logger.error('❌ Exception storing routing preference in database', { 
      error,
      pageUuid: pageUuid.slice(0, 8)
    })
  }
}

/**
 * Gets routing preferences from database for a specific user
 * Useful for analyzing user routing patterns and building suggestions
 */
export async function getUserRoutingPreferences(
  limit: number = 50
): Promise<any[]> {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.error('❌ No authenticated user for retrieving routing preferences')
      return []
    }

    const { data: preferences, error } = await supabase
      .from('routingPreferences')
      .select('*')
      .eq('user_id', user.id)
      .order('lastUpdated', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('❌ Failed to retrieve routing preferences from database', { error })
      return []
    }

    logger.info('📊 Retrieved user routing preferences', {
      count: preferences?.length || 0,
      userId: user.id.slice(0, 8)
    })

    return preferences || []

  } catch (error) {
    logger.error('❌ Exception retrieving user routing preferences', { error })
    return []
  }
}

/**
 * SERVER-SIDE: Searches existing docs in SuperMemory for similar content
 * Returns file paths of documents that are similar to the current editor text
 * Called from API routes with supabase client
 */
export async function searchSimilarDocsForRoutingServer(
  supabase: SupabaseClient,
  userId: string,
  editorText: string,
  limit: number = 5
): Promise<{ success: boolean; error?: string; suggestedPaths?: string[] }> {
  try {
    logger.info('Searching similar docs for routing (server-side)', {
      userId,
      editorTextLength: editorText.length,
      limit
    })

    // Use the memory service abstraction to search in docs container
    const searchResults = await memory.search(
      editorText,
      userId,
      limit,
      ['docs'] // Search in the docs container where organized content is stored
    )

    // Extract file paths from the search results
    const suggestedPaths: string[] = []
    
    for (const doc of searchResults) {
      // Try to extract file path from metadata
      if (doc.metadata && doc.metadata.filePath) {
        suggestedPaths.push(doc.metadata.filePath)
      } else if (doc.metadata && doc.metadata.title) {
        // If no filePath, use title as fallback
        suggestedPaths.push(doc.metadata.title)
      } else if (doc.title) {
        // Last resort: use doc title
        suggestedPaths.push(doc.title)
      }
    }

    // Remove duplicates and limit results
    const uniquePaths = Array.from(new Set(suggestedPaths)).slice(0, limit)

    logger.info('Successfully found similar docs for routing', {
      userId,
      searchResultsCount: searchResults.length,
      suggestedPathsCount: uniquePaths.length,
      paths: uniquePaths
    })

    return { success: true, suggestedPaths: uniquePaths }
  } catch (error) {
    logger.error('Error searching similar docs for routing', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      editorTextLength: editorText.length
    })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
} 