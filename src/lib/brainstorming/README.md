# Brainstorming Module

A simple module for detecting the user's current thought and building context for AI conversations.

## Functions

### Thought Detection

**`detectLastThought(editor)`**
Analyzes TipTap editor history to detect the most recent thought by looking at undo/redo patterns.

- **editor**: TipTap editor instance
- **Returns**: String describing the last thought/editing activity

**`createThoughtContext(allPages, currentPage?, editor?)`**
Creates formatted context text combining:
1. Most recent thought (from editor history)
2. Recent "soon" pages (3 most recent)  
3. Current page content (highest priority)

- **allPages**: Array of all pages
- **currentPage**: Currently active page (optional)
- **editor**: TipTap editor instance (optional)
- **Returns**: Formatted context string

### Memory Context

**`getRelevantMemories(userQuestion, maxResults?)`**
Retrieves relevant documents from SuperMemory based on current thought/question.
Filters out low-confidence results (below 30%).

- **userQuestion**: The user's question or thought
- **maxResults**: Maximum number of results (default: 5)
- **Returns**: Promise<RelevantMemory[]>

**`formatMemoryContext(memories)`**
Formats memory documents into context text for AI consumption.

- **memories**: Array of RelevantMemory objects
- **Returns**: Formatted context string

**`createMemoryContext(userQuestion, maxResults?)`**
Combines search and formatting in one convenient function.

- **userQuestion**: The user's question or thought
- **maxResults**: Maximum number of results (default: 5)
- **Returns**: Promise<string> - Formatted memory context

## Usage

```typescript
import { 
  detectLastThought, 
  createThoughtContext,
  createMemoryContext,
  getRelevantMemories 
} from '@/lib/brainstorming'

// In your chat component
const thoughtContext = createThoughtContext(pages, currentPage, editor)
const memoryContext = await createMemoryContext(userQuestion)
const lastThought = detectLastThought(editor)

// Or get them separately
const memories = await getRelevantMemories(userQuestion, 5)
const formattedMemories = formatMemoryContext(memories)

// Use these contexts separately in your LLM calls
```

## Design Philosophy

Keep it simple. Separate functions for:
1. **Thought detection** - What you're thinking right now
2. **Memory retrieval** - What you've thought about before  
3. **Context building** - Format for AI consumption

Each function does one thing well and can be used independently. 