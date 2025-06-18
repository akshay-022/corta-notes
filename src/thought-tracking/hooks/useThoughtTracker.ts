import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ParagraphEdit, 
  BrainState, 
  OrganizedPage, 
  BrainStateConfig
} from '../types';
import { ThoughtTracker } from '../core/thoughtTracker';
import { EVENTS } from '../constants';

interface ThoughtTrackerHookReturn {
  // Core tracking methods
  trackEdit: (edit: Omit<ParagraphEdit, 'id' | 'timestamp'>) => Promise<void>;
  
  // Data access methods
  brainState: BrainState | null;
  organizedPages: OrganizedPage[];
  recentEdits: ParagraphEdit[];
  unorganizedEdits: ParagraphEdit[];
  
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
  organizationApiEndpoint?: string,
  userId?: string
): ThoughtTrackerHookReturn {
  const trackerRef = useRef<ThoughtTracker | null>(null);
  
  // State
  const [brainState, setBrainState] = useState<BrainState | null>(null);
  const [organizedPages, setOrganizedPages] = useState<OrganizedPage[]>([]);
  const [recentEdits, setRecentEdits] = useState<ParagraphEdit[]>([]);
  const [unorganizedEdits, setUnorganizedEdits] = useState<ParagraphEdit[]>([]);
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
          organizationApiEndpoint,
          userId
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
  }, []); // Remove dependencies to run only once on mount

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

    window.addEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete);
    window.addEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError);
    window.addEventListener(EVENTS.ORGANIZATION_NEEDED, handleOrganizationNeeded);

    return () => {
      window.removeEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete);
      window.removeEventListener(EVENTS.ORGANIZATION_ERROR, handleOrganizationError);
      window.removeEventListener(EVENTS.ORGANIZATION_NEEDED, handleOrganizationNeeded);
    };
  }, []);

  const refreshData = useCallback(async () => {
    if (!trackerRef.current) return;

    try {
      const [
        brainStateData,
        organizedPagesData,
        recentEditsData,
        unorganizedEditsData,
        statsData,
      ] = await Promise.all([
        trackerRef.current.getBrainState(),
        trackerRef.current.getOrganizedPages(),
        trackerRef.current.getRecentEdits(),
        trackerRef.current.getUnorganizedEdits(),
        trackerRef.current.getStats(),
      ]);

      setBrainState(brainStateData);
      setOrganizedPages(organizedPagesData);
      setRecentEdits(recentEditsData);
      setUnorganizedEdits(unorganizedEditsData);
      setStats(statsData);
      
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data');
    }
  }, []);

  // Core methods
  const trackEdit = useCallback(async (edit: Omit<ParagraphEdit, 'id' | 'timestamp'>) => {
    if (!trackerRef.current) return;

    try {
      await trackerRef.current.trackEdit(edit);
      await refreshData();
    } catch (err) {
      console.error('Error tracking edit:', err);
      setError('Failed to track edit');
      throw err;
    }
  }, [refreshData]);

  const searchPages = useCallback(async (query: string): Promise<OrganizedPage[]> => {
    if (!trackerRef.current) return [];
    return trackerRef.current.searchPages(query);
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

  const triggerOrganization = useCallback(async () => {
    if (!trackerRef.current) return;
    await trackerRef.current.triggerManualOrganization();
  }, []);

  const updateConfig = useCallback(async (config: Partial<BrainStateConfig>) => {
    if (!trackerRef.current) return;
    await trackerRef.current.updateConfig(config);
    await refreshData();
  }, [refreshData]);

  const exportData = useCallback(async () => {
    if (!trackerRef.current) return null;
    return trackerRef.current.exportData();
  }, []);

  const importData = useCallback(async (data: any) => {
    if (!trackerRef.current) return;
    await trackerRef.current.importData(data);
    await refreshData();
  }, [refreshData]);

  // Event handlers
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
    // Core tracking methods
    trackEdit,
    
    // Data access methods
    brainState,
    organizedPages,
    recentEdits,
    unorganizedEdits,
    
    // Search and filter methods
    searchPages,
    getEditsByPage,
    getEditsByParagraph,
    getOrganizedPage,
    
    // Control methods
    triggerOrganization,
    updateConfig,
    
    // Data management
    exportData,
    importData,
    
    // State and stats
    stats,
    isLoading,
    error,
    isOrganizing,
    
    // Event handlers
    onOrganizationComplete,
    onOrganizationError,
  };
} 