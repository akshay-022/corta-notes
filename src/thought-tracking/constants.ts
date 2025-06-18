/**
 * Global constants for the thought-tracking system
 * Centralizes all configuration values, storage keys, and default settings
 */

import { BrainStateConfig, OrganizationConfig, SupabaseStorageConfig } from './types';

// =============================================================================
// BRAIN STATE DEFAULTS
// =============================================================================

export const BRAIN_STATE_DEFAULTS = {
  maxEditsBeforeOrganization: 2, // Trigger organization when > 2 edits
  numEditsToOrganize: 3, // Organize 3 edits at a time
  summaryUpdateFrequency: 1, // Update summary every 10 edits (optional, not in use at the moment)
  useLineMappingSystem: true, // Use the new line mapping system by default
} as const;

// =============================================================================
// ORGANIZATION DEFAULTS
// =============================================================================

export const ORGANIZATION_DEFAULTS = {
  preserveAllInformation: true,
  createNewPagesThreshold: 0.3, // 30% similarity threshold for new pages
  maxSimilarityForMerge: 0.7, // 70% similarity threshold for merging
  contextWindowSize: 4000, // Max context for LLM
} as const;

// =============================================================================
// EVENTS
// =============================================================================

export const EVENTS = {
  EDIT_ADDED: 'thought-tracking:edit-added',
  BRAIN_STATE_UPDATED: 'thought-tracking:brain-state-updated',
  ORGANIZATION_NEEDED: 'thought-tracking:organization-needed',
  ORGANIZATION_COMPLETE: 'thought-tracking:organization-complete',
  ORGANIZATION_ERROR: 'thought-tracking:organization-error',
} as const;

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  BRAIN_STATE: 'thought-tracking:brain-state',
  ORGANIZED_PAGES: 'thought-tracking:organized-pages',
  CONFIG: 'thought-tracking:config',
} as const;

// =============================================================================
// SUPABASE DEFAULTS
// =============================================================================

export const SUPABASE_DEFAULTS = {
  tableName: 'pages',
  brainStateKey: 'thought_tracking_brain_state',
} as const;

// =============================================================================
// API ENDPOINTS
// =============================================================================

export const API_ENDPOINTS = {
  SUMMARY: '/api/thought-tracking/summarize',
  ORGANIZATION: '/api/organize-note',
} as const;

// =============================================================================
// PERFORMANCE THRESHOLDS
// =============================================================================

export const PERFORMANCE_THRESHOLDS = {
  MAX_STORAGE_SIZE_MB: 10, // Maximum storage size in MB
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  DEBOUNCE_DELAY_MS: 300, // Debounce delay for edit tracking
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