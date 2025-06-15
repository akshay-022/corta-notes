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
    '/api/organize'   // Your organization API endpoint
  );

  await tracker.initialize();
  return tracker;
};

// 4. Example: Track edits from a TipTap editor
export const trackTipTapEdit = async (
  tracker: ThoughtTracker,
  pageUuid: string,
  newContent: any,
  previousContent: any
) => {
  // Extract text content for comparison
  const newText = extractTextFromTipTap(newContent);
  const previousText = extractTextFromTipTap(previousContent);

  if (newText !== previousText) {
    await tracker.trackEdit({
      paragraphId: `${pageUuid}-content`, // Or use more granular IDs
      pageId: pageUuid,
      content: newText,
      editType: 'update',
      previousContent: previousText,
      metadata: {
        wordCount: newText.split(/\s+/).length,
        charCount: newText.length
      }
    });
  }
};

// Helper function to extract text from TipTap content
const extractTextFromTipTap = (content: any): string => {
  if (!content || !content.content) return '';
  
  return content.content
    .map((node: any) => {
      if (node.type === 'paragraph' && node.content) {
        return node.content
          .map((inline: any) => inline.text || '')
          .join('');
      }
      return '';
    })
    .join('\n')
    .trim();
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

// 9. Example: React Hook usage
export const useSupabaseThoughtTracking = () => {
  return useThoughtTracker('/api/summarize', '/api/organize');
};

// 10. Example: Batch operations
export const batchMarkPagesAsOrganized = async (
  pageUuids: string[],
  userId: string
) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  
  for (const uuid of pageUuids) {
    await storageManager.updatePageOrganizedStatus(uuid, true);
  }
};

// 11. Example: Migration utility
export const migrateExistingPagesToThoughtTracking = async (userId: string) => {
  const storageManager = new SupabaseStorageManager(supabase, userId);
  
  // Get all raw pages
  const rawPages = await storageManager.getRawPages();
  
  console.log(`Found ${rawPages.length} raw pages for user ${userId}`);
  
  // You can now track edits on these pages or mark some as organized
  return rawPages;
}; 