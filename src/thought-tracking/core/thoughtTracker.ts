import { 
  ParagraphEdit, 
  BrainState, 
  BrainStateConfig, 
  CacheEntry, 
  OrganizedPage,
  StorageManager 
} from '../types';
import { BrainStateManager } from './brainState';
import { SummaryGenerator } from './summaryGenerator';
import { OrganizationManager } from './organizationManager';
import { LocalStorageManager } from '../storage/localStorage';
import { validateParagraphEdit, debounce } from '../utils/helpers';

export class ThoughtTracker {
  private brainStateManager: BrainStateManager;
  private organizationManager: OrganizationManager;
  private storageManager: StorageManager;
  private initialized: boolean = false;
  
  // Debounced methods to prevent excessive API calls
  private debouncedSave: (...args: any[]) => void;
  private organizationPending: boolean = false;

  constructor(
    customStorageManager?: StorageManager,
    summaryApiEndpoint?: string,
    organizationApiEndpoint?: string
  ) {
    // Initialize storage manager
    this.storageManager = customStorageManager || new LocalStorageManager();
    
    // Initialize core components
    const summaryGenerator = new SummaryGenerator(summaryApiEndpoint);
    this.brainStateManager = new BrainStateManager(this.storageManager, summaryGenerator);
    this.organizationManager = new OrganizationManager(this.storageManager, organizationApiEndpoint);
    
    // Setup debounced save
    this.debouncedSave = debounce(this.saveState.bind(this), 1000);
    
    // Listen for organization events
    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.brainStateManager.initialize();
      this.initialized = true;
      console.log('ThoughtTracker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ThoughtTracker:', error);
      throw new Error('ThoughtTracker initialization failed');
    }
  }

  async trackEdit(editData: Omit<ParagraphEdit, 'id' | 'timestamp'>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate edit data
    if (!validateParagraphEdit(editData)) {
      throw new Error('Invalid paragraph edit data');
    }

    try {
      await this.brainStateManager.addEdit(editData);
      this.debouncedSave();
    } catch (error) {
      console.error('Error tracking edit:', error);
      throw new Error('Failed to track edit');
    }
  }

  private async saveState(): Promise<void> {
    // This is already handled by BrainStateManager
    // But could be used for additional persistence logic
  }

  private setupEventListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('thought-tracking:organization-needed', 
        this.handleOrganizationTrigger.bind(this)
      );
      
      // Handle page visibility changes to save state
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.saveState();
        }
      });
      
      // Handle beforeunload to save state
      window.addEventListener('beforeunload', () => {
        this.saveState();
      });
    }
  }

  private async handleOrganizationTrigger(event: Event): Promise<void> {
    const customEvent = event as CustomEvent;
    
    if (this.organizationPending) {
      console.log('Organization already in progress, skipping...');
      return;
    }

    this.organizationPending = true;
    
    try {
      const { cacheEntries } = customEvent.detail;
      console.log('Starting organization process for', cacheEntries.length, 'cache entries');
      
      const result = await this.organizationManager.organizeContent(cacheEntries);
      
      console.log('Organization completed:', {
        updatedPages: result.updatedPages.length,
        newPages: result.newPages.length,
        summary: result.summary
      });
      
      // Emit completion event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thought-tracking:organization-complete', {
          detail: result
        }));
      }
      
    } catch (error) {
      console.error('Organization process failed:', error);
      
      // Emit error event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('thought-tracking:organization-error', {
          detail: { error: (error as Error).message }
        }));
      }
    } finally {
      this.organizationPending = false;
    }
  }

  // Public API methods

  async getCurrentBrainState(): Promise<BrainState | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getCurrentState();
  }

  async getEditsByPage(pageId: string): Promise<ParagraphEdit[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getEditsByPage(pageId);
  }

  async getEditsByParagraph(paragraphId: string): Promise<ParagraphEdit[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getEditsByParagraph(paragraphId);
  }

  async getRecentEdits(limit: number = 10): Promise<ParagraphEdit[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getRecentEdits(limit);
  }

  async getOrganizedPages(): Promise<OrganizedPage[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.storageManager.loadOrganizedPages();
  }

  async getOrganizedPage(pageId: string): Promise<OrganizedPage | null> {
    const pages = await this.getOrganizedPages();
    return pages.find(page => page.uuid === pageId) || null;
  }

  async searchOrganizedPages(query: string): Promise<OrganizedPage[]> {
    const pages = await this.getOrganizedPages();
    const lowerQuery = query.toLowerCase();
    
    return pages.filter(page => 
      page.title.toLowerCase().includes(lowerQuery) ||
      page.content.toLowerCase().includes(lowerQuery) ||
      page.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  async updateConfig(config: Partial<BrainStateConfig>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    await this.brainStateManager.updateConfig(config);
  }

  async getStats(): Promise<{
    brainState: any;
    organization: any;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const [brainStateStats, organizationStats] = await Promise.all([
      this.brainStateManager.getStats(),
      this.organizationManager.getOrganizationStats()
    ]);
    
    return {
      brainState: brainStateStats,
      organization: organizationStats,
    };
  }

  async getCacheEntries(): Promise<CacheEntry[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.storageManager.loadCacheEntries();
  }

  async triggerManualOrganization(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const cacheEntries = await this.storageManager.loadCacheEntries();
    const unprocessedEntries = cacheEntries.filter(entry => !entry.processed);
    
    if (unprocessedEntries.length === 0) {
      console.log('No unprocessed cache entries to organize');
      return;
    }
    
    // Trigger organization manually
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('thought-tracking:organization-needed', {
        detail: { cacheEntries: unprocessedEntries }
      }));
    }
  }

  async clearAllData(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    await this.brainStateManager.clearBrainState();
    
    if (this.storageManager instanceof LocalStorageManager) {
      await this.storageManager.clearAllData();
    }
    
    console.log('All thought tracking data cleared');
  }

  async exportData(): Promise<{
    brainState: BrainState | null;
    cacheEntries: CacheEntry[];
    organizedPages: OrganizedPage[];
    exportDate: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const [brainState, cacheEntries, organizedPages] = await Promise.all([
      this.brainStateManager.getCurrentState(),
      this.storageManager.loadCacheEntries(),
      this.storageManager.loadOrganizedPages()
    ]);
    
    return {
      brainState,
      cacheEntries,
      organizedPages,
      exportDate: Date.now(),
    };
  }

  async importData(data: {
    brainState?: BrainState;
    cacheEntries?: CacheEntry[];
    organizedPages?: OrganizedPage[];
  }): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      if (data.brainState) {
        await this.storageManager.saveBrainState(data.brainState);
      }
      
      if (data.cacheEntries) {
        for (const entry of data.cacheEntries) {
          await this.storageManager.saveCacheEntry(entry);
        }
      }
      
      if (data.organizedPages) {
        await this.storageManager.saveOrganizedPages(data.organizedPages);
      }
      
      console.log('Data imported successfully');
    } catch (error) {
      console.error('Error importing data:', error);
      throw new Error('Failed to import data');
    }
  }

  // Cleanup method
  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('thought-tracking:organization-needed', 
        this.handleOrganizationTrigger.bind(this)
      );
    }
    
    this.initialized = false;
    console.log('ThoughtTracker disposed');
  }
} 