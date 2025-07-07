import { formatMemoryContext } from '@/lib/brainstorming';
import { getRelevantChatMemories } from '@/lib/brainstorming/memory-context';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-server';

/**
 * Get conversation summary from metadata if available
 * @param conversationId - Conversation ID
 * @returns Conversation summary or empty string if not found
 */
export async function getConversationMetadata(conversationId?: string): Promise<{summary: string, relevantFolders: any}> {
  if (!conversationId) {
    return {summary: '', relevantFolders: []};
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
    const relevantFolders = conversationMetadata?.relevantFolders;
    
    if (summary) {
      logger.info('Retrieved conversation summary', { 
        conversationId, 
        summaryLength: summary.length 
      });
    }
    
    return {summary, relevantFolders};
  } catch (error) {
    logger.error('Failed to get conversation summary', { error, conversationId });
    return {summary: '', relevantFolders: []};
  }
}