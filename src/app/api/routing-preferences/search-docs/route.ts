import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/supabase-server'
import { searchSimilarDocsForRoutingServer } from '@/lib/self-improvements/routing'
import logger from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { editorText, limit = 5 } = await request.json()

    // Get supabase client and user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Call the library function directly
    const result = await searchSimilarDocsForRoutingServer(
      supabase,
      user.id,
      editorText,
      limit
    )

    return NextResponse.json(result)

  } catch (error) {
    logger.error('Exception in routing docs search API', { error })
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 