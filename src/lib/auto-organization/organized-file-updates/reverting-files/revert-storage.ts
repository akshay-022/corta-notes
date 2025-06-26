import { EnhancedFileHistoryItem } from '@/components/left-sidebar/fileHistoryUtils'
import logger from '@/lib/logger'

/**
 * Storage key for enhanced change history in localStorage
 */
export const ENHANCED_HISTORY_STORAGE_KEY = 'corta-enhanced-file-history'

/**
 * Maximum number of enhanced history items to keep in localStorage
 */
export const MAX_ENHANCED_HISTORY_ITEMS = 20

/**
 * Maximum age of enhanced history items in milliseconds (7 days)
 */
export const MAX_ENHANCED_HISTORY_AGE = 7 * 24 * 60 * 60 * 1000

/**
 * Save enhanced file history to localStorage with cleanup
 */
export function saveEnhancedHistoryToStorage(items: EnhancedFileHistoryItem[]): void {
  try {
    if (typeof window !== 'undefined') {
      const now = Date.now()
      
      // Filter out old items and limit to max count
      const validItems = items
        .filter(item => (now - item.timestamp) < MAX_ENHANCED_HISTORY_AGE)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_ENHANCED_HISTORY_ITEMS)
      
      localStorage.setItem(ENHANCED_HISTORY_STORAGE_KEY, JSON.stringify(validItems))
      
      logger.info('Enhanced history saved to localStorage', {
        totalItems: items.length,
        validItems: validItems.length,
        removedOld: items.length - validItems.length
      })
    }
  } catch (error) {
    logger.error('Failed to save enhanced history to localStorage', { error })
  }
}

/**
 * Load enhanced file history from localStorage with validation
 */
export function loadEnhancedHistoryFromStorage(): EnhancedFileHistoryItem[] {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(ENHANCED_HISTORY_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const now = Date.now()
          
          // Filter out invalid or old items
          const validItems = parsed.filter(item => {
            return (
              item &&
              typeof item === 'object' &&
              item.uuid &&
              item.canRevert === true &&
              item.timestamp &&
              (now - item.timestamp) < MAX_ENHANCED_HISTORY_AGE
            )
          })
          
          logger.info('Enhanced history loaded from localStorage', {
            storedItems: parsed.length,
            validItems: validItems.length
          })
          
          return validItems
        }
      }
    }
  } catch (error) {
    logger.error('Failed to load enhanced history from localStorage', { error })
  }
  return []
}

/**
 * Add an enhanced history item to localStorage with deduplication
 */
export function addEnhancedHistoryItem(item: EnhancedFileHistoryItem): void {
  const existingHistory = loadEnhancedHistoryFromStorage()
  
  // Remove any existing entry for the same file to avoid duplicates
  const filteredHistory = existingHistory.filter(h => h.uuid !== item.uuid)
  
  // Add the new item at the beginning
  const updatedHistory = [item, ...filteredHistory]
  
  saveEnhancedHistoryToStorage(updatedHistory)
  
  logger.info('Enhanced history item added', {
    uuid: item.uuid.substring(0, 8),
    title: item.title,
    action: item.action,
    totalItems: updatedHistory.length
  })
}

/**
 * Remove an enhanced history item from localStorage (after successful revert)
 */
export function removeEnhancedHistoryItem(uuid: string): void {
  const existingHistory = loadEnhancedHistoryFromStorage()
  const filteredHistory = existingHistory.filter(h => h.uuid !== uuid)
  
  saveEnhancedHistoryToStorage(filteredHistory)
  
  logger.info('Enhanced history item removed', {
    uuid: uuid.substring(0, 8),
    remainingItems: filteredHistory.length
  })
}

/**
 * Clear all enhanced history items (useful for cleanup)
 */
export function clearEnhancedHistory(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ENHANCED_HISTORY_STORAGE_KEY)
      logger.info('Enhanced history cleared')
    }
  } catch (error) {
    logger.error('Failed to clear enhanced history', { error })
  }
}

/**
 * Get storage usage statistics
 */
export function getEnhancedHistoryStats(): {
  itemCount: number
  storageSize: number
  oldestItem?: number
  newestItem?: number
} {
  const items = loadEnhancedHistoryFromStorage()
  const storageSize = typeof window !== 'undefined' 
    ? (localStorage.getItem(ENHANCED_HISTORY_STORAGE_KEY)?.length || 0)
    : 0
  
  const timestamps = items.map(item => item.timestamp).filter(Boolean)
  
  return {
    itemCount: items.length,
    storageSize,
    oldestItem: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
    newestItem: timestamps.length > 0 ? Math.max(...timestamps) : undefined
  }
} 