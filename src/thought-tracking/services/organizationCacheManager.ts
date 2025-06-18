import { Page } from '@/lib/supabase/types';
import { OrganizationResult } from '../types';
import { createClient } from '@/lib/supabase/supabase-client';

export interface CacheUpdateEvent {
  type: 'immediate' | 'refresh' | 'error';
  data: any;
  timestamp: number;
}

export interface OrganizationState {
  isOrganizing: boolean;
  lastOrganization: number | null;
  pendingUpdates: Page[];
  cacheVersion: number;
}

export class OrganizationCacheManager {
  private supabase: any;
  private userId?: string;
  private listeners: Map<string, (event: CacheUpdateEvent) => void> = new Map();
  private state: OrganizationState = {
    isOrganizing: false,
    lastOrganization: null,
    pendingUpdates: [],
    cacheVersion: 0
  };

  constructor(userId?: string) {
    this.supabase = createClient();
    this.userId = userId;
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  /**
   * Register a listener for cache update events
   */
  onCacheUpdate(listenerId: string, callback: (event: CacheUpdateEvent) => void): void {
    this.listeners.set(listenerId, callback);
  }

  /**
   * Remove a cache update listener
   */
  removeCacheListener(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  /**
   * Emit cache update event to all listeners
   */
  private emit(event: CacheUpdateEvent): void {
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in cache update listener:', error);
      }
    });
  }

  /**
   * Start organization process
   */
  startOrganization(): void {
    this.state.isOrganizing = true;
    this.state.cacheVersion += 1;
    
    this.emit({
      type: 'immediate',
      data: { status: 'organizing_started' },
      timestamp: Date.now()
    });
  }

  /**
   * Complete organization with optimized cache updates
   */
  async completeOrganization(result: OrganizationResult): Promise<void> {
    try {
      this.state.isOrganizing = false;
      this.state.lastOrganization = Date.now();
      this.state.cacheVersion += 1;

      // Apply immediate cache updates
      await this.applyImmediateCacheUpdates(result);
      
      // Schedule consistency check
      setTimeout(() => this.performConsistencyCheck(), 500);
      
    } catch (error) {
      console.error('Error completing organization:', error);
      this.handleOrganizationError(error as Error);
    }
  }

  /**
   * Apply immediate cache updates without waiting for database
   */
  private async applyImmediateCacheUpdates(result: OrganizationResult): Promise<void> {
    const updateEvent: CacheUpdateEvent = {
      type: 'immediate',
      data: {
        action: 'organization_complete',
        updatedPages: result.updatedPages,
        newPages: result.newPages,
        processedEditIds: result.processedEditIds,
        cacheVersion: this.state.cacheVersion
      },
      timestamp: Date.now()
    };

    this.emit(updateEvent);

    // Post message for components that listen to window messages
    if (typeof window !== 'undefined') {
      window.postMessage({
        type: 'ORGANIZATION_CACHE_UPDATE',
        data: updateEvent.data
      }, '*');
    }
  }

  /**
   * Perform consistency check with database
   */
  private async performConsistencyCheck(): Promise<void> {
    if (!this.userId) return;

    try {
      console.log('🔄 Performing organization consistency check...');
      
      // Get fresh data from database
      const { data: freshPages, error } = await this.supabase
        .from('pages')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Consistency check failed: ${error.message}`);
      }

      // Emit refresh event
      const refreshEvent: CacheUpdateEvent = {
        type: 'refresh',
        data: {
          action: 'consistency_refresh',
          freshPages,
          cacheVersion: this.state.cacheVersion
        },
        timestamp: Date.now()
      };

      this.emit(refreshEvent);

      // Post message for components that listen to window messages
      if (typeof window !== 'undefined') {
        window.postMessage({
          type: 'ORGANIZATION_REFRESH_REQUIRED',
          data: {
            reason: 'consistency_check',
            pages: freshPages,
            timestamp: Date.now()
          }
        }, '*');
      }

      console.log('✅ Consistency check completed');
      
    } catch (error) {
      console.error('❌ Consistency check failed:', error);
      this.handleOrganizationError(error as Error);
    }
  }

  /**
   * Handle organization errors
   */
  private handleOrganizationError(error: Error): void {
    this.state.isOrganizing = false;
    
    const errorEvent: CacheUpdateEvent = {
      type: 'error',
      data: {
        action: 'organization_error',
        error: error.message,
        cacheVersion: this.state.cacheVersion
      },
      timestamp: Date.now()
    };

    this.emit(errorEvent);

    // Post error message
    if (typeof window !== 'undefined') {
      window.postMessage({
        type: 'ORGANIZATION_ERROR',
        data: errorEvent.data
      }, '*');
    }
  }

  /**
   * Get current organization state
   */
  getState(): OrganizationState {
    return { ...this.state };
  }

  /**
   * Check if organization is in progress
   */
  isOrganizing(): boolean {
    return this.state.isOrganizing;
  }

  /**
   * Get cache version for optimistic updates
   */
  getCacheVersion(): number {
    return this.state.cacheVersion;
  }

  /**
   * Mark pages as pending update
   */
  addPendingUpdates(pages: Page[]): void {
    this.state.pendingUpdates.push(...pages);
  }

  /**
   * Clear pending updates
   */
  clearPendingUpdates(): void {
    this.state.pendingUpdates = [];
  }

  /**
   * Get pending updates
   */
  getPendingUpdates(): Page[] {
    return [...this.state.pendingUpdates];
  }

  /**
   * Optimistic update for immediate UI feedback
   */
  optimisticUpdate(pages: Page[], action: 'update' | 'create' | 'delete'): void {
    const optimisticEvent: CacheUpdateEvent = {
      type: 'immediate',
      data: {
        action: `optimistic_${action}`,
        pages,
        cacheVersion: this.state.cacheVersion
      },
      timestamp: Date.now()
    };

    this.emit(optimisticEvent);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.listeners.clear();
    this.state = {
      isOrganizing: false,
      lastOrganization: null,
      pendingUpdates: [],
      cacheVersion: 0
    };
  }
}

// Singleton instance for app-wide use
export const organizationCacheManager = new OrganizationCacheManager(); 