export interface FileHistoryItem {
  uuid: string
  title: string
  action: 'updated' | 'created'
  timestamp: number
  path?: string // full path for tooltip display
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
 * Post a single file history update
 */
export function postSingleFileUpdate(uuid: string, title: string, action: 'updated' | 'created', path?: string): void {
  const item = createFileHistoryItem(uuid, title, action, path)
  postFileHistoryUpdate([item])
} 