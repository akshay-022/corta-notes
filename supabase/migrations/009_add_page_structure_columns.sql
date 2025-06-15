-- Migration 008: Add new page structure columns
-- This migration adds type, organized, and visible columns to pages table
-- and migrates existing data from the metadata JSON column

-- 1. Add new columns to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS organized BOOLEAN;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS visible BOOLEAN;

-- 2. Create a check constraint for the type column
ALTER TABLE pages ADD CONSTRAINT pages_type_check 
  CHECK (type IN ('file', 'folder'));

-- 3. Set default values for new columns
ALTER TABLE pages ALTER COLUMN type SET DEFAULT 'file';
ALTER TABLE pages ALTER COLUMN organized SET DEFAULT false;
ALTER TABLE pages ALTER COLUMN visible SET DEFAULT true;

-- 4. Migrate existing data from metadata JSON to new columns
UPDATE pages 
SET 
  type = CASE 
    WHEN (metadata->>'isFolder')::boolean = true THEN 'folder'
    ELSE 'file'
  END,
  organized = CASE 
    WHEN metadata->>'organizeStatus' = 'yes' THEN true
    ELSE false
  END,
  visible = COALESCE((metadata->>'visible')::boolean, true)
WHERE 
  type IS NULL OR organized IS NULL OR visible IS NULL;

-- 5. Set NOT NULL constraints after data migration
ALTER TABLE pages ALTER COLUMN type SET NOT NULL;
ALTER TABLE pages ALTER COLUMN organized SET NOT NULL;
ALTER TABLE pages ALTER COLUMN visible SET NOT NULL;

-- 6. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
CREATE INDEX IF NOT EXISTS idx_pages_organized ON pages(organized);
CREATE INDEX IF NOT EXISTS idx_pages_visible ON pages(visible);

-- 7. Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_pages_organized_visible ON pages(organized, visible) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_pages_type_organized ON pages(type, organized) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_pages_user_organized_visible ON pages(user_id, organized, visible) WHERE NOT is_deleted;

-- 8. Add comments to document the new columns
COMMENT ON COLUMN pages.type IS 'Type of page: file or folder';
COMMENT ON COLUMN pages.organized IS 'Whether the page has been organized by AI (true) or is raw user content (false)';
COMMENT ON COLUMN pages.visible IS 'Whether the page should be visible in the sidebar (true) or hidden (false)';

-- Note: The metadata column is kept for backward compatibility and other metadata
-- The new columns provide structured access to the most commonly queried fields 