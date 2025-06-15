// Core types
export * from './types';

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
export const DEFAULT_CONFIG = {
  maxEditsInPrimary: 30,
  maxEditsInSecondary: 30,
  summaryUpdateFrequency: 5,
  organizationThreshold: 30,
} as const;

export const EVENTS = {
  ORGANIZATION_NEEDED: 'thought-tracking:organization-needed',
  ORGANIZATION_COMPLETE: 'thought-tracking:organization-complete',
  ORGANIZATION_ERROR: 'thought-tracking:organization-error',
} as const; 