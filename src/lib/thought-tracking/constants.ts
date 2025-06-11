/**
 * Configuration constants for the thought tracking system
 */

import { ThoughtProcessingConfig } from './types'

// Categories are dynamically discovered by LLM - no defaults needed

// Simple configuration
export const DEFAULT_CONFIG: ThoughtProcessingConfig = {
  bufferSize: 600,                    // Last 600 characters
  processingDelay: 1000,              // 1 second after empty line
  maxCategoriesPerThought: 2,         // One category per thought
  enableRealTimeProcessing: true      // Enable real-time processing
} 