// Centralized memory service exports
// Switch providers by changing the import path here

// Types are always from mem0 file (shared interfaces)
export type { MemoryDocument, MemoryProvider, MemoryAddResponse } from './types'

// Current provider: SuperMemory
export { memoryService } from './memory-service-supermemory'

// To switch to Mem0, just change the import path:
// export { memoryService } from './memory-service-mem0' 