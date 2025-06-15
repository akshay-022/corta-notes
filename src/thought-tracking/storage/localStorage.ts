import { 
  BrainState, 
  CacheEntry, 
  OrganizedPage, 
  StorageManager, 
  BrainStateConfig 
} from '../types';

export class LocalStorageManager implements StorageManager {
  private readonly BRAIN_STATE_KEY = 'thought-tracking:brain-state';
  private readonly CACHE_ENTRIES_KEY = 'thought-tracking:cache-entries';
  private readonly ORGANIZED_PAGES_KEY = 'thought-tracking:organized-pages';
  private readonly CONFIG_KEY = 'thought-tracking:config';

  private getDefaultConfig(): BrainStateConfig {
    return {
      maxEditsInPrimary: 30,
      maxEditsInSecondary: 30,
      summaryUpdateFrequency: 5,
      organizationThreshold: 30,
    };
  }

  async saveBrainState(state: BrainState): Promise<void> {
    try {
      localStorage.setItem(this.BRAIN_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving brain state:', error);
      throw new Error('Failed to save brain state to localStorage');
    }
  }

  async loadBrainState(): Promise<BrainState | null> {
    try {
      const stored = localStorage.getItem(this.BRAIN_STATE_KEY);
      if (!stored) return null;
      
      const state = JSON.parse(stored) as BrainState;
      
      // Ensure config exists and has default values
      if (!state.config) {
        state.config = this.getDefaultConfig();
      }
      
      return state;
    } catch (error) {
      console.error('Error loading brain state:', error);
      return null;
    }
  }

  async saveCacheEntry(entry: CacheEntry): Promise<void> {
    try {
      const entries = await this.loadCacheEntries();
      const updatedEntries = [...entries, entry];
      localStorage.setItem(this.CACHE_ENTRIES_KEY, JSON.stringify(updatedEntries));
    } catch (error) {
      console.error('Error saving cache entry:', error);
      throw new Error('Failed to save cache entry to localStorage');
    }
  }

  async loadCacheEntries(): Promise<CacheEntry[]> {
    try {
      const stored = localStorage.getItem(this.CACHE_ENTRIES_KEY);
      if (!stored) return [];
      
      return JSON.parse(stored) as CacheEntry[];
    } catch (error) {
      console.error('Error loading cache entries:', error);
      return [];
    }
  }

  async clearProcessedCache(ids: string[]): Promise<void> {
    try {
      const entries = await this.loadCacheEntries();
      const filteredEntries = entries.filter(entry => !ids.includes(entry.id));
      localStorage.setItem(this.CACHE_ENTRIES_KEY, JSON.stringify(filteredEntries));
    } catch (error) {
      console.error('Error clearing processed cache:', error);
      throw new Error('Failed to clear processed cache from localStorage');
    }
  }

  async saveOrganizedPages(pages: OrganizedPage[]): Promise<void> {
    try {
      localStorage.setItem(this.ORGANIZED_PAGES_KEY, JSON.stringify(pages));
    } catch (error) {
      console.error('Error saving organized pages:', error);
      throw new Error('Failed to save organized pages to localStorage');
    }
  }

  async loadOrganizedPages(): Promise<OrganizedPage[]> {
    try {
      const stored = localStorage.getItem(this.ORGANIZED_PAGES_KEY);
      if (!stored) return [];
      
      return JSON.parse(stored) as OrganizedPage[];
    } catch (error) {
      console.error('Error loading organized pages:', error);
      return [];
    }
  }

  async saveConfig(config: BrainStateConfig): Promise<void> {
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Error saving config:', error);
      throw new Error('Failed to save config to localStorage');
    }
  }

  async loadConfig(): Promise<BrainStateConfig> {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (!stored) return this.getDefaultConfig();
      
      return { ...this.getDefaultConfig(), ...JSON.parse(stored) };
    } catch (error) {
      console.error('Error loading config:', error);
      return this.getDefaultConfig();
    }
  }

  // Utility methods for storage management
  async getStorageSize(): Promise<{ brainState: number; cache: number; pages: number }> {
    const brainStateSize = localStorage.getItem(this.BRAIN_STATE_KEY)?.length || 0;
    const cacheSize = localStorage.getItem(this.CACHE_ENTRIES_KEY)?.length || 0;
    const pagesSize = localStorage.getItem(this.ORGANIZED_PAGES_KEY)?.length || 0;
    
    return {
      brainState: brainStateSize,
      cache: cacheSize,
      pages: pagesSize,
    };
  }

  async clearAllData(): Promise<void> {
    localStorage.removeItem(this.BRAIN_STATE_KEY);
    localStorage.removeItem(this.CACHE_ENTRIES_KEY);
    localStorage.removeItem(this.ORGANIZED_PAGES_KEY);
    localStorage.removeItem(this.CONFIG_KEY);
  }
} 