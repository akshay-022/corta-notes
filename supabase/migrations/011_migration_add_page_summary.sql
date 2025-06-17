-- Migration: Add page summary columns to pages table
-- This will store AI-generated page summaries and the content state when summary was last made

ALTER TABLE pages 
ADD COLUMN page_summary JSONB DEFAULT NULL,
ADD COLUMN last_summary_content JSONB DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN pages.page_summary IS 'AI-generated summary of the page in TipTap JSON format for user display';
COMMENT ON COLUMN pages.last_summary_content IS 'Page content state (TipTap JSON) when the summary was last generated, used for incremental updates';

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pages_page_summary_gin ON pages USING GIN (page_summary);
CREATE INDEX IF NOT EXISTS idx_pages_last_summary_content_gin ON pages USING GIN (last_summary_content);

-- Optional: Add a partial index for pages that have summaries (more efficient)
CREATE INDEX IF NOT EXISTS idx_pages_has_summary ON pages (id) WHERE page_summary IS NOT NULL; 