import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/supabase-server'
import { searchSimilarContextPreferencesInSupermemoryServer } from '@/lib/self-improvements/deciding-relevant-context'
import logger from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { query, conversationSummary, limit = 5 } = await request.json()

    logger.info('Context preferences search API called', {
      queryLength: query?.length || 0,
      conversationSummaryLength: conversationSummary?.length || 0,
      limit
    })

    // Get supabase client and user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.error('No authenticated user for context preferences search API', { authError })
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Call the server-side function
    const result = await searchSimilarContextPreferencesInSupermemoryServer(
      supabase,
      user.id,
      query,
      conversationSummary,
      limit
    )

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        results: result.results 
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error || 'Failed to search SuperMemory' 
      }, { status: 500 })
    }

  } catch (error) {
    logger.error('Exception in context preferences search API', { error })
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 