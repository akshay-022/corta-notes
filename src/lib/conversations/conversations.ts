import { createClient } from '@/lib/supabase/supabase-client'
import { Conversation, ConversationInsert, ConversationUpdate, ChatMessage, ChatMessageInsert } from '@/lib/supabase/types'

class ConversationsService {
  private supabase = createClient()

  /**
   * Create a new conversation
   */
  async createConversation(
    title: string = 'New Conversation', 
    relatedPages: string[] = [],
    metadata: Record<string, any> = {}
  ): Promise<Conversation | null> {
    try {
      const { data: user } = await this.supabase.auth.getUser()
      if (!user.user) {
        console.error('User not authenticated')
        return null
      }

      const conversationData: ConversationInsert = {
        user_id: user.user.id,
        title,
        related_pages: relatedPages,
        metadata
      }

      const { data, error } = await this.supabase
        .from('conversations')
        .insert(conversationData)
        .select()
        .single()

      if (error) {
        console.error('Error creating conversation:', error)
        return null
      }

      console.log('✅ Created new conversation:', data.title)
      return data
    } catch (error) {
      console.error('Error creating conversation:', error)
      return null
    }
  }

  /**
   * Get all conversations for the current user
   */
  async getConversations(): Promise<Conversation[]> {
    try {
      const { data: user } = await this.supabase.auth.getUser()
      if (!user.user) return []

      const { data, error } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.user.id)
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Error fetching conversations:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching conversations:', error)
      return []
    }
  }

  /**
   * Get a specific conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (error) {
        console.error('Error fetching conversation:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error fetching conversation:', error)
      return null
    }
  }

  /**
   * Update a conversation
   */
  async updateConversation(
    conversationId: string, 
    updates: ConversationUpdate
  ): Promise<Conversation | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .update(updates)
        .eq('id', conversationId)
        .select()
        .single()

      if (error) {
        console.error('Error updating conversation:', error)
        return null
      }

      console.log('✅ Updated conversation:', data.title)
      return data
    } catch (error) {
      console.error('Error updating conversation:', error)
      return null
    }
  }

  /**
   * Delete a conversation (and all its messages)
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)

      if (error) {
        console.error('Error deleting conversation:', error)
        return false
      }

      console.log('🗑️ Deleted conversation:', conversationId)
      return true
    } catch (error) {
      console.error('Error deleting conversation:', error)
      return false
    }
  }

  /**
   * Add a page to the conversation's related_pages
   */
  async addRelatedPage(conversationId: string, pageUuid: string): Promise<boolean> {
    try {
      const conversation = await this.getConversation(conversationId)
      if (!conversation) return false

      const relatedPages = (conversation.related_pages as string[]) || []
      
      // Only add if not already present
      if (!relatedPages.includes(pageUuid)) {
        relatedPages.push(pageUuid)
        
        const updated = await this.updateConversation(conversationId, {
          related_pages: relatedPages
        })
        
        return updated !== null
      }
      
      return true // Already present
    } catch (error) {
      console.error('Error adding related page:', error)
      return false
    }
  }

  /**
   * Remove a page from the conversation's related_pages
   */
  async removeRelatedPage(conversationId: string, pageUuid: string): Promise<boolean> {
    try {
      const conversation = await this.getConversation(conversationId)
      if (!conversation) return false

      const relatedPages = (conversation.related_pages as string[]) || []
      const filteredPages = relatedPages.filter(uuid => uuid !== pageUuid)
      
      const updated = await this.updateConversation(conversationId, {
        related_pages: filteredPages
      })
      
      return updated !== null
    } catch (error) {
      console.error('Error removing related page:', error)
      return false
    }
  }

  /**
   * Get all chat messages for a conversation
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await this.supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching messages:', error)
      return []
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    content: string,
    isUserMessage: boolean = true,
    metadata: Record<string, any> = {}
  ): Promise<ChatMessage | null> {
    try {
      const { data: user } = await this.supabase.auth.getUser()
      if (!user.user) {
        console.error('User not authenticated')
        return null
      }

      const messageData: ChatMessageInsert = {
        conversation_id: conversationId,
        user_id: user.user.id,
        content,
        is_user_message: isUserMessage,
        metadata
      }

      const { data, error } = await this.supabase
        .from('chat_messages')
        .insert(messageData)
        .select()
        .single()

      if (error) {
        console.error('Error adding message:', error)
        return null
      }

      console.log('💬 Added message to conversation:', conversationId)
      return data
    } catch (error) {
      console.error('Error adding message:', error)
      return null
    }
  }
}

export const conversationsService = new ConversationsService()
export default conversationsService 