-- Corta Notes Database Schema
-- Single TipTap editor with AI chat functionality

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. User Profiles Table
CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username VARCHAR(50) UNIQUE,
  fullname VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Pages Table (Notes/Journals with single TipTap editor)
CREATE TABLE pages (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content JSONB DEFAULT '{"type":"doc","content":[]}', -- TipTap JSON content
  content_text TEXT DEFAULT '', -- Plain text for full-text search
  emoji VARCHAR(10) DEFAULT '📝',
  description VARCHAR(500),
  parent_uuid UUID REFERENCES pages(uuid) ON DELETE SET NULL, -- For nested pages/folders
  is_deleted BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE, -- Public sharing
  is_locked BOOLEAN DEFAULT FALSE, -- Read-only mode
  metadata JSONB DEFAULT '{}', -- Tags, color, custom settings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Conversations Table (User-AI conversation sessions)
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
  related_pages JSONB DEFAULT '[]', -- Array of page UUIDs that this conversation relates to
  metadata JSONB DEFAULT '{}', -- Additional conversation metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Chat Messages Table (Individual messages within conversations)
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, -- Links to conversation
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_user_message BOOLEAN DEFAULT TRUE, -- TRUE = user, FALSE = AI response
  metadata JSONB DEFAULT '{}', -- AI model info, context, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_username ON profiles(username);

CREATE INDEX idx_pages_user_id ON pages(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_pages_uuid ON pages(uuid);
CREATE INDEX idx_pages_parent_uuid ON pages(parent_uuid) WHERE parent_uuid IS NOT NULL;
CREATE INDEX idx_pages_content_search ON pages USING gin(to_tsvector('english', content_text));
CREATE INDEX idx_pages_updated_at ON pages(updated_at DESC);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Profiles
CREATE POLICY "Users can view own profile" ON profiles 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for Pages
CREATE POLICY "Users can view own pages or published pages" ON pages 
  FOR SELECT USING (auth.uid() = user_id OR is_published = TRUE);

CREATE POLICY "Users can insert own pages" ON pages 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pages" ON pages 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pages" ON pages 
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Conversations
CREATE POLICY "Users can view own conversations" ON conversations 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON conversations 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations" ON conversations 
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Chat Messages
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

CREATE POLICY "Users can update own chat messages" ON chat_messages 
  FOR UPDATE USING (auth.uid() = user_id);

-- Trigger to update updated_at on pages
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pages_updated_at 
  BEFORE UPDATE ON pages 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversations.updated_at when conversations are modified
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversations.updated_at when chat messages are added
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

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, fullname)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  RETURN new;
END;
$$ language plpgsql security definer;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 