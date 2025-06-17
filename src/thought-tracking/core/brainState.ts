import { 
  BrainState, 
  ParagraphEdit, 
  BrainStateConfig, 
  CacheEntry, 
  StorageManager 
} from '../types';
import { generateId } from '../utils/helpers';
import { SummaryGenerator } from './summaryGenerator';
import { BRAIN_STATE_DEFAULTS, EVENTS } from '../constants';

export class BrainStateManager {
  private storageManager: StorageManager;
  private summaryGenerator: SummaryGenerator;
  private currentState: BrainState | null = null;
  private isMovingToCache: boolean = false;

  constructor(storageManager: StorageManager, summaryGenerator: SummaryGenerator) {
    this.storageManager = storageManager;
    this.summaryGenerator = summaryGenerator;
  }

  async initialize(): Promise<void> {
    this.currentState = await this.storageManager.loadBrainState();
    
    if (!this.currentState) {
      this.currentState = this.createDefaultBrainState();
      await this.storageManager.saveBrainState(this.currentState);
    }
  }

  private createDefaultBrainState(): BrainState {
    return {
      edits: [],
      summary: '',
      lastUpdated: Date.now(),
      config: BRAIN_STATE_DEFAULTS,
    };
  }

  async addEdit(edit: Omit<ParagraphEdit, 'id' | 'timestamp'>): Promise<void> {
    if (!this.currentState) {
      await this.initialize();
    }

    const fullEdit: ParagraphEdit = {
      ...edit,
      id: generateId(),
      timestamp: Date.now(),
      metadata: {
        wordCount: edit.content.split(/\s+/).length,
        charCount: edit.content.length,
        ...edit.metadata,
      },
    };

    this.currentState!.edits.push(fullEdit);
    this.currentState!.lastUpdated = Date.now();

    // Check if we need to update summary - Let's not do this for now
    // if (this.shouldUpdateSummary()) {
    //   await this.updateSummary();
    // }

    // Check if we need to move edits to cache
    if (this.shouldMoveToCache() && !this.isMovingToCache) {
      await this.moveEditsToCache();
    }

    await this.storageManager.saveBrainState(this.currentState!);
  }

  private shouldUpdateSummary(): boolean {
    if (!this.currentState) return false;
    
    const { summaryUpdateFrequency } = this.currentState.config;
    return this.currentState.edits.length % summaryUpdateFrequency === 0;
  }

  private shouldMoveToCache(): boolean {
    if (!this.currentState) return false;
    
    return this.currentState.edits.length >= this.currentState.config.maxEditsInPrimary;
  }

  private async updateSummary(): Promise<void> {
    if (!this.currentState) return;

    try {
      const newSummary = await this.summaryGenerator.generateSummary(
        this.currentState.edits,
        this.currentState.summary
      );
      
      this.currentState.summary = newSummary;
    } catch (error) {
      console.error('Error updating summary:', error);
    }
  }

  private async moveEditsToCache(): Promise<void> {
    if (!this.currentState || this.isMovingToCache) return;

    // Set flag to prevent concurrent cache moves
    this.isMovingToCache = true;

    try {
      const cacheEntry: CacheEntry = {
        id: generateId(),
        edits: [...this.currentState.edits],
        summary: this.currentState.summary,
        contextSummary: "",
        // contextSummary: await this.generateContextSummary(this.currentState.edits),
        timestamp: Date.now(),
        processed: false,
      };

      await this.storageManager.saveCacheEntry(cacheEntry);
      
      // Clear primary edits
      this.currentState.edits = [];
      
      // Check if we should trigger organization
      await this.checkOrganizationTrigger();
    } finally {
      // Always reset the flag
      this.isMovingToCache = false;
    }
  }

  private async generateContextSummary(edits: ParagraphEdit[]): Promise<string> {
    return this.summaryGenerator.generateContextSummary(edits);
  }

  private async checkOrganizationTrigger(): Promise<void> {
    const cacheEntries = await this.storageManager.loadCacheEntries();
    const unprocessedEntries = cacheEntries.filter(entry => !entry.processed);
    
    if (unprocessedEntries.length >= this.currentState?.config.organizationThreshold!) {
      // Trigger organization process
      await this.triggerOrganization(unprocessedEntries);
    }
  }

  private async triggerOrganization(cacheEntries: CacheEntry[]): Promise<void> {
    // This will be handled by the OrganizationManager
    // For now, we'll emit an event or call a callback
    console.log('Organization trigger activated with', cacheEntries.length, 'cache entries');
    
    // You can implement custom event emission or callback mechanism here
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENTS.ORGANIZATION_NEEDED, {
        detail: { cacheEntries }
      }));
    }
  }

  async getCurrentState(): Promise<BrainState | null> {
    if (!this.currentState) {
      await this.initialize();
    }
    return this.currentState;
  }

  async updateConfig(newConfig: Partial<BrainStateConfig>): Promise<void> {
    if (!this.currentState) {
      await this.initialize();
    }

    this.currentState!.config = { ...this.currentState!.config, ...newConfig };
    await this.storageManager.saveBrainState(this.currentState!);
  }

  async getEditsByPage(pageId: string): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.edits.filter(edit => edit.pageId === pageId);
  }

  async getEditsByParagraph(paragraphId: string): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.edits.filter(edit => edit.paragraphId === paragraphId);
  }

  async getRecentEdits(limit: number = 10): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.edits
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async clearBrainState(): Promise<void> {
    this.currentState = this.createDefaultBrainState();
    await this.storageManager.saveBrainState(this.currentState);
  }

  async getStats(): Promise<{
    totalEdits: number;
    totalCacheEntries: number;
    lastUpdate: number;
    averageEditSize: number;
    editTypes: Record<string, number>;
  }> {
    if (!this.currentState) {
      await this.initialize();
    }

    const cacheEntries = await this.storageManager.loadCacheEntries();
    const allEdits = this.currentState!.edits;
    
    const editTypes = allEdits.reduce((acc, edit) => {
      acc[edit.editType] = (acc[edit.editType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageEditSize = allEdits.length > 0 
      ? allEdits.reduce((sum, edit) => sum + (edit.metadata?.charCount || 0), 0) / allEdits.length
      : 0;

    return {
      totalEdits: allEdits.length,
      totalCacheEntries: cacheEntries.length,
      lastUpdate: this.currentState!.lastUpdated,
      averageEditSize,
      editTypes,
    };
  }
} 