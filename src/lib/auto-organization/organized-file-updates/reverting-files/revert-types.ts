/**
 * Types and interfaces for the revert functionality
 */

export interface RevertResult {
  success: boolean
  error?: string
  pageUuid?: string
  pageTitle?: string
}

export interface RevertPreview {
  action: string
  description: string
  warning?: string
}

export interface RevertOperation {
  uuid: string
  title: string
  action: 'created' | 'updated'
  timestamp: number
  oldContent: any
  newContent: any
  oldContentText: string
  newContentText: string
}

export interface RevertNotification {
  type: 'FILE_DELETED' | 'FILE_REVERTED'
  data: {
    uuid: string
    title: string
    timestamp?: number
    reason?: string
  }
}

export type RevertStatus = 'idle' | 'confirming' | 'reverting' | 'success' | 'error'

export interface RevertState {
  status: RevertStatus
  operation?: RevertOperation
  error?: string
} 