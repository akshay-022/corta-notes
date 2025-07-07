import { formatMemoryContext } from '@/lib/brainstorming';
import { getRelevantChatMemories } from '@/lib/brainstorming/memory-context';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-server';

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
    const supabase = await createClient();
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