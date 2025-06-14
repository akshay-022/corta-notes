/**
 * Enhanced Brain state manager with 1:1 editor synchronization
 */

import { GlobalBrainState, ThoughtObject, ThoughtChange } from './types'

// LocalStorage key
const BRAIN_STATE_KEY = 'corta-brain-state-v2'

/**
 * Generate unique ID for thoughts
 */
function generateThoughtId(): string {
  return `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate content hash for change detection
 */
function generateContentHash(content: string): string {
  // Use a simple hash that works in both browser and Node
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

/**
 * Load brain state from localStorage or create default
 */
function loadBrainStateFromStorage(): GlobalBrainState {
  try {
    if (typeof window === 'undefined') {
      return createEmptyBrainState()
    }

    const savedState = localStorage.getItem(BRAIN_STATE_KEY)
    
    if (savedState) {
      const parsed = JSON.parse(savedState)
      
      // Convert timestamp strings back to Date objects
      if (parsed.currentContext?.timestamp) {
        parsed.currentContext.timestamp = new Date(parsed.currentContext.timestamp)
      }
      
      // Convert thought timestamps
      Object.values(parsed.thoughtsById || {}).forEach((thought: any) => {
        if (thought.lastUpdated) {
          thought.lastUpdated = new Date(thought.lastUpdated)
        }
      })
      
      // Ensure all required properties exist
      const brainState: GlobalBrainState = {
        categories: parsed.categories || {},
        thoughtsById: parsed.thoughtsById || {},
        thoughtsByPage: parsed.thoughtsByPage || {},
        currentContext: parsed.currentContext || { 
          activeThought: '', 
          relatedCategory: '', 
          timestamp: new Date() 
        }
      }
      
      console.log('🧠 Brain state loaded from localStorage:', {
        categories: Object.keys(brainState.categories).length,
        thoughts: Object.keys(brainState.thoughtsById).length,
        pages: Object.keys(brainState.thoughtsByPage).length
      })
      
      return brainState
    }
  } catch (error) {
    console.error('🧠 Error loading brain state from localStorage:', error)
  }
  
  console.log('🧠 Creating fresh brain state')
  return createEmptyBrainState()
}

/**
 * Create empty brain state
 */
function createEmptyBrainState(): GlobalBrainState {
  return {
    categories: {},
    thoughtsById: {},
    thoughtsByPage: {},
    currentContext: { activeThought: '', relatedCategory: '', timestamp: new Date() }
  }
}

/**
 * Save brain state to localStorage
 */
function saveBrainStateToStorage(): void {
  try {
    if (typeof window === 'undefined') return
    
    localStorage.setItem(BRAIN_STATE_KEY, JSON.stringify(globalBrainState))
    console.log('🧠 Brain state saved to localStorage')
  } catch (error) {
    console.error('🧠 Error saving brain state to localStorage:', error)
  }
}

// Global brain state (singleton)
let globalBrainState: GlobalBrainState = loadBrainStateFromStorage()

/**
 * Get current brain state
 */
export function getBrainState(): GlobalBrainState {
  return globalBrainState
}

/**
 * Create a new thought with unique ID
 */
export function createThought(
  content: string, 
  category: string, 
  pageUuid?: string,
  editorPosition?: number,
  paragraphId?: string
): ThoughtObject {
  const thoughtId = generateThoughtId()
  const contentHash = generateContentHash(content)
  
  const thought: ThoughtObject = {
    id: thoughtId,
    content,
    isOrganized: true, // It's being categorized, so it's organized
    editorPosition,
    paragraphId,
    lastUpdated: new Date(),
    isDeleted: false,
    pageUuid
  }
  
  // Add to global state
  globalBrainState.thoughtsById[thoughtId] = thought
  
  // Add to category
  if (!globalBrainState.categories[category]) {
    globalBrainState.categories[category] = []
  }
  globalBrainState.categories[category].push(thought)
  
  // Add to page mapping
  if (pageUuid) {
    if (!globalBrainState.thoughtsByPage[pageUuid]) {
      globalBrainState.thoughtsByPage[pageUuid] = []
    }
    globalBrainState.thoughtsByPage[pageUuid].push(thoughtId)
  }
  
  saveBrainStateToStorage()
  console.log(`🧠 Created thought "${thoughtId}" in category "${category}":`, content.substring(0, 50) + '...')
  
  return thought
}

/**
 * Update an existing thought
 */
export function updateThought(
  thoughtId: string, 
  newContent: string, 
  newCategory?: string
): ThoughtObject | null {
  const thought = globalBrainState.thoughtsById[thoughtId]
  if (!thought) {
    console.error('🧠 Thought not found for update:', thoughtId)
    return null
  }
  
  const oldContent = thought.content
  const oldCategory = findThoughtCategory(thoughtId)
  
  // Update content
  thought.content = newContent
  thought.lastUpdated = new Date()
  
  // Handle category change
  if (newCategory && newCategory !== oldCategory) {
    // Remove from old category
    if (oldCategory) {
      globalBrainState.categories[oldCategory] = globalBrainState.categories[oldCategory]
        .filter(t => t.id !== thoughtId)
      
      // Clean up empty categories
      if (globalBrainState.categories[oldCategory].length === 0) {
        delete globalBrainState.categories[oldCategory]
      }
    }
    
    // Add to new category
    if (!globalBrainState.categories[newCategory]) {
      globalBrainState.categories[newCategory] = []
    }
    globalBrainState.categories[newCategory].push(thought)
  }
  
  saveBrainStateToStorage()
  console.log(`🧠 Updated thought "${thoughtId}":`, {
    oldContent: oldContent.substring(0, 30) + '...',
    newContent: newContent.substring(0, 30) + '...',
    oldCategory,
    newCategory
  })
  
  return thought
}

/**
 * Delete a thought (soft delete)
 */
export function deleteThought(thoughtId: string): boolean {
  const thought = globalBrainState.thoughtsById[thoughtId]
  if (!thought) {
    console.error('🧠 Thought not found for deletion:', thoughtId)
    return false
  }
  
  // Soft delete
  thought.isDeleted = true
  thought.lastUpdated = new Date()
  
  // Remove from category
  const category = findThoughtCategory(thoughtId)
  if (category) {
    globalBrainState.categories[category] = globalBrainState.categories[category]
      .filter(t => t.id !== thoughtId)
    
    // Clean up empty categories
    if (globalBrainState.categories[category].length === 0) {
      delete globalBrainState.categories[category]
    }
  }
  
  // Remove from page mapping
  if (thought.pageUuid) {
    const pageThoughts = globalBrainState.thoughtsByPage[thought.pageUuid]
    if (pageThoughts) {
      globalBrainState.thoughtsByPage[thought.pageUuid] = pageThoughts
        .filter(id => id !== thoughtId)
      
      // Clean up empty page mappings
      if (globalBrainState.thoughtsByPage[thought.pageUuid].length === 0) {
        delete globalBrainState.thoughtsByPage[thought.pageUuid]
      }
    }
  }
  
  saveBrainStateToStorage()
  console.log(`🧠 Deleted thought "${thoughtId}":`, thought.content.substring(0, 50) + '...')
  
  return true
}

/**
 * Find which category a thought belongs to
 */
function findThoughtCategory(thoughtId: string): string | null {
  for (const [category, thoughts] of Object.entries(globalBrainState.categories)) {
    if (thoughts.some(t => t.id === thoughtId)) {
      return category
    }
  }
  return null
}

/**
 * Get thought by ID
 */
export function getThoughtById(thoughtId: string): ThoughtObject | null {
  return globalBrainState.thoughtsById[thoughtId] || null
}

/**
 * Get all thoughts for a page
 */
export function getThoughtsForPage(pageUuid: string): ThoughtObject[] {
  const thoughtIds = globalBrainState.thoughtsByPage[pageUuid] || []
  return thoughtIds
    .map(id => globalBrainState.thoughtsById[id])
    .filter(thought => thought && !thought.isDeleted)
}

/**
 * Sync editor content with brain state for a specific page
 */
export function syncPageWithBrainState(pageUuid: string, editorContent: string): void {
  console.log('🧠 Syncing page with brain state:', pageUuid)
  
  const existingThoughts = getThoughtsForPage(pageUuid)
  const contentLines = editorContent.split('\n').filter(line => line.trim().length > 0)
  
  // Find thoughts that no longer exist in editor
  const thoughtsToDelete = existingThoughts.filter(thought => 
    !contentLines.some(line => line.trim() === thought.content.trim())
  )
  
  // Delete thoughts that are no longer in editor
  thoughtsToDelete.forEach(thought => {
    console.log('🧠 Deleting thought no longer in editor:', thought.content.substring(0, 30) + '...')
    deleteThought(thought.id)
  })
  
  console.log(`🧠 Synced page ${pageUuid}: deleted ${thoughtsToDelete.length} thoughts`)
}

/**
 * Process thought with enhanced tracking (replaces old addThoughtToCategory)
 */
export async function processThought(fullText: string, currentPageUuid?: string): Promise<void> {
  // Check if this exact content already exists
  const existingThought = Object.values(globalBrainState.thoughtsById)
    .find(t => t.content === fullText && !t.isDeleted && t.pageUuid === currentPageUuid)
  
  if (existingThought) {
    console.log('🧠 Thought already exists, skipping processing:', existingThought.id)
    return
  }

  console.log('🧠 Processing new thought:', fullText.substring(0, 50) + '...')
  
  // Categorize the text using LLM
  const category = await categorizeThought(fullText)
  
  // Create new thought
  createThought(fullText, category, currentPageUuid)
  
  console.log('🧠 ✅ Thought processed and organized into category:', category)
}

/**
 * Categorize thought using LLM (unchanged)
 */
async function categorizeThought(content: string): Promise<string> {
  try {
    console.log('🤖 Categorizing thought with LLM...')
    
    const existingCategories = Object.keys(globalBrainState.categories)
    
    const prompt = `You are helping organize thoughts into categories.

Existing categories: ${existingCategories.length > 0 ? existingCategories.join(', ') : 'none yet'}

Thought to categorize: "${content}"

Rules:
1. Use existing categories when the thought fits
2. Create new categories for genuinely different topics
3. Keep category names short and clear (1-2 words)
4. Common categories: motivation, ideas, work, personal, learning, etc.

Return ONLY the category name (no explanation).`

    const response = await fetch('/api/llm', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        prompt: prompt
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const category = data.response?.trim().toLowerCase() || 'general'
    
    console.log('🤖 LLM categorized as:', category)
    return category

  } catch (error) {
    console.error('❌ Error categorizing thought:', error)
    return 'general'
  }
}

/**
 * Get thoughts by category (updated to filter deleted)
 */
export function getThoughtsByCategory(category: string): ThoughtObject[] {
  return (globalBrainState.categories[category] || [])
    .filter(thought => !thought.isDeleted)
}

/**
 * Get all categories (updated to filter empty categories)
 */
export function getAllCategories(): string[] {
  return Object.keys(globalBrainState.categories)
    .filter(category => globalBrainState.categories[category].some(t => !t.isDeleted))
}

/**
 * Clear all stored brain state
 */
export function clearStoredBrainState(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(BRAIN_STATE_KEY)
  }
  globalBrainState = createEmptyBrainState()
  console.log('🧠 Brain state cleared')
}

/**
 * Reset brain state to empty
 */
export function resetBrainState(): void {
  globalBrainState = createEmptyBrainState()
  saveBrainStateToStorage()
  console.log('🧠 Brain state reset')
}

/**
 * Check if thought content exists (updated for new structure)
 */
export function isThoughtInAnyCategory(content: string): boolean {
  return Object.values(globalBrainState.thoughtsById)
    .some(thought => thought.content === content && !thought.isDeleted)
}

/**
 * Get brain state statistics
 */
export function getBrainStateStats() {
  const totalThoughts = Object.values(globalBrainState.thoughtsById)
    .filter(t => !t.isDeleted).length
  const totalCategories = getAllCategories().length
  const totalPages = Object.keys(globalBrainState.thoughtsByPage).length
  
  return {
    totalThoughts,
    totalCategories,
    totalPages,
    categories: getAllCategories().map(cat => ({
      name: cat,
      count: getThoughtsByCategory(cat).length
    }))
  }
}

// Legacy compatibility - keep old function names working
export const addThoughtToCategory = (content: string, category: string) => {
  console.warn('🧠 addThoughtToCategory is deprecated, use createThought instead')
  return createThought(content, category)
}



 