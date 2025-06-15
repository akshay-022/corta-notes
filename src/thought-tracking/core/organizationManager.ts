import { 
  CacheEntry, 
  OrganizedPage, 
  OrganizationRequest, 
  OrganizationResult, 
  OrganizationConfig, 
  StorageManager 
} from '../types';
import { calculateTextSimilarity, generateId } from '../utils/helpers';

export class OrganizationManager {
  private storageManager: StorageManager;
  private apiEndpoint: string;
  private defaultConfig: OrganizationConfig;

  constructor(
    storageManager: StorageManager, 
    apiEndpoint: string = '/api/organize'
  ) {
    this.storageManager = storageManager;
    this.apiEndpoint = apiEndpoint;
    this.defaultConfig = {
      preserveAllInformation: true,
      createNewPagesThreshold: 0.3, // Similarity threshold for creating new pages
      maxSimilarityForMerge: 0.7, // Similarity threshold for merging with existing pages
      contextWindowSize: 4000, // Maximum context size for LLM
    };
  }

  async organizeContent(cacheEntries: CacheEntry[]): Promise<OrganizationResult> {
    const unprocessedEntries = cacheEntries.filter(entry => !entry.processed);
    
    if (unprocessedEntries.length === 0) {
      return {
        updatedPages: [],
        newPages: [],
        summary: 'No unprocessed entries to organize',
        processedCacheIds: [],
      };
    }

    try {
      // Load existing organized pages
      const existingPages = await this.storageManager.loadOrganizedPages();
      
      // Prepare organization request
      const request = this.prepareOrganizationRequest(unprocessedEntries, existingPages);
      
      // Call organization API
      const result = await this.callOrganizationAPI(request);
      
      // Process and save results
      await this.processOrganizationResult(result, unprocessedEntries);
      
      return result;
    } catch (error) {
      console.error('Error organizing content:', error);
      
      // Fallback organization
      return this.performFallbackOrganization(unprocessedEntries);
    }
  }

  private prepareOrganizationRequest(
    cacheEntries: CacheEntry[], 
    existingPages: OrganizedPage[]
  ): OrganizationRequest {
    // Combine all cache summaries for context
    const combinedSummary = cacheEntries
      .map(entry => entry.contextSummary)
      .join('\n\n');

    return {
      cacheEntries,
      currentSummary: combinedSummary,
      existingPages,
      config: this.defaultConfig,
    };
  }

  private async callOrganizationAPI(request: OrganizationRequest): Promise<OrganizationResult> {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'organize_content',
        request,
        instructions: this.getOrganizationInstructions(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Organization API failed: ${response.statusText}`);
    }

    return await response.json();
  }

  private getOrganizationInstructions(): string {
    return `
You are an intelligent content organizer. Your task is to:

1. PRESERVE ALL INFORMATION: Never lose any information from the cache entries. Every piece of content must be preserved.

2. SMART ORGANIZATION: 
   - Analyze the content themes and topics
   - Group related content together
   - Identify the best existing pages to update or determine if new pages are needed
   - Maintain coherent narrative flow

3. EDITING STRATEGY:
   - Don't just append content - intelligently integrate it
   - Update existing sections where content fits naturally
   - Create new sections when needed
   - Maintain proper document structure

4. PAGE MANAGEMENT:
   - Update existing pages when content is highly related (similarity > 0.7)
   - Create new pages when content is sufficiently different (similarity < 0.3)
   - For medium similarity (0.3-0.7), use judgment based on content coherence

5. METADATA:
   - Generate appropriate tags for discoverability
   - Set relevant categories
   - Establish relationships between pages
   - Update titles to reflect content accurately

6. QUALITY ASSURANCE:
   - Ensure all information from cache is incorporated
   - Maintain readability and flow
   - Check for redundancy and consolidate when appropriate
   - Preserve important timestamps and context
`;
  }

  private async processOrganizationResult(
    result: OrganizationResult, 
    processedEntries: CacheEntry[]
  ): Promise<void> {
    // Save updated and new pages
    const existingPages = await this.storageManager.loadOrganizedPages();
    const allPages = this.mergePages(existingPages, result.updatedPages, result.newPages);
    
    await this.storageManager.saveOrganizedPages(allPages);
    
    // Mark cache entries as processed
    await this.markCacheEntriesAsProcessed(processedEntries);
  }

  private mergePages(
    existing: OrganizedPage[], 
    updated: OrganizedPage[], 
    newPages: OrganizedPage[]
  ): OrganizedPage[] {
    const result = [...existing];
    
    // Update existing pages
    updated.forEach(updatedPage => {
      const index = result.findIndex(page => page.uuid === updatedPage.uuid);
      if (index !== -1) {
        result[index] = { ...updatedPage, updated_at: new Date().toISOString() };
      }
    });
    
    // Add new pages
    newPages.forEach(newPage => {
      result.push({ ...newPage, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    });
    
    return result;
  }

  private async markCacheEntriesAsProcessed(entries: CacheEntry[]): Promise<void> {
    const allEntries = await this.storageManager.loadCacheEntries();
    const processedIds = new Set(entries.map(entry => entry.id));
    
    const updatedEntries = allEntries.map(entry => 
      processedIds.has(entry.id) ? { ...entry, processed: true } : entry
    );
    
    // Here we would need to update individual cache entries
    // For now, we'll clear the processed ones
    await this.storageManager.clearProcessedCache(entries.map(e => e.id));
  }

  private async performFallbackOrganization(cacheEntries: CacheEntry[]): Promise<OrganizationResult> {
    const existingPages = await this.storageManager.loadOrganizedPages();
    const newPages: OrganizedPage[] = [];
    const updatedPages: OrganizedPage[] = [];

    for (const entry of cacheEntries) {
      const bestMatch = this.findBestPageMatch(entry, existingPages);
      
      if (bestMatch && this.calculateSimilarity(entry, bestMatch) > 0.5) {
        // Update existing page
        const updatedPage = this.updatePageWithCacheEntry(bestMatch, entry);
        updatedPages.push(updatedPage);
      } else {
        // Create new page
        const newPage = this.createPageFromCacheEntry(entry);
        newPages.push(newPage);
      }
    }

    return {
      updatedPages,
      newPages,
      summary: `Fallback organization: ${updatedPages.length} pages updated, ${newPages.length} pages created`,
      processedCacheIds: cacheEntries.map(e => e.id),
    };
  }

  private findBestPageMatch(entry: CacheEntry, pages: OrganizedPage[]): OrganizedPage | null {
    if (pages.length === 0) return null;

    let bestMatch: OrganizedPage | null = null;
    let bestSimilarity = 0;

    for (const page of pages) {
      const similarity = this.calculateSimilarity(entry, page);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = page;
      }
    }

    return bestSimilarity > this.defaultConfig.createNewPagesThreshold ? bestMatch : null;
  }

  private calculateSimilarity(entry: CacheEntry, page: OrganizedPage): number {
    const entryText = entry.contextSummary + ' ' + entry.edits.map(e => e.content).join(' ');
    const pageText = page.title + ' ' + page.content;
    
    return calculateTextSimilarity(entryText, pageText);
  }

  private updatePageWithCacheEntry(page: OrganizedPage, entry: CacheEntry): OrganizedPage {
    const additionalContent = entry.edits
      .map(edit => edit.content)
      .join('\n\n');

    // Update both content structures
    const updatedContentText = page.content_text + '\n\n' + additionalContent;
    
    // Add new paragraphs to TipTap content
    const newParagraphs = additionalContent.split('\n\n').map(paragraph => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: paragraph
        }
      ]
    }));

    const updatedContent = {
      ...page.content,
      content: [...(page.content?.content || []), ...newParagraphs]
    };

    return {
      ...page,
      content: updatedContent,
      content_text: updatedContentText,
      updated_at: new Date().toISOString(),
      metadata: {
        ...page.metadata,
        thoughtTracking: {
          ...page.metadata?.thoughtTracking,
          lastCacheUpdate: entry.timestamp,
          cacheUpdates: (page.metadata?.thoughtTracking?.cacheUpdates || 0) + 1
        }
      }
    };
  }

  private createPageFromCacheEntry(entry: CacheEntry): OrganizedPage {
    const content_text = entry.edits
      .map(edit => edit.content)
      .join('\n\n');

    // Extract potential title from content or use summary
    const title = this.extractTitleFromContent(content_text) || 
                  `Notes from ${new Date(entry.timestamp).toLocaleDateString()}`;

    // Create TipTap-compatible content structure
    const content = {
      type: "doc",
      content: content_text.split('\n\n').map(paragraph => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: paragraph
          }
        ]
      }))
    };

    return {
      uuid: generateId(),
      title,
      content,
      content_text,
      organized: true,
      type: 'file',
      visible: true,
      is_deleted: false,
      is_published: false,
      is_locked: false,
      metadata: {
        thoughtTracking: {
          tags: this.extractTagsFromContent(content_text),
          category: this.inferCategoryFromContent(content_text),
          createdFromCache: true,
          cacheEntryId: entry.id,
          cacheTimestamp: entry.timestamp
        }
      },
      tags: this.extractTagsFromContent(content_text),
      category: this.inferCategoryFromContent(content_text),
    };
  }

  private extractTitleFromContent(content: string): string | null {
    // Simple title extraction - could be more sophisticated
    const lines = content.split('\n').filter(line => line.trim());
    const firstLine = lines[0]?.trim();
    
    if (firstLine && firstLine.length < 100 && firstLine.length > 5) {
      return firstLine;
    }
    
    return null;
  }

  private extractTagsFromContent(content: string): string[] {
    // Basic tag extraction - could use NLP for better results
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  private inferCategoryFromContent(content: string): string {
    // Basic category inference - could be enhanced with ML
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('meeting') || lowerContent.includes('discussion')) {
      return 'meetings';
    }
    if (lowerContent.includes('idea') || lowerContent.includes('concept')) {
      return 'ideas';
    }
    if (lowerContent.includes('todo') || lowerContent.includes('task')) {
      return 'tasks';
    }
    if (lowerContent.includes('research') || lowerContent.includes('study')) {
      return 'research';
    }
    
    return 'general';
  }

  // Public methods for configuration and monitoring

  async getOrganizationStats(): Promise<{
    totalOrganizedPages: number;
    unprocessedCacheEntries: number;
    lastOrganization: number | null;
    averagePageSize: number;
  }> {
    const pages = await this.storageManager.loadOrganizedPages();
    const cacheEntries = await this.storageManager.loadCacheEntries();
    const unprocessedEntries = cacheEntries.filter(entry => !entry.processed);
    
    const lastOrganization = pages.length > 0 
      ? Math.max(...pages.map(page => new Date(page.updated_at || 0).getTime()))
      : null;
    
    const averagePageSize = pages.length > 0
      ? pages.reduce((sum, page) => sum + page.content.length, 0) / pages.length
      : 0;

    return {
      totalOrganizedPages: pages.length,
      unprocessedCacheEntries: unprocessedEntries.length,
      lastOrganization,
      averagePageSize,
    };
  }

  updateConfig(newConfig: Partial<OrganizationConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...newConfig };
  }

  updateApiEndpoint(endpoint: string): void {
    this.apiEndpoint = endpoint;
  }
} 