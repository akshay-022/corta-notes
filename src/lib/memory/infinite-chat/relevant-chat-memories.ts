import { formatMemoryContext } from '@/lib/brainstorming';
import { getRelevantChatMemories } from '@/lib/brainstorming/memory-context';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-client';

/**
 * Search for relevant memories from previous conversations and inject them into the current message
 * @param currentMessage - The user's current message
 * @param conversationSummary - Summary of the current conversation (if available)
 * @param conversationId - Current conversation ID to filter out
 * @returns Enhanced message with relevant memory context
 */
export async function injectRelevantMemories(
  currentMessage: string,
  conversationSummary?: string,
  conversationId?: string
): Promise<string> {
  try {
    // Build search query from current message and conversation summary
    let searchQuery = currentMessage;
    
    if (conversationSummary) {
      searchQuery = `${conversationSummary} ${currentMessage}`;
      logger.info('Searching with conversation summary context', { 
        summaryLength: conversationSummary.length,
        messageLength: currentMessage.length 
      });
    }

    // Search for relevant memories from ALL conversations (no page restriction)
    const relevantDocuments = await getRelevantChatMemories(searchQuery, 5);
    
    if (relevantDocuments.length === 0) {
      logger.info('No relevant memories found for current message');
      return currentMessage;
    }

    // Filter out memories from the current conversation to avoid redundancy
    const crossConversationMemories = relevantDocuments.filter((doc: any) => 
      doc.metadata?.conversationId !== conversationId
    );

    if (crossConversationMemories.length === 0) {
      logger.info('No cross-conversation memories found');
      return currentMessage;
    }

    // Format the memory context
    const memoryContext = formatMemoryContext(crossConversationMemories);
    
    // Enhance the current message with relevant memories
    const enhancedMessage = `${currentMessage}

RELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:
${memoryContext}

Please use this additional context from previous conversations to provide a more comprehensive and connected response.`;

    logger.info('Enhanced message with cross-conversation memories', {
      originalLength: currentMessage.length,
      enhancedLength: enhancedMessage.length,
      memoriesFound: crossConversationMemories.length,
      memorySources: crossConversationMemories.map(doc => doc.pageUuid)
    });

    return enhancedMessage;

  } catch (error) {
    logger.error('Failed to inject relevant memories', { error });
    // Return original message if memory injection fails
    return currentMessage;
  }
}

/**
 * Get conversation summary from metadata if available
 * @param conversationId - Conversation ID
 * @returns Conversation summary or empty string if not found
 */
export async function getConversationSummary(conversationId?: string): Promise<string> {
  if (!conversationId) {
    return '';
  }

  try {
    const supabase = createClient();
    const { data: conversation } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();
    
    const conversationMetadata = conversation?.metadata as any;
    const summary = conversationMetadata?.summary;
    
    if (summary) {
      logger.info('Retrieved conversation summary', { 
        conversationId, 
        summaryLength: summary.length 
      });
    }
    
    return summary || '';
  } catch (error) {
    logger.error('Failed to get conversation summary', { error, conversationId });
    return '';
  }
}