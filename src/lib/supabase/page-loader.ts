/**
 * Modular page loading service for Supabase pages
 * Provides unified interface for loading pages with different filters and strategies
 */

import { createClient } from './supabase-client'
import { Page } from './types'

export interface PageLoadOptions {
  userId: string
  includeDeleted?: boolean
  organizeStatuses?: string[]
  parentUuid?: string | null
  pageUuid?: string
  orderBy?: 'title' | 'created_at' | 'updated_at'
  orderDirection?: 'asc' | 'desc'
  limit?: number
}

export interface PageLoadResult {
  pages: Page[]
  error: string | null
  count: number
}

class PageLoaderService {
  private supabase = createClient()

  /**
   * Load all pages for a user with optional filters
   */
  async loadPages(options: PageLoadOptions): Promise<PageLoadResult> {
    try {
      console.log('📄 Loading pages with options:', options)

      let query = this.supabase
        .from('pages')
        .select('*')
        .eq('user_id', options.userId)

      // Apply filters
      if (!options.includeDeleted) {
        query = query.eq('is_deleted', false)
      }

      if (options.organizeStatuses && options.organizeStatuses.length > 0) {
        query = query.in('metadata->>organizeStatus', options.organizeStatuses)
      }

      if (options.parentUuid !== undefined) {
        if (options.parentUuid === null) {
          query = query.is('parent_uuid', null)
        } else {
          query = query.eq('parent_uuid', options.parentUuid)
        }
      }

      if (options.pageUuid) {
        query = query.eq('uuid', options.pageUuid)
      }

      // Apply ordering
      const orderBy = options.orderBy || 'title'
      const ascending = options.orderDirection !== 'desc'
      query = query.order(orderBy, { ascending })

      // Apply limit
      if (options.limit) {
        query = query.limit(options.limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('❌ Error loading pages:', error)
        return { pages: [], error: error.message, count: 0 }
      }

      const pages = data || []
      console.log(`✅ Loaded ${pages.length} pages`)

      return { pages, error: null, count: pages.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Exception loading pages:', error)
      return { pages: [], error: errorMessage, count: 0 }
    }
  }

  /**
   * Load a single page by UUID
   */
  async loadPageByUuid(userId: string, pageUuid: string): Promise<Page | null> {
    try {
      console.log('📄 Loading single page:', pageUuid)

      const { data, error } = await this.supabase
        .from('pages')
        .select('*')
        .eq('user_id', userId)
        .eq('uuid', pageUuid)
        .eq('is_deleted', false)
        .maybeSingle()

      if (error) {
        console.error('❌ Error loading page:', error)
        return null
      }

      console.log('✅ Loaded page:', data?.title || 'Not found')
      return data
    } catch (error) {
      console.error('❌ Exception loading page:', error)
      return null
    }
  }

  /**
   * Load all pages for a user (convenience method)
   */
  async loadAllPages(userId: string): Promise<PageLoadResult> {
    return this.loadPages({ userId })
  }

  /**
   * Load only recent notes (organize status 'soon')
   */
  async loadRecentNotes(userId: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      organizeStatuses: ['soon']
    })
  }

  /**
   * Load only auto-organized notes (organize status 'yes')
   */
  async loadOrganizedNotes(userId: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      organizeStatuses: ['yes']
    })
  }

  /**
   * Load relevant notes (both 'soon' and 'yes' organize status)
   */
  async loadRelevantNotes(userId: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      organizeStatuses: ['soon', 'yes']
    })
  }

  /**
   * Load root-level pages (no parent)
   */
  async loadRootPages(userId: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      parentUuid: null
    })
  }

  /**
   * Load child pages of a specific parent
   */
  async loadChildPages(userId: string, parentUuid: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      parentUuid
    })
  }

  /**
   * Load pages with specific organize status
   */
  async loadPagesByOrganizeStatus(userId: string, organizeStatus: string): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      organizeStatuses: [organizeStatus]
    })
  }

  /**
   * Load pages ordered by last updated
   */
  async loadRecentlyUpdatedPages(userId: string, limit?: number): Promise<PageLoadResult> {
    return this.loadPages({
      userId,
      orderBy: 'updated_at',
      orderDirection: 'desc',
      limit
    })
  }

  /**
   * Build file tree structure from flat pages array
   */
  buildFileTree(pages: Page[]): Page[] {
    const pageMap = new Map<string, Page & { children?: Page[] }>()
    const rootPages: (Page & { children?: Page[] })[] = []

    // First pass: create map of all pages
    pages.forEach(page => {
      pageMap.set(page.uuid, { ...page, children: [] })
    })

    // Second pass: build tree structure
    pages.forEach(page => {
      const pageWithChildren = pageMap.get(page.uuid)!
      
      if (page.parent_uuid) {
        const parent = pageMap.get(page.parent_uuid)
        if (parent) {
          if (!parent.children) parent.children = []
          parent.children.push(pageWithChildren)
        } else {
          // Parent not found, treat as root
          rootPages.push(pageWithChildren)
        }
      } else {
        rootPages.push(pageWithChildren)
      }
    })

    return rootPages
  }

  /**
   * Get pages as flat array (for brain-state.ts compatibility)
   */
  async loadPagesFlat(userId: string, options?: Partial<PageLoadOptions>): Promise<Page[]> {
    const result = await this.loadPages({ userId, ...options })
    return result.pages
  }
}

// Export singleton instance
export const pageLoader = new PageLoaderService()

// Export class for custom instances if needed
export { PageLoaderService }

// Convenience functions for common use cases
export async function loadPages(userId: string, options?: Partial<PageLoadOptions>): Promise<Page[]> {
  const result = await pageLoader.loadPages({ userId, ...options })
  return result.pages
}

export async function loadPageByUuid(userId: string, pageUuid: string): Promise<Page | null> {
  return pageLoader.loadPageByUuid(userId, pageUuid)
}

export async function loadAllPages(userId: string): Promise<Page[]> {
  const result = await pageLoader.loadAllPages(userId)
  return result.pages
}

export async function loadRelevantNotes(userId: string): Promise<Page[]> {
  const result = await pageLoader.loadRelevantNotes(userId)
  return result.pages
} 