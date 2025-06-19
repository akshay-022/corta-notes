import { createClient } from '@/lib/supabase/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { OrganizationManager } from '@/thought-tracking/core/organizationManager'
import { LineEdit, StorageManager, BrainState, OrganizedPage } from '@/thought-tracking/types'

export const runtime = 'edge';

// Simple storage manager implementation for the API
class ApiStorageManager implements StorageManager {
  private supabase: any;
  private userId: string;

  constructor(supabase: any, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }

  async loadOrganizedPages() {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .select('*')
        .eq('user_id', this.userId)
        .eq('organized', true)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading organized pages:', error);
        return [];
      }

      return data.map((page: any) => ({
        uuid: page.uuid,
        title: page.title,
        content: page.content,
        content_text: page.content_text,
        organized: page.organized,
        type: page.type,
        parent_uuid: page.parent_uuid,
        emoji: page.emoji,
        description: page.description,
        visible: page.visible,
        is_deleted: page.is_deleted,
        metadata: page.metadata,
        created_at: page.created_at,
        updated_at: page.updated_at,
        tags: page.tags,
        category: page.category,
        relatedPages: []
      }));
    } catch (error) {
      console.error('Error loading organized pages:', error);
      return [];
    }
  }

  async saveOrganizedPages() {
    // No-op for API - OrganizationManager handles direct database operations
    return Promise.resolve();
  }

  async saveBrainState(state: BrainState) {
    // No-op for API - not needed for organization
    return Promise.resolve();
  }

  async loadBrainState(): Promise<BrainState | null> {
    // No-op for API - not needed for organization
    return null;
  }

  async getPageByUuid(uuid: string): Promise<OrganizedPage | null> {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .select('*')
        .eq('uuid', uuid)
        .eq('user_id', this.userId)
        .eq('is_deleted', false)
        .single();

      if (error) {
        console.error('Error loading page by UUID:', error);
        return null;
      }

      return {
        uuid: data.uuid,
        title: data.title,
        content: data.content,
        content_text: data.content_text,
        organized: data.organized,
        type: data.type,
        parent_uuid: data.parent_uuid,
        emoji: data.emoji,
        description: data.description,
        visible: data.visible,
        is_deleted: data.is_deleted,
        metadata: data.metadata,
        created_at: data.created_at,
        updated_at: data.updated_at,
        tags: data.tags,
        category: data.category,
        relatedPages: []
      };
    } catch (error) {
      console.error('Error loading page by UUID:', error);
      return null;
    }
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  getUserId() {
    return this.userId;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body
    const body = await request.json()
    
    // Extract organization data
    let edits: LineEdit[] = []
    
    if (body.type === 'organize_content' && body.request) {
      const { request: orgRequest } = body
      edits = orgRequest.edits || []
    } else {
      return NextResponse.json({ 
        error: 'Invalid request format. Expected organize_content type.' 
      }, { status: 400 })
    }

    if (!edits || edits.length === 0) {
      return NextResponse.json({
        updatedPages: [],
        newPages: [],
        summary: 'No edits to organize',
        processedEditIds: []
      })
    }

    // Create storage manager
    const storageManager = new ApiStorageManager(supabase, user.id);

    // Initialize organization manager
    const organizationManager = new OrganizationManager(
      storageManager,
      undefined, // API endpoint not needed since we're handling it directly
      user.id,
      process.env.OPENAI_API_KEY!
    );

    // Execute organization - this handles all database operations
    const result = await organizationManager.organizeContent(edits);

    // Create file history items for frontend
    const fileHistoryItems = [
      ...result.updatedPages.map(page => ({
        uuid: page.uuid,
        title: page.title,
        action: 'updated' as const,
        timestamp: Date.now()
      })),
      ...result.newPages.map(page => ({
        uuid: page.uuid,
        title: page.title,
        action: 'created' as const,
        timestamp: Date.now()
      }))
    ]

    return NextResponse.json({
      ...result,
      fileHistory: fileHistoryItems
    })

  } catch (error) {
    console.error('Error organizing content:', error)
    return NextResponse.json(
      { error: 'Failed to organize content' }, 
      { status: 500 }
    )
  }
} 