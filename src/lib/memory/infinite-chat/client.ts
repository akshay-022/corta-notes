import OpenAI from 'openai';
import logger from '@/lib/logger';

/**
 * Creates a supermemory-enabled OpenAI client for infinite chat
 * @param userId - Optional user ID for conversation scoping
 * @returns Configured OpenAI client that routes through supermemory
 */
export function createSupermemoryClient(userId?: string): OpenAI {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "x-api-key": process.env.SUPERMEMORY_API_KEY || '',
    "Content-Type": "application/json",
  };
  
  // Add user ID for conversation scoping
  if (userId) {
    headers["x-sm-user-id"] = userId;
  }
  
  logger.info('Created supermemory client', { hasUserId: !!userId });
  
  return new OpenAI({
    baseURL: "https://api.supermemory.ai/v3/https://api.openai.com/v1",
    fetchOptions: {
      headers: headers,
    } as any,
  });
}

/**
 * Check if supermemory is properly configured
 * @returns true if both API keys are available
 */
export function isSupermemoryConfigured(): boolean {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasSupermemoryKey = !!process.env.SUPERMEMORY_API_KEY;
  
  if (!hasOpenAIKey) {
    logger.warn('OpenAI API key not configured for supermemory');
  }
  
  if (!hasSupermemoryKey) {
    logger.warn('Supermemory API key not configured');
  }
  
  return hasOpenAIKey && hasSupermemoryKey;
} 