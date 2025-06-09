import { NextRequest, NextResponse } from 'next/server'
import { memoryService } from '@/lib/memory/memory-service-supermemory'
import { createClient } from '@/lib/supabase/supabase-server'

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 10 } = await request.json()

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!memoryService.isConfigured()) {
      return NextResponse.json({ error: 'Memory service not configured' }, { status: 503 })
    }

    const supabase = await createClient()

    // Get authenticated user server-side
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Server-side memory service search for:', query)

    // Perform the search using memory service abstraction
    const results = await memoryService.search(query, user.id, limit)

    return NextResponse.json({
      results: results,
      query: query
    })

  } catch (error) {
    console.error('Memory service search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 