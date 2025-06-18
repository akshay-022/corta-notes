import { 
  LineEdit,
  OrganizedPage, 
  OrganizationRequest, 
  OrganizationResult, 
  OrganizationConfig, 
  StorageManager 
} from '../types';
import { calculateTextSimilarity, generateId } from '../utils/helpers';
import { ORGANIZATION_DEFAULTS, API_ENDPOINTS } from '../constants';
import { createClient } from '@/lib/supabase/supabase-client';
import { PageUpdate, PageInsert } from '@/lib/supabase/types';
import { organizationCacheManager, OrganizationCacheManager } from '../services/organizationCacheManager';

export class OrganizationManager {
  private storageManager: StorageManager;
  private apiEndpoint: string;
  private defaultConfig: OrganizationConfig;
  private supabase: any;
  private userId?: string;
  private cacheManager: OrganizationCacheManager;

  constructor(
    storageManager: StorageManager, 
    apiEndpoint: string = API_ENDPOINTS.ORGANIZATION,
    userId?: string
  ) {
    this.storageManager = storageManager;
    this.apiEndpoint = apiEndpoint;
    this.defaultConfig = ORGANIZATION_DEFAULTS;
    this.supabase = createClient();
    this.userId = userId;
    this.cacheManager = organizationCacheManager;
    
    // Set userId in cache manager
    if (userId) {
      this.cacheManager.setUserId(userId);
    }
  }

  async organizeContent(edits: LineEdit[]): Promise<OrganizationResult> {
    if (edits.length === 0) {
      return {
        updatedPages: [],
        newPages: [],
        summary: 'No edits to organize',
        processedEditIds: [],
      };
    }

    // Prevent concurrent organization
    if (this.cacheManager.isOrganizing()) {
      console.warn('Organization already in progress, skipping...');
      return {
        updatedPages: [],
        newPages: [],
        summary: 'Organization already in progress',
        processedEditIds: [],
      };
    }

    try {
      // Start organization process
      this.cacheManager.startOrganization();
      
      // Load existing organized pages
      const existingPages = await this.storageManager.loadOrganizedPages();
      
      // Prepare organization request
      const request = this.prepareOrganizationRequest(edits, existingPages);
      
      // Call organization API
      const result = await this.callOrganizationAPI(request);
      
      // Process and save results with Supabase integration
      await this.processOrganizationResult(result);
      
      // Complete organization with cache updates
      await this.cacheManager.completeOrganization(result);
      
      return result;
    } catch (error) {
      console.error('Error organizing content:', error);
      
      // Fallback organization
      return this.performFallbackOrganization(edits);
    }
  }

  private prepareOrganizationRequest(
    edits: LineEdit[], 
    existingPages: OrganizedPage[]
  ): OrganizationRequest {
    // Generate a summary from the edits
    const combinedContent = edits
      .map(edit => edit.content)
      .join('\n\n');

    return {
      edits,
      currentSummary: combinedContent,
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

    const result = await response.json();
    
    // Post file history update to window if organization was successful
    if (result.fileHistory && typeof window !== 'undefined') {
      window.postMessage({
        type: 'FILE_HISTORY_UPDATE',
        data: result.fileHistory
      }, '*');
    }

    return result;
  }

  private getOrganizationInstructions(): string {
    return `
You are an intelligent content organizer. Your task is to efficiently group edits into the optimal file structure.

CORE PRINCIPLE: Group N edits into M files where N >= M (multiple edits can go to the same file when they're related).

ORGANIZATION STRATEGY:
1. ANALYZE CONTENT SIMILARITY: Group similar/related edits together
2. USE EXISTING FILES: Prefer adding to existing relevant files when content fits
3. CREATE NEW FILES: Only when content represents a distinct new topic that doesn't fit existing files
4. BE EFFICIENT: Don't create unnecessary files - group related content together

DECISION PROCESS:
- If edits relate to existing file content: add to that file
- If multiple edits are similar to each other: group them into one file (existing or new)
- If edit is unique and substantial: consider new file
- If edit is short/minor: add to most relevant existing file

QUALITY ASSURANCE:
- Preserve all information from the edits
- Ensure all edits are incorporated somewhere
- Maintain readability and coherent narrative
- Keep related information accessible
- Focus on content similarity and logical grouping

RESPONSE FORMAT:
Return a structured response indicating for each edit:
- Whether to update an existing file or create new file
- The target location (path)  
- How to integrate the content
- Reasoning for the decision
- Group similar edits efficiently rather than creating many separate files
`;
  }

  private async processOrganizationResult(result: OrganizationResult): Promise<void> {
    try {
      // Save to storage manager (for compatibility)
      const existingPages = await this.storageManager.loadOrganizedPages();
      const allPages = this.mergePages(existingPages, result.updatedPages, result.newPages);
      await this.storageManager.saveOrganizedPages(allPages);

      // Direct Supabase updates for better performance and consistency
      await this.updateSupabasePages(result);
      
      console.log('✅ Organization result processed successfully');
    } catch (error) {
      console.error('❌ Error processing organization result:', error);
      throw error;
    }
  }

  private async updateSupabasePages(result: OrganizationResult): Promise<void> {
    if (!this.userId) {
      console.warn('No userId provided, skipping Supabase updates');
      return;
    }

    const promises: Promise<any>[] = [];

    // Update existing pages
    for (const page of result.updatedPages) {
      if (page.uuid) {
        const updateData: PageUpdate = {
          title: page.title,
          content: page.content,
          content_text: page.content_text,
          organized: page.organized,
          metadata: {
            ...page.metadata,
            thoughtTracking: {
              ...page.metadata?.thoughtTracking,
              lastOrganizationUpdate: new Date().toISOString(),
              editUpdates: (page.metadata?.thoughtTracking?.editUpdates || 0) + 1
            }
          },
          updated_at: new Date().toISOString(),
        };

        if (page.description) updateData.description = page.description;
        if (page.emoji) updateData.emoji = page.emoji;
        if (page.parent_uuid) updateData.parent_uuid = page.parent_uuid;

        const updatePromise = this.supabase
          .from('pages')
          .update(updateData)
          .eq('uuid', page.uuid)
          .eq('user_id', this.userId);

        promises.push(updatePromise);
      }
    }

    // Create new pages
    for (const page of result.newPages) {
      const insertData: PageInsert = {
        user_id: this.userId,
        title: page.title,
        content: page.content || { type: "doc", content: [] },
        content_text: page.content_text,
        organized: page.organized !== false,
        type: page.type || 'file',
        visible: page.visible !== false,
        is_deleted: false,
        is_published: false,
        is_locked: false,
        metadata: {
          thoughtTracking: {
            tags: page.tags,
            category: page.category,
            relatedPages: page.relatedPages,
            createdFromOrganization: true,
            organizationTimestamp: new Date().toISOString()
          },
          ...page.metadata
        },
      };

      if (page.description) insertData.description = page.description;
      if (page.emoji) insertData.emoji = page.emoji;
      if (page.parent_uuid) insertData.parent_uuid = page.parent_uuid;
      if (page.uuid) insertData.uuid = page.uuid;

      const insertPromise = this.supabase
        .from('pages')
        .insert(insertData)
        .select('*')
        .single();

      promises.push(insertPromise);
    }

    // Execute all updates/inserts in parallel
    const results = await Promise.allSettled(promises);
    
    // Log any errors but don't fail the entire operation
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`❌ Supabase operation ${index} failed:`, result.reason);
      }
    });

    console.log(`✅ Completed ${promises.length} Supabase operations for organization`);
  }

  private async updateClientCache(result: OrganizationResult): Promise<void> {
    try {
      // Use cache manager for coordinated updates
      await this.cacheManager.completeOrganization(result);
      
      console.log('✅ Client cache updated via cache manager');
    } catch (error) {
      console.error('❌ Error updating client cache:', error);
    }
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

  private async performFallbackOrganization(edits: LineEdit[]): Promise<OrganizationResult> {
    // Start fallback organization
    this.cacheManager.startOrganization();
    
    const existingPages = await this.storageManager.loadOrganizedPages();
    const newPages: OrganizedPage[] = [];
    const updatedPages: OrganizedPage[] = [];

    for (const edit of edits) {
      const bestMatch = this.findBestPageMatch(edit, existingPages);
      const similarity = bestMatch ? this.calculateSimilarity(edit, bestMatch) : 0;
      
      if (bestMatch && similarity > this.defaultConfig.maxSimilarityForMerge) {
        // High similarity - update existing page
        const updatedPage = this.updatePageWithEdit(bestMatch, edit);
        updatedPages.push(updatedPage);
      } else if (bestMatch && similarity > this.defaultConfig.createNewPagesThreshold) {
        // Medium similarity - still update existing but note the decision
        const updatedPage = this.updatePageWithEdit(bestMatch, edit);
        updatedPage.metadata = {
          ...updatedPage.metadata,
          thoughtTracking: {
            ...updatedPage.metadata?.thoughtTracking,
            fallbackDecision: 'medium_similarity_update',
            similarityScore: similarity
          }
        };
        updatedPages.push(updatedPage);
      } else {
        // Low similarity or no match - create new page only if content is substantial
        if (edit.content.length > 50) { // Only create new page for substantial content
          const newPage = this.createPageFromEdit(edit);
          newPage.metadata = {
            ...newPage.metadata,
            thoughtTracking: {
              ...newPage.metadata?.thoughtTracking,
              fallbackDecision: 'new_page_created',
              similarityScore: similarity
            }
          };
          newPages.push(newPage);
        } else {
          // Short content - add to best match or most recent file
          const targetPage = bestMatch || this.findBestFallbackPage(existingPages);
          if (targetPage) {
            const updatedPage = this.updatePageWithEdit(targetPage, edit);
            updatedPage.metadata = {
              ...updatedPage.metadata,
              thoughtTracking: {
                ...updatedPage.metadata?.thoughtTracking,
                fallbackDecision: 'short_content_merged',
                similarityScore: similarity
              }
            };
            updatedPages.push(updatedPage);
          } else {
            // No existing files - create a new one
            const newPage = this.createPageFromEdit(edit);
            newPage.metadata = {
              ...newPage.metadata,
              thoughtTracking: {
                ...newPage.metadata?.thoughtTracking,
                fallbackDecision: 'no_files_available_created_new',
                similarityScore: similarity
              }
            };
            newPages.push(newPage);
          }
        }
      }
    }

    const fallbackResult = {
      updatedPages,
      newPages,
      summary: `Fallback organization: ${updatedPages.length} pages updated, ${newPages.length} pages created (prioritized existing files)`,
      processedEditIds: edits.map(e => `${e.lineId}-v${e.version}`),
    };

    try {
      // Apply fallback result to Supabase
      await this.updateSupabasePages(fallbackResult);
      
      // Complete organization with cache updates
      await this.cacheManager.completeOrganization(fallbackResult);
      
      // Post file history update for fallback organization
      if (typeof window !== 'undefined') {
        const fileHistoryItems = [
          ...fallbackResult.updatedPages.map(page => ({
            uuid: page.uuid,
            title: page.title,
            action: 'updated' as const,
            timestamp: Date.now()
          })),
          ...fallbackResult.newPages.map(page => ({
            uuid: page.uuid,
            title: page.title,
            action: 'created' as const,
            timestamp: Date.now()
          }))
        ];
        
        window.postMessage({
          type: 'FILE_HISTORY_UPDATE',
          data: fileHistoryItems
        }, '*');
      }
      
    } catch (error) {
      console.error('❌ Error in fallback organization:', error);
      // Still return the result even if cache update fails
    }

    return fallbackResult;
  }

  private findBestPageMatch(edit: LineEdit, pages: OrganizedPage[]): OrganizedPage | null {
    if (pages.length === 0) return null;

    let bestMatch: OrganizedPage | null = null;
    let highestSimilarity = 0;

    for (const page of pages) {
      const similarity = this.calculateSimilarity(edit, page);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = page;
      }
    }

    return bestMatch;
  }

  private findBestFallbackPage(pages: OrganizedPage[]): OrganizedPage | null {
    // Find the most recently updated file to use as fallback
    const filePages = pages.filter(page => page.type === 'file' && page.organized === true);
    
    if (filePages.length === 0) {
      return null;
    }

    // Sort by updated_at timestamp, most recent first
    const sortedPages = filePages.sort((a, b) => {
      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return bTime - aTime;
    });

    return sortedPages[0];
  }

  private calculateSimilarity(edit: LineEdit, page: OrganizedPage): number {
    return calculateTextSimilarity(edit.content, page.content_text);
  }

  private updatePageWithEdit(page: OrganizedPage, edit: LineEdit): OrganizedPage {
    const additionalContent = edit.content;

    // Update both content structures
    const updatedContentText = page.content_text + '\n\n' + additionalContent;
    
    // Add new paragraph to TipTap content
    const newParagraph = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: additionalContent
        }
      ]
    };

    const updatedContent = {
      ...page.content,
      content: [...(page.content?.content || []), newParagraph]
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
          lastEditUpdate: edit.timestamp,
          editUpdates: (page.metadata?.thoughtTracking?.editUpdates || 0) + 1
        }
      }
    };
  }

  private createPageFromEdit(edit: LineEdit): OrganizedPage {
    const content_text = edit.content;

    // Extract potential title from content
    const title = this.extractTitleFromContent(content_text) || 
                  `Notes from ${new Date(edit.timestamp).toLocaleDateString()}`;

    // Create TipTap-compatible content structure
    const content = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          {
            type: "text",
            text: content_text
          }
        ]
      }]
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
          createdFromEdit: true,
          lineId: edit.lineId,
          version: edit.version,
          editTimestamp: edit.timestamp,
          pageId: edit.pageId
        }
      },
      tags: this.extractTagsFromContent(content_text),
      category: this.inferCategoryFromContent(content_text),
    };
  }

  private extractTitleFromContent(content: string): string | null {
    // Try to extract a title from the first line or sentence
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    const firstLine = lines[0].trim();
    
    // If first line is short enough to be a title
    if (firstLine.length <= 100 && firstLine.length > 0) {
      return firstLine;
    }

    // Try to extract first sentence
    const sentences = content.split(/[.!?]+/);
    if (sentences.length > 0 && sentences[0].trim().length <= 100) {
      return sentences[0].trim();
    }

    return null;
  }

  private extractTagsFromContent(content: string): string[] {
    // Simple tag extraction - look for hashtags or common keywords
    const tags: string[] = [];
    
    // Extract hashtags
    const hashtagMatches = content.match(/#\w+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map(tag => tag.substring(1)));
    }

    // Add some basic content-based tags
    const lowerContent = content.toLowerCase();
    const commonTags = [
      'idea', 'note', 'thought', 'todo', 'meeting', 'project', 
      'research', 'question', 'important', 'draft'
    ];

    commonTags.forEach(tag => {
      if (lowerContent.includes(tag)) {
        tags.push(tag);
      }
    });

    return [...new Set(tags)]; // Remove duplicates
  }

  private inferCategoryFromContent(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('meeting') || lowerContent.includes('call')) {
      return 'meetings';
    }
    if (lowerContent.includes('todo') || lowerContent.includes('task')) {
      return 'tasks';
    }
    if (lowerContent.includes('idea') || lowerContent.includes('brainstorm')) {
      return 'ideas';
    }
    if (lowerContent.includes('research') || lowerContent.includes('study')) {
      return 'research';
    }
    if (lowerContent.includes('project')) {
      return 'projects';
    }
    
    return 'general';
  }

  async getOrganizationStats(): Promise<{
    totalOrganizedPages: number;
    lastOrganization: number | null;
    averagePageSize: number;
    cacheVersion: number;
    isOrganizing: boolean;
  }> {
    const pages = await this.storageManager.loadOrganizedPages();
    const organizedPages = pages.filter(page => page.organized);
    
    const averagePageSize = organizedPages.length > 0
      ? organizedPages.reduce((sum, page) => sum + page.content_text.length, 0) / organizedPages.length
      : 0;

    // Try to find the most recent organization timestamp from metadata
    let lastOrganization: number | null = null;
    organizedPages.forEach(page => {
      const timestamp = page.metadata?.thoughtTracking?.editTimestamp;
      if (timestamp && (!lastOrganization || timestamp > lastOrganization)) {
        lastOrganization = timestamp;
      }
    });

    const cacheState = this.cacheManager.getState();

    return {
      totalOrganizedPages: organizedPages.length,
      lastOrganization: cacheState.lastOrganization || lastOrganization,
      averagePageSize,
      cacheVersion: cacheState.cacheVersion,
      isOrganizing: cacheState.isOrganizing,
    };
  }

  updateConfig(newConfig: Partial<OrganizationConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...newConfig };
  }

  updateApiEndpoint(endpoint: string): void {
    this.apiEndpoint = endpoint;
  }

  setUserId(userId: string): void {
    this.userId = userId;
    this.cacheManager.setUserId(userId);
    
    // Update storage manager if it supports it
    if (this.storageManager.setUserId) {
      this.storageManager.setUserId(userId);
    }
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  /**
   * Get the cache manager instance for external access
   */
  getCacheManager(): OrganizationCacheManager {
    return this.cacheManager;
  }

  /**
   * Check if organization is currently in progress
   */
  isOrganizing(): boolean {
    return this.cacheManager.isOrganizing();
  }
} 