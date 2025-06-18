import { 
  ParagraphEdit, 
  BrainState, 
  BrainStateConfig, 
  OrganizedPage,
  OrganizationResult,
  StorageManager 
} from '../types';
import { BrainStateManager } from './brainState';
import { SummaryGenerator } from './summaryGenerator';
import { OrganizationManager } from './organizationManager';
import { LocalStorageManager } from '../storage/localStorage';
import { validateParagraphEdit, debounce } from '../utils/helpers';
import { EVENTS, PERFORMANCE_THRESHOLDS } from '../constants';

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
    organizationApiEndpoint?: string,
    userId?: string
  ) {
    // Initialize storage manager
    this.storageManager = customStorageManager || new LocalStorageManager(userId);
    
    // Initialize core components
    const summaryGenerator = new SummaryGenerator(summaryApiEndpoint);
    this.brainStateManager = new BrainStateManager(summaryGenerator, new LocalStorageManager(userId));
    this.organizationManager = new OrganizationManager(this.storageManager, organizationApiEndpoint);
    
    // Setup debounced save
    this.debouncedSave = debounce(this.saveState.bind(this), PERFORMANCE_THRESHOLDS.DEBOUNCE_DELAY_MS);
    
    // Listen for organization events
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener(EVENTS.ORGANIZATION_NEEDED, this.handleOrganizationTrigger.bind(this));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.brainStateManager.initialize();
      this.initialized = true;
      
      console.log('ThoughtTracker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ThoughtTracker:', error);
      throw error;
    }
  }

  async trackEdit(edit: Omit<ParagraphEdit, 'id' | 'timestamp'>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Validate the edit
      if (!validateParagraphEdit(edit)) {
        throw new Error('Invalid paragraph edit provided');
      }

      // Check if the page has organized = false before tracking
      // Only track edits for pages that are not organized (organized = false)
      const page = await this.storageManager.getPageByUuid(edit.pageId);
      
      if (page && page.organized === true) {
        return;
      }
      
      if (!page) {
        console.warn('🧠 Page not found, but continuing with edit tracking:', edit.pageId);
      } else {
        console.log('🧠 Page organized status check passed:', {
          pageId: edit.pageId,
          organized: page.organized,
          willTrack: page.organized === false
        });
      }

      // Add to brain state
      await this.brainStateManager.addEdit(edit);
      
      // Debounced save
      this.debouncedSave();

      // Emit edit added event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.EDIT_ADDED, {
          detail: { edit }
        }));
      }

    } catch (error) {
      console.error('Error tracking edit:', error);
      throw error;
    }
  }

  private async saveState(): Promise<void> {
    // This is handled automatically by BrainStateManager
    // Placeholder for any additional save logic if needed
  }

  private async handleOrganizationTrigger(event: Event): Promise<void> {
    const customEvent = event as CustomEvent;
    
    if (this.organizationPending) {
      console.log('Organization already in progress, skipping...');
      return;
    }

    this.organizationPending = true;
    
    try {
      const { edits } = customEvent.detail;
      console.log('Starting organization process for', edits.length, 'edits');
      
      const result = await this.organizationManager.organizeContent(edits);
      
      // Mark the organized edits as processed in brain state
      await this.brainStateManager.markEditsAsOrganized(result.processedEditIds);
      
      // Wait a bit more to ensure all Supabase operations are complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('Organization completed:', {
        updatedPages: result.updatedPages.length,
        newPages: result.newPages.length,
        summary: result.summary
      });
      
      // Emit completion event with detailed information for UI updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.ORGANIZATION_COMPLETE, {
          detail: {
            ...result,
            // Include page data for client-side updates
            allOrganizedPages: await this.storageManager.loadOrganizedPages(),
            // Provide summary for notifications
            notification: {
              message: this.createNotificationMessage(result),
              updatedPageIds: result.updatedPages.map(p => p.uuid),
              newPageIds: result.newPages.map(p => p.uuid)
            }
          }
        }));
      }
      
    } catch (error) {
      console.error('Organization process failed:', error);
      
      // Emit error event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.ORGANIZATION_ERROR, {
          detail: { error: (error as Error).message }
        }));
      }
    } finally {
      this.organizationPending = false;
    }
  }

  private createNotificationMessage(result: OrganizationResult): string {
    const updatedCount = result.updatedPages.length;
    const newCount = result.newPages.length;
    
    if (updatedCount > 0 && newCount > 0) {
      return `✅ Organization complete: ${updatedCount} notes updated, ${newCount} new notes created`;
    } else if (updatedCount > 0) {
      return `✅ Organization complete: ${updatedCount} notes updated`;
    } else if (newCount > 0) {
      return `✅ Organization complete: ${newCount} new notes created`;
    } else {
      return '✅ Organization complete: No changes made';
    }
  }

  // Public API methods
  async getBrainState(): Promise<BrainState | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getCurrentState();
  }

  async getRecentEdits(limit: number = 10): Promise<ParagraphEdit[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getRecentEdits(limit);
  }

  async getUnorganizedEdits(): Promise<ParagraphEdit[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getUnorganizedEdits();
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

  async getOrganizedPages(): Promise<OrganizedPage[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.storageManager.loadOrganizedPages();
  }

  async searchPages(query: string): Promise<OrganizedPage[]> {
    const pages = await this.getOrganizedPages();
    const lowerQuery = query.toLowerCase();
    
    return pages.filter(page => 
      page.title.toLowerCase().includes(lowerQuery) ||
      page.content_text.toLowerCase().includes(lowerQuery) ||
      page.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      page.category?.toLowerCase().includes(lowerQuery)
    );
  }

  async getOrganizedPage(pageId: string): Promise<OrganizedPage | null> {
    const pages = await this.getOrganizedPages();
    return pages.find(page => page.uuid === pageId) || null;
  }

  async triggerManualOrganization(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const unorganizedEdits = await this.brainStateManager.getUnorganizedEdits();
    
    if (unorganizedEdits.length === 0) {
      console.log('No unorganized edits to organize');
      return;
    }
    
    // Trigger organization manually
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENTS.ORGANIZATION_NEEDED, {
        detail: { edits: unorganizedEdits }
      }));
    }
  }

  async updateConfig(newConfig: Partial<BrainStateConfig>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    await this.brainStateManager.updateConfig(newConfig);
  }

  setUserId(userId: string): void {
    if (this.storageManager.setUserId) {
      this.storageManager.setUserId(userId);
    }
  }

  getUserId(): string | undefined {
    return this.storageManager.getUserId?.();
  }

  async exportData(): Promise<{
    brainState: BrainState | null;
    organizedPages: OrganizedPage[];
    exportDate: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const [brainState, organizedPages] = await Promise.all([
      this.brainStateManager.getCurrentState(),
      this.storageManager.loadOrganizedPages(),
    ]);
    
    return {
      brainState,
      organizedPages,
      exportDate: Date.now(),
    };
  }

  async importData(data: {
    brainState?: BrainState;
    organizedPages?: OrganizedPage[];
  }): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      if (data.brainState) {
        await this.storageManager.saveBrainState(data.brainState);
      }
      
      if (data.organizedPages) {
        await this.storageManager.saveOrganizedPages(data.organizedPages);
      }
      
      console.log('Data imported successfully');
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }

  async getStats(): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const [brainStats, organizationStats] = await Promise.all([
      this.brainStateManager.getStats(),
      this.organizationManager.getOrganizationStats(),
    ]);
    
    return {
      brain: brainStats,
      organization: organizationStats,
    };
  }

  // New line-based tracking methods
  async updateLine(lineData: {
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
  }): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.updateLine(lineData);
  }

  async getLineHistory(lineId: string): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getLineHistory(lineId);
  }

  async getLinesByPage(pageId: string): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.brainStateManager.getLinesByPage(pageId);
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener(EVENTS.ORGANIZATION_NEEDED, this.handleOrganizationTrigger.bind(this));
    }
  }
} 