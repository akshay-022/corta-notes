import { NextRequest, NextResponse } from 'next/server'
// import supermemory from 'supermemory' // SuperMemory - commented out for mem0 migration
// import MemoryClient from 'mem0ai' // New mem0 client - moved to service
import { memoryService } from '@/lib/memory/memory-service-supermemory'
import { createClient } from '@/lib/supabase/supabase-server'

export const runtime = 'edge';

// const superMemoryClient = new supermemory({
//   apiKey: process.env.SUPERMEMORY_API_KEY,
// }) // SuperMemory client - commented out

// // New mem0 client - moved to memory service
// const mem0Client = new MemoryClient({
//   apiKey: process.env.MEM0_API_KEY || ''
// });

export async function POST(request: NextRequest) {
  try {
    const { action, pageUuid, content, title } = await request.json()

    // Updated to check memory service configuration
    if (!memoryService.isConfigured()) {
      return NextResponse.json({ error: 'Memory service not configured' }, { status: 503 })
    }

    const supabase = await createClient()

    // Get authenticated user server-side
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    switch (action) {
      case 'add':
        return await addDocument(pageUuid, content, title, user.id, supabase)
      case 'update':
        return await updateDocument(pageUuid, content, title, user.id, supabase)
      case 'delete':
        return await deleteDocument(pageUuid, user.id, supabase)
      case 'findSimilar':
        return await findSimilarDocuments(content, title, pageUuid, user.id)
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Memory service operation error:', error)
    return NextResponse.json(
      { error: 'Operation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function addDocument(pageUuid: string, content: string, title: string, userId: string, supabase: any) {
  console.log('Adding document via memory service:', { pageUuid, title })

  try {
    // Add to memory service with metadata
    const response = await memoryService.add(content, title, userId, {
      pageUuid: pageUuid,
      source: 'corta-notes'
    })

    if (response.success && response.memoryId) {
      // Store the mapping in Supabase (reusing existing supermemory table)
      const { error } = await supabase
        .from('document_supermemory_mapping')
        .insert({
          page_uuid: pageUuid,
          supermemory_id: response.memoryId,
          user_id: userId
        })

      if (error) {
        console.error('Error storing memory mapping:', error)
        return NextResponse.json({ error: 'Failed to store mapping' }, { status: 500 })
      }

      return NextResponse.json({ success: true, memoryId: response.memoryId })
    }

    return NextResponse.json({ error: response.error || 'Failed to add document' }, { status: 500 })
  } catch (error) {
    console.error('Error adding document:', error)
    return NextResponse.json({ error: 'Failed to add document' }, { status: 500 })
  }
}

async function updateDocument(pageUuid: string, content: string, title: string, userId: string, supabase: any) {
  console.log('Updating document via memory service:', { pageUuid, title })

  try {
    // Get the memory ID from our mapping
    const { data: mapping, error: mappingError } = await supabase
      .from('document_supermemory_mapping')
      .select('supermemory_id')
      .eq('page_uuid', pageUuid)
      .eq('user_id', userId)
      .single()

    if (mappingError || !mapping) {
      // If no mapping exists, add as new document
      console.log('No existing mapping found, adding as new document')
      return await addDocument(pageUuid, content, title, userId, supabase)
    }

    // Update the existing memory
    const success = await memoryService.update(mapping.supermemory_id, content, title)

    if (success) {
      return NextResponse.json({ success: true, memoryId: mapping.supermemory_id })
    } else {
      // Fallback: delete and re-add
      await deleteDocument(pageUuid, userId, supabase)
      return await addDocument(pageUuid, content, title, userId, supabase)
    }

  } catch (error) {
    console.error('Error updating document:', error)
    // Fallback: delete and re-add
    await deleteDocument(pageUuid, userId, supabase)
    return await addDocument(pageUuid, content, title, userId, supabase)
  }
}

async function deleteDocument(pageUuid: string, userId: string, supabase: any) {
  console.log('Deleting document via memory service:', { pageUuid })

  // First, get the memory ID from our mapping
  const { data: mapping, error: mappingError } = await supabase
    .from('document_supermemory_mapping')
    .select('supermemory_id')
    .eq('page_uuid', pageUuid)
    .eq('user_id', userId)
    .single()

  if (mappingError) {
    console.log('No memory mapping found for page:', pageUuid)
    // If no mapping exists, that's fine - the document was never synced
    return NextResponse.json({ success: true, message: 'No memory document to delete' })
  }

  try {
    // Delete from memory service
    const success = await memoryService.delete(mapping.supermemory_id)
    
    if (success) {
      console.log('✅ Successfully deleted from memory service')
    } else {
      console.log('⚠️ Memory service deletion may have failed, continuing with mapping cleanup')
    }

  } catch (error) {
    console.error('❌ Error deleting from memory service:', error)
    // Continue to remove mapping even if memory deletion fails
  }

  // Remove the mapping from our database
  const { error: deleteError } = await supabase
    .from('document_supermemory_mapping')
    .delete()
    .eq('page_uuid', pageUuid)
    .eq('user_id', userId)

  if (deleteError) {
    console.error('Error deleting memory mapping:', deleteError)
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
  }

  console.log('🎯 Memory document and mapping deleted successfully')
  return NextResponse.json({ success: true })
}

async function findSimilarDocuments(content: string, title: string, excludePageUuid?: string, userId?: string) {
  try {
    const searchQuery = `${title} ${content}`.slice(0, 500)
    
    // Search using memory service
    const results = await memoryService.search(searchQuery, userId || '', 6)

    // Filter out the current document if excludePageUuid is provided
    let filteredResults = results
    if (excludePageUuid) {
      filteredResults = results.filter(doc => doc.metadata?.pageUuid !== excludePageUuid)
    }

    return NextResponse.json({ results: filteredResults.slice(0, 5) })

  } catch (error) {
    console.error('Error finding similar documents:', error)
    return NextResponse.json({ results: [] })
  }
}

// OLD IMPLEMENTATIONS REMOVED FOR BREVITY - See backup files

// OLD SUPERMEMORY IMPLEMENTATION - COMMENTED OUT FOR BACKUP
/*
async function addDocument(pageUuid: string, content: string, title: string, userId: string, supabase: any) {
  console.log('Adding document to SuperMemory:', { pageUuid, title })

  // Add to SuperMemory - don't include userId in metadata for privacy
  const response = await superMemoryClient.memories.add({
    content: content,
    metadata: {
      pageUuid: pageUuid,
      source: 'corta-notes',
      title: title
    }
  })

  if (response.id) {
    // Store the mapping in Supabase (userId only for our internal tracking)
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
  console.log('Deleting document from SuperMemory:', { pageUuid })

  // First, get the SuperMemory document ID from our mapping
  const { data: mapping, error: mappingError } = await supabase
    .from('document_supermemory_mapping')
    .select('supermemory_id')
    .eq('page_uuid', pageUuid)
    .eq('user_id', userId)
    .single()

  if (mappingError) {
    console.log('No SuperMemory mapping found for page:', pageUuid)
    // If no mapping exists, that's fine - the document was never synced
    return NextResponse.json({ success: true, message: 'No SuperMemory document to delete' })
  }

  try {
    // Delete from SuperMemory using the correct API endpoint
    console.log('🗑️ Deleting from SuperMemory with ID:', mapping.supermemory_id)
    
    // Use the raw HTTP client since the SDK might not expose the delete method correctly
    const deleteResponse = await fetch(`https://api.supermemory.ai/v3/memories/${mapping.supermemory_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (deleteResponse.ok) {
      console.log('✅ Successfully deleted from SuperMemory')
    } else {
      const errorText = await deleteResponse.text()
      console.error('❌ SuperMemory delete failed:', deleteResponse.status, errorText)
    }
  } catch (error) {
    console.error('❌ Error deleting from SuperMemory:', error)
    // Continue to remove mapping even if SuperMemory deletion fails
    // This prevents orphaned mappings if the document was already deleted externally
  }

  // Remove the mapping from our database
  const { error: deleteError } = await supabase
    .from('document_supermemory_mapping')
    .delete()
    .eq('page_uuid', pageUuid)
    .eq('user_id', userId)

  if (deleteError) {
    console.error('Error deleting SuperMemory mapping:', deleteError)
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
  }

  console.log('🎯 SuperMemory document and mapping deleted successfully')
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
*/ 