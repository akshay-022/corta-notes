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

    return await response.json();
  }

  private getOrganizationInstructions(): string {
    return `
You are an intelligent content organizer. Your task is to:

1. PRESERVE ALL INFORMATION: Never lose any information from the edits. Every piece of content must be preserved.

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
   - Update existing pages when content is highly related (similarity > ${this.defaultConfig.maxSimilarityForMerge})
   - Create new pages when content is sufficiently different (similarity < ${this.defaultConfig.createNewPagesThreshold})
   - For medium similarity (${this.defaultConfig.createNewPagesThreshold}-${this.defaultConfig.maxSimilarityForMerge}), use judgment based on content coherence

5. METADATA:
   - Generate appropriate tags for discoverability
   - Set relevant categories
   - Establish relationships between pages
   - Update titles to reflect content accurately

6. QUALITY ASSURANCE:
   - Ensure all information from edits is incorporated
   - Maintain readability and flow
   - Check for redundancy and consolidate when appropriate
   - Preserve important timestamps and context
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
      
      if (bestMatch && this.calculateSimilarity(edit, bestMatch) > this.defaultConfig.createNewPagesThreshold) {
        // Update existing page
        const updatedPage = this.updatePageWithEdit(bestMatch, edit);
        updatedPages.push(updatedPage);
      } else {
        // Create new page
        const newPage = this.createPageFromEdit(edit);
        newPages.push(newPage);
      }
    }

    return {
      updatedPages,
      newPages,
      summary: `Fallback organization: ${updatedPages.length} pages updated, ${newPages.length} pages created`,
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