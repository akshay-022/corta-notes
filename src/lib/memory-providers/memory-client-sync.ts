'use client'

import { Page } from '@/lib/supabase/types'
import { superMemoryService } from '@/lib/memory-providers/memory-client'
import { createClient } from '@/lib/supabase/supabase-client'

export type SyncStatus = 'never' | 'no' | 'yes'

export interface PageSyncMetadata {
  isMemSynced?: SyncStatus
  // ... other existing metadata fields
}

class SuperMemorySyncService {
  private logger = console
  private supabase = createClient()

  /**
   * Check if a page should be synced to SuperMemory
   * Only sync pages that are NOT in "soon" organize status
   */
  private shouldSyncPage(page: Page): boolean {
    const metadata = page.metadata as PageSyncMetadata
    const organizeStatus = (metadata as any)?.organizeStatus
    const isFolder = (metadata as any)?.isFolder
    
    // Don't sync folders
    if (isFolder) {
      this.logger.log(`Skipping folder: ${page.title}`)
      return false
    }
    
    // Don't sync pages with organizeStatus 'soon' or if not marked organized
    if (organizeStatus === 'soon' || !page.organized) {
      this.logger.log(`Skipping unorganized page: ${page.title}`)
      return false
    }
    
    return true
  }

  /**
   * Get the current sync status of a page
   */
  getSyncStatus(page: Page): SyncStatus {
    const metadata = page.metadata as PageSyncMetadata
    return metadata.isMemSynced || 'never'
  }

  /**
   * Update the sync status of a page in the database
   */
  private async updateSyncStatus(pageUuid: string, status: SyncStatus): Promise<void> {
    this.logger.log(`Updating sync status for ${pageUuid} to ${status}`)
    
    // Get current page data
    const { data: currentPage, error: fetchError } = await this.supabase
      .from('pages')
      .select('metadata')
      .eq('uuid', pageUuid)
      .single()

    if (fetchError) {
      this.logger.error('Error fetching page for sync status update:', fetchError)
      return
    }

    // Update metadata with new sync status
    const updatedMetadata = {
      ...(currentPage.metadata as any || {}),
      isMemSynced: status
    }

    const { error } = await this.supabase
      .from('pages')
      .update({ metadata: updatedMetadata })
      .eq('uuid', pageUuid)

    if (error) {
      this.logger.error('Error updating sync status:', error)
    } else {
      this.logger.log(`Successfully updated sync status for ${pageUuid} to ${status}`)
    }
  }

  /**
   * Sync a single page to SuperMemory
   * Handles both new documents and updates
   */
  async syncPage(page: Page): Promise<boolean> {
    if (!this.shouldSyncPage(page)) {
      return false
    }

    const syncStatus = this.getSyncStatus(page)
    this.logger.log(`Syncing page: ${page.title} (status: ${syncStatus})`)

    try {
      // Extract text content for embedding
      const originalTextContent = page.content_text || ''
      
      if (!originalTextContent.trim()) {
        this.logger.log(`Skipping empty page: ${page.title}`)
        return false
      }

      // CRITICAL: Append title to content for better search relevance
      const enhancedTextContent = `The title of this file is ${page.title} and this is EXTREMELY IMPORTANT \n\n Here is the content of the file: ${originalTextContent}`

      if (syncStatus === 'never') {
        // First time sync - add to SuperMemory
        this.logger.log(`Adding new document to SuperMemory: ${page.title}`)
        await superMemoryService.addDocument(
          page.uuid,
          enhancedTextContent,
          page.title
        )
      } else if (syncStatus === 'no') {
        // Update existing document in SuperMemory
        this.logger.log(`Updating document in SuperMemory: ${page.title}`)
        await superMemoryService.updateDocument(
          page.uuid,
          enhancedTextContent,
          page.title
        )
      }

      // Mark as synced
      await this.updateSyncStatus(page.uuid, 'yes')
      return true

    } catch (error) {
      this.logger.error(`Error syncing page ${page.title}:`, error)
      return false
    }
  }

  /**
   * Mark a page as needing sync (when it gets updated)
   */
  async markPageForSync(pageUuid: string): Promise<void> {
    const currentStatus = await this.getCurrentSyncStatus(pageUuid)
    if (currentStatus === 'never') {
      // Keep it as 'never' if it was never synced
      return
    }
    
    // Mark as needing sync
    await this.updateSyncStatus(pageUuid, 'no')
  }

  /**
   * Get current sync status from database
   */
  private async getCurrentSyncStatus(pageUuid: string): Promise<SyncStatus> {
    const { data, error } = await this.supabase
      .from('pages')
      .select('metadata')
      .eq('uuid', pageUuid)
      .single()

    if (error || !data) {
      return 'never'
    }

    const metadata = data.metadata as PageSyncMetadata
    return metadata.isMemSynced || 'never'
  }

  /**
   * Sync all pages that need syncing
   * This runs in the background when pages are loaded
   */
  async syncAllPending(pages: Page[]): Promise<void> {
    this.logger.log('Starting background sync of all pending pages...')
    
    const pagesToSync = pages.filter(page => {
      if (!this.shouldSyncPage(page)) return false
      
      const syncStatus = this.getSyncStatus(page)
      return syncStatus === 'never' || syncStatus === 'no'
    })

    this.logger.log(`Found ${pagesToSync.length} pages needing sync`)

    // Sync pages in batches to avoid overwhelming the API
    const batchSize = 3
    for (let i = 0; i < pagesToSync.length; i += batchSize) {
      const batch = pagesToSync.slice(i, i + batchSize)
      
      this.logger.log(`Syncing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(pagesToSync.length/batchSize)}`)
      
      // Sync batch in parallel
      const promises = batch.map(page => this.syncPage(page))
      await Promise.all(promises)
      
      // Small delay between batches
      if (i + batchSize < pagesToSync.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    this.logger.log('Background sync completed')
  }

  /**
   * Get pages that need syncing
   */
  getPendingSyncPages(pages: Page[]): Page[] {
    return pages.filter(page => {
      if (!this.shouldSyncPage(page)) return false
      
      const syncStatus = this.getSyncStatus(page)
      return syncStatus === 'never' || syncStatus === 'no'
    })
  }
}

// Export singleton instance
export const superMemorySyncService = new SuperMemorySyncService() 