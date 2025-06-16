import { ParagraphEdit } from '../types';
import { extractKeywords, groupEditsByTimeWindow, truncateText } from '../utils/helpers';

export class SummaryGenerator {
  private apiEndpoint: string;
  private maxSummaryLength: number;

  constructor(apiEndpoint: string = '/api/summarize', maxSummaryLength: number = 500) {
    this.apiEndpoint = apiEndpoint;
    this.maxSummaryLength = maxSummaryLength;
  }

  async generateSummary(edits: ParagraphEdit[], previousSummary: string = ''): Promise<string> {
    if (edits.length === 0) return previousSummary;

    try {
      // Prepare the context for summarization
      const context = this.prepareContext(edits, previousSummary);
      
      // Call the API to generate summary
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'brain_state_summary',
          context,
          previousSummary,
          maxLength: this.maxSummaryLength,
        }),
      });

      if (!response.ok) {
        throw new Error(`Summary API failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.summary || this.generateFallbackSummary(edits, previousSummary);
    } catch (error) {
      console.error('Error generating summary:', error);
      return this.generateFallbackSummary(edits, previousSummary);
    }
  }

  async generateContextSummary(edits: ParagraphEdit[]): Promise<string> {
    if (edits.length === 0) return '';

    try {
      const context = this.prepareContextForCaching(edits);
      
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'context_summary',
          context,
          maxLength: 300,
        }),
      });

      if (!response.ok) {
        throw new Error(`Context summary API failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.summary || this.generateFallbackContextSummary(edits);
    } catch (error) {
      console.error('Error generating context summary:', error);
      return this.generateFallbackContextSummary(edits);
    }
  }

  private prepareContext(edits: ParagraphEdit[], previousSummary: string): any {
    const editGroups = groupEditsByTimeWindow(edits);
    const recentEdits = edits.slice(-10); // Last 10 edits for immediate context
    
    return {
      editCount: edits.length,
      timeSpan: {
        start: edits[0]?.timestamp,
        end: edits[edits.length - 1]?.timestamp,
      },
      editGroups: editGroups.map(group => ({
        count: group.length,
        timeWindow: {
          start: group[0].timestamp,
          end: group[group.length - 1].timestamp,
        },
        mainTopics: this.extractMainTopics(group),
        editTypes: this.analyzeEditTypes(group),
      })),
      recentEdits: recentEdits.map(edit => ({
        type: edit.editType,
        content: truncateText(edit.content, 100),
        pageId: edit.pageId,
        timestamp: edit.timestamp,
      })),
      keywords: this.extractOverallKeywords(edits),
      previousSummary,
    };
  }

  private prepareContextForCaching(edits: ParagraphEdit[]): any {
    return {
      editCount: edits.length,
      timeSpan: {
        start: edits[0]?.timestamp,
        end: edits[edits.length - 1]?.timestamp,
      },
      mainTopics: this.extractMainTopics(edits),
      editTypes: this.analyzeEditTypes(edits),
      affectedPages: [...new Set(edits.map(edit => edit.pageId))],
      keywords: this.extractOverallKeywords(edits),
    };
  }

  private extractMainTopics(edits: ParagraphEdit[]): string[] {
    const allContent = edits.map(edit => edit.content).join(' ');
    return extractKeywords(allContent, 5);
  }

  private analyzeEditTypes(edits: ParagraphEdit[]): Record<string, number> {
    return edits.reduce((acc, edit) => {
      acc[edit.editType] = (acc[edit.editType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private extractOverallKeywords(edits: ParagraphEdit[]): string[] {
    const allContent = edits.map(edit => edit.content).join(' ');
    return extractKeywords(allContent, 10);
  }

  private generateFallbackSummary(edits: ParagraphEdit[], previousSummary: string): string {
    const editCount = edits.length;
    const pageCount = new Set(edits.map(edit => edit.pageId)).size;
    const editTypes = this.analyzeEditTypes(edits);
    const keywords = this.extractOverallKeywords(edits).slice(0, 5);
    
    const timeSpan = edits.length > 0 ? {
      start: new Date(edits[0].timestamp).toLocaleDateString(),
      end: new Date(edits[edits.length - 1].timestamp).toLocaleDateString(),
    } : null;

    let summary = `Brain state contains ${editCount} edits across ${pageCount} pages`;
    
    if (timeSpan && timeSpan.start !== timeSpan.end) {
      summary += ` from ${timeSpan.start} to ${timeSpan.end}`;
    }

    if (Object.keys(editTypes).length > 0) {
      const typeDescriptions = Object.entries(editTypes)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');
      summary += `. Edit types: ${typeDescriptions}`;
    }

    if (keywords.length > 0) {
      summary += `. Key topics: ${keywords.join(', ')}`;
    }

    if (previousSummary) {
      summary += `. Previous context: ${truncateText(previousSummary, 100)}`;
    }

    return truncateText(summary, this.maxSummaryLength);
  }

  private generateFallbackContextSummary(edits: ParagraphEdit[]): string {
    const keywords = this.extractOverallKeywords(edits).slice(0, 3);
    const editTypes = this.analyzeEditTypes(edits);
    const pageCount = new Set(edits.map(edit => edit.pageId)).size;

    let summary = `Context: ${edits.length} edits on ${pageCount} page${pageCount > 1 ? 's' : ''}`;
    
    if (keywords.length > 0) {
      summary += ` about ${keywords.join(', ')}`;
    }

    const mainEditType = Object.entries(editTypes)
      .sort(([, a], [, b]) => b - a)[0]?.[0];
    
    if (mainEditType) {
      summary += `. Primarily ${mainEditType} operations`;
    }

    return truncateText(summary, 300);
  }

  // Method to update API configuration
  updateConfig(apiEndpoint?: string, maxSummaryLength?: number): void {
    if (apiEndpoint) this.apiEndpoint = apiEndpoint;
    if (maxSummaryLength) this.maxSummaryLength = maxSummaryLength;
  }

  // Method to validate summary quality (can be expanded)
  validateSummary(summary: string): boolean {
    return summary.length > 10 && summary.length <= this.maxSummaryLength;
  }
} 