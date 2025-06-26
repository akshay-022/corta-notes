export interface FileHistoryItem {
  uuid: string
  title: string
  action: 'updated' | 'created'
  timestamp: number
  path?: string // full path for tooltip display
  // Enhanced fields for revert functionality
  oldContent?: any // TipTap JSON content before change
  newContent?: any // TipTap JSON content after change
  oldContentText?: string // Plain text before change
  newContentText?: string // Plain text after change
  canRevert?: boolean // Whether this change can be reverted
}

/**
 * Enhanced file history item for tracking content changes with revert capability
 */
export interface EnhancedFileHistoryItem extends FileHistoryItem {
  oldContent: any
  newContent: any
  oldContentText: string
  newContentText: string
  canRevert: true
}

/**
 * Post a file history update to the window for the FileHistory component to pick up
 */
export function postFileHistoryUpdate(items: FileHistoryItem[]): void {
  if (typeof window !== 'undefined') {
    window.postMessage({
      type: 'FILE_HISTORY_UPDATE',
      data: items
    }, '*')
  }
}

/**
 * Create a file history item for a single file update
 */
export function createFileHistoryItem(
  uuid: string,
  title: string,
  action: 'updated' | 'created',
  path?: string
): FileHistoryItem {
  return {
    uuid,
    title,
    action,
    timestamp: Date.now(),
    path,
  }
}

/**
 * Create an enhanced file history item with content tracking for revert functionality
 */
export function createEnhancedFileHistoryItem(
  uuid: string,
  title: string,
  action: 'updated' | 'created',
  oldContent: any,
  newContent: any,
  oldContentText: string,
  newContentText: string,
  path?: string
): EnhancedFileHistoryItem {
  return {
    uuid,
    title,
    action,
    timestamp: Date.now(),
    path,
    oldContent,
    newContent,
    oldContentText,
    newContentText,
    canRevert: true
  }
}

/**
 * Post a single file history update
 */
export function postSingleFileUpdate(uuid: string, title: string, action: 'updated' | 'created', path?: string): void {
  const item = createFileHistoryItem(uuid, title, action, path)
  postFileHistoryUpdate([item])
}

/**
 * Post an enhanced file history update with revert capability
 */
export function postEnhancedFileUpdate(
  uuid: string, 
  title: string, 
  action: 'updated' | 'created',
  oldContent: any,
  newContent: any,
  oldContentText: string,
  newContentText: string,
  path?: string
): void {
  const item = createEnhancedFileHistoryItem(uuid, title, action, oldContent, newContent, oldContentText, newContentText, path)
  postFileHistoryUpdate([item])
}

// Note: Enhanced history storage functions have been moved to:
// @/lib/auto-organization/organized-file-updates/reverting-files/revert-storage 