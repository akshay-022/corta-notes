/**
 * Revert functionality for AI-organized file changes
 * 
 * This module provides comprehensive revert capabilities for when AI organization
 * makes unwanted changes to files. Users can easily undo AI changes through the UI.
 */

// Core revert service
export { RevertService, revertService } from './revert-service'

// Storage management
export {
  saveEnhancedHistoryToStorage,
  loadEnhancedHistoryFromStorage,
  addEnhancedHistoryItem,
  removeEnhancedHistoryItem,
  clearEnhancedHistory,
  getEnhancedHistoryStats,
  ENHANCED_HISTORY_STORAGE_KEY,
  MAX_ENHANCED_HISTORY_ITEMS,
  MAX_ENHANCED_HISTORY_AGE
} from './revert-storage'

// Type definitions
export type {
  RevertResult,
  RevertPreview,
  RevertOperation,
  RevertNotification,
  RevertStatus,
  RevertState
} from './revert-types' 