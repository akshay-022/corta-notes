// Core types for the thought-tracking system

export interface ParagraphEdit {
  id: string;
  paragraphId: string; // Unique identifier for the paragraph/line
  pageId: string; // This will be the page UUID from Supabase
  content: string; // Latest content state - empty string "" for delete
  timestamp: number;
  editType: 'create' | 'update' | 'delete';
  organized?: boolean; // Mark if this edit has been organized
  metadata?: {
    wordCount: number;
    charCount: number;
  };
}

export interface BrainState {
  edits: ParagraphEdit[];
  summary: string;
  lastUpdated: number;
  config: BrainStateConfig;
}

export interface BrainStateConfig {
  maxEditsBeforeOrganization: number; // Default 20 - trigger organization when exceeded
  numEditsToOrganize: number; // Default 5 - how many edits to organize at once
  summaryUpdateFrequency: number; // How often to update summary (optional)
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