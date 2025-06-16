// Core types
export * from './types';

// Constants
export * from './constants';

// Core classes
export { ThoughtTracker } from './core/thoughtTracker';
export { BrainStateManager } from './core/brainState';
export { SummaryGenerator } from './core/summaryGenerator';
export { OrganizationManager } from './core/organizationManager';

// Storage implementations
export { LocalStorageManager } from './storage/localStorage';
export { SupabaseStorageManager } from './storage/supabaseStorage';

// Utilities
export * from './utils/helpers';

// React hook
export { useThoughtTracker } from './hooks/useThoughtTracker'

// Components
export { ThoughtTrackingStatus, ThoughtTrackingMini } from './components/ThoughtTrackingStatus'

// Extensions  
export { ThoughtParagraph } from './extensions/paragraph-extension'

// Integration utilities
export { 
  setupThoughtTracking, 
  getTrackerForPage, 
  triggerOrganizationForPage, 
  getThoughtTrackingStats 
} from './integration/editor-integration';

// Constants and defaults
export { 
  BRAIN_STATE_DEFAULTS as DEFAULT_CONFIG,
  ORGANIZATION_DEFAULTS,
  STORAGE_KEYS,
  SUPABASE_DEFAULTS,
  API_ENDPOINTS,
  EVENTS,
  SUMMARY_DEFAULTS,
  PERFORMANCE_THRESHOLDS,
  VALIDATION_LIMITS
} from './constants'; 