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

export interface GlobalBrainState {
  // Real-time typing buffer
  recentBuffer: {
    text: string              // Last 600 characters typed
    paragraphs: string[]      // Recent paragraphs in order
    timestamp: Date
  }
  
  // Organized thought categories (auto-discovered + predefined)
  thoughtCategories: {
    [category: string]: ThoughtEntry[]
  }
  
  // Current mental context
  currentContext: {
    activeThought: string
    relatedCategory: string
    momentum: 'building' | 'switching' | 'concluding'
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