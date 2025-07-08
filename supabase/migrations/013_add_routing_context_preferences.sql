-- Migration: Add routing preferences and context preferences tables
-- Created: 2025-01-08
-- Description: Tables to store user preferences for routing and context decisions

-- Create routingPreferences table
CREATE TABLE IF NOT EXISTS public.routingPreferences (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    editor_text TEXT,
    title TEXT,
    instruction TEXT,
    summary TEXT,
    page_uuid UUID REFERENCES public.pages(uuid) ON DELETE CASCADE,
    organized_page_uuid UUID REFERENCES public.pages(uuid) ON DELETE CASCADE,
    lastUpdated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Create unique constraint on the combination of page_uuid, organized_page_uuid, and lastUpdated
    CONSTRAINT unique_routing_preference UNIQUE (page_uuid, organized_page_uuid, lastUpdated)
);

-- Create contextPreferences table
CREATE TABLE IF NOT EXISTS public.contextPreferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT,
    editor_text TEXT,
    summary TEXT,
    page_uuids UUID[] DEFAULT '{}', -- Array of UUIDs
    paths TEXT[] DEFAULT '{}', -- Array of text paths
    lastUpdated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_routing_preferences_user_id ON public.routingPreferences(user_id);
CREATE INDEX IF NOT EXISTS idx_routing_preferences_page_uuid ON public.routingPreferences(page_uuid);
CREATE INDEX IF NOT EXISTS idx_routing_preferences_organized_page_uuid ON public.routingPreferences(organized_page_uuid);
CREATE INDEX IF NOT EXISTS idx_routing_preferences_last_updated ON public.routingPreferences(lastUpdated);

CREATE INDEX IF NOT EXISTS idx_context_preferences_user_id ON public.contextPreferences(user_id);
CREATE INDEX IF NOT EXISTS idx_context_preferences_last_updated ON public.contextPreferences(lastUpdated);
CREATE INDEX IF NOT EXISTS idx_context_preferences_page_uuids ON public.contextPreferences USING GIN(page_uuids);
CREATE INDEX IF NOT EXISTS idx_context_preferences_paths ON public.contextPreferences USING GIN(paths);

-- Enable Row Level Security (RLS)
ALTER TABLE public.routingPreferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextPreferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for routingPreferences
CREATE POLICY "Users can view their own routing preferences" ON public.routingPreferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routing preferences" ON public.routingPreferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routing preferences" ON public.routingPreferences
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routing preferences" ON public.routingPreferences
    FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for contextPreferences
CREATE POLICY "Users can view their own context preferences" ON public.contextPreferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own context preferences" ON public.contextPreferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own context preferences" ON public.contextPreferences
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own context preferences" ON public.contextPreferences
    FOR DELETE USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE public.routingPreferences IS 'Stores user preferences for content routing decisions - learns from user organization patterns';
COMMENT ON TABLE public.contextPreferences IS 'Stores user preferences for context selection - learns from user chat context choices';

COMMENT ON COLUMN public.routingPreferences.editor_text IS 'The original unorganized text from the editor';
COMMENT ON COLUMN public.routingPreferences.title IS 'The title of the original page';
COMMENT ON COLUMN public.routingPreferences.instruction IS 'The routing instruction provided by the user';
COMMENT ON COLUMN public.routingPreferences.summary IS 'Summary of the content being routed';
COMMENT ON COLUMN public.routingPreferences.page_uuid IS 'UUID of the source page';
COMMENT ON COLUMN public.routingPreferences.organized_page_uuid IS 'UUID of the destination organized page';

COMMENT ON COLUMN public.contextPreferences.query IS 'The user query that triggered context selection';
COMMENT ON COLUMN public.contextPreferences.editor_text IS 'The editor content at time of query';
COMMENT ON COLUMN public.contextPreferences.summary IS 'Summary of the context selection';
COMMENT ON COLUMN public.contextPreferences.page_uuids IS 'Array of page UUIDs that were selected as context';
COMMENT ON COLUMN public.contextPreferences.paths IS 'Array of file paths that were selected as context'; 