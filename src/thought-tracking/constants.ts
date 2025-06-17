/**
 * Global constants for the thought-tracking system
 * Centralizes all configuration values, storage keys, and default settings
 */

import { BrainStateConfig, OrganizationConfig, SupabaseStorageConfig } from './types';

// =============================================================================
// BRAIN STATE CONFIGURATION
// =============================================================================

export const BRAIN_STATE_DEFAULTS: BrainStateConfig = {
  maxEditsInPrimary: 1,
  maxEditsInSecondary: 3,
  summaryUpdateFrequency: 5,
  organizationThreshold: 3,
} as const;

// =============================================================================
// ORGANIZATION CONFIGURATION
// =============================================================================

export const ORGANIZATION_DEFAULTS: OrganizationConfig = {
  preserveAllInformation: true,
  createNewPagesThreshold: 0.3, // Similarity threshold for creating new pages
  maxSimilarityForMerge: 0.7, // Similarity threshold for merging with existing pages
  contextWindowSize: 4000, // Maximum context size for LLM
} as const;

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  BRAIN_STATE: 'thought-tracking:brain-state',
  CACHE_ENTRIES: 'thought-tracking:cache-entries',
  ORGANIZED_PAGES: 'thought-tracking:organized-pages',
  CONFIG: 'thought-tracking:config',
} as const;

// =============================================================================
// SUPABASE CONFIGURATION
// =============================================================================

export const SUPABASE_DEFAULTS: Required<SupabaseStorageConfig> = {
  tableName: 'pages',
  brainStateKey: 'thought_tracking_brain_state',
  cacheTableName: 'thought_tracking_cache',
} as const;

// =============================================================================
// API ENDPOINTS
// =============================================================================

export const API_ENDPOINTS = {
  ORGANIZATION: '/api/organize',
  SUMMARY_GENERATION: '/api/summarize',
} as const;

// =============================================================================
// EVENTS
// =============================================================================

export const EVENTS = {
  ORGANIZATION_NEEDED: 'thought-tracking:organization-needed',
  ORGANIZATION_COMPLETE: 'thought-tracking:organization-complete',
  ORGANIZATION_ERROR: 'thought-tracking:organization-error',
  SUMMARY_UPDATED: 'thought-tracking:summary-updated',
  BRAIN_STATE_UPDATED: 'thought-tracking:brain-state-updated',
} as const;

// =============================================================================
// SUMMARY GENERATION CONFIGURATION
// =============================================================================

export const SUMMARY_DEFAULTS = {
  MAX_SUMMARY_LENGTH: 500,
  MIN_EDITS_FOR_SUMMARY: 3,
  CONTEXT_WINDOW_SIZE: 2000,
} as const;

// =============================================================================
// PERFORMANCE THRESHOLDS
// =============================================================================

export const PERFORMANCE_THRESHOLDS = {
  MAX_CACHE_SIZE: 100, // Maximum number of cache entries before cleanup
  MAX_STORAGE_SIZE_MB: 10, // Maximum storage size in MB
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  DEBOUNCE_DELAY_MS: 300, // Debounce delay for edit tracking
} as const;

// =============================================================================
// VALIDATION LIMITS
// =============================================================================

export const VALIDATION_LIMITS = {
  MAX_PARAGRAPH_LENGTH: 10000,
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_TAGS_COUNT: 20,
  MAX_TAG_LENGTH: 50,
} as const;

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use BRAIN_STATE_DEFAULTS instead
 * Kept for backward compatibility
 */
export const DEFAULT_CONFIG = BRAIN_STATE_DEFAULTS; 