import { NextRequest, NextResponse } from 'next/server'
import supermemory from 'supermemory'
import { createClient } from '@/lib/supabase/supabase-server'

const superMemoryClient = new supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY, // Server-side only, not NEXT_PUBLIC_
})

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 10 } = await request.json()

    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!process.env.SUPERMEMORY_API_KEY) {
      return NextResponse.json({ error: 'SuperMemory not configured' }, { status: 503 })
    }

    console.log('Server-side SuperMemory search for:', query)

    // Perform the search
    const response = await superMemoryClient.search.execute({ 
      q: query,
      limit: limit
    })

    // Map the response to our interface
    const mappedResults = (response.results || []).map((result: any) => ({
      id: result.id || result._id || '',
      content: result.content || result.text || '',
      title: result.title || result.metadata?.title || '',
      score: result.score || result._score,
      metadata: result.metadata || {}
    }))

    return NextResponse.json({
      results: mappedResults,
      query: query
    })

  } catch (error) {
    console.error('SuperMemory search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 