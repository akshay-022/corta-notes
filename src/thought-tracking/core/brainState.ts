import { 
  BrainState, 
  ParagraphEdit, 
  BrainStateConfig,
  LineEdit,
  LineMap,
  ParagraphMetadata,
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
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000; // 1 second debounce for saves

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

    // Migrate from old system to new line mapping system if needed
    if (!this.currentState.lineMap || Object.keys(this.currentState.lineMap).length === 0) {
      await this.migrateToLineMappingSystem();
    }
  }

  private createDefaultBrainState(): BrainState {
    return {
      lineMap: {},
      edits: [], // Keep for backward compatibility
      summary: '',
      lastUpdated: Date.now(),
      config: BRAIN_STATE_DEFAULTS,
    };
  }

  private async migrateToLineMappingSystem(): Promise<void> {
    if (!this.currentState || !this.currentState.edits.length) return;

    console.log('🧠 Migrating to line mapping system...');
    
    const lineMap: LineMap = {};
    
    // Convert existing edits to line mapping format
    for (const edit of this.currentState.edits) {
      const lineId = edit.paragraphId;
      if (!lineMap[lineId]) {
        lineMap[lineId] = [];
      }
      
      const lineEdit: LineEdit = {
        lineId,
        pageId: edit.pageId,
        content: edit.content,
        timestamp: edit.timestamp,
        organized: edit.organized || false,
        version: lineMap[lineId].length + 1,
        editType: edit.editType,
        metadata: edit.metadata,
        paragraphMetadata: edit.paragraphMetadata,
      };
      
      lineMap[lineId].push(lineEdit);
    }
    
    this.currentState.lineMap = lineMap;
    await this.debouncedSave();
    
    console.log('🧠 Migration complete. Line map has', Object.keys(lineMap).length, 'lines');
  }

  /**
   * Add or update a line edit using the mapping system
   */
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
    paragraphMetadata?: ParagraphMetadata;
  }): Promise<void> {
    if (!this.currentState) {
      await this.initialize();
    }

    const now = Date.now();
    const { lineId, pageId, content, editType, metadata, paragraphMetadata } = lineData;

    // Initialize line map if it doesn't exist
    if (!this.currentState!.lineMap[lineId]) {
      this.currentState!.lineMap[lineId] = [];
    }

    const lineEdits = this.currentState!.lineMap[lineId];
    const latestEdit = lineEdits[lineEdits.length - 1];

    // Check if content actually changed
    if (latestEdit && latestEdit.content === content && latestEdit.editType === editType) {
      console.log('🧠 No change detected for line:', lineId);
      return;
    }

    // If the latest edit is not organized, we can update it directly
    if (latestEdit && !latestEdit.organized) {
      latestEdit.content = content;
      latestEdit.timestamp = now;
      latestEdit.editType = editType;
      latestEdit.metadata = {
        wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
        charCount: content.length,
        ...metadata,
      };
      latestEdit.paragraphMetadata = paragraphMetadata;
      
      console.log('🧠 Updated existing unorganized line:', {
        lineId,
        version: latestEdit.version,
        editType,
        contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      });
    } else {
      // Create a new version if the latest edit is organized or if this is the first edit
      const newVersion = lineEdits.length + 1;
      const lineEdit: LineEdit = {
        lineId,
        pageId,
        content,
        timestamp: now,
        organized: false,
        version: newVersion,
        editType,
        metadata: {
          wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
          charCount: content.length,
          ...metadata,
        },
        paragraphMetadata,
      };
      
      lineEdits.push(lineEdit);
      
      console.log('🧠 Created new line version:', {
        lineId,
        version: newVersion,
        editType,
        contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      });
    }

    this.currentState!.lastUpdated = now;
    
    // Check if we need to trigger organization
    await this.checkOrganizationTrigger();
    
    // Debounced save to avoid too frequent storage operations
    this.debouncedSave();
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      if (this.currentState) {
        await this.localStorageManager.saveBrainState(this.currentState);
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  private async checkOrganizationTrigger(): Promise<void> {
    if (!this.currentState || this.isOrganizing) return;

    const unorganizedLines = this.getUnorganizedLineEdits();
    
    if (unorganizedLines.length >= this.currentState.config.maxEditsBeforeOrganization + this.currentState.config.numEditsToOrganize) {
      await this.triggerOrganization();
    }
  }

  private getUnorganizedLineEdits(): LineEdit[] {
    if (!this.currentState) return [];
    
    const unorganizedEdits: LineEdit[] = [];
    
    for (const lineEdits of Object.values(this.currentState.lineMap)) {
      const latestEdit = lineEdits[lineEdits.length - 1];
      if (latestEdit && !latestEdit.organized) {
        unorganizedEdits.push(latestEdit);
      }
    }
    
    return unorganizedEdits.sort((a, b) => a.timestamp - b.timestamp);
  }

  private async triggerOrganization(): Promise<void> {
    if (!this.currentState || this.isOrganizing) return;

    this.isOrganizing = true;
    
    try {
      const unorganizedEdits = this.getUnorganizedLineEdits()
        .slice(0, this.currentState.config.numEditsToOrganize);

      console.log('🧠 Triggering organization for', unorganizedEdits.length, 'line edits');
      
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

  /**
   * Mark specific line versions as organized
   */
  async markLinesAsOrganized(lineVersions: Array<{ lineId: string; version: number }>): Promise<void> {
    if (!this.currentState) {
      await this.initialize();
    }

    for (const { lineId, version } of lineVersions) {
      const lineEdits = this.currentState!.lineMap[lineId];
      if (lineEdits) {
        const editToMark = lineEdits.find(edit => edit.version === version);
        if (editToMark) {
          editToMark.organized = true;
          console.log('🧠 Marked line as organized:', { lineId, version });
        }
      }
    }

    this.currentState!.lastUpdated = Date.now();
    await this.debouncedSave();
  }

  /**
   * Legacy method - converts line edits to paragraph edits for backward compatibility
   */
  async addEdit(edit: Omit<ParagraphEdit, 'id' | 'timestamp'>): Promise<void> {
    // Convert to new line mapping system
    await this.updateLine({
      lineId: edit.paragraphId,
      pageId: edit.pageId,
      content: edit.content,
      editType: edit.editType,
      metadata: edit.metadata,
      paragraphMetadata: edit.paragraphMetadata,
    });
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
    await this.debouncedSave();
  }

  async getLinesByPage(pageId: string): Promise<LineEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    const pageLines: LineEdit[] = [];
    
    for (const lineEdits of Object.values(this.currentState!.lineMap)) {
      const latestEdit = lineEdits[lineEdits.length - 1];
      if (latestEdit && latestEdit.pageId === pageId) {
        pageLines.push(latestEdit);
      }
    }
    
    return pageLines.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getLineHistory(lineId: string): Promise<LineEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    return this.currentState!.lineMap[lineId] || [];
  }

  async getLatestLineEdit(lineId: string): Promise<LineEdit | null> {
    const history = await this.getLineHistory(lineId);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  // Legacy methods for backward compatibility
  async markEditsAsOrganized(editIds: string[]): Promise<void> {
    // This is for backward compatibility - in the new system we use markLinesAsOrganized
    console.warn('🧠 Using legacy markEditsAsOrganized - consider upgrading to markLinesAsOrganized');
  }

  async getEditsByPage(pageId: string): Promise<ParagraphEdit[]> {
    const lineEdits = await this.getLinesByPage(pageId);
    return lineEdits.map(this.convertLineEditToParagraphEdit);
  }

  async getEditsByParagraph(paragraphId: string): Promise<ParagraphEdit[]> {
    const lineHistory = await this.getLineHistory(paragraphId);
    return lineHistory.map(this.convertLineEditToParagraphEdit);
  }

  async getEditsByParagraphMetadataId(metadataId: string): Promise<ParagraphEdit[]> {
    if (!this.currentState) {
      await this.initialize();
    }

    if (!this.currentState) {
      return [];
    }

    const matchingEdits: ParagraphEdit[] = [];
    
    for (const lineEdits of Object.values(this.currentState.lineMap)) {
      for (const lineEdit of lineEdits) {
        if (lineEdit.paragraphMetadata?.id === metadataId) {
          matchingEdits.push(this.convertLineEditToParagraphEdit(lineEdit));
        }
      }
    }
    
    return matchingEdits.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getRecentEdits(limit: number = 10): Promise<ParagraphEdit[]> {
    const unorganizedEdits = this.getUnorganizedLineEdits();
    return unorganizedEdits
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(this.convertLineEditToParagraphEdit);
  }

  async getUnorganizedEdits(): Promise<ParagraphEdit[]> {
    const unorganizedEdits = this.getUnorganizedLineEdits();
    return unorganizedEdits.map(this.convertLineEditToParagraphEdit);
  }

  private convertLineEditToParagraphEdit(lineEdit: LineEdit): ParagraphEdit {
    return {
      id: `${lineEdit.lineId}-v${lineEdit.version}`,
      paragraphId: lineEdit.lineId,
      pageId: lineEdit.pageId,
      content: lineEdit.content,
      timestamp: lineEdit.timestamp,
      editType: lineEdit.editType,
      organized: lineEdit.organized,
      paragraphMetadata: lineEdit.paragraphMetadata,
      metadata: lineEdit.metadata,
    };
  }

  async getStats(): Promise<{
    totalLines: number;
    totalVersions: number;
    organizedVersions: number;
    unorganizedVersions: number;
    lastUpdate: number;
    averageEditSize: number;
    editTypes: Record<string, number>;
  }> {
    if (!this.currentState) {
      await this.initialize();
    }

    let totalVersions = 0;
    let organizedVersions = 0;
    let totalCharCount = 0;
    const editTypes: Record<string, number> = {};
    
    for (const lineEdits of Object.values(this.currentState!.lineMap)) {
      for (const lineEdit of lineEdits) {
        totalVersions++;
        if (lineEdit.organized) {
          organizedVersions++;
        }
        totalCharCount += lineEdit.metadata?.charCount || 0;
        editTypes[lineEdit.editType] = (editTypes[lineEdit.editType] || 0) + 1;
      }
    }

    return {
      totalLines: Object.keys(this.currentState!.lineMap).length,
      totalVersions,
      organizedVersions,
      unorganizedVersions: totalVersions - organizedVersions,
      lastUpdate: this.currentState!.lastUpdated,
      averageEditSize: totalVersions > 0 ? totalCharCount / totalVersions : 0,
      editTypes,
    };
  }
} 