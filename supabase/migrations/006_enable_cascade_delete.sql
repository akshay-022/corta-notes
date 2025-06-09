-- Migration 006: Enable cascade delete for parent-child page relationships
-- This will make it so that when a parent page is deleted, all its children (and their children) are automatically deleted

-- First, drop the existing foreign key constraint
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_parent_uuid_fkey;

-- Recreate the foreign key constraint with CASCADE DELETE
ALTER TABLE pages ADD CONSTRAINT pages_parent_uuid_fkey 
  FOREIGN KEY (parent_uuid) REFERENCES pages(uuid) ON DELETE CASCADE;

-- Note: This change means that:
-- 1. When you delete a page, all its children will be automatically deleted
-- 2. This cascades recursively - children of children will also be deleted  
-- 3. The document_supermemory_mapping table already has ON DELETE CASCADE,
--    so SuperMemory embeddings will be cleaned up automatically
-- 4. This is irreversible - there's no "undo" for cascade deletes 