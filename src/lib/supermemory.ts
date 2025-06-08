export interface SuperMemoryDocument {
  id: string
  content: string
  title: string
  score?: number
  metadata?: any
}

export interface SearchResult {
  results: SuperMemoryDocument[]
  query: string
}

class SuperMemoryService {
  constructor() {
    // No direct API key access - everything goes through server routes
  }

  /**
   * Search documents semantically using SuperMemory
   */
  async searchDocuments(query: string, limit: number = 10): Promise<SearchResult> {
    try {
      console.log('Searching SuperMemory for:', query)
      
      const response = await fetch('/api/supermemory/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit })
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('SuperMemory search response:', data)

      return {
        results: data.results || [],
        query: query
      }
    } catch (error) {
      console.error('Error searching SuperMemory:', error)
      return {
        results: [],
        query: query
      }
    }
  }

  /**
   * Add a document to SuperMemory and store the mapping
   */
  async addDocument(pageUuid: string, content: string, title: string, userId: string): Promise<string | null> {
    try {
      console.log('Adding document to SuperMemory:', { pageUuid, title })

      const response = await fetch('/api/supermemory/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'add',
          pageUuid, 
          content, 
          title, 
          userId 
        })
      })

      if (!response.ok) {
        throw new Error(`Add document failed: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('SuperMemory add response:', data)

      return data.success ? data.supermemoryId : null
    } catch (error) {
      console.error('Error adding document to SuperMemory:', error)
      return null
    }
  }

  /**
   * Update a document in SuperMemory
   */
  async updateDocument(pageUuid: string, content: string, title: string, userId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/supermemory/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'update',
          pageUuid, 
          content, 
          title, 
          userId 
        })
      })

      if (!response.ok) {
        throw new Error(`Update document failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success
    } catch (error) {
      console.error('Error updating document in SuperMemory:', error)
      return false
    }
  }

  /**
   * Delete a document from SuperMemory
   */
  async deleteDocument(pageUuid: string, userId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/supermemory/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'delete',
          pageUuid, 
          userId 
        })
      })

      if (!response.ok) {
        throw new Error(`Delete document failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.success
    } catch (error) {
      console.error('Error deleting document from SuperMemory:', error)
      return false
    }
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilarDocuments(content: string, title: string, excludePageUuid?: string, limit: number = 5): Promise<SuperMemoryDocument[]> {
    try {
      console.log('Finding similar documents for:', title)

      const response = await fetch('/api/supermemory/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'findSimilar',
          content, 
          title, 
          pageUuid: excludePageUuid 
        })
      })

      if (!response.ok) {
        throw new Error(`Find similar documents failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.results || []
    } catch (error) {
      console.error('Error finding similar documents:', error)
      return []
    }
  }

  /**
   * Check if SuperMemory is properly configured
   */
  async isConfigured(): Promise<boolean> {
    try {
      const response = await fetch('/api/supermemory/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'test' })
      })

      return response.status !== 503 // 503 means not configured
    } catch (error) {
      return false
    }
  }
}

// Export a singleton instance
export const superMemoryService = new SuperMemoryService()
export default superMemoryService 