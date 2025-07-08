import { createClient } from '@/lib/supabase/supabase-client'
import { ContextPreferenceInsert } from '@/lib/supabase/types'
import { memoryService } from '@/lib/memory-providers/memory-service-supermemory'
import logger from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * CLIENT-SIDE: Stores context preference in database
 * Called from client components (Chat panel)
 */
export async function storeContextPreferenceInDB(
  query: string,
  conversationSummary: string,
  editorText: string,
  pageUuids: string[],
  paths: string[]
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    logger.info('Storing context preference in database', {
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      editorTextLength: editorText.length,
      pageUuidsCount: pageUuids.length,
      pathsCount: paths.length
    });

    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    
    if (!user.user) {
      logger.error('User not authenticated for context preference storage');
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('contextPreferences')
      .insert({
        user_id: user.user.id,
        query,
        editor_text: editorText,
        summary: conversationSummary, // Store conversation summary instead of page summary
        page_uuids: pageUuids,
        paths,
        lastUpdated: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Database error storing context preference', {
        error: error.message,
        code: error.code,
        queryLength: query.length,
        conversationSummaryLength: conversationSummary.length
      });
      return { success: false, error: error.message };
    }

    logger.info('Successfully stored context preference in database', {
      id: data.id,
      userId: user.user.id,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      pageUuidsCount: pageUuids.length,
      pathsCount: paths.length
    });

    return { success: true, id: data.id };
  } catch (error) {
    logger.error('Error storing context preference in database', {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * CLIENT-SIDE: Stores context preference in SuperMemory via API
 * Called from client components, hits server API endpoint
 */
export async function storeContextPreferenceInSupermemory(
  query: string,
  conversationSummary: string,
  editorText: string,
  pageUuids: string[],
  paths: string[]
): Promise<{ success: boolean; error?: string; memoryId?: string }> {
  try {
    logger.info('Storing context preference in SuperMemory (client-side)', {
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      editorTextLength: editorText.length,
      pageUuidsCount: pageUuids.length,
      pathsCount: paths.length
    });

    const response = await fetch('/api/context-preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        conversationSummary,
        editorText,
        pageUuids,
        paths
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('API error storing context preference in SuperMemory', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return { success: false, error: errorData.error || `API error: ${response.statusText}` };
    }

    const result = await response.json();
    logger.info('Successfully stored context preference in SuperMemory via API', {
      memoryId: result.memoryId,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });

    return { success: true, memoryId: result.memoryId };
  } catch (error) {
    logger.error('Error storing context preference in SuperMemory via API', {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * CLIENT-SIDE: Retrieves similar context preferences via API
 * This can be used to provide intelligent context suggestions based on past user behavior
 */
export async function getSimilarContextPreferences(
  query: string,
  conversationSummary: string,
  limit: number = 5
): Promise<{ success: boolean; error?: string; results?: any[] }> {
  try {
    logger.info('Searching for similar context preferences in SuperMemory (client-side)', {
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      limit
    });

    const response = await fetch('/api/context-preferences/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        conversationSummary,
        limit
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('API error searching similar context preferences in SuperMemory', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return { success: false, error: errorData.error || `API error: ${response.statusText}` };
    }

    const result = await response.json();
    logger.info('Successfully searched similar context preferences in SuperMemory via API', {
      resultsCount: result.results?.length || 0,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });

    return { success: true, results: result.results || [] };
  } catch (error) {
    logger.error('Error searching similar context preferences in SuperMemory via API', {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Gets context preferences from database for a specific user
 * Useful for analyzing user context patterns and building suggestions
 */
export async function getUserContextPreferences(
  limit: number = 50
): Promise<any[]> {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.error('❌ No authenticated user for retrieving context preferences')
      return []
    }

    const { data: preferences, error } = await supabase
      .from('contextPreferences')
      .select('*')
      .eq('user_id', user.id)
      .order('lastUpdated', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('❌ Failed to retrieve context preferences from database', { error })
      return []
    }

    logger.info('📊 Retrieved user context preferences', {
      count: preferences?.length || 0,
      userId: user.id.slice(0, 8)
    })

    return preferences || []

  } catch (error) {
    logger.error('❌ Exception retrieving user context preferences', { error })
    return []
  }
}

/**
 * SERVER-SIDE: Stores context preference in SuperMemory
 * Called from API routes with supabase client
 */
export async function storeContextPreferenceInSupermemoryServer(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  conversationSummary: string,
  editorText: string,
  pageUuids: string[],
  paths: string[]
): Promise<{ success: boolean; error?: string; memoryId?: string }> {
  try {
    logger.info('Storing context preference in SuperMemory (server-side)', {
      userId,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      editorTextLength: editorText.length,
      pageUuidsCount: pageUuids.length,
      pathsCount: paths.length
    });

    // Content is conversation summary + current user message
    const content = `${conversationSummary}\n\nCurrent query: ${query}`;

    // Metadata includes all the context preference data
    const metadata = {
      userId,
      query,
      editorText,
      pageUuids,
      paths,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${process.env.SUPERMEMORY_BASE_URL}/api/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`
      },
      body: JSON.stringify({
        content,
        metadata,
        user: userId,
        container: 'contextPreferences'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('SuperMemory API error for context preference', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return { success: false, error: `SuperMemory API error: ${response.statusText}` };
    }

    const result = await response.json();
    logger.info('Successfully stored context preference in SuperMemory', {
      userId,
      memoryId: result.id,
      contentLength: content.length,
      metadataKeys: Object.keys(metadata)
    });

    return { success: true, memoryId: result.id };
  } catch (error) {
    logger.error('Error storing context preference in SuperMemory', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * SERVER-SIDE: Searches for similar context preferences in SuperMemory
 * Called from API routes with supabase client
 */
export async function searchSimilarContextPreferencesInSupermemoryServer(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  conversationSummary: string,
  limit: number = 5
): Promise<{ success: boolean; error?: string; results?: any[] }> {
  try {
    logger.info('Searching for similar context preferences in SuperMemory (server-side)', {
      userId,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length,
      limit
    });

    // Search content is conversation summary + current query
    const searchContent = `${conversationSummary}\n\nCurrent query: ${query}`;

    const response = await fetch(`${process.env.SUPERMEMORY_BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`
      },
      body: JSON.stringify({
        query: searchContent,
        user: userId,
        container: 'contextPreferences',
        limit
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('SuperMemory search API error for context preferences', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return { success: false, error: `SuperMemory search API error: ${response.statusText}` };
    }

    const result = await response.json();
    logger.info('Successfully searched similar context preferences in SuperMemory', {
      userId,
      resultsCount: result.results?.length || 0,
      searchContentLength: searchContent.length
    });

    return { success: true, results: result.results || [] };
  } catch (error) {
    logger.error('Error searching similar context preferences in SuperMemory', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      queryLength: query.length,
      conversationSummaryLength: conversationSummary.length
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
} 