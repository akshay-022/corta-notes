import { createClient } from '@supabase/supabase-js';
import { 
  ThoughtTracker, 
  SupabaseStorageManager,
  useThoughtTracker 
} from '@/thought-tracking';

// Example: Setting up thought tracking with Supabase

// 1. Initialize Supabase client (you probably already have this)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 2. Get current user ID (from your auth system)
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
};

// 3. Create thought tracker with Supabase storage
export const createSupabaseThoughtTracker = async () => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');

  const storageManager = new SupabaseStorageManager(supabase, userId);
  
  const tracker = new ThoughtTracker(
    storageManager,
    '/api/summarize', // Your summary API endpoint
    '/api/organize-note',   // Your organization API endpoint
    userId
  );

  await tracker.initialize();
  return tracker;
};

// 4. Example: Track line edits from a TipTap editor with metadata
// NOTE: This is a simplified example. In practice, use the editor-integration.ts
// which handles paragraph metadata automatically.
export const trackTipTapLineEdits = async (
  tracker: ThoughtTracker,
  pageUuid: string,
  newContent: any,
  previousContent: any,
  getParagraphMetadata?: (content: string) => any // Function to get metadata for paragraph
) => {
  // Extract paragraphs from both versions
  const newParagraphs = extractParagraphsFromTipTap(newContent);
  const previousParagraphs = extractParagraphsFromTipTap(previousContent);

  // Compare paragraphs and track changes
  const maxLength = Math.max(newParagraphs.length, previousParagraphs.length);
  
  for (let i = 0; i < maxLength; i++) {
    const newParagraph = newParagraphs[i] || '';
    const previousParagraph = previousParagraphs[i] || '';
    
    if (newParagraph !== previousParagraph) {
      let editType: 'create' | 'update' | 'delete';
      let content: string;
      
      if (previousParagraph === '' && newParagraph !== '') {
        editType = 'create';
        content = newParagraph;
      } else if (newParagraph === '') {
        editType = 'delete';
        content = '';
      } else {
        editType = 'update';
        content = newParagraph;
      }

      // Get paragraph metadata if available
      const paragraphMetadata = getParagraphMetadata ? getParagraphMetadata(content) : null;
      const lineId = paragraphMetadata?.id || `${pageUuid}-fallback-${Date.now()}-${i}`;
      
      await tracker.updateLine({
        lineId,
        pageId: pageUuid,
        content,
        editType,
        metadata: {
          wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
          charCount: content.length,
          position: i
        },
        paragraphMetadata
      });
    }
  }
};

// Helper function to extract paragraphs from TipTap content
const extractParagraphsFromTipTap = (content: any): string[] => {
  if (!content || !content.content) return [];
  
  const paragraphs: string[] = [];
  
  content.content.forEach((node: any) => {
    if (node.type === 'paragraph' && node.content) {
      const paragraphText = node.content
        .map((inline: any) => inline.text || '')
        .join('');
      paragraphs.push(paragraphText.trim());
    } else if (node.type === 'heading' && node.content) {
      const headingText = node.content
        .map((inline: any) => inline.text || '')
        .join('');
      paragraphs.push(headingText.trim());
    }
  });
  
  return paragraphs;
};

// Helper function to extract text from TipTap content (kept for backward compatibility)
const extractTextFromTipTap = (content: any): string => {
  return extractParagraphsFromTipTap(content).join('\n');
};

// 5. Example: Manual organization trigger
export const triggerOrganizationForUser = async (userId: string) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  const tracker = new ThoughtTracker(storageManager);
  
  await tracker.initialize();
  await tracker.triggerManualOrganization();
};

// 6. Example: Get all raw pages for organization
export const getRawPagesForOrganization = async (userId: string) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  return await storageManager.getRawPages();
};

// 7. Example: Search organized pages
export const searchOrganizedContent = async (
  userId: string, 
  query: string
) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  return await storageManager.searchPages(query, true); // organized = true
};

// 8. Example: Convert existing pages to organized
export const markPageAsOrganized = async (
  pageUuid: string, 
  userId: string
) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  await storageManager.updatePageOrganizedStatus(pageUuid, true);
};

// 9. Example: React Hook usage with line-based tracking
export const useSupabaseThoughtTracking = async () => {
  const tracker = await createSupabaseThoughtTracker();
  
  return useThoughtTracker({ 
    tracker,
    autoRefresh: true,
    refreshInterval: 30000 
  });
};

// 10. Example: Direct line tracking without TipTap parsing
export const trackDirectLineEdit = async (
  tracker: ThoughtTracker,
  lineId: string,
  pageId: string,
  content: string,
  editType: 'create' | 'update' | 'delete',
  metadata?: any
) => {
  await tracker.updateLine({
    lineId,
    pageId,
    content,
    editType,
    metadata: {
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
      charCount: content.length,
      ...metadata
    }
  });
};

// 11. Example: Get line history for debugging
export const getLineEditHistory = async (
  userId: string,
  lineId: string
) => {
  const tracker = await createSupabaseThoughtTracker();
  return await tracker.getLineHistory(lineId);
};

// 12. Example: Get all lines for a page
export const getPageLineEdits = async (
  userId: string,
  pageId: string
) => {
  const tracker = await createSupabaseThoughtTracker();
  return await tracker.getLinesByPage(pageId);
};

// 13. Example: Batch operations
export const batchMarkPagesAsOrganized = async (
  pageUuids: string[],
  userId: string
) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  
  for (const uuid of pageUuids) {
    await storageManager.updatePageOrganizedStatus(uuid, true);
  }
};

// 14. Example: Migration utility
export const migrateExistingPagesToThoughtTracking = async (userId: string) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  
  // Get all raw pages
  const rawPages = await storageManager.getRawPages();
  
  console.log(`Found ${rawPages.length} raw pages for user ${userId}`);
  
  // You can now track line edits on these pages or mark some as organized
  return rawPages;
};

// 15. Example: Track user typing in real-time
export const setupRealtimeLineTracking = async (
  pageUuid: string,
  onLineUpdate: (lineId: string, content: string) => void
) => {
  const tracker = await createSupabaseThoughtTracker();
  
  // This would be called whenever a user types in a specific line/paragraph
  const handleLineEdit = async (lineId: string, content: string, editType: 'create' | 'update' | 'delete') => {
    await tracker.updateLine({
      lineId,
      pageId: pageUuid,
      content,
      editType,
      metadata: {
        wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
        charCount: content.length
      }
    });
    
    onLineUpdate(lineId, content);
  };
  
  return { handleLineEdit, tracker };
}; 