import { LineEdit, OrganizedPage, OrganizationInput, FileTreeNode } from './types';

export class InputProcessor {
  /**
   * Validate and process input data for organization
   */
  validateInput(input: OrganizationInput): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.edits || input.edits.length === 0) {
      errors.push('No edits provided');
    }

    if (!input.pageId) {
      errors.push('Page ID is required');
    }

    if (!input.fullPageContent) {
      errors.push('Full page content is required');
    }

    if (!input.existingFileTree) {
      errors.push('Existing file tree is required');
    }

    // Validate each edit
    input.edits?.forEach((edit, index) => {
      if (!edit.lineId) {
        errors.push(`Edit ${index}: lineId is required`);
      }
      if (!edit.pageId) {
        errors.push(`Edit ${index}: pageId is required`);
      }
      if (edit.content === undefined) {
        errors.push(`Edit ${index}: content is required`);
      }
      if (!['create', 'update', 'delete'].includes(edit.editType)) {
        errors.push(`Edit ${index}: invalid editType ${edit.editType}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Build file tree from organized pages
   */
  buildFileTree(organizedPages: OrganizedPage[]): FileTreeNode[] {
    const pageMap = new Map<string, OrganizedPage>();
    organizedPages.forEach(page => pageMap.set(page.uuid, page));

    const buildHierarchy = (parentUuid: string | null = null): FileTreeNode[] => {
      return organizedPages
        .filter(page => page.parent_uuid === parentUuid)
        .map(page => {
          const node: FileTreeNode = {
            uuid: page.uuid,
            title: page.title,
            type: page.type,
            path: this.getFullPath(page, organizedPages),
            parent_uuid: page.parent_uuid,
            contentPreview: page.content_text?.substring(0, 200)
          };

          if (page.type === 'folder') {
            node.children = buildHierarchy(page.uuid);
          }

          return node;
        });
    };

    return buildHierarchy();
  }

  /**
   * Get full path for a page
   */
  private getFullPath(page: OrganizedPage, allPages: OrganizedPage[]): string {
    const path: string[] = [];
    let currentPage: OrganizedPage | null = page;

    while (currentPage) {
      path.unshift(currentPage.title);
      
      if (currentPage.parent_uuid) {
        currentPage = allPages.find(p => p.uuid === currentPage!.parent_uuid) || null;
      } else {
        currentPage = null;
      }
    }

    return '/' + path.join('/');
  }

  /**
   * Prepare context for LLM
   */
  prepareLLMContext(input: OrganizationInput): {
    editsContext: string;
    fileTreeContext: string;
    pageContext: string;
  } {
    const editsContext = input.edits.map((edit, index) => 
      `${index + 1}. Paragraph ID: ${edit.lineId}
         Content: "${edit.content}"
         Type: ${edit.editType}`
    ).join('\n\n');

    const fileTreeContext = this.serializeFileTree(input.existingFileTree);

    const pageContext = `
Current Page ID: ${input.pageId}
Full Page Content Preview: ${input.fullPageContent.substring(0, 500)}${input.fullPageContent.length > 500 ? '...' : ''}
Page Length: ${input.fullPageContent.length} characters
`;

    return {
      editsContext,
      fileTreeContext,
      pageContext
    };
  }
  /**
   * Serialize file tree for LLM context
   */
  private serializeFileTree(nodes: FileTreeNode[], level: number = 0): string {
    const indent = '  '.repeat(level);
    return nodes.map(node => {
      const prefix = node.type === 'folder' ? '[DIR]' : '[FILE]';
      const result = `${indent}${prefix} ${node.title}`;
      
      if (node.children && node.children.length > 0) {
        return result + '\n' + this.serializeFileTree(node.children, level + 1);
      }
      
      return result;
    }).join('\n');
  }
} 