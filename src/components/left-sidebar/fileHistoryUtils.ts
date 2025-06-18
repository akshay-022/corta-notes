export interface FileHistoryItem {
  uuid: string
  title: string
  action: 'updated' | 'created'
  timestamp: number
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
  action: 'updated' | 'created'
): FileHistoryItem {
  return {
    uuid,
    title,
    action,
    timestamp: Date.now()
  }
}

/**
 * Post a single file history update
 */
export function postSingleFileUpdate(uuid: string, title: string, action: 'updated' | 'created'): void {
  const item = createFileHistoryItem(uuid, title, action)
  postFileHistoryUpdate([item])
} 