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

// Line-based tracking types
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

export interface BrainState {
  lineMap: LineMap;
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

  /**
   * OPTIONAL – when the organizer creates / updates this page it should list the
   * paragraph edits that were merged into it so the client can quickly map
   * sources → destination without digging through metadata.
   * Each entry contains the originating page uuid and the paragraphId (and
   * optionally the editId if the LLM includes it).
   */
  sourceParagraphs?: Array<{
    pageId: string;        // uuid of the page where the paragraph came from
    paragraphId: string;   // id of the paragraph in that page
  }>;
}

export interface OrganizationRequest {
  edits: LineEdit[]; // Line edits to organize
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
  loadUnorganizedPages(): Promise<OrganizedPage[]>;
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