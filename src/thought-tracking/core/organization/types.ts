// Core types for the new organization system

export interface LineEdit {
  lineId: string; // Unique identifier for the line (paragraph metadata ID)
  pageId: string; // Page UUID from Supabase
  content: string; // Current content of the line
  timestamp: number; // When this version was created
  organized: boolean; // Whether this version has been organized
  version: number; // Version number for this line
  editType: 'create' | 'update' | 'delete';
  metadata?: {
    wordCount: number;
    charCount: number;
    position?: number;
  };
  paragraphMetadata?: ParagraphMetadata;
}

export interface ParagraphMetadata {
  id?: string;
  lastUpdated?: string;
  organizationStatus?: 'yes' | 'no';
  whereOrganized?: Array<{
    filePath: string;
    organizedAt?: string;
  }>;
  isOrganized?: boolean;
  [key: string]: any;
}

export interface OrganizedPage {
  uuid: string;
  title: string;
  content: any; // TipTap JSON
  content_text: string;
  organized: boolean;
  type: 'file' | 'folder';
  parent_uuid?: string;
  emoji?: string;
  description?: string;
  tags?: string[];
  category?: string;
  updated_at?: string;
  created_at?: string;
  visible?: boolean;
  is_deleted?: boolean;
  metadata?: any;
}

export interface FileTreeNode {
  uuid: string;
  title: string;
  type: 'file' | 'folder';
  path: string;
  parent_uuid?: string;
  children?: FileTreeNode[];
  contentPreview?: string;
}

export interface OrganizationInput {
  edits: LineEdit[];
  fullPageContent: string;
  pageId: string;
  existingFileTree: FileTreeNode[];
}

export interface RefinementItem {
  paragraphId: string;
  originalContent: string;
  refinedContent: string;
}

export interface LLMOrganizationResponse {
  targetFilePath: string;
  shouldCreateNewFile: boolean;
  shouldCreateNewFolder: boolean;
  parentFolderPath?: string;
  refinements: RefinementItem[];
  reasoning: string;
}

export interface OrganizationResult {
  updatedPages: OrganizedPage[];
  newPages: OrganizedPage[];
  summary: string;
  processedEditIds: string[];
  errors?: string[];
}

export interface DatabasePage {
  uuid: string;
  user_id: string;
  title: string;
  content: any;
  content_text: string;
  emoji?: string;
  description?: string;
  parent_uuid?: string;
  type: 'file' | 'folder';
  organized: boolean;
  visible: boolean;
  is_deleted: boolean;
  metadata: any;
  created_at: string;
  updated_at: string;
} 