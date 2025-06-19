import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  recentEdits: LineEdit[];
  
  // Analysis methods
  getLineHistory: (lineId: string) => Promise<LineEdit[]>;
  getLinesByPage: (pageId: string) => Promise<LineEdit[]>;
  
  // Organization
  triggerOrganization: () => Promise<void>;
  
  // Configuration
  updateConfig: (config: Partial<BrainStateConfig>) => Promise<void>;
  
  // Status
  isLoading: boolean;
  isOrganizing: boolean;
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
  const [recentEdits, setRecentEdits] = useState<LineEdit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // Use ref to prevent recreating loadData function on every render
  const trackerRef = useRef(tracker);
  trackerRef.current = tracker;

  // Initialize and load data - stable function
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
        trackerRef.current.getBrainState(),
        trackerRef.current.getUnorganizedEdits(),
        trackerRef.current.getOrganizedPages(),
        trackerRef.current.getStats()
      ]);

      setBrainState(brainStateData);
      setUnorganizedEdits(unorganizedEditsData);
      setOrganizedPages(organizedPagesData);
      setStats(statsData);
      
      // Get recent edits from the last 24 hours or last 10 edits
      const recentEditsCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      const allEdits: LineEdit[] = [];
      
      // Extract all edits from the lineMap
      if (brainStateData?.lineMap) {
        Object.values(brainStateData.lineMap).forEach(edits => {
          allEdits.push(...edits);
        });
      }
      
      const recentEditsData = allEdits
        .filter((edit: LineEdit) => edit.timestamp > recentEditsCutoff)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10); // Take last 10 recent edits
      setRecentEdits(recentEditsData);

    } catch (err) {
      console.error('Error loading thought tracker data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array - function is now stable

  // Initialize on mount and when tracker changes
  useEffect(() => {
    let mounted = true;

    const initializeTracker = async () => {
      try {
        await trackerRef.current.initialize();
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
  }, [tracker]); // Remove loadData dependency

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]); // Remove loadData dependency

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
  }, []); // Remove loadData dependency - function is stable now

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
      await trackerRef.current.updateLine(lineData);
      
      // Refresh data after tracking
      setTimeout(loadData, 100); // Small delay to ensure data is saved
    } catch (err) {
      console.error('Error updating line:', err);
      setError(err instanceof Error ? err.message : 'Failed to update line');
    }
  }, []); // Remove dependencies - use refs instead

  const getLineHistory = useCallback(async (lineId: string): Promise<LineEdit[]> => {
    try {
      return await trackerRef.current.getLineHistory(lineId);
    } catch (err) {
      console.error('Error getting line history:', err);
      return [];
    }
  }, []);

  const getLinesByPage = useCallback(async (pageId: string): Promise<LineEdit[]> => {
    try {
      return await trackerRef.current.getLinesByPage(pageId);
    } catch (err) {
      console.error('Error getting lines by page:', err);
      return [];
    }
  }, []);

  const triggerOrganization = useCallback(async (): Promise<void> => {
    try {
      setIsOrganizing(true);
      setError(null);
      await trackerRef.current.triggerManualOrganization();
      // Data will be refreshed via event listeners
    } catch (err) {
      console.error('Error triggering organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to trigger organization');
    } finally {
      setIsOrganizing(false);
    }
  }, []);

  const updateConfig = useCallback(async (config: Partial<BrainStateConfig>): Promise<void> => {
    try {
      await trackerRef.current.updateConfig(config);
      await loadData(); // Refresh to reflect config changes
    } catch (err) {
      console.error('Error updating config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  }, []); // Remove dependencies - use refs instead

  const refresh = useCallback(async (): Promise<void> => {
    await loadData();
  }, []); // Remove loadData dependency

  // Memoized return object
  return useMemo(() => ({
    // Line-based tracking
    updateLine,
    
    // Data
    brainState,
    unorganizedEdits,
    organizedPages,
    recentEdits,
    
    // Analysis
    getLineHistory,
    getLinesByPage,
    
    // Organization
    triggerOrganization,
    
    // Configuration
    updateConfig,
    
    // Status
    isLoading,
    isOrganizing,
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
    recentEdits,
    getLineHistory,
    getLinesByPage,
    triggerOrganization,
    updateConfig,
    isLoading,
    isOrganizing,
    error,
    stats,
    refresh,
  ]);
} 