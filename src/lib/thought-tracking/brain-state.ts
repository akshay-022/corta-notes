/**
 * SIMPLIFIED Brain state manager - just categories with arrays of text
 */

import { GlobalBrainState, ThoughtObject } from './types'

// LocalStorage key
const BRAIN_STATE_KEY = 'corta-brain-state-simple'

/**
 * Load brain state from localStorage or create default
 */
function loadBrainStateFromStorage(): GlobalBrainState {
  try {
    if (typeof window === 'undefined') {
      return {
        categories: {},
        currentContext: { activeThought: '', relatedCategory: '', timestamp: new Date() }
      }
    }

    const savedState = localStorage.getItem(BRAIN_STATE_KEY)
    
    if (savedState) {
      const parsed = JSON.parse(savedState)
      // Convert timestamp string back to Date
      if (parsed.currentContext?.timestamp) {
        parsed.currentContext.timestamp = new Date(parsed.currentContext.timestamp)
      }
      console.log('🧠 Brain state loaded from localStorage:', Object.keys(parsed.categories || {}))
      return parsed
    }
  } catch (error) {
    console.error('🧠 Error loading brain state from localStorage:', error)
  }
  
  console.log('🧠 Creating fresh brain state')
  return {
    categories: {},
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
 * Add text to a category
 */
export function addThoughtToCategory(content: string, category: string): void {
  console.log('🧠 Adding thought to category:', content, 'in category:', category)
  // Initialize category if it doesn't exist
  if (!globalBrainState.categories[category]) {
    globalBrainState.categories[category] = []
    console.log('🧠 New category created:', category)
  }
  
  // Add text to category (avoid duplicates)
  if (!globalBrainState.categories[category].some(t => t.content === content)) {
    globalBrainState.categories[category].push({
      content,
      isOrganized: false
    })
    
    // Update current context with timestamp
    globalBrainState.currentContext = {
      activeThought: content,
      relatedCategory: category,
      timestamp: new Date()
    }
    
    saveBrainStateToStorage()
    console.log(`🧠 Added to "${category}":`, content.substring(0, 50) + '...')
  }
}

/**
 * Process thoughts for organization
 */
export async function processThought(fullText: string, currentPageUuid?: string): Promise<void> {
  console.log('🧠 Processing text:', fullText.substring(0, 50) + '...')
  
  // Categorize the text using LLM
  const category = await categorizeThought(fullText)

  console.log('🧠 Category:', category, fullText)
  
  // Add to brain state
  addThoughtToCategory(fullText, category)
  
  console.log('🧠 ✅ Text organized into category:', category)
}

/**
 * Categorize thought using LLM
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
 * Get thoughts by category
 */
export function getThoughtsByCategory(category: string): ThoughtObject[] {
  return globalBrainState.categories[category] || []
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  return Object.keys(globalBrainState.categories)
}

/**
 * Clear all stored brain state
 */
export function clearStoredBrainState(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(BRAIN_STATE_KEY)
  }
  globalBrainState = {
    categories: {},
    currentContext: { activeThought: '', relatedCategory: '', timestamp: new Date() }
  }
  console.log('🧠 Brain state cleared')
}

/**
 * Reset brain state to empty
 */
export function resetBrainState(): void {
  globalBrainState = {
    categories: {},
    currentContext: { activeThought: '', relatedCategory: '', timestamp: new Date() }
  }
  saveBrainStateToStorage()
  console.log('🧠 Brain state reset')
}

 