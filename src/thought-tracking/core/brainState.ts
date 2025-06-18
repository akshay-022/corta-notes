import { 
  BrainState, 
  ParagraphEdit, 
  BrainStateConfig, 
} from '../types';
import { generateId } from '../utils/helpers';
import { SummaryGenerator } from './summaryGenerator';
import { BRAIN_STATE_DEFAULTS, EVENTS } from '../constants';
import { LocalStorageManager } from '../storage/localStorage';

export class BrainStateManager {
  private localStorageManager: LocalStorageManager;
  private summaryGenerator: SummaryGenerator;
  private currentState: BrainState | null = null;
  private isOrganizing: boolean = false;

  constructor(summaryGenerator: SummaryGenerator, localStorageManager: LocalStorageManager) {
    this.localStorageManager = localStorageManager;
    this.summaryGenerator = summaryGenerator;
  }

  async initialize(): Promise<void> {
    this.currentState = await this.localStorageManager.loadBrainState();
    
    if (!this.currentState) {
      this.currentState = this.createDefaultBrainState();
      await this.localStorageManager.saveBrainState(this.currentState);
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

    // Check for duplicate edits using paragraph metadata ID within the last 5 seconds
    const now = Date.now();
    const recentEdits = this.currentState!.edits.filter(
      existingEdit => 
        existingEdit.paragraphId === edit.paragraphId &&
        existingEdit.pageId === edit.pageId &&
        (now - existingEdit.timestamp) < 5000 // 5 seconds
    );

    // If there's a very recent edit with the same content, skip this one
    if (recentEdits.length > 0) {
      const mostRecentEdit = recentEdits[recentEdits.length - 1];
      if (mostRecentEdit.content === edit.content && mostRecentEdit.editType === edit.editType) {
        console.log('🧠 Skipping duplicate edit for paragraph:', {
          paragraphId: edit.paragraphId,
          content: edit.content.substring(0, 30) + '...',
          timeSinceLastEdit: now - mostRecentEdit.timestamp + 'ms'
        });
        return;
      }
    }

    const fullEdit: ParagraphEdit = {
      ...edit,
      id: generateId(),
      timestamp: now,
      organized: false,
      metadata: {
        wordCount: edit.content.split(/\s+/).length,
        charCount: edit.content.length,
        ...edit.metadata,
      },
    };

    this.currentState!.edits.push(fullEdit);
    this.currentState!.lastUpdated = now;
    
    console.log('🧠 Added edit to brain state:', {
      id: fullEdit.id,
      paragraphId: fullEdit.paragraphId,
      paragraphMetadataId: fullEdit.paragraphMetadata?.id,
      editType: fullEdit.editType,
      totalEdits: this.currentState!.edits.length,
      unorganizedEdits: this.currentState!.edits.filter(e => !e.organized).length,
      position: fullEdit.metadata?.position
    });

    // Check if we need to trigger organization
    await this.checkOrganizationTrigger();

    await this.localStorageManager.saveBrainState(this.currentState!);
  }

  private async checkOrganizationTrigger(): Promise<void> {
    if (!this.currentState || this.isOrganizing) return;

    const unorganizedEdits = this.currentState.edits.filter(edit => !edit.organized);
    
    if (unorganizedEdits.length >= this.currentState.config.maxEditsBeforeOrganization + this.currentState.config.numEditsToOrganize) {
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
        .slice(0, this.currentState.config.numEditsToOrganize);

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
    await this.localStorageManager.saveBrainState(this.currentState!);
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
    await this.localStorageManager.saveBrainState(this.currentState!);
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

  async getEditsByParagraphMetadataId(metadataId: string): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.edits.filter(edit => edit.paragraphMetadata?.id === metadataId);
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