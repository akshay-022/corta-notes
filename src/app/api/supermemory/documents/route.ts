import { NextRequest, NextResponse } from 'next/server'
import supermemory from 'supermemory'
import { createClient } from '@/lib/supabase/supabase-server'

const superMemoryClient = new supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { action, pageUuid, content, title, userId } = await request.json()

    if (!process.env.SUPERMEMORY_API_KEY) {
      return NextResponse.json({ error: 'SuperMemory not configured' }, { status: 503 })
    }

    const supabase = await createClient()

    switch (action) {
      case 'add':
        return await addDocument(pageUuid, content, title, userId, supabase)
      case 'update':
        return await updateDocument(pageUuid, content, title, userId, supabase)
      case 'delete':
        return await deleteDocument(pageUuid, userId, supabase)
      case 'findSimilar':
        return await findSimilarDocuments(content, title, pageUuid)
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('SuperMemory document operation error:', error)
    return NextResponse.json(
      { error: 'Operation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function addDocument(pageUuid: string, content: string, title: string, userId: string, supabase: any) {
  console.log('Adding document to SuperMemory:', { pageUuid, title })

  // Add to SuperMemory
  const response = await superMemoryClient.memories.add({
    content: content,
    metadata: {
      pageUuid: pageUuid,
      userId: userId,
      source: 'corta-notes',
      title: title
    }
  })

  if (response.id) {
    // Store the mapping in Supabase
    const { error } = await supabase
      .from('document_supermemory_mapping')
      .insert({
        page_uuid: pageUuid,
        supermemory_id: response.id,
        user_id: userId
      })

    if (error) {
      console.error('Error storing SuperMemory mapping:', error)
      return NextResponse.json({ error: 'Failed to store mapping' }, { status: 500 })
    }

    return NextResponse.json({ success: true, supermemoryId: response.id })
  }

  return NextResponse.json({ error: 'Failed to add document to SuperMemory' }, { status: 500 })
}

async function updateDocument(pageUuid: string, content: string, title: string, userId: string, supabase: any) {
  // For now, we'll delete and re-add since SuperMemory might not have update
  await deleteDocument(pageUuid, userId, supabase)
  return await addDocument(pageUuid, content, title, userId, supabase)
}

async function deleteDocument(pageUuid: string, userId: string, supabase: any) {
  // Remove the mapping from our database
  const { error } = await supabase
    .from('document_supermemory_mapping')
    .delete()
    .eq('page_uuid', pageUuid)
    .eq('user_id', userId)

  if (error) {
    console.error('Error deleting SuperMemory mapping:', error)
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

async function findSimilarDocuments(content: string, title: string, excludePageUuid?: string) {
  const searchQuery = `${title} ${content}`.slice(0, 500)
  const response = await superMemoryClient.search.execute({ 
    q: searchQuery,
    limit: 6
  })

  let results = (response.results || []).map((result: any) => ({
    id: result.id || result._id || '',
    content: result.content || result.text || '',
    title: result.title || result.metadata?.title || '',
    score: result.score || result._score,
    metadata: result.metadata || {}
  }))

  // Filter out the current document if excludePageUuid is provided
  if (excludePageUuid) {
    results = results.filter(doc => doc.metadata?.pageUuid !== excludePageUuid)
  }

  return NextResponse.json({ results: results.slice(0, 5) })
} 