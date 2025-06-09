import MemoryClient from 'mem0ai'
import { MemoryProvider, MemoryDocument, MemoryAddResponse } from './types'


class Mem0Provider implements MemoryProvider {
  private client!: MemoryClient
  private configured: boolean

  constructor() {
    this.configured = !!process.env.MEM0_API_KEY
    if (this.configured) {
      this.client = new MemoryClient({
        apiKey: process.env.MEM0_API_KEY || ''
      })
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  async add(content: string, title: string, userId: string, metadata: any = {}): Promise<MemoryAddResponse> {
    if (!this.configured) {
      return { success: false, error: 'Mem0 not configured' }
    }

    try {
      console.log('Adding document to Mem0:', { title, userId })

      // Add to mem0 - using conversational format expected by mem0
      const messages: Array<{ role: "user" | "assistant", content: string }> = [
        { role: "user" as const, content: `Document: ${title}\n\nContent: ${content}` }
      ]

      const response = await this.client.add(messages, {
        user_id: userId,
        metadata: {
          title: title,
          document_type: 'note',
          ...metadata
        },
        infer: false // Disable AI processing - store raw content
      })

      console.log('Mem0 add response:', response)

      if (response && response.length > 0) {
        const memoryId = response[0].id
        return { success: true, memoryId }
      }

      return { success: false, error: 'No memory created' }
    } catch (error) {
      console.error('Error adding document to Mem0:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async search(query: string, userId: string, limit: number = 10): Promise<MemoryDocument[]> {
    if (!this.configured) {
      return []
    }

    try {
      console.log('Searching Mem0 for:', query, 'userId:', userId)

      const response = await this.client.search(query, {
        user_id: userId,
        limit: limit
      })

      console.log('Mem0 search response:', response)

      // Map the response to our standardized interface
      return (response || []).map((result: any) => ({
        id: result.id || '',
        content: result.memory || '',
        title: result.metadata?.title || 'Untitled Document',
        score: result.score || 0,
        metadata: result.metadata || {}
      }))
    } catch (error) {
      console.error('Error searching Mem0:', error)
      return []
    }
  }

  async update(memoryId: string, content: string, title: string): Promise<boolean> {
    if (!this.configured) {
      return false
    }

    try {
      console.log('Updating Mem0 memory:', memoryId)

      const updatedContent = `Document: ${title}\n\nContent: ${content}`
      const response = await this.client.update(memoryId, updatedContent)

      console.log('Mem0 update response:', response)
      return true
    } catch (error) {
      console.error('Error updating Mem0 memory:', error)
      return false
    }
  }

  async delete(memoryId: string): Promise<boolean> {
    if (!this.configured) {
      return false
    }

    try {
      console.log('🗑️ Deleting from Mem0 with ID:', memoryId)

      const deleteResponse = await this.client.delete(memoryId)
      console.log('✅ Successfully deleted from Mem0:', deleteResponse)
      
      return true
    } catch (error) {
      console.error('❌ Error deleting from Mem0:', error)
      return false
    }
  }
}

// Export singleton instance - you can easily switch providers here
export const memoryService: MemoryProvider = new Mem0Provider()

// For easy provider switching, you could do:
// import { superMemoryProvider } from './memory-service-supermemory'
// export const memoryService: MemoryProvider = process.env.MEMORY_PROVIDER === 'supermemory' 
//   ? superMemoryProvider 
//   : new Mem0Provider()

// Or even simpler environment-based switching:
// export const memoryService: MemoryProvider = process.env.MEM0_API_KEY 
//   ? new Mem0Provider() 
//   : superMemoryProvider 