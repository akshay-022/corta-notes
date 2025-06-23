// Simple brainstorming functions for detecting current thought and building context
export { createThoughtContext } from './thought-detector'

// Memory context functions for retrieving relevant past memories
export { 
  getRelevantMemories, 
  formatMemoryContext, 
  createMemoryContext,
  type RelevantMemory 
} from './memory-context' 