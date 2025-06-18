import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LineEdit,
  BrainState, 
  OrganizedPage,
  BrainStateConfig 
} from '../types';
import { ThoughtTracker } from '../core/thoughtTracker';
import { EVENTS } from '../constants';

interface UseThoughtTrackerProps {
  tracker: ThoughtTracker;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseThoughtTrackerReturn {
  // Line-based tracking methods
  updateLine: (lineData: {
    lineId: string;
    pageId: string;
    content: string;
    editType: 'create' | 'update' | 'delete';
    metadata?: {
      wordCount: number;
      charCount: number;
      position?: number;
    };
    paragraphMetadata?: any;
  }) => Promise<void>;
  
  // Data retrieval
  brainState: BrainState | null;
  unorganizedEdits: LineEdit[];
  organizedPages: OrganizedPage[];
  
  // Analysis methods
  getLineHistory: (lineId: string) => Promise<LineEdit[]>;
  getLinesByPage: (pageId: string) => Promise<LineEdit[]>;
  
  // Organization
  triggerOrganization: () => Promise<void>;
  
  // Configuration
  updateConfig: (config: Partial<BrainStateConfig>) => Promise<void>;
  
  // Status
  isLoading: boolean;
  error: string | null;
  
  // Statistics
  stats: any;
  
  // Refresh data
  refresh: () => Promise<void>;
}

export function useThoughtTracker({ 
  tracker, 
  autoRefresh = true, 
  refreshInterval = 30000 
}: UseThoughtTrackerProps): UseThoughtTrackerReturn {
  const [brainState, setBrainState] = useState<BrainState | null>(null);
  const [unorganizedEdits, setUnorganizedEdits] = useState<LineEdit[]>([]);
  const [organizedPages, setOrganizedPages] = useState<OrganizedPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // Initialize and load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [
        brainStateData,
        unorganizedEditsData,
        organizedPagesData,
        statsData
      ] = await Promise.all([
        tracker.getBrainState(),
        tracker.getUnorganizedEdits(),
        tracker.getOrganizedPages(),
        tracker.getStats()
      ]);

      setBrainState(brainStateData);
      setUnorganizedEdits(unorganizedEditsData);
      setOrganizedPages(organizedPagesData);
      setStats(statsData);

    } catch (err) {
      console.error('Error loading thought tracker data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tracker]);

  // Initialize on mount and when tracker changes
  useEffect(() => {
    let mounted = true;

    const initializeTracker = async () => {
      try {
        await tracker.initialize();
        if (mounted) {
          await loadData();
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to initialize tracker:', err);
          setError(err instanceof Error ? err.message : 'Initialization failed');
          setIsLoading(false);
        }
      }
    };

    initializeTracker();

    return () => {
      mounted = false;
    };
  }, [tracker, loadData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadData]);

  // Event listeners for real-time updates
  useEffect(() => {
    const handleEditAdded = () => {
      loadData(); // Refresh when new edits are added
    };

    const handleOrganizationComplete = () => {
      loadData(); // Refresh when organization is complete
    };

    const handleBrainStateUpdate = () => {
      loadData(); // Refresh when brain state updates
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENTS.EDIT_ADDED, handleEditAdded);
      window.addEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete);
      window.addEventListener(EVENTS.BRAIN_STATE_UPDATED, handleBrainStateUpdate);

      return () => {
        window.removeEventListener(EVENTS.EDIT_ADDED, handleEditAdded);
        window.removeEventListener(EVENTS.ORGANIZATION_COMPLETE, handleOrganizationComplete);
        window.removeEventListener(EVENTS.BRAIN_STATE_UPDATED, handleBrainStateUpdate);
      };
    }
  }, [loadData]);

  // Line-based tracking method
  const updateLine = useCallback(async (lineData: {
    lineId: string;
    pageId: string;
    content: string;
    editType: 'create' | 'update' | 'delete';
    metadata?: {
      wordCount: number;
      charCount: number;
      position?: number;
    };
    paragraphMetadata?: any;
  }) => {
    try {
      await tracker.updateLine(lineData);
      
      // Refresh data after tracking
      setTimeout(loadData, 100); // Small delay to ensure data is saved
    } catch (err) {
      console.error('Error updating line:', err);
      setError(err instanceof Error ? err.message : 'Failed to update line');
    }
  }, [tracker, loadData]);

  const getLineHistory = useCallback(async (lineId: string): Promise<LineEdit[]> => {
    try {
      return await tracker.getLineHistory(lineId);
    } catch (err) {
      console.error('Error getting line history:', err);
      return [];
    }
  }, [tracker]);

  const getLinesByPage = useCallback(async (pageId: string): Promise<LineEdit[]> => {
    try {
      return await tracker.getLinesByPage(pageId);
    } catch (err) {
      console.error('Error getting lines by page:', err);
      return [];
    }
  }, [tracker]);

  const triggerOrganization = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      await tracker.triggerManualOrganization();
      // Data will be refreshed via event listeners
    } catch (err) {
      console.error('Error triggering organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to trigger organization');
    } finally {
      setIsLoading(false);
    }
  }, [tracker]);

  const updateConfig = useCallback(async (config: Partial<BrainStateConfig>): Promise<void> => {
    try {
      await tracker.updateConfig(config);
      await loadData(); // Refresh to reflect config changes
    } catch (err) {
      console.error('Error updating config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  }, [tracker, loadData]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadData();
  }, [loadData]);

  // Memoized return object
  return useMemo(() => ({
    // Line-based tracking
    updateLine,
    
    // Data
    brainState,
    unorganizedEdits,
    organizedPages,
    
    // Analysis
    getLineHistory,
    getLinesByPage,
    
    // Organization
    triggerOrganization,
    
    // Configuration
    updateConfig,
    
    // Status
    isLoading,
    error,
    
    // Statistics
    stats,
    
    // Refresh
    refresh,
  }), [
    updateLine,
    brainState,
    unorganizedEdits,
    organizedPages,
    getLineHistory,
    getLinesByPage,
    triggerOrganization,
    updateConfig,
    isLoading,
    error,
    stats,
    refresh,
  ]);
} 