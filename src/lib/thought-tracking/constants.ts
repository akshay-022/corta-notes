/**
 * Configuration constants for the thought tracking system
 */

import { AutoOrganizationConfig, ThoughtProcessingConfig } from './types'

// Categories are dynamically discovered by LLM - no defaults needed

// Simple configuration
export const DEFAULT_CONFIG: ThoughtProcessingConfig = {
  bufferSize: 600,                    // Last 600 characters
  processingDelay: 1000,              // 1 second after empty line
  maxCategoriesPerThought: 2,         // One category per thought
  enableRealTimeProcessing: true      // Enable real-time processing
} 

export const DEFAULT_AUTO_ORGANIZATION_CONFIG: AutoOrganizationConfig = {
  enabled: true,
  threshold: 1,
  debounceMs: 2000,
  currentPageUuid: '',
  fileTree: []
}