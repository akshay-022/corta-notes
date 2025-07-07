import { SupermemoryDiagnostics } from './types';
import logger from '@/lib/logger';

/**
 * Extract supermemory diagnostic headers from a response
 * @param response - The fetch response from supermemory
 * @returns SupermemoryDiagnostics object
 */
export function extractSupermemoryDiagnostics(response: Response): SupermemoryDiagnostics {
  const diagnostics: SupermemoryDiagnostics = {};
  
  try {
    // Extract diagnostic headers
    const conversationId = response.headers.get('x-supermemory-conversation-id');
    const contextModified = response.headers.get('x-supermemory-context-modified');
    const tokensProcessed = response.headers.get('x-supermemory-tokens-processed');
    const chunksCreated = response.headers.get('x-supermemory-chunks-created');
    const chunksDeleted = response.headers.get('x-supermemory-chunks-deleted');
    const docsDeleted = response.headers.get('x-supermemory-docs-deleted');
    const error = response.headers.get('x-supermemory-error');
    
    if (conversationId) diagnostics.conversationId = conversationId;
    if (contextModified) diagnostics.contextModified = contextModified === 'true';
    if (tokensProcessed) diagnostics.tokensProcessed = parseInt(tokensProcessed, 10);
    if (chunksCreated) diagnostics.chunksCreated = parseInt(chunksCreated, 10);
    if (chunksDeleted) diagnostics.chunksDeleted = parseInt(chunksDeleted, 10);
    if (docsDeleted) diagnostics.docsDeleted = parseInt(docsDeleted, 10);
    if (error) diagnostics.error = error;
    
    // Log diagnostics if any are present
    if (Object.keys(diagnostics).length > 0) {
      logger.info('Supermemory diagnostics extracted', { diagnostics });
    }
    
  } catch (error) {
    logger.error('Failed to extract supermemory diagnostics', { error });
  }
  
  return diagnostics;
}

/**
 * Log supermemory performance metrics
 * @param diagnostics - Supermemory diagnostic data
 */
export function logSupermemoryMetrics(diagnostics: SupermemoryDiagnostics): void {
  if (diagnostics.tokensProcessed) {
    logger.info('Supermemory tokens processed', { 
      tokensProcessed: diagnostics.tokensProcessed,
      chunksCreated: diagnostics.chunksCreated || 0,
      contextModified: diagnostics.contextModified || false
    });
  }
  
  if (diagnostics.error) {
    logger.warn('Supermemory error detected', { error: diagnostics.error });
  }
} 