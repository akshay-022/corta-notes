import supermemory from 'supermemory'
import { MemoryProvider, MemoryDocument, MemoryAddResponse } from './types'

class SuperMemoryProvider implements MemoryProvider {
  private client!: any
  private configured: boolean

  constructor() {
    this.configured = !!process.env.SUPERMEMORY_API_KEY
    if (this.configured) {
      this.client = new supermemory({
        apiKey: process.env.SUPERMEMORY_API_KEY || ''
      })
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  async add(content: string, title: string, userId: string, metadata: any = {}, containerTags?: string[]): Promise<MemoryAddResponse> {
    if (!this.configured) {
      return { success: false, error: 'SuperMemory not configured' }
    }

    try {
      console.log('Adding document to SuperMemory:', { title, userId, containerTags })

      // Add to SuperMemory with user ID and optional container tags
      const addParams: any = {
        content: content,
        userId: userId,  // Correct parameter name per SuperMemory API
        metadata: {
          title: title,
          source: 'corta-notes',
          document_type: 'note',
          ...metadata
        }
      }

      // Add container tags if provided
      if (containerTags && containerTags.length > 0) {
        addParams.containerTags = containerTags
      }

      const response = await this.client.memories.add(addParams)

      console.log('SuperMemory add response:', response)

      if (response.id) {
        return { success: true, memoryId: response.id }
      }

      return { success: false, error: 'No memory created' }
    } catch (error) {
      console.error('Error adding document to SuperMemory:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async search(query: string, userId: string, limit: number = 10, containerTags?: string[]): Promise<MemoryDocument[]> {
    if (!this.configured) {
      return []
    }

    try {
      console.log('Searching SuperMemory for:', query, 'userId:', userId, 'containerTags:', containerTags)

      // Build search parameters
      const searchParams: any = {
        q: query,
        limit: limit,
        userId: userId  // Correct parameter name per SuperMemory API
      }

      // Add container tags filter if provided
      if (containerTags && containerTags.length > 0) {
        searchParams.containerTags = containerTags
      }

      // Perform the search with user ID and optional container tags
      const response = await this.client.search.execute(searchParams)

      console.log('SuperMemory search response:', response)

      // Return raw SuperMemory results for flexible processing in enrichResults
      return (response.results || []).map((result: any) => ({
        id: result.documentId || result.id || result._id || '',
        title: result.title || result.metadata?.title || 'Untitled Document',
        score: result.score || result._score || 0,
        metadata: result.metadata || {},
        // Preserve raw SuperMemory structure for content extraction
        chunks: result.chunks || [],
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        documentId: result.documentId
      }))
    } catch (error) {
      console.error('Error searching SuperMemory:', error)
      return []
    }
  }

  async update(memoryId: string, content: string, title: string): Promise<boolean> {
    if (!this.configured) {
      return false
    }

    try {
      console.log('Updating SuperMemory memory:', memoryId)

      // SuperMemory doesn't have a direct update method, so we'll use HTTP API
      const updateResponse = await fetch(`https://api.supermemory.ai/v3/memories/${memoryId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          metadata: {
            title: title,
            source: 'corta-notes',
            document_type: 'note'
          }
        })
      })

      if (updateResponse.ok) {
        console.log('SuperMemory update response: success')
        return true
      } else {
        console.error('SuperMemory update failed:', updateResponse.status, await updateResponse.text())
        return false
      }
    } catch (error) {
      console.error('Error updating SuperMemory memory:', error)
      return false
    }
  }

  async delete(memoryId: string): Promise<boolean> {
    if (!this.configured) {
      return false
    }

    try {
      console.log('🗑️ Deleting from SuperMemory with ID:', memoryId)

      // Use the raw HTTP client since the SDK might not expose the delete method correctly
      const deleteResponse = await fetch(`https://api.supermemory.ai/v3/memories/${memoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.SUPERMEMORY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })

      if (deleteResponse.ok) {
        console.log('✅ Successfully deleted from SuperMemory')
        return true
      } else {
        const errorText = await deleteResponse.text()
        console.error('❌ SuperMemory delete failed:', deleteResponse.status, errorText)
        return false
      }
    } catch (error) {
      console.error('❌ Error deleting from SuperMemory:', error)
      return false
    }
  }
}

// Export the SuperMemory provider with standardized name
export const memoryService: MemoryProvider = new SuperMemoryProvider()

// You can also export the class for direct instantiation
export default SuperMemoryProvider 