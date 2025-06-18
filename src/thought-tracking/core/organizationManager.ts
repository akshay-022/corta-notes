import { 
  ParagraphEdit,
  OrganizedPage, 
  OrganizationRequest, 
  OrganizationResult, 
  OrganizationConfig, 
  StorageManager 
} from '../types';
import { calculateTextSimilarity, generateId } from '../utils/helpers';
import { ORGANIZATION_DEFAULTS, API_ENDPOINTS } from '../constants';

export class OrganizationManager {
  private storageManager: StorageManager;
  private apiEndpoint: string;
  private defaultConfig: OrganizationConfig;

  constructor(
    storageManager: StorageManager, 
    apiEndpoint: string = API_ENDPOINTS.ORGANIZATION
  ) {
    this.storageManager = storageManager;
    this.apiEndpoint = apiEndpoint;
    this.defaultConfig = ORGANIZATION_DEFAULTS;
  }

  async organizeContent(edits: ParagraphEdit[]): Promise<OrganizationResult> {
    if (edits.length === 0) {
      return {
        updatedPages: [],
        newPages: [],
        summary: 'No edits to organize',
        processedEditIds: [],
      };
    }

    try {
      // Load existing organized pages
      const existingPages = await this.storageManager.loadOrganizedPages();
      
      // Prepare organization request
      const request = this.prepareOrganizationRequest(edits, existingPages);
      
      // Call organization API
      const result = await this.callOrganizationAPI(request);
      
      // Process and save results
      await this.processOrganizationResult(result);
      
      return result;
    } catch (error) {
      console.error('Error organizing content:', error);
      
      // Fallback organization
      return this.performFallbackOrganization(edits);
    }
  }

  private prepareOrganizationRequest(
    edits: ParagraphEdit[], 
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
    
    // Post notification message to window if organization was successful
    if (result.notification && typeof window !== 'undefined') {
      window.postMessage({
        type: 'ORGANIZATION_NOTIFICATION',
        data: result.notification
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
    // Save updated and new pages
    const existingPages = await this.storageManager.loadOrganizedPages();
    const allPages = this.mergePages(existingPages, result.updatedPages, result.newPages);
    
    await this.storageManager.saveOrganizedPages(allPages);
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

  private async performFallbackOrganization(edits: ParagraphEdit[]): Promise<OrganizationResult> {
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

    return {
      updatedPages,
      newPages,
      summary: `Fallback organization: ${updatedPages.length} pages updated, ${newPages.length} pages created (prioritized existing files)`,
      processedEditIds: edits.map(e => e.id),
    };
  }

  private findBestPageMatch(edit: ParagraphEdit, pages: OrganizedPage[]): OrganizedPage | null {
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

  private calculateSimilarity(edit: ParagraphEdit, page: OrganizedPage): number {
    return calculateTextSimilarity(edit.content, page.content_text);
  }

  private updatePageWithEdit(page: OrganizedPage, edit: ParagraphEdit): OrganizedPage {
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

  private createPageFromEdit(edit: ParagraphEdit): OrganizedPage {
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
          editId: edit.id,
          editTimestamp: edit.timestamp,
          pageId: edit.pageId,
          paragraphId: edit.paragraphId
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

    return {
      totalOrganizedPages: organizedPages.length,
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