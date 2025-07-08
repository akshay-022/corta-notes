import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/supabase-server'
import { storeContextPreferenceInSupermemoryServer } from '@/lib/self-improvements/deciding-relevant-context'
import logger from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { query, conversationSummary, editorText, pageUuids, paths } = await request.json()

    logger.info('Context preferences API called', {
      queryLength: query?.length || 0,
      conversationSummaryLength: conversationSummary?.length || 0,
      editorTextLength: editorText?.length || 0,
      pageUuidsCount: pageUuids?.length || 0,
      pathsCount: paths?.length || 0
    })

    // Get supabase client and user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.error('No authenticated user for context preferences API', { authError })
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Call the server-side function
    const result = await storeContextPreferenceInSupermemoryServer(
      supabase,
      user.id,
      query,
      conversationSummary,
      editorText,
      pageUuids,
      paths
    )

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        memoryId: result.memoryId 
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error || 'Failed to store in SuperMemory' 
      }, { status: 500 })
    }

  } catch (error) {
    logger.error('Exception in context preferences API', { error })
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 