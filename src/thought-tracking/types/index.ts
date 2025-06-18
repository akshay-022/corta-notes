// Core types for the thought-tracking system

// Import paragraph metadata type
export interface ParagraphMetadata {
  id?: string
  lastUpdated?: string
  organizationStatus?: 'yes' | 'no'
  whereOrganized?: Array<{
    filePath: string
    paragraphId: string
    summary_stored?: string
  }>
  isOrganized?: boolean
  [key: string]: any // Allow custom metadata fields
}

// New line-based tracking types
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
    position?: number; // Editor position where the paragraph is located
  };
  paragraphMetadata?: ParagraphMetadata; // Store the full paragraph metadata
}

export interface LineMap {
  [lineId: string]: LineEdit[];
}

// Legacy ParagraphEdit - keeping for backward compatibility
export interface ParagraphEdit {
  id: string;
  paragraphId: string; // This will now be the actual paragraph metadata ID from the editor
  pageId: string; // This will be the page UUID from Supabase
  content: string; // Latest content state - empty string "" for delete
  timestamp: number;
  editType: 'create' | 'update' | 'delete';
  organized?: boolean; // Mark if this edit has been organized
  paragraphMetadata?: ParagraphMetadata; // Store the full paragraph metadata
  metadata?: {
    wordCount: number;
    charCount: number;
    position?: number; // Editor position where the paragraph is located
  };
}

export interface BrainState {
  // New line-based system
  lineMap: LineMap;
  // Legacy system - keeping for backward compatibility
  edits: ParagraphEdit[];
  summary: string;
  lastUpdated: number;
  config: BrainStateConfig;
}

export interface BrainStateConfig {
  maxEditsBeforeOrganization: number; // Default 20 - trigger organization when exceeded
  numEditsToOrganize: number; // Default 5 - how many edits to organize at once
  summaryUpdateFrequency: number; // How often to update summary (optional)
  useLineMappingSystem: boolean; // Whether to use the new line mapping system
}

// Updated to match Supabase schema
export interface OrganizedPage {
  id?: number; // bigserial from database
  uuid: string; // Primary identifier
  user_id?: string;
  title: string;
  content: any; // JSONB content (TipTap format)
  content_text: string; // Plain text version
  emoji?: string;
  description?: string;
  parent_uuid?: string;
  is_deleted?: boolean;
  is_published?: boolean;
  is_locked?: boolean;
  metadata?: any; // JSONB metadata
  created_at?: string;
  updated_at?: string;
  type?: 'file' | 'folder';
  organized: boolean; // This is the key field we use
  visible?: boolean;
  // Additional fields for our system
  tags?: string[];
  category?: string;
  relatedPages?: string[];
}

export interface OrganizationRequest {
  edits: ParagraphEdit[]; // Changed from cacheEntries to edits
  currentSummary: string;
  existingPages: OrganizedPage[];
  config: OrganizationConfig;
}

export interface OrganizationConfig {
  preserveAllInformation: boolean;
  createNewPagesThreshold: number;
  maxSimilarityForMerge: number;
  contextWindowSize: number;
}

export interface OrganizationResult {
  updatedPages: OrganizedPage[];
  newPages: OrganizedPage[];
  summary: string;
  processedEditIds: string[]; // Changed from processedCacheIds
}

export interface StorageManager {
  saveBrainState(state: BrainState): Promise<void>;
  loadBrainState(): Promise<BrainState | null>;
  saveOrganizedPages(pages: OrganizedPage[]): Promise<void>;
  loadOrganizedPages(): Promise<OrganizedPage[]>;
  getPageByUuid(uuid: string): Promise<OrganizedPage | null>;
  setUserId?(userId: string): void;
  getUserId?(): string | undefined;
}

// Supabase-specific types
export interface SupabaseStorageConfig {
  tableName?: string;
  brainStateKey?: string;
}

// Database row type for pages
export interface DatabasePage {
  id: number;
  uuid: string;
  user_id: string | null;
  title: string;
  content: any;
  content_text: string;
  emoji: string | null;
  description: string | null;
  parent_uuid: string | null;
  is_deleted: boolean | null;
  is_published: boolean | null;
  is_locked: boolean | null;
  metadata: any;
  created_at: string | null;
  updated_at: string | null;
  type: string;
  organized: boolean;
  visible: boolean;
} 