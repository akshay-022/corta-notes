import { 
  OrganizationInput, 
  OrganizationResult, 
  LLMOrganizationResponse,
  LineEdit,
  OrganizedPage,
  FileTreeNode
} from './types';
import { StorageManager } from '../../types';
import { InputProcessor } from './inputProcessor';
import { LLMInterface } from './llmInterface';
import { FilePathValidator } from './filePathValidator';
import { ContentProcessor } from './contentProcessor';

export class OrganizationOrchestrator {
  private inputProcessor: InputProcessor;
  private llmInterface: LLMInterface;
  private filePathValidator: FilePathValidator;
  private contentProcessor: ContentProcessor;
  private storageManager: StorageManager;

  constructor(userId: string, openAIKey: string, storageManager: StorageManager) {
    this.inputProcessor = new InputProcessor();
    this.llmInterface = new LLMInterface(openAIKey);
    this.filePathValidator = new FilePathValidator();
    this.contentProcessor = new ContentProcessor();
    this.storageManager = storageManager;
  }

  /**
   * Main orchestration method - returns organization plan without database operations
   */
  async organizeContent(input: OrganizationInput): Promise<OrganizationResult> {
    try {
      // Step 1: Validate input
      const validation = this.inputProcessor.validateInput(input);
      if (!validation.isValid) {
        return {
          updatedPages: [],
          newPages: [],
          summary: `Input validation failed: ${validation.errors.join(', ')}`,
          processedEditIds: [],
          errors: validation.errors
        };
      }

      // Step 2: Get LLM recommendations
      const llmResponse = await this.llmInterface.getOrganizationRecommendations(input);
      
      // Step 3: Validate file path
      const pathValidation = this.validateAndPreparePath(llmResponse, input.existingFileTree);
      if (!pathValidation.isValid) {
        return {
          updatedPages: [],
          newPages: [],
          summary: `Path validation failed: ${pathValidation.error}`,
          processedEditIds: [],
          errors: [pathValidation.error!]
        };
      }

      // Step 4: Process content refinements
      const contentResult = this.contentProcessor.applyRefinements(
        input.fullPageContent,
        llmResponse.refinements,
        input.edits
      );

      if (contentResult.errors.length > 0) {
        console.warn('Content processing warnings:', contentResult.errors);
      }

      // Step 5: Build organization plan (no database operations)
      const organizationPlan = await this.buildOrganizationPlan(
        llmResponse,
        contentResult.refinedContent,
        input.edits,
        pathValidation.parentUuid,
        input.existingFileTree
      );

      // Step 6: Build and return result
      return this.buildResult(organizationPlan, input.edits, llmResponse.reasoning);

    } catch (error) {
      console.error('Organization orchestration error:', error);
      return {
        updatedPages: [],
        newPages: [],
        summary: `Organization failed: ${error}`,
        processedEditIds: [],
        errors: [String(error)]
      };
    }
  }

  /**
   * Validate and prepare the target path
   */
  private validateAndPreparePath(
    llmResponse: LLMOrganizationResponse,
    fileTree: any[]
  ): { isValid: boolean; error?: string; parentUuid?: string } {
    // Validate basic path format
    const pathValidation = this.filePathValidator.validateFilePath(llmResponse.targetFilePath);
    if (!pathValidation.isValid) {
      return {
        isValid: false,
        error: `Invalid file path: ${pathValidation.errors.join(', ')}`
      };
    }

    // Check if we're creating a new file
    if (llmResponse.shouldCreateNewFile) {
      const parentValidation = this.filePathValidator.validateParentFolderExists(
        llmResponse.targetFilePath,
        fileTree
      );
      
      if (!parentValidation.isValid) {
        return {
          isValid: false,
          error: parentValidation.error
        };
      }

      // Find parent UUID if needed
      let parentUuid: string | undefined;
      if (parentValidation.parentPath) {
        const parentNode = this.filePathValidator.findNodeByPath(parentValidation.parentPath, fileTree);
        parentUuid = parentNode?.uuid;
      }

      return { isValid: true, parentUuid };
    }

    // Check if existing path exists
    if (!this.filePathValidator.pathExists(llmResponse.targetFilePath, fileTree)) {
      return {
        isValid: false,
        error: `Target file does not exist: ${llmResponse.targetFilePath}`
      };
    }

    return { isValid: true };
  }

  /**
   * Build organization plan without executing database operations
   */
  private async buildOrganizationPlan(
    llmResponse: LLMOrganizationResponse,
    refinedContent: string,
    edits: LineEdit[],
    parentUuid?: string,
    fileTree?: any[]
  ): Promise<{ targetPage: OrganizedPage | null; isNewPage: boolean }> {
    const fileName = this.filePathValidator.getFileName(llmResponse.targetFilePath);
    
    if (llmResponse.shouldCreateNewFile) {
      // Plan to create new file - return the planned page structure
      const tipTapContent = this.contentProcessor.createTipTapContent(refinedContent);
      const plannedPage: OrganizedPage = {
        uuid: '', // Will be generated during actual creation
        title: fileName,
        content: tipTapContent,
        content_text: refinedContent,
        organized: true,
        type: 'file',
        parent_uuid: parentUuid,
        visible: true,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          createdFromOrganization: true,
          organizationTimestamp: new Date().toISOString(),
          sourceParagraphs: edits.map(edit => ({
            pageId: edit.pageId,
            paragraphId: edit.lineId
          }))
        }
      };
      
      return { targetPage: plannedPage, isNewPage: true };
    } else {
      // Plan to update existing file - find the existing page and plan the update
      const existingPage = await this.findPageByPath(llmResponse.targetFilePath, fileTree || []);
      
      if (!existingPage) {
        throw new Error(`Could not find existing page: ${llmResponse.targetFilePath}`);
      }

      // Plan content merge
      const mergedContent = this.contentProcessor.mergeIntoTipTapContent(
        existingPage.content,
        refinedContent
      );
      const mergedText = existingPage.content_text + '\n\n' + refinedContent;
      
      const plannedPage: OrganizedPage = {
        ...existingPage,
        content: mergedContent,
        content_text: mergedText,
        updated_at: new Date().toISOString(),
        metadata: {
          ...existingPage.metadata,
          lastOrganizationUpdate: new Date().toISOString(),
          sourceParagraphs: [
            ...(existingPage.metadata?.sourceParagraphs || []),
            ...edits.map(edit => ({
              pageId: edit.pageId,
              paragraphId: edit.lineId
            }))
          ]
        }
      };
      
      return { targetPage: plannedPage, isNewPage: false };
    }
  }

  /**
   * Find page by path in the file tree and load the full organized page
   */
  private async findPageByPath(filePath: string, fileTree: FileTreeNode[]): Promise<OrganizedPage | null> {
    // Build path map using the existing path property
    const pathMap = new Map<string, any>();
    
    const buildPathMap = (nodes: FileTreeNode[]) => {
      nodes.forEach(node => {
        // Use the existing path property directly
        if (node.path) {
          pathMap.set(node.path, node);
        }
        
        if (node.children && node.children.length > 0) {
          buildPathMap(node.children);
        }
      });
    };

    buildPathMap(fileTree);
    const node = pathMap.get(filePath);
    
    if (node && node.type === 'file' && node.uuid) {
      // Load the full organized page from storage
      try {
        const fullPage = await this.storageManager.getPageByUuid(node.uuid);
        if (fullPage) {
          // Convert from main types to organization types
          return this.convertToOrganizationPage(fullPage);
        }
      } catch (error) {
        console.error(`Error loading page by UUID ${node.uuid}:`, error);
      }
      // Fallback: convert file tree node to OrganizedPage format if loading fails
      return node as OrganizedPage;
    }
    
    return null;
  }

  /**
   * Convert from main StorageManager OrganizedPage type to organization OrganizedPage type
   */
  private convertToOrganizationPage(page: import('../../types').OrganizedPage): OrganizedPage {
    return {
      uuid: page.uuid,
      title: page.title,
      content: page.content,
      content_text: page.content_text,
      organized: page.organized,
      type: page.type || 'file', // Default to 'file' if undefined
      parent_uuid: page.parent_uuid,
      emoji: page.emoji,
      description: page.description,
      tags: page.tags,
      category: page.category,
      created_at: page.created_at,
      updated_at: page.updated_at,
      visible: page.visible,
      is_deleted: page.is_deleted,
      metadata: page.metadata
    };
  }

  /**
   * Build the final result from the organization plan
   */
  private buildResult(
    organizationPlan: { targetPage: OrganizedPage | null; isNewPage: boolean },
    edits: LineEdit[],
    reasoning: string
  ): OrganizationResult {
    const processedEditIds = edits.map(edit => `${edit.lineId}-v${edit.version}`);
    
    if (!organizationPlan.targetPage) {
      return {
        updatedPages: [],
        newPages: [],
        summary: `Organization failed: ${reasoning}`,
        processedEditIds,
        errors: ['No target page determined']
      };
    }

    if (organizationPlan.isNewPage) {
      return {
        updatedPages: [],
        newPages: [organizationPlan.targetPage],
        summary: `Created new file: ${organizationPlan.targetPage.title}. ${reasoning}`,
        processedEditIds
      };
    } else {
      return {
        updatedPages: [organizationPlan.targetPage],
        newPages: [],
        summary: `Updated existing file: ${organizationPlan.targetPage.title}. ${reasoning}`,
        processedEditIds
      };
    }
  }
} 