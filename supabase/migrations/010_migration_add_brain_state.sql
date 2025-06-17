-- Migration: Add brain_state column to profiles table
-- This will store the thought tracking brain state as JSON

ALTER TABLE profiles 
ADD COLUMN brain_state JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.brain_state IS 'Stores thought tracking brain state including edits, summary, and configuration';

-- Optional: Add an index for better query performance if you plan to query brain_state contents
CREATE INDEX IF NOT EXISTS idx_profiles_brain_state_gin ON profiles USING GIN (brain_state);

-- Optional: Add RLS policy if you want to ensure users can only access their own brain_state
-- (Assuming you already have RLS enabled on profiles table)
-- This policy would be similar to your existing profile policies 