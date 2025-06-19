import { FileTreeNode, OrganizedPage } from './types';

export class FilePathValidator {
  /**
   * Validate if a file path is valid and properly formatted
   */
  validateFilePath(filePath: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!filePath) {
      errors.push('File path cannot be empty');
      return { isValid: false, errors };
    }

    if (!filePath.startsWith('/')) {
      errors.push('File path must start with /');
    }

    if (filePath.includes('//')) {
      errors.push('File path cannot contain double slashes');
    }

    if (filePath.includes('..')) {
      errors.push('File path cannot contain relative path references (..)');
    }

    const pathParts = filePath.split('/').filter(part => part.length > 0);
    
    for (const part of pathParts) {
      if (!/^[a-zA-Z0-9\s\-_\.]+$/.test(part)) {
        errors.push(`Invalid characters in path segment: ${part}`);
      }
      
      if (part.length > 100) {
        errors.push(`Path segment too long: ${part}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a file path exists in the current file tree
   */
  pathExists(filePath: string, fileTree: FileTreeNode[]): boolean {
    return this.findNodeByPath(filePath, fileTree) !== null;
  }

  /**
   * Find a node by its path
   */
  findNodeByPath(filePath: string, fileTree: FileTreeNode[]): FileTreeNode | null {
    for (const node of fileTree) {
      if (node.path === filePath) {
        return node;
      }
      
      if (node.children) {
        const found = this.findNodeByPath(filePath, node.children);
        if (found) return found;
      }
    }
    
    return null;
  }

  /**
   * Get parent path from a file path
   */
  getParentPath(filePath: string): string | null {
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    
    if (pathParts.length <= 1) {
      return null; // Root level
    }
    
    pathParts.pop(); // Remove the last part
    return '/' + pathParts.join('/');
  }

  /**
   * Get file name from path
   */
  getFileName(filePath: string): string {
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    return pathParts[pathParts.length - 1] || '';
  }

  /**
   * Validate parent folder exists for new file creation
   */
  validateParentFolderExists(
    filePath: string, 
    fileTree: FileTreeNode[]
  ): { isValid: boolean; parentPath: string | null; error?: string } {
    const parentPath = this.getParentPath(filePath);
    
    if (!parentPath) {
      // Root level is always valid
      return { isValid: true, parentPath: null };
    }

    const parentNode = this.findNodeByPath(parentPath, fileTree);
    
    if (!parentNode) {
      return {
        isValid: false,
        parentPath,
        error: `Parent folder does not exist: ${parentPath}`
      };
    }

    if (parentNode.type !== 'folder') {
      return {
        isValid: false,
        parentPath,
        error: `Parent path is not a folder: ${parentPath}`
      };
    }

    return { isValid: true, parentPath };
  }

  /**
   * Generate a unique file path if the target path already exists
   */
  generateUniqueFilePath(filePath: string, fileTree: FileTreeNode[]): string {
    if (!this.pathExists(filePath, fileTree)) {
      return filePath;
    }

    const pathParts = filePath.split('/').filter(part => part.length > 0);
    const fileName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1).join('/');
    const basePath = parentPath ? `/${parentPath}` : '';

    // Try adding numbers to make it unique
    for (let i = 2; i <= 100; i++) {
      const newFileName = `${fileName} (${i})`;
      const newFilePath = `${basePath}/${newFileName}`;
      
      if (!this.pathExists(newFilePath, fileTree)) {
        return newFilePath;
      }
    }

    // Fallback: add timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${basePath}/${fileName}-${timestamp}`;
  }

  /**
   * Sanitize a file path to make it valid
   */
  sanitizeFilePath(filePath: string): string {
    // Remove invalid characters
    let sanitized = filePath.replace(/[<>:"|?*]/g, '');
    
    // Ensure it starts with /
    if (!sanitized.startsWith('/')) {
      sanitized = '/' + sanitized;
    }
    
    // Remove double slashes
    sanitized = sanitized.replace(/\/+/g, '/');
    
    // Trim whitespace from path segments
    const parts = sanitized.split('/').map(part => part.trim()).filter(part => part.length > 0);
    
    return '/' + parts.join('/');
  }
} 