-- Create table for mapping our document IDs to SuperMemory document IDs
CREATE TABLE IF NOT EXISTS document_supermemory_mapping (
  id BIGSERIAL PRIMARY KEY,
  page_uuid UUID NOT NULL REFERENCES pages(uuid) ON DELETE CASCADE,
  supermemory_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one-to-one mapping between page and supermemory document
  UNIQUE(page_uuid),
  UNIQUE(supermemory_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_supermemory_mapping_page_uuid ON document_supermemory_mapping(page_uuid);
CREATE INDEX IF NOT EXISTS idx_document_supermemory_mapping_user_id ON document_supermemory_mapping(user_id);
CREATE INDEX IF NOT EXISTS idx_document_supermemory_mapping_supermemory_id ON document_supermemory_mapping(supermemory_id);

-- Enable RLS (Row Level Security)
ALTER TABLE document_supermemory_mapping ENABLE ROW LEVEL SECURITY;

-- Create RLS policy so users can only access their own mappings
CREATE POLICY "Users can access their own document mappings" ON document_supermemory_mapping
FOR ALL USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_supermemory_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_document_supermemory_mapping_updated_at_trigger
  BEFORE UPDATE ON document_supermemory_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_document_supermemory_mapping_updated_at(); 