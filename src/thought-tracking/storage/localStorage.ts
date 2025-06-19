import { 
  BrainState, 
  OrganizedPage, 
  StorageManager, 
  BrainStateConfig 
} from '../types';
import { STORAGE_KEYS, BRAIN_STATE_DEFAULTS } from '../constants';

export class LocalStorageManager implements StorageManager {
  private userId?: string;

  constructor(userId?: string) {
    this.userId = userId;
  }

  private getBrainStateKey(): string {
    return this.userId ? `${STORAGE_KEYS.BRAIN_STATE}:${this.userId}` : STORAGE_KEYS.BRAIN_STATE;
  }

  private getOrganizedPagesKey(): string {
    return this.userId ? `${STORAGE_KEYS.ORGANIZED_PAGES}:${this.userId}` : STORAGE_KEYS.ORGANIZED_PAGES;
  }

  private getConfigKey(): string {
    return this.userId ? `${STORAGE_KEYS.CONFIG}:${this.userId}` : STORAGE_KEYS.CONFIG;
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  private getDefaultConfig(): BrainStateConfig {
    return BRAIN_STATE_DEFAULTS;
  }

  async saveBrainState(state: BrainState): Promise<void> {
    try {
      localStorage.setItem(this.getBrainStateKey(), JSON.stringify(state));

      // Additionally persist to Supabase profile if userId is available
      if (this.userId) {
        try {
          const { createClient } = await import('@/lib/supabase/supabase-client');
          const supabase = createClient();
          await supabase
            .from('profiles')
            .update({ brain_state: state, updated_at: new Date().toISOString() })
            .eq('user_id', this.userId);
        } catch (dbErr) {
          console.warn('Failed to sync brain state to Supabase:', dbErr);
        }
      }
    } catch (error) {
      console.error('Error saving brain state:', error);
      throw new Error('Failed to save brain state to localStorage');
    }
  }

  async loadBrainState(): Promise<BrainState | null> {
    try {
      // Try to get from Supabase first if we have a userId
      let stored = null;
      if (this.userId) {
        try {
          const { createClient } = await import('@/lib/supabase/supabase-client');
          const supabase = createClient();
          const { data } = await supabase
            .from('profiles')
            .select('brain_state')
            .eq('user_id', this.userId)
            .single();
          
          if (data?.brain_state) {
            stored = JSON.stringify(data.brain_state);
          }
        } catch (err) {
          console.warn('Failed to load brain state from Supabase:', err);
        }
      }

      // Fall back to localStorage if no Supabase data
      if (!stored) {
        stored = localStorage.getItem(this.getBrainStateKey());
      }
      
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

  async saveOrganizedPages(pages: OrganizedPage[]): Promise<void> {
    try {
      localStorage.setItem(this.getOrganizedPagesKey(), JSON.stringify(pages));
    } catch (error) {
      console.error('Error saving organized pages:', error);
      throw new Error('Failed to save organized pages to localStorage');
    }
  }

  async loadOrganizedPages(): Promise<OrganizedPage[]> {
    try {
      const stored = localStorage.getItem(this.getOrganizedPagesKey());
      if (!stored) return [];
      
      return JSON.parse(stored) as OrganizedPage[];
    } catch (error) {
      console.error('Error loading organized pages:', error);
      return [];
    }
  }

  async getPageByUuid(uuid: string): Promise<OrganizedPage | null> {
    try {
      const pages = await this.loadOrganizedPages();
      return pages.find(page => page.uuid === uuid) || null;
    } catch (error) {
      console.error('Error getting page by UUID:', error);
      return null;
    }
  }

  async saveConfig(config: BrainStateConfig): Promise<void> {
    try {
      localStorage.setItem(this.getConfigKey(), JSON.stringify(config));
    } catch (error) {
      console.error('Error saving config:', error);
      throw new Error('Failed to save config to localStorage');
    }
  }

  async loadConfig(): Promise<BrainStateConfig> {
    try {
      const stored = localStorage.getItem(this.getConfigKey());
      if (!stored) return this.getDefaultConfig();
      
      return { ...this.getDefaultConfig(), ...JSON.parse(stored) };
    } catch (error) {
      console.error('Error loading config:', error);
      return this.getDefaultConfig();
    }
  }

  // Utility methods for storage management
  async getStorageSize(): Promise<{ brainState: number; pages: number }> {
    const brainStateSize = localStorage.getItem(this.getBrainStateKey())?.length || 0;
    const pagesSize = localStorage.getItem(this.getOrganizedPagesKey())?.length || 0;
    
    return {
      brainState: brainStateSize,
      pages: pagesSize,
    };
  }
} 