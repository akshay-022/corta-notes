# Thought Tracking System

A comprehensive, modular system for tracking, summarizing, and organizing text edits with AI-powered content organization.

## Overview

The Thought Tracking System implements a sophisticated workflow for managing raw text edits:

1. **Raw Page Edits** → Track line-by-line changes with paragraph IDs
2. **Brain State** → Stack edits in localStorage with auto-summarization
3. **Cache System** → Move batches of edits to secondary cache with context summaries
4. **AI Organization** → Intelligently organize cached content into structured pages
5. **Organized Pages** → Final structured content with proper categorization

## Architecture

```
Raw Pages (organized=false)
    ↓ [Line edits tracked]
Brain State (localStorage)
    ↓ [After N edits]
Cache Store (with summaries)
    ↓ [After N cache entries]
Organization API
    ↓ [AI processing]
Organized Pages (organized=true)
```

## Core Components

### 1. ThoughtTracker (Main Orchestrator)
The central class that coordinates all components.

```typescript
import { ThoughtTracker } from '@/thought-tracking';

const tracker = new ThoughtTracker(
  undefined, // storage manager (optional)
  '/api/summarize', // summary API endpoint
  '/api/organize' // organization API endpoint
);

await tracker.initialize();
```

### 2. BrainStateManager
Manages the primary edit queue and auto-summarization.

```typescript
// Track an edit
await tracker.trackEdit({
  paragraphId: 'para-123',
  pageId: 'page-456',
  content: 'Updated content...',
  editType: 'update',
  previousContent: 'Original content...'
});
```

### 3. OrganizationManager
Handles AI-powered organization of cached content.

```typescript
// Trigger manual organization
await tracker.triggerManualOrganization();
```

### 4. Storage System
LocalStorage-based persistence with configurable thresholds, plus Supabase integration for production use.

## Supabase Integration

### Using with your existing Supabase database

```typescript
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageManager, ThoughtTracker } from '@/thought-tracking';

// Initialize with your Supabase client and user ID
const supabase = createClient(url, key);
const userId = 'your-user-id';

const storageManager = new SupabaseStorageManager(supabase, userId);
const tracker = new ThoughtTracker(storageManager);

await tracker.initialize();

// Track edits on existing pages
await tracker.trackEdit({
  paragraphId: 'para-123',
  pageId: 'your-page-uuid', // Use your page UUID
  content: 'Updated content...',
  editType: 'update'
});

// The system will automatically:
// 1. Store brain state in localStorage (frequent updates)
// 2. Use your pages table for organized content
// 3. Set organized=true when content is organized
// 4. Store additional metadata in the metadata JSONB field
```

### Database Integration

The system integrates seamlessly with your existing `pages` table:

- **Raw pages**: `organized = false` (default)
- **Organized pages**: `organized = true` (after AI processing)
- **Content**: Uses both `content` (JSONB) and `content_text` fields
- **Metadata**: Stores thought tracking data in the `metadata` field
- **Full text search**: Leverages your existing search indexes

## React Integration

### Using the Hook

```typescript
import { useThoughtTracker } from '@/thought-tracking';

function MyComponent() {
  const {
    trackEdit,
    brainState,
    organizedPages,
    recentEdits,
    isLoading,
    error,
    isOrganizing,
    triggerOrganization,
    searchPages
  } = useThoughtTracker();

  const handleEdit = async (content: string, paragraphId: string) => {
    await trackEdit({
      paragraphId,
      pageId: 'current-page',
      content,
      editType: 'update'
    });
  };

  return (
    <div>
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {isOrganizing && <div>Organizing content...</div>}
      
      <button onClick={triggerOrganization}>
        Organize Now
      </button>
      
      <div>Recent Edits: {recentEdits.length}</div>
      <div>Organized Pages: {organizedPages.length}</div>
    </div>
  );
}
```

### Event Handling

```typescript
import { EVENTS } from '@/thought-tracking';

// Listen for organization events
const { onOrganizationComplete, onOrganizationError } = useThoughtTracker();

useEffect(() => {
  const unsubscribeComplete = onOrganizationComplete((result) => {
    console.log('Organization completed:', result);
  });
  
  const unsubscribeError = onOrganizationError((error) => {
    console.error('Organization failed:', error);
  });
  
  return () => {
    unsubscribeComplete();
    unsubscribeError();
  };
}, []);
```

## Configuration

### Brain State Configuration

```typescript
await tracker.updateConfig({
  maxEditsInPrimary: 50, // Max edits before moving to cache
  maxEditsInSecondary: 30, // Max cache entries before organization
  summaryUpdateFrequency: 10, // Update summary every N edits
  organizationThreshold: 25 // Trigger organization after N cache entries
});
```

### Organization Configuration

The system uses intelligent thresholds for content organization:

- **createNewPagesThreshold**: 0.3 (similarity threshold for new pages)
- **maxSimilarityForMerge**: 0.7 (similarity threshold for merging)
- **preserveAllInformation**: true (never lose information)
- **contextWindowSize**: 4000 (max context for LLM)

## API Endpoints

### Summary API (`/api/summarize`)

```typescript
// POST /api/summarize
{
  "type": "brain_state_summary" | "context_summary",
  "context": {
    "editCount": number,
    "timeSpan": { "start": number, "end": number },
    "keywords": string[],
    "editTypes": Record<string, number>
  },
  "previousSummary": string,
  "maxLength": number
}
```

### Organization API (`/api/organize`)

```typescript
// POST /api/organize
{
  "type": "organize_content",
  "request": {
    "cacheEntries": CacheEntry[],
    "currentSummary": string,
    "existingPages": OrganizedPage[],
    "config": OrganizationConfig
  },
  "instructions": string
}
```

## Data Types

### ParagraphEdit

```typescript
interface ParagraphEdit {
  id: string;
  paragraphId: string;
  pageId: string;
  content: string;
  timestamp: number;
  editType: 'create' | 'update' | 'delete';
  previousContent?: string;
  metadata?: {
    wordCount: number;
    charCount: number;
    lineNumber?: number;
  };
}
```

### OrganizedPage

```typescript
interface OrganizedPage {
  id: string;
  title: string;
  content: string;
  organized: boolean;
  lastModified: number;
  tags: string[];
  category?: string;
  relatedPages?: string[];
}
```

## Workflow Examples

### Basic Edit Tracking

```typescript
// Initialize
const tracker = new ThoughtTracker();
await tracker.initialize();

// Track edits as user types
await tracker.trackEdit({
  paragraphId: 'intro-paragraph',
  pageId: 'my-notes',
  content: 'This is my updated introduction...',
  editType: 'update',
  previousContent: 'This is my introduction...'
});

// System automatically:
// 1. Stores edit in brain state
// 2. Updates summary every 5 edits
// 3. Moves to cache after 30 edits
// 4. Triggers organization after 30 cache entries
```

### Manual Organization

```typescript
// Check current state
const stats = await tracker.getStats();
console.log('Unprocessed entries:', stats.organization.unprocessedCacheEntries);

// Trigger organization manually
await tracker.triggerManualOrganization();

// Listen for completion
window.addEventListener('thought-tracking:organization-complete', (event) => {
  const result = event.detail;
  console.log(`Updated ${result.updatedPages.length} pages`);
  console.log(`Created ${result.newPages.length} new pages`);
});
```

### Search and Retrieval

```typescript
// Search organized pages
const pages = await tracker.searchOrganizedPages('machine learning');

// Get specific page
const page = await tracker.getOrganizedPage('page-id');

// Get edits for a specific page
const edits = await tracker.getEditsByPage('page-id');

// Get recent activity
const recentEdits = await tracker.getRecentEdits(20);
```

### Data Management

```typescript
// Export all data
const backup = await tracker.exportData();

// Import data
await tracker.importData(backup);

// Clear all data
await tracker.clearAllData();
```

## Performance Considerations

- **Debounced saves**: Edits are saved with 1-second debouncing
- **localStorage limits**: Monitor storage size with `getStorageSize()`
- **Batch processing**: Organization happens in configurable batches
- **Event-driven**: Uses custom events for loose coupling

## Error Handling

The system includes comprehensive error handling:

- **Fallback summaries**: When API fails, generates local summaries
- **Fallback organization**: Basic organization when AI fails
- **Graceful degradation**: System continues working even with component failures
- **Data validation**: Validates all edit data before processing

## Extending the System

### Custom Storage Manager

```typescript
import { StorageManager } from '@/thought-tracking';

class DatabaseStorageManager implements StorageManager {
  async saveBrainState(state: BrainState): Promise<void> {
    // Custom implementation
  }
  // ... implement other methods
}

const tracker = new ThoughtTracker(new DatabaseStorageManager());
```

### Custom Summary Generator

```typescript
import { SummaryGenerator } from '@/thought-tracking';

class CustomSummaryGenerator extends SummaryGenerator {
  async generateSummary(edits: ParagraphEdit[]): Promise<string> {
    // Custom summarization logic
    return 'Custom summary';
  }
}
```

## Best Practices

1. **Configure thresholds** based on your content volume
2. **Monitor storage usage** regularly
3. **Handle events** for better UX feedback
4. **Validate edit data** before tracking
5. **Test organization APIs** thoroughly
6. **Backup data** regularly using export functionality

## Troubleshooting

### High Memory Usage
- Reduce `maxEditsInPrimary` and `maxEditsInSecondary`
- Clear processed cache more frequently
- Export and clear old data

### Slow Organization
- Reduce `contextWindowSize`
- Optimize API endpoints
- Use fallback organization for testing

### Missing Edits
- Check edit validation
- Verify paragraph IDs are unique
- Monitor browser console for errors

## License

This system is part of the Corta Notes project. 