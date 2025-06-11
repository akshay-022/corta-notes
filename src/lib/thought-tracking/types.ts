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

// SIMPLIFIED: Categories with text + current context
export interface GlobalBrainState {
  categories: {
    [categoryName: string]: string[]
  }
  currentContext: {
    activeThought: string
    relatedCategory: string
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
}

export interface ThoughtProcessingConfig {
  bufferSize: number           // Characters to keep in recent buffer
  processingDelay: number      // MS to wait before processing
  maxCategoriesPerThought: number
  enableRealTimeProcessing: boolean
}

export interface CategoryStats {
  name: string
  thoughtCount: number
  lastActivity: Date
  avgThoughtLength: number
} 