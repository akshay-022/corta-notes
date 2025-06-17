import { 
  BrainState, 
  ParagraphEdit, 
  BrainStateConfig, 
  StorageManager 
} from '../types';
import { generateId } from '../utils/helpers';
import { SummaryGenerator } from './summaryGenerator';
import { BRAIN_STATE_DEFAULTS, EVENTS } from '../constants';

export class BrainStateManager {
  private storageManager: StorageManager;
  private summaryGenerator: SummaryGenerator;
  private currentState: BrainState | null = null;
  private isOrganizing: boolean = false;

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
      organized: false,
      metadata: {
        wordCount: edit.content.split(/\s+/).length,
        charCount: edit.content.length,
        ...edit.metadata,
      },
    };

    this.currentState!.edits.push(fullEdit);
    this.currentState!.lastUpdated = Date.now();

    // Check if we need to trigger organization
    await this.checkOrganizationTrigger();

    await this.storageManager.saveBrainState(this.currentState!);
  }

  private async checkOrganizationTrigger(): Promise<void> {
    if (!this.currentState || this.isOrganizing) return;

    const unorganizedEdits = this.currentState.edits.filter(edit => !edit.organized);
    
    if (unorganizedEdits.length > this.currentState.config.maxEditsBeforeOrganization) {
      await this.triggerOrganization();
    }
  }

  private async triggerOrganization(): Promise<void> {
    if (!this.currentState || this.isOrganizing) return;

    this.isOrganizing = true;
    
    try {
      // Get oldest unorganized edits
      const unorganizedEdits = this.currentState.edits
        .filter(edit => !edit.organized)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, this.currentState.config.editsToOrganizeCount);

      console.log('Triggering organization for', unorganizedEdits.length, 'edits');
      
      // Emit organization event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.ORGANIZATION_NEEDED, {
          detail: { edits: unorganizedEdits }
        }));
      }
    } finally {
      this.isOrganizing = false;
    }
  }

  async markEditsAsOrganized(editIds: string[]): Promise<void> {
    if (!this.currentState) {
      await this.initialize();
    }

    const editIdSet = new Set(editIds);
    this.currentState!.edits = this.currentState!.edits.map(edit => 
      editIdSet.has(edit.id) ? { ...edit, organized: true } : edit
    );

    this.currentState!.lastUpdated = Date.now();
    await this.storageManager.saveBrainState(this.currentState!);
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

  async getUnorganizedEdits(): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.edits.filter(edit => !edit.organized);
  }

  async clearBrainState(): Promise<void> {
    this.currentState = this.createDefaultBrainState();
    await this.storageManager.saveBrainState(this.currentState);
  }

  async getStats(): Promise<{
    totalEdits: number;
    organizedEdits: number;
    unorganizedEdits: number;
    lastUpdate: number;
    averageEditSize: number;
    editTypes: Record<string, number>;
  }> {
    if (!this.currentState) {
      await this.initialize();
    }

    const allEdits = this.currentState!.edits;
    const organizedEdits = allEdits.filter(edit => edit.organized);
    const unorganizedEdits = allEdits.filter(edit => !edit.organized);
    
    const editTypes = allEdits.reduce((acc, edit) => {
      acc[edit.editType] = (acc[edit.editType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageEditSize = allEdits.length > 0 
      ? allEdits.reduce((sum, edit) => sum + (edit.metadata?.charCount || 0), 0) / allEdits.length
      : 0;

    return {
      totalEdits: allEdits.length,
      organizedEdits: organizedEdits.length,
      unorganizedEdits: unorganizedEdits.length,
      lastUpdate: this.currentState!.lastUpdated,
      averageEditSize,
      editTypes,
    };
  }
} 