import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ParagraphEdit, 
  BrainState, 
  OrganizedPage, 
  BrainStateConfig,
  CacheEntry 
} from '../types';
import { ThoughtTracker } from '../core/thoughtTracker';

interface ThoughtTrackerHookReturn {
  // Core tracking methods
  trackEdit: (edit: Omit<ParagraphEdit, 'id' | 'timestamp'>) => Promise<void>;
  
  // Data access methods
  brainState: BrainState | null;
  organizedPages: OrganizedPage[];
  recentEdits: ParagraphEdit[];
  cacheEntries: CacheEntry[];
  
  // Search and filter methods
  searchPages: (query: string) => Promise<OrganizedPage[]>;
  getEditsByPage: (pageId: string) => Promise<ParagraphEdit[]>;
  getEditsByParagraph: (paragraphId: string) => Promise<ParagraphEdit[]>;
  getOrganizedPage: (pageId: string) => Promise<OrganizedPage | null>;
  
  // Control methods
  triggerOrganization: () => Promise<void>;
  updateConfig: (config: Partial<BrainStateConfig>) => Promise<void>;
  
  // Data management
  exportData: () => Promise<any>;
  importData: (data: any) => Promise<void>;
  clearAllData: () => Promise<void>;
  
  // State and stats
  stats: any;
  isLoading: boolean;
  error: string | null;
  isOrganizing: boolean;
  
  // Event handlers
  onOrganizationComplete: (callback: (result: any) => void) => void;
  onOrganizationError: (callback: (error: string) => void) => void;
}

export function useThoughtTracker(
  summaryApiEndpoint?: string,
  organizationApiEndpoint?: string
): ThoughtTrackerHookReturn {
  const trackerRef = useRef<ThoughtTracker | null>(null);
  
  // State
  const [brainState, setBrainState] = useState<BrainState | null>(null);
  const [organizedPages, setOrganizedPages] = useState<OrganizedPage[]>([]);
  const [recentEdits, setRecentEdits] = useState<ParagraphEdit[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOrganizing, setIsOrganizing] = useState(false);
  
  // Event callback refs
  const organizationCompleteCallbacks = useRef<Set<(result: any) => void>>(new Set());
  const organizationErrorCallbacks = useRef<Set<(error: string) => void>>(new Set());

  // Initialize tracker
  useEffect(() => {
    const initializeTracker = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        trackerRef.current = new ThoughtTracker(
          undefined, // Use default storage manager
          summaryApiEndpoint,
          organizationApiEndpoint
        );
        
        await trackerRef.current.initialize();
        
        // Load initial data
        await refreshData();
        
        // Setup event listeners
        setupEventListeners();
        
      } catch (err) {
        console.error('Failed to initialize ThoughtTracker:', err);
        setError('Failed to initialize thought tracking');
      } finally {
        setIsLoading(false);
      }
    };

    initializeTracker();

    return () => {
      if (trackerRef.current) {
        trackerRef.current.dispose();
      }
    };
  }, [summaryApiEndpoint, organizationApiEndpoint]);

  const setupEventListeners = useCallback(() => {
    if (typeof window === 'undefined') return;

    const handleOrganizationComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      setIsOrganizing(false);
      
      organizationCompleteCallbacks.current.forEach(callback => {
        callback(customEvent.detail);
      });
      
      // Refresh data after organization
      refreshData();
    };

    const handleOrganizationError = (event: Event) => {
      const customEvent = event as CustomEvent;
      setIsOrganizing(false);
      
      organizationErrorCallbacks.current.forEach(callback => {
        callback(customEvent.detail.error);
      });
    };

    const handleOrganizationNeeded = () => {
      setIsOrganizing(true);
    };

    window.addEventListener('thought-tracking:organization-complete', handleOrganizationComplete);
    window.addEventListener('thought-tracking:organization-error', handleOrganizationError);
    window.addEventListener('thought-tracking:organization-needed', handleOrganizationNeeded);

    return () => {
      window.removeEventListener('thought-tracking:organization-complete', handleOrganizationComplete);
      window.removeEventListener('thought-tracking:organization-error', handleOrganizationError);
      window.removeEventListener('thought-tracking:organization-needed', handleOrganizationNeeded);
    };
  }, []);

  const refreshData = useCallback(async () => {
    if (!trackerRef.current) return;

    try {
      const [
        brainStateData,
        organizedPagesData,
        recentEditsData,
        cacheEntriesData,
        statsData
      ] = await Promise.all([
        trackerRef.current.getCurrentBrainState(),
        trackerRef.current.getOrganizedPages(),
        trackerRef.current.getRecentEdits(20),
        trackerRef.current.getCacheEntries(),
        trackerRef.current.getStats()
      ]);

      setBrainState(brainStateData);
      setOrganizedPages(organizedPagesData);
      setRecentEdits(recentEditsData);
      setCacheEntries(cacheEntriesData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to refresh data:', err);
      setError('Failed to load data');
    }
  }, []);

  // Core tracking method
  const trackEdit = useCallback(async (edit: Omit<ParagraphEdit, 'id' | 'timestamp'>) => {
    if (!trackerRef.current) {
      throw new Error('ThoughtTracker not initialized');
    }

    try {
      setError(null);
      await trackerRef.current.trackEdit(edit);
      
      // Refresh relevant data
      const [newBrainState, newRecentEdits, newStats] = await Promise.all([
        trackerRef.current.getCurrentBrainState(),
        trackerRef.current.getRecentEdits(20),
        trackerRef.current.getStats()
      ]);
      
      setBrainState(newBrainState);
      setRecentEdits(newRecentEdits);
      setStats(newStats);
      
    } catch (err) {
      console.error('Failed to track edit:', err);
      setError('Failed to track edit');
      throw err;
    }
  }, []);

  // Search and access methods
  const searchPages = useCallback(async (query: string): Promise<OrganizedPage[]> => {
    if (!trackerRef.current) return [];
    return trackerRef.current.searchOrganizedPages(query);
  }, []);

  const getEditsByPage = useCallback(async (pageId: string): Promise<ParagraphEdit[]> => {
    if (!trackerRef.current) return [];
    return trackerRef.current.getEditsByPage(pageId);
  }, []);

  const getEditsByParagraph = useCallback(async (paragraphId: string): Promise<ParagraphEdit[]> => {
    if (!trackerRef.current) return [];
    return trackerRef.current.getEditsByParagraph(paragraphId);
  }, []);

  const getOrganizedPage = useCallback(async (pageId: string): Promise<OrganizedPage | null> => {
    if (!trackerRef.current) return null;
    return trackerRef.current.getOrganizedPage(pageId);
  }, []);

  // Control methods
  const triggerOrganization = useCallback(async () => {
    if (!trackerRef.current) return;
    
    try {
      setError(null);
      await trackerRef.current.triggerManualOrganization();
    } catch (err) {
      console.error('Failed to trigger organization:', err);
      setError('Failed to trigger organization');
      throw err;
    }
  }, []);

  const updateConfig = useCallback(async (config: Partial<BrainStateConfig>) => {
    if (!trackerRef.current) return;
    
    try {
      setError(null);
      await trackerRef.current.updateConfig(config);
      await refreshData();
    } catch (err) {
      console.error('Failed to update config:', err);
      setError('Failed to update configuration');
      throw err;
    }
  }, [refreshData]);

  // Data management methods
  const exportData = useCallback(async () => {
    if (!trackerRef.current) return null;
    return trackerRef.current.exportData();
  }, []);

  const importData = useCallback(async (data: any) => {
    if (!trackerRef.current) return;
    
    try {
      setError(null);
      await trackerRef.current.importData(data);
      await refreshData();
    } catch (err) {
      console.error('Failed to import data:', err);
      setError('Failed to import data');
      throw err;
    }
  }, [refreshData]);

  const clearAllData = useCallback(async () => {
    if (!trackerRef.current) return;
    
    try {
      setError(null);
      await trackerRef.current.clearAllData();
      await refreshData();
    } catch (err) {
      console.error('Failed to clear data:', err);
      setError('Failed to clear data');
      throw err;
    }
  }, [refreshData]);

  // Event handler registration
  const onOrganizationComplete = useCallback((callback: (result: any) => void) => {
    organizationCompleteCallbacks.current.add(callback);
    
    return () => {
      organizationCompleteCallbacks.current.delete(callback);
    };
  }, []);

  const onOrganizationError = useCallback((callback: (error: string) => void) => {
    organizationErrorCallbacks.current.add(callback);
    
    return () => {
      organizationErrorCallbacks.current.delete(callback);
    };
  }, []);

  return {
    // Core tracking
    trackEdit,
    
    // Data access
    brainState,
    organizedPages,
    recentEdits,
    cacheEntries,
    
    // Search and filter
    searchPages,
    getEditsByPage,
    getEditsByParagraph,
    getOrganizedPage,
    
    // Control
    triggerOrganization,
    updateConfig,
    
    // Data management
    exportData,
    importData,
    clearAllData,
    
    // State
    stats,
    isLoading,
    error,
    isOrganizing,
    
    // Events
    onOrganizationComplete,
    onOrganizationError,
  };
} 