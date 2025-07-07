import { createClient } from '@/lib/supabase/supabase-client';
import { callLLM } from '@/lib/llm/callLLM';
import logger from '@/lib/logger';

/**
 * Update conversation summary in metadata asynchronously
 * @param conversationId - Conversation ID
 * @param userId - User ID for authentication
 * @param messageHistory - Array of conversation messages
 * @param currentPageContent - Optional current page content for context
 */
export async function updateConversationSummary(
  conversationId: string,
  userId: string,
  messageHistory: any[],
  currentPageContent?: string
): Promise<void> {
  try {
    // Get the last 5 messages for context
    const lastMessages = messageHistory.slice(-5);
    
    if (lastMessages.length === 0) {
      logger.info('No messages to summarize', { conversationId });
      return;
    }

    // Get current summary from conversations table
    const supabase = createClient();
    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      logger.error('Failed to fetch current summary', { error: fetchError, conversationId, userId });
      return;
    }

    const conversationMetadata = conversation?.metadata as any;
    const currentSummary = conversationMetadata?.summary;

    // Build summary context
    let summaryContext = '';
    if (currentSummary) {
      summaryContext += `Previous summary: ${currentSummary}\n\n`;
    }
    
    summaryContext += `Last 5 messages:\n${lastMessages.map(msg => 
      `${msg.role}: ${msg.content}`
    ).join('\n')}`;

    // Add current page content if provided
    if (currentPageContent) {
      summaryContext += `\n\nCurrent page context:\n${currentPageContent}`;
    }

    // Use AI to generate a proper summary
    const summaryPrompt = `You are a helpful assistant that creates concise, informative summaries of conversations.

${summaryContext}

Please create a brief, 2-3 sentence summary of this conversation that captures the main topic and key points discussed. Focus on what the conversation is about and any important decisions or insights mentioned. Try to only focus on what the user is talking about right now. 

Summary:`;

    const newSummary = await callLLM({ 
      model: 'gpt-4o', 
      prompt: summaryPrompt 
    });

    // Clean up the summary (remove any extra formatting)
    const cleanedSummary = newSummary.trim().replace(/^Summary:\s*/i, '');

    // Update metadata in conversations table
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        metadata: {
          ...conversationMetadata,
          summary: cleanedSummary,
          lastUpdated: new Date().toISOString()
        }
      })
      .eq('id', conversationId)
      .eq('user_id', userId);

    if (updateError) {
      logger.error('Failed to update conversation summary', { error: updateError, conversationId, userId });
    } else {
      logger.info('Updated conversation summary with AI', { 
        conversationId, 
        userId,
        summaryLength: cleanedSummary.length,
        summary: cleanedSummary,
        hasPageContent: !!currentPageContent
      });
    }

  } catch (error) {
    logger.error('Error updating conversation summary', { error, conversationId, userId });
  }
}