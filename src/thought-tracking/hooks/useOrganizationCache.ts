import { useState, useEffect, useCallback } from 'react';
import { Page } from '@/lib/supabase/types';
import { organizationCacheManager, CacheUpdateEvent, OrganizationState } from '../services/organizationCacheManager';

export interface UseOrganizationCacheOptions {
  autoRefresh?: boolean;
  listenerId?: string;
}

export interface OrganizationCacheHook {
  state: OrganizationState;
  isOrganizing: boolean;
  cacheVersion: number;
  lastOrganization: number | null;
  pendingUpdates: Page[];
  
  // Actions
  refreshCache: () => Promise<void>;
  clearPendingUpdates: () => void;
  optimisticUpdate: (pages: Page[], action: 'update' | 'create' | 'delete') => void;
  
  // Events
  onCacheUpdate: (callback: (event: CacheUpdateEvent) => void) => void;
  offCacheUpdate: () => void;
}

export function useOrganizationCache(options: UseOrganizationCacheOptions = {}): OrganizationCacheHook {
  const {
    autoRefresh = true,
    listenerId = `hook-${Math.random().toString(36).substr(2, 9)}`
  } = options;

  const [state, setState] = useState<OrganizationState>(() => 
    organizationCacheManager.getState()
  );
  const [updateCallback, setUpdateCallback] = useState<((event: CacheUpdateEvent) => void) | null>(null);

  // Update state when cache manager state changes
  const handleCacheUpdate = useCallback((event: CacheUpdateEvent) => {
    setState(organizationCacheManager.getState());
    
    // Call external callback if provided
    if (updateCallback) {
      updateCallback(event);
    }
  }, [updateCallback]);

  // Setup cache update listener
  useEffect(() => {
    organizationCacheManager.onCacheUpdate(listenerId, handleCacheUpdate);
    
    return () => {
      organizationCacheManager.removeCacheListener(listenerId);
    };
  }, [listenerId, handleCacheUpdate]);

  // Refresh initial state
  useEffect(() => {
    setState(organizationCacheManager.getState());
  }, []);

  const refreshCache = useCallback(async () => {
    // Trigger a consistency check
    if (organizationCacheManager.getUserId()) {
      // This will trigger a consistency check internally
      setState(organizationCacheManager.getState());
    }
  }, []);

  const clearPendingUpdates = useCallback(() => {
    organizationCacheManager.clearPendingUpdates();
    setState(organizationCacheManager.getState());
  }, []);

  const optimisticUpdate = useCallback((pages: Page[], action: 'update' | 'create' | 'delete') => {
    organizationCacheManager.optimisticUpdate(pages, action);
  }, []);

  const onCacheUpdate = useCallback((callback: (event: CacheUpdateEvent) => void) => {
    setUpdateCallback(() => callback);
  }, []);

  const offCacheUpdate = useCallback(() => {
    setUpdateCallback(null);
  }, []);

  return {
    state,
    isOrganizing: state.isOrganizing,
    cacheVersion: state.cacheVersion,
    lastOrganization: state.lastOrganization,
    pendingUpdates: state.pendingUpdates,
    
    refreshCache,
    clearPendingUpdates,
    optimisticUpdate,
    
    onCacheUpdate,
    offCacheUpdate,
  };
}

/**
 * Hook for components that need to show organization status
 */
export function useOrganizationStatus() {
  const { isOrganizing, lastOrganization, cacheVersion } = useOrganizationCache();
  
  return {
    isOrganizing,
    lastOrganization,
    cacheVersion,
    lastOrganizationAgo: lastOrganization ? Date.now() - lastOrganization : null,
  };
}

/**
 * Hook for components that need to perform optimistic updates
 */
export function useOptimisticUpdates() {
  const { optimisticUpdate, pendingUpdates, clearPendingUpdates } = useOrganizationCache();
  
  return {
    optimisticUpdate,
    pendingUpdates,
    clearPendingUpdates,
    hasPendingUpdates: pendingUpdates.length > 0,
  };
} 