import { useEffect } from 'react'
import { fileTreeEvents, FileTreeEventType, FileTreeEventCallback, OrganizedPageSlim } from '@/lib/auto-organization/organized-file-updates/helpers/fileTree'
import logger from '@/lib/logger'

/**
 * React hook for listening to fileTree INSERT/DELETE events
 * 
 * @param callback - Function to call when events occur
 * @param enabled - Whether the subscription is active (default: true)
 * 
 * @example
 * ```tsx
 * useFileTreeEvents((eventType, page) => {
 *   if (eventType === 'INSERT') {
 *     console.log('New page created:', page.title)
 *     // Refresh your component state
 *   } else if (eventType === 'DELETE') {
 *     console.log('Page deleted:', page.title)
 *     // Remove from your component state
 *   }
 * })
 * ```
 */
export function useFileTreeEvents(
  callback: FileTreeEventCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return

    logger.info('Subscribing to fileTree events')
    
    const unsubscribe = fileTreeEvents.subscribe(callback)
    
    return () => {
      logger.info('Unsubscribing from fileTree events')
      unsubscribe()
    }
  }, [callback, enabled])
}

/**
 * Hook for listening to only INSERT events
 */
export function useFileTreeInserts(
  callback: (page: OrganizedPageSlim) => void,
  enabled: boolean = true
) {
  useFileTreeEvents((eventType, page) => {
    if (eventType === 'INSERT') {
      callback(page)
    }
  }, enabled)
}

/**
 * Hook for listening to only DELETE events
 */
export function useFileTreeDeletes(
  callback: (page: OrganizedPageSlim) => void,
  enabled: boolean = true
) {
  useFileTreeEvents((eventType, page) => {
    if (eventType === 'DELETE') {
      callback(page)
    }
  }, enabled)
} 