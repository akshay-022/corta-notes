import { createClient } from '@/lib/supabase/supabase-client'
import logger from '@/lib/logger'
import { 
  EnhancedFileHistoryItem, 
  postFileHistoryUpdate 
} from '@/components/left-sidebar/fileHistoryUtils'
import { removeEnhancedHistoryItem } from './revert-storage'
import { RevertResult, RevertPreview } from './revert-types'

/**
 * Service for reverting file changes using enhanced history
 */
export class RevertService {
  private supabase = createClient()

  /**
   * Revert a file to its previous state using enhanced history
   */
  async revertFileChange(historyItem: EnhancedFileHistoryItem): Promise<RevertResult> {
    try {
      logger.info('Starting file revert', {
        pageUuid: historyItem.uuid.substring(0, 8),
        pageTitle: historyItem.title,
        action: historyItem.action,
        timestamp: historyItem.timestamp
      })

      // Get current user
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user?.id) {
        return { 
          success: false, 
          error: 'User not authenticated' 
        }
      }

      // Verify the page exists and belongs to the user
      const { data: currentPage, error: fetchError } = await this.supabase
        .from('pages')
        .select('uuid, title, content, content_text, user_id')
        .eq('uuid', historyItem.uuid)
        .eq('user_id', user.id)
        .single()

      if (fetchError || !currentPage) {
        logger.error('Failed to fetch page for revert', { 
          error: fetchError, 
          pageUuid: historyItem.uuid 
        })
        return { 
          success: false, 
          error: 'Page not found or access denied' 
        }
      }

      // Handle different revert scenarios
      if (historyItem.action === 'created') {
        // For created files, we delete the file entirely
        return await this.revertCreatedFile(historyItem, user.id)
      } else {
        // For updated files, we restore the old content
        return await this.revertUpdatedFile(historyItem, user.id)
      }

    } catch (error) {
      logger.error('Revert operation failed', { 
        error, 
        pageUuid: historyItem.uuid 
      })
      return { 
        success: false, 
        error: `Revert failed: ${error}` 
      }
    }
  }

  /**
   * Revert a file creation by deleting the file
   */
  private async revertCreatedFile(historyItem: EnhancedFileHistoryItem, userId: string): Promise<RevertResult> {
    const { error: deleteError } = await this.supabase
      .from('pages')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString()
      })
      .eq('uuid', historyItem.uuid)
      .eq('user_id', userId)

    if (deleteError) {
      logger.error('Failed to delete created file during revert', { 
        error: deleteError, 
        pageUuid: historyItem.uuid 
      })
      return { 
        success: false, 
        error: 'Failed to delete file' 
      }
    }

    // Remove from enhanced history
    removeEnhancedHistoryItem(historyItem.uuid)

    // Notify UI about the deletion
    this.notifyFileDeleted(historyItem)

    logger.info('Successfully reverted file creation', {
      pageUuid: historyItem.uuid.substring(0, 8),
      pageTitle: historyItem.title
    })

    return {
      success: true,
      pageUuid: historyItem.uuid,
      pageTitle: historyItem.title
    }
  }

  /**
   * Revert a file update by restoring old content
   */
  private async revertUpdatedFile(historyItem: EnhancedFileHistoryItem, userId: string): Promise<RevertResult> {
    const { error: updateError } = await this.supabase
      .from('pages')
      .update({
        content: historyItem.oldContent,
        content_text: historyItem.oldContentText,
        updated_at: new Date().toISOString()
      })
      .eq('uuid', historyItem.uuid)
      .eq('user_id', userId)

    if (updateError) {
      logger.error('Failed to restore old content during revert', { 
        error: updateError, 
        pageUuid: historyItem.uuid 
      })
      return { 
        success: false, 
        error: 'Failed to restore old content' 
      }
    }

    // Remove from enhanced history
    removeEnhancedHistoryItem(historyItem.uuid)

    // Notify UI about the revert
    this.notifyFileReverted(historyItem)

    logger.info('Successfully reverted file update', {
      pageUuid: historyItem.uuid.substring(0, 8),
      pageTitle: historyItem.title,
      oldContentLength: historyItem.oldContentText.length,
      newContentLength: historyItem.newContentText.length
    })

    return {
      success: true,
      pageUuid: historyItem.uuid,
      pageTitle: historyItem.title
    }
  }

  /**
   * Notify UI components about file deletion
   */
  private notifyFileDeleted(historyItem: EnhancedFileHistoryItem): void {
    if (typeof window !== 'undefined') {
      // Notify about file deletion
      window.postMessage({
        type: 'FILE_DELETED',
        data: {
          uuid: historyItem.uuid,
          title: historyItem.title,
          reason: 'reverted_creation'
        }
      }, '*')

      // Update file history to remove the item
      postFileHistoryUpdate([])
    }
  }

  /**
   * Notify UI components about file revert
   */
  private notifyFileReverted(historyItem: EnhancedFileHistoryItem): void {
    if (typeof window !== 'undefined') {
      // Notify about successful revert
      window.postMessage({
        type: 'FILE_REVERTED',
        data: {
          uuid: historyItem.uuid,
          title: historyItem.title,
          timestamp: Date.now()
        }
      }, '*')

      // Add a new history entry for the revert action
      postFileHistoryUpdate([{
        uuid: historyItem.uuid,
        title: historyItem.title,
        action: 'updated',
        timestamp: Date.now(),
        path: historyItem.path
      }])
    }
  }

  /**
   * Get a preview of what will be reverted
   */
  getRevertPreview(historyItem: EnhancedFileHistoryItem): RevertPreview {
    if (historyItem.action === 'created') {
      return {
        action: 'Delete File',
        description: `This will delete the file "${historyItem.title}" completely.`,
        warning: 'This action cannot be undone. The file will be permanently deleted.'
      }
    } else {
      const oldLength = historyItem.oldContentText.length
      const newLength = historyItem.newContentText.length
      const sizeDiff = newLength - oldLength
      
      return {
        action: 'Restore Previous Version',
        description: `This will restore "${historyItem.title}" to its previous state.`,
        warning: sizeDiff > 0 
          ? `You will lose ${sizeDiff} characters of content added by AI organization.`
          : `This will restore ${Math.abs(sizeDiff)} characters that were removed.`
      }
    }
  }
}

// Export a singleton instance
export const revertService = new RevertService() 