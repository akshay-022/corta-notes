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
You are an intelligent content organizer. Your task is to organize edits into a coherent file structure.

CORE PRINCIPLES:
1. PRESERVE ALL INFORMATION: Never lose any information from the edits. Every piece of content must be preserved.

2. SMART ORGANIZATION STRATEGY:
   - PREFER EXISTING FILES: Always try to add content to existing relevant files first
   - CREATE SPARINGLY: Only create new files/folders when content doesn't fit well into existing structure
   - MAINTAIN COHERENCE: Keep related content together and maintain logical flow

3. DECISION MATRIX FOR ORGANIZATION:
   a) HIGH SIMILARITY (>${this.defaultConfig.maxSimilarityForMerge}): Update existing file
   b) MEDIUM SIMILARITY (${this.defaultConfig.createNewPagesThreshold}-${this.defaultConfig.maxSimilarityForMerge}): 
      - If content enhances existing file: Update existing
      - If content is distinct but related: Consider new file in same folder
   c) LOW SIMILARITY (<${this.defaultConfig.createNewPagesThreshold}): Create new file/folder

4. FILE/FOLDER CREATION GUIDELINES:
   - Create new FOLDERS when content represents a new major topic/project
   - Create new FILES when content is distinct but doesn't warrant a folder
   - Use descriptive, consistent naming conventions
   - Consider hierarchical organization (folders > files)

5. CONTENT INTEGRATION:
   - Don't just append - intelligently integrate content
   - Update existing sections where content fits naturally
   - Create new sections when needed
   - Maintain proper document structure and flow

6. METADATA AND RELATIONSHIPS:
   - Generate appropriate tags for discoverability
   - Set relevant categories
   - Establish parent-child relationships for folders
   - Update titles to accurately reflect content

7. QUALITY ASSURANCE:
   - Ensure all edits are incorporated somewhere
   - Maintain readability and coherent narrative
   - Avoid redundancy but preserve important context
   - Keep related information accessible

RESPONSE FORMAT:
Return a structured response indicating for each edit:
- Whether to update an existing file or create new file/folder
- The target location (path)
- How to integrate the content
- Reasoning for the decision
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
          // Short content - add to general or best match anyway
          const targetPage = bestMatch || this.findOrCreateGeneralPage(existingPages);
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

  private findOrCreateGeneralPage(pages: OrganizedPage[]): OrganizedPage | null {
    // Try to find existing general page
    const generalPage = pages.find(page => 
      page.type === 'file' && 
      page.title.toLowerCase() === 'general' &&
      page.organized === true
    );

    if (generalPage) {
      return generalPage;
    }

    // If no general page exists, return null - it will be handled by the API
    // The API has logic to create the general page when needed
    return null;
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