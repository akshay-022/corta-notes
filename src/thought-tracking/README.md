# Thought Tracking System

A lightweight, intelligent system for tracking and organizing paragraph-level edits in real-time. The system automatically organizes your thoughts into structured pages when you reach a certain threshold of edits.

## How It Works

1. **Edit Tracking** → Track every paragraph edit with metadata
2. **Brain State** → Store recent edits in memory
3. **AI Organization** → When you have >20 edits, organize the oldest 10 into pages

```
User edits → Brain State (max 20+ edits) → AI Organization (oldest 10) → Organized Pages
```

## Core Components

### BrainStateManager
Manages the current state of tracked edits and triggers organization when needed.

### OrganizationManager
Handles AI-powered organization of edits into structured pages.

### StorageManager
Provides persistence layer (localStorage, Supabase, etc.)

## Quick Start

```typescript
import { ThoughtTracker } from '@/thought-tracking';

// Initialize
const tracker = new ThoughtTracker();
await tracker.initialize();

// Track edits
await tracker.trackEdit({
  paragraphId: 'intro-paragraph',
  pageId: 'my-notes',
  content: 'This is my updated introduction...',
  editType: 'update'
});

// System automatically organizes when >20 edits
```

## Configuration

### Brain State Config

```typescript
interface BrainStateConfig {
  maxEditsBeforeOrganization: number; // Default: 20
  numEditsToOrganize: number; // Default: 5  
  summaryUpdateFrequency: number; // Default: 10
}
```

### Organization Config

```typescript
interface OrganizationConfig {
  preserveAllInformation: boolean; // Default: true
  createNewPagesThreshold: number; // Default: 0.3
  maxSimilarityForMerge: number; // Default: 0.7
  contextWindowSize: number; // Default: 4000
}
```

### Default Settings

```typescript
const config = {
  maxEditsBeforeOrganization: 20, // Trigger when >=25 edits (20 + 5)
  numEditsToOrganize: 5, // Organize oldest 5 edits at once
  summaryUpdateFrequency: 10, // Update summary every 10 edits
};
```

## API Endpoints

### Organization API (`/api/organize-note`)

```typescript
// POST /api/organize-note
{
  "type": "organize_content",
  "request": {
    "edits": ParagraphEdit[],
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
  organized?: boolean; // Marks if edit has been organized
  metadata?: {
    wordCount: number;
    charCount: number;
  };
}
```

### OrganizedPage

```typescript
interface OrganizedPage {
  uuid: string;
  title: string;
  content: any; // TipTap JSON
  content_text: string; // Plain text
  organized: boolean;
  tags?: string[];
  category?: string;
  // ... other Supabase fields
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
  editType: 'update'
});

// System automatically:
// 1. Stores edit in brain state
// 2. When >=25 edits (20 + 5), organizes oldest 5
// 3. Marks organized edits as processed
```

### Manual Organization

```typescript
// Check current state
const stats = await tracker.getStats();
console.log('Unorganized edits:', stats.brain.unorganizedEdits);

// Trigger manual organization
await tracker.triggerManualOrganization();
```

### React Hook Usage

```typescript
import { useThoughtTracker } from '@/thought-tracking/hooks/useThoughtTracker';

function MyComponent() {
  const {
    trackEdit,
    brainState,
    unorganizedEdits,
    organizedPages,
    isOrganizing,
    triggerOrganization
  } = useThoughtTracker();

  const handleEdit = async (content: string) => {
    await trackEdit({
      paragraphId: 'p1',
      pageId: 'page1',
      content,
      editType: 'update'
    });
  };

  return (
    <div>
      <p>Unorganized edits: {unorganizedEdits.length}</p>
      <p>Organized pages: {organizedPages.length}</p>
      <button onClick={triggerOrganization} disabled={isOrganizing}>
        {isOrganizing ? 'Organizing...' : 'Organize Now'}
      </button>
    </div>
  );
}
```

## Storage Options

### localStorage (Default)
```typescript
import { LocalStorageManager } from '@/thought-tracking/storage/localStorage';
const tracker = new ThoughtTracker(new LocalStorageManager());
```

### Supabase
```typescript
import { SupabaseStorageManager } from '@/thought-tracking/storage/supabaseStorage';
const storage = new SupabaseStorageManager(supabase, userId);
const tracker = new ThoughtTracker(storage);
```

## Events

The system emits events for integration:

```typescript
// Listen for organization events
window.addEventListener('thought-tracking:organization-complete', (event) => {
  console.log('Organization completed:', event.detail);
});

window.addEventListener('thought-tracking:organization-needed', (event) => {
  console.log('Organization triggered for:', event.detail.edits.length, 'edits');
});
```

## Performance

- **Lightweight**: No complex caching system
- **Efficient**: Only organizes when threshold is reached
- **Debounced**: Edit tracking is debounced to prevent excessive calls
- **Simple**: Direct organization of oldest edits

## Best Practices

1. **Set appropriate thresholds**: Adjust `maxEditsBeforeOrganization` based on your usage
2. **Monitor organization**: Use the status component to see when organization is needed
3. **Regular cleanup**: Organized edits are marked but kept for reference
4. **API optimization**: Ensure your organization API can handle batches of 5 edits efficiently

## Troubleshooting

### High Memory Usage
- Check `maxEditsBeforeOrganization` setting
- Ensure organization API is working properly
- Monitor unorganized edit count

### Organization Not Triggering
- Verify API endpoints are configured
- Check browser console for errors
- Ensure edit threshold is being reached

### Performance Issues
- Reduce `maxEditsBeforeOrganization` for more frequent organization
- Optimize organization API response time
- Check for excessive edit tracking calls

## License

This system is part of the Corta Notes project. 