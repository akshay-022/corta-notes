-- Migration 004: Add conversations table and update chat_messages structure
-- This migration creates a new conversations table and updates chat_messages to use conversation_id instead of page_uuid

-- 1. Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
  related_pages JSONB DEFAULT '[]', -- Array of page UUIDs that this conversation relates to
  metadata JSONB DEFAULT '{}', -- Additional conversation metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- 3. Enable RLS for conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for conversations
CREATE POLICY "Users can view own conversations" ON conversations 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON conversations 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations" ON conversations 
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Add conversation_id column to chat_messages table
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- 6. Drop the old page_uuid column and its index
DROP INDEX IF EXISTS idx_chat_messages_page_uuid;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS page_uuid;

-- 7. Create index for new conversation_id column
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);

-- 8. Make conversation_id NOT NULL (since it's now the primary relationship)
ALTER TABLE chat_messages ALTER COLUMN conversation_id SET NOT NULL;

-- 9. Update RLS policies for chat_messages to work with conversations
-- Drop old policies
DROP POLICY IF EXISTS "Users can view chat messages for accessible pages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert chat messages for accessible pages" ON chat_messages;

-- Create new policies for conversation-based access
CREATE POLICY "Users can view chat messages for own conversations" ON chat_messages 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c 
      WHERE c.id = chat_messages.conversation_id 
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chat messages for own conversations" ON chat_messages 
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM conversations c 
      WHERE c.id = chat_messages.conversation_id 
      AND c.user_id = auth.uid()
    )
  );

-- 10. Add trigger to update conversations.updated_at when chat messages are added
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent conversation's updated_at timestamp
  UPDATE conversations 
  SET updated_at = NOW() 
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversation_updated_at_trigger
  AFTER INSERT ON chat_messages 
  FOR EACH ROW 
  EXECUTE FUNCTION update_conversation_updated_at();

-- 11. Add trigger to update conversations.updated_at when conversations are modified
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Note: The page_uuid column has been completely removed from chat_messages
-- All chat messages now use conversation_id to link to conversations
-- Conversations can relate to multiple pages via the related_pages JSONB field 