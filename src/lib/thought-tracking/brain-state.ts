/**
 * Brain state manager - the core of the thought tracking system
 */

import { GlobalBrainState, ThoughtEntry, ParagraphMetadata } from './types'
import { DEFAULT_CONFIG } from './constants'
import { detectEmptyLine, generateId, updateRecentBuffer, extractLastParagraph } from './utils'
import { getUnprocessedParagraphs, markParagraphAsProcessing, markParagraphAsProcessed } from './paragraph-metadata'

// LocalStorage keys
const BRAIN_STATE_KEY = 'corta-brain-state'
const BUFFER_KEY = 'corta-recent-buffer'

/**
 * Load brain state from localStorage or create default
 */
function loadBrainStateFromStorage(): GlobalBrainState {
  try {
    if (typeof window === 'undefined') {
      // Server-side rendering - return default state
      return createDefaultBrainState()
    }

    const savedState = localStorage.getItem(BRAIN_STATE_KEY)
    const savedBuffer = localStorage.getItem(BUFFER_KEY)
    
    if (savedState) {
      const parsed = JSON.parse(savedState)
      
      // Restore buffer from separate storage
      if (savedBuffer) {
        const bufferData = JSON.parse(savedBuffer)
        parsed.recentBuffer = {
          ...bufferData,
          timestamp: new Date(bufferData.timestamp)
        }
      }
      
      // Convert timestamp strings back to dates
      Object.values(parsed.thoughtCategories).forEach((thoughts: any) => {
        thoughts.forEach((thought: any) => {
          thought.timestamp = new Date(thought.timestamp)
        })
      })
      
      console.log('🧠 Brain state loaded from localStorage:', Object.keys(parsed.thoughtCategories))
      return parsed
    }
  } catch (error) {
    console.error('🧠 Error loading brain state from localStorage:', error)
  }
  
  console.log('🧠 Creating fresh brain state')
  return createDefaultBrainState()
}

/**
 * Save brain state to localStorage
 */
function saveBrainStateToStorage(): void {
  try {
    if (typeof window === 'undefined') return
    
    // Save brain state (without buffer to keep it separate)
    const stateToSave = {
      ...globalBrainState,
      recentBuffer: { text: '', paragraphs: [], timestamp: new Date() } // Don't save buffer in main state
    }
    
    localStorage.setItem(BRAIN_STATE_KEY, JSON.stringify(stateToSave))
    
    // Save buffer separately for performance
    localStorage.setItem(BUFFER_KEY, JSON.stringify(globalBrainState.recentBuffer))
    
    console.log('🧠 Brain state saved to localStorage')
  } catch (error) {
    console.error('🧠 Error saving brain state to localStorage:', error)
  }
}

/**
 * Throttled save function to avoid excessive localStorage writes
 */
let saveTimeout: NodeJS.Timeout | null = null
function saveBrainStateThrottled(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  saveTimeout = setTimeout(() => {
    saveBrainStateToStorage()
    saveTimeout = null
  }, 1000) // Save after 1 second of inactivity
}

/**
 * Create default brain state
 */
function createDefaultBrainState(): GlobalBrainState {
  return {
    recentBuffer: {
      text: '',
      paragraphs: [],
      timestamp: new Date()
    },
    thoughtCategories: {},
    currentContext: {
      activeThought: '',
      relatedCategory: '',
      momentum: 'building'
    }
  }
}

// Global brain state (singleton) - loaded from localStorage if available
let globalBrainState: GlobalBrainState = loadBrainStateFromStorage()

/**
 * Initialize empty brain state
 */
export function createBrainState(): GlobalBrainState {
  return {
    recentBuffer: {
      text: '',
      paragraphs: [],
      timestamp: new Date()
    },
    thoughtCategories: {},
    currentContext: {
      activeThought: '',
      relatedCategory: '',
      momentum: 'building'
    }
  }
}

/**
 * Get current brain state
 */
export function getBrainState(): GlobalBrainState {
  return globalBrainState
}

/**
 * Update buffer asynchronously (lightweight for every keystroke)
 */
export async function updateBuffer(newText: string): Promise<void> {
  // Just store the text directly - no processing on every keystroke
  globalBrainState.recentBuffer = {
    text: newText.slice(-DEFAULT_CONFIG.bufferSize), // Keep last 600 chars
    paragraphs: [], // We'll populate this only when needed
    timestamp: new Date()
  }
  
  // No console.log on every keystroke - too noisy
  // No localStorage save on every keystroke - too slow
}

/**
 * Process thoughts for organization (triggered by empty lines)
 * Now handles both categorization AND document organization
 */
export async function processThought(fullText: string, editor?: any, currentPageUuid?: string): Promise<void> {
  console.log('🧠 Processing text:', fullText.substring(0, 50) + '...')
  
  // Categorize the text using LLM
  const category = await categorizeThought(fullText)
  
  // Add to brain state
  addThoughtToCategory(fullText, category)
  
  console.log('🧠 ✅ Text organized into category:', category)
}

/**
 * Add categorized thought to global state
 */
export function addThoughtToCategory(content: string, category: string): void {
  const thought: ThoughtEntry = {
    id: generateId(),
    content: content,
    timestamp: new Date(),
    category: category,
    relatedDocs: [],
    metadata: {}
  }
  
  // Initialize category if it doesn't exist
  if (!globalBrainState.thoughtCategories[category]) {
    globalBrainState.thoughtCategories[category] = []
    console.log('🧠 New category created:', category)
  }
  
  // Add thought to category
  globalBrainState.thoughtCategories[category].push(thought)
  
  // Update current context
  globalBrainState.currentContext = {
    activeThought: content,
    relatedCategory: category,
    momentum: 'building'
  }
  
  console.log(`🧠 Added thought to category "${category}":`, content.slice(0, 50))
  console.log('📊 Current brain state categories:', Object.keys(globalBrainState.thoughtCategories))
  
  // Save to localStorage
  saveBrainStateToStorage()
}

/**
 * Organize a single unprocessed paragraph 
 */
async function organizeUnprocessedParagraph(
  paragraph: {content: string, position: number}, 
  editor: any, 
  currentPageUuid?: string
): Promise<void> {
  try {
    console.log('📄 Organizing paragraph:', paragraph.content.slice(0, 50))
    
    // Mark as processing
    markParagraphAsProcessing(editor, paragraph.position)
    
    // First categorize the thought
    const category = await categorizeThought(paragraph.content)
    
    // Add to brain state
    addThoughtToCategory(paragraph.content, category)
    
    // TODO: Organize into document (placeholder for now)
    const organizedPageName = `${category.charAt(0).toUpperCase() + category.slice(1)} Notes`
    const organizedPageUuid = `${category}-${Date.now()}` // Placeholder UUID
    
    // Mark as processed with organization info
    markParagraphAsProcessed(editor, paragraph.position, category, generateId())
    
    // Update paragraph metadata with organized document info
    editor.commands.setTextSelection(paragraph.position)
    editor.commands.updateAttributes('paragraph', {
      organizedPageName: organizedPageName,
      organizedPageUuid: organizedPageUuid
    })
    
    console.log(`📄 Paragraph organized into: "${organizedPageName}"`)
    
  } catch (error) {
    console.error('❌ Error organizing paragraph:', error)
  }
}

/**
 * LLM integration - categorize a thought
 */
async function categorizeThought(content: string): Promise<string> {
  console.log('🤖 LLM categorizing thought:', content.slice(0, 50))
  
  try {
    const existingCategories = Object.keys(globalBrainState.thoughtCategories)
    
    let prompt = `Categorize this thought into a single, short category name (1-2 words max).

Thought: "${content}"`

    if (existingCategories.length > 0) {
      prompt += `

EXISTING CATEGORIES: ${existingCategories.join(', ')}

If the thought fits well into one of these existing categories, use that category. However, if the thought is about a genuinely different topic or domain, create a new appropriate category. Don't force thoughts into categories where they don't belong.`
    } else {
      prompt += `

This is your first categorization. Examples of good categories: "todos", "ideas", "learnings", "product", "meetings", "personal"`
    }

    prompt += `

Return only the category name, nothing else.`

    const response = await fetch('/api/llm', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        prompt: prompt
      })
    })

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`)
    }

    const data = await response.json()
    const category = data.response?.trim().toLowerCase() || 'general'
    
    console.log(`🤖 LLM categorized as: "${category}" (existing: [${existingCategories.join(', ')}])`)
    return category

  } catch (error) {
    console.error('🤖 LLM categorization failed:', error)
    
    // Fallback to keyword-based categorization
    if (content.toLowerCase().includes('todo') || content.toLowerCase().includes('task')) {
      return 'todos'
    }
    if (content.toLowerCase().includes('idea') || content.toLowerCase().includes('maybe')) {
      return 'ideas'  
    }
    if (content.toLowerCase().includes('learn') || content.toLowerCase().includes('note')) {
      return 'learnings'
    }
    
    return 'general'
  }
}

/**
 * Get thoughts by category
 */
export function getThoughtsByCategory(category: string): ThoughtEntry[] {
  return globalBrainState.thoughtCategories[category] || []
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  return Object.keys(globalBrainState.thoughtCategories)
}

/**
 * Clear all stored brain state data from localStorage
 */
export function clearStoredBrainState(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(BRAIN_STATE_KEY)
      localStorage.removeItem(BUFFER_KEY)
      console.log('🧠 Cleared brain state from localStorage')
    }
  } catch (error) {
    console.error('🧠 Error clearing brain state from localStorage:', error)
  }
}

/**
 * Manually save brain state to localStorage
 */
export function saveBrainState(): void {
  saveBrainStateToStorage()
}

/**
 * Reset brain state to default and clear localStorage
 */
export function resetBrainState(): void {
  globalBrainState = createDefaultBrainState()
  clearStoredBrainState()
  console.log('🧠 Brain state reset to default')
}

/**
 * Get brain state storage info for debugging
 */
export function getBrainStateStorageInfo(): { hasStoredState: boolean, hasStoredBuffer: boolean, categoriesCount: number, bufferLength: number } {
  const hasStoredState = typeof window !== 'undefined' && localStorage.getItem(BRAIN_STATE_KEY) !== null
  const hasStoredBuffer = typeof window !== 'undefined' && localStorage.getItem(BUFFER_KEY) !== null
  
  return {
    hasStoredState,
    hasStoredBuffer,
    categoriesCount: Object.keys(globalBrainState.thoughtCategories).length,
    bufferLength: globalBrainState.recentBuffer.text.length
  }
} 