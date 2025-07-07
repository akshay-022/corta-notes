/**
 * Supermemory diagnostic headers from the response
 * Based on https://supermemory.ai/docs/model-enhancement/context-extender
 */
export interface SupermemoryDiagnostics {
  conversationId?: string;
  contextModified?: boolean;
  tokensProcessed?: number;
  chunksCreated?: number;
  chunksDeleted?: number;
  docsDeleted?: number;
  error?: string;
}

/**
 * Enhanced response with supermemory diagnostics
 */
export interface SupermemoryResponse {
  content: string;
  diagnostics: SupermemoryDiagnostics;
}

/**
 * Configuration for supermemory infinite chat
 */
export interface SupermemoryConfig {
  userId?: string;
  model?: string;
  enableFunctionCalling?: boolean;
} 