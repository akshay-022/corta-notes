/**
 * Core types for the thought tracking system
 */

export interface ThoughtEntry {
  id: string
  content: string
  timestamp: Date
  category: string
  relatedDocs: string[]
  metadata?: Record<string, any>
}

// Enhanced ThoughtObject with unique ID and editor tracking
export interface ThoughtObject {
  id: string                    // Unique identifier for the thought
  content: string              // The actual thought content
  isOrganized: boolean         // Whether it's been organized
  organizedPath?: string       // Path where the thought was organized (e.g., "Projects/AI/Notes.md")
  organizedNoteId?: string     // UUID of the organized note
  organizationReasoning?: string // AI reasoning for why it was organized this way
  organizedAt?: Date           // When it was organized
  editorPosition?: number      // Position in the editor (if still present)
  paragraphId?: string         // Link to paragraph metadata
  lastUpdated: Date           // When this thought was last modified
  isDeleted: boolean          // Soft delete flag
  pageUuid?: string           // Which page this thought belongs to
}

export interface GlobalBrainState {
  categories: {
    [categoryName: string]: ThoughtObject[]
  }
  // Map of thought ID to thought for quick lookups
  thoughtsById: {
    [thoughtId: string]: ThoughtObject
  }
  // Map of page UUID to thought IDs for page-level operations
  thoughtsByPage: {
    [pageUuid: string]: string[]
  }
  currentContext: {
    activeThought: string
    relatedCategory: string
    timestamp: Date
  }
}

export interface ParagraphMetadata {
  // Brain activity tracking
  brainActivity: string[]       // ["product-planning", "feature-ideas"]
  
  // Document mapping  
  mappedDocs: string[]         // ["product-roadmap.md", "feature-specs.md"]
  
  // Temporal tracking
  lastUpdated: Date
  thoughtTimestamp: Date
  
  // Processing status
  status: 'unprocessed' | 'organizing' | 'organized' | 'archived'
  actionTaken: string          // "sent to product category"
  sentToCategory: string       // "product"
  
  // NEW: Bidirectional sync
  thoughtId?: string           // Link to brain state thought
  contentHash?: string         // Hash of content for change detection
}

export interface ThoughtProcessingConfig {
  bufferSize: number           // Characters to keep in recent buffer
  processingDelay: number      // MS to wait before processing
  maxCategoriesPerThought: number
  enableRealTimeProcessing: boolean
}

export interface AutoOrganizationConfig {
  enabled: boolean
  threshold: number
  debounceMs: number
  currentPageUuid: string
  fileTree: any[]
}

export interface CategoryStats {
  name: string
  thoughtCount: number
  lastActivity: Date
  avgThoughtLength: number
}

// NEW: Change tracking for synchronization
export interface ThoughtChange {
  type: 'create' | 'update' | 'delete' | 'move'
  thoughtId: string
  oldContent?: string
  newContent?: string
  oldCategory?: string
  newCategory?: string
  timestamp: Date
  pageUuid?: string
} 