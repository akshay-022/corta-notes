import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  BrainState, 
  OrganizedPage, 
  StorageManager, 
  BrainStateConfig,
  SupabaseStorageConfig,
  DatabasePage 
} from '../types';
import { SUPABASE_DEFAULTS, BRAIN_STATE_DEFAULTS } from '../constants';

export class SupabaseStorageManager implements StorageManager {
  private supabase: SupabaseClient;
  private config: Required<SupabaseStorageConfig>;
  private userId?: string;

  constructor(
    supabase: SupabaseClient, 
    userId?: string,
    config: SupabaseStorageConfig = {}
  ) {
    this.supabase = supabase;
    this.userId = userId;
    this.config = {
      ...SUPABASE_DEFAULTS,
      ...config
    };
  }

  private getDefaultConfig(): BrainStateConfig {
    return BRAIN_STATE_DEFAULTS;
  }

  async saveBrainState(state: BrainState): Promise<void> {
    try {
      // Store brain state in localStorage for now, as it's frequently updated
      // You could also create a dedicated table for this if needed
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `${this.config.brainStateKey}_${this.userId}`, 
          JSON.stringify(state)
        );
      }
    } catch (error) {
      console.error('Error saving brain state:', error);
      throw new Error('Failed to save brain state to Supabase');
    }
  }

  async loadBrainState(): Promise<BrainState | null> {
    try {
      if (typeof window === 'undefined') return null;
      
      const stored = localStorage.getItem(`${this.config.brainStateKey}_${this.userId}`);
      if (!stored) return null;
      
      const state = JSON.parse(stored) as BrainState;
      
      // Ensure config exists and has default values
      if (!state.config) {
        state.config = this.getDefaultConfig();
      }
      
      return state;
    } catch (error) {
      console.error('Error loading brain state:', error);
      return null;
    }
  }

  async saveOrganizedPages(pages: OrganizedPage[]): Promise<void> {
    try {
      for (const page of pages) {
        if (page.uuid) {
          // Update existing page
          await this.updatePage(page);
        } else {
          // Create new page
          await this.createPage(page);
        }
      }
    } catch (error) {
      console.error('Error saving organized pages:', error);
      throw new Error('Failed to save organized pages to Supabase');
    }
  }

  private async updatePage(page: OrganizedPage): Promise<void> {
    const updateData: Partial<DatabasePage> = {
      title: page.title,
      content: page.content,
      content_text: page.content_text,
      organized: page.organized,
      metadata: {
        ...page.metadata,
        // Store our additional fields in metadata
        thoughtTracking: {
          tags: page.tags,
          category: page.category,
          relatedPages: page.relatedPages,
        }
      },
      updated_at: new Date().toISOString(),
    };

    if (page.description) updateData.description = page.description;
    if (page.emoji) updateData.emoji = page.emoji;
    if (page.parent_uuid) updateData.parent_uuid = page.parent_uuid;

    const { error } = await this.supabase
      .from(this.config.tableName)
      .update(updateData)
      .eq('uuid', page.uuid)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to update page: ${error.message}`);
    }
  }

  private async createPage(page: OrganizedPage): Promise<string> {
    const createData: Partial<DatabasePage> = {
      user_id: this.userId!,
      title: page.title,
      content: page.content || { type: "doc", content: [] },
      content_text: page.content_text,
      organized: page.organized,
      type: page.type || 'file',
      visible: page.visible !== false,
      is_deleted: false,
      is_published: false,
      is_locked: false,
      metadata: {
        thoughtTracking: {
          tags: page.tags,
          category: page.category,
          relatedPages: page.relatedPages,
        },
        ...page.metadata
      },
    };

    if (page.description) createData.description = page.description;
    if (page.emoji) createData.emoji = page.emoji;
    if (page.parent_uuid) createData.parent_uuid = page.parent_uuid;

    const { data, error } = await this.supabase
      .from(this.config.tableName)
      .insert(createData)
      .select('uuid')
      .single();

    if (error) {
      throw new Error(`Failed to create page: ${error.message}`);
    }

    return data.uuid;
  }

  async loadOrganizedPages(): Promise<OrganizedPage[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.config.tableName)
        .select('*')
        .eq('user_id', this.userId)
        .eq('organized', true)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load organized pages: ${error.message}`);
      }

      return (data || []).map(this.mapDatabasePageToOrganizedPage);
    } catch (error) {
      console.error('Error loading organized pages:', error);
      return [];
    }
  }

  private mapDatabasePageToOrganizedPage(dbPage: DatabasePage): OrganizedPage {
    const thoughtTracking = dbPage.metadata?.thoughtTracking || {};
    
    return {
      id: dbPage.id,
      uuid: dbPage.uuid,
      user_id: dbPage.user_id || undefined,
      title: dbPage.title,
      content: dbPage.content,
      content_text: dbPage.content_text,
      emoji: dbPage.emoji || undefined,
      description: dbPage.description || undefined,
      parent_uuid: dbPage.parent_uuid || undefined,
      is_deleted: dbPage.is_deleted || false,
      is_published: dbPage.is_published || false,
      is_locked: dbPage.is_locked || false,
      metadata: dbPage.metadata,
      created_at: dbPage.created_at || undefined,
      updated_at: dbPage.updated_at || undefined,
      type: (dbPage.type as 'file' | 'folder') || 'file',
      organized: dbPage.organized,
      visible: dbPage.visible,
      // Extract our additional fields from metadata
      tags: thoughtTracking.tags || [],
      category: thoughtTracking.category,
      relatedPages: thoughtTracking.relatedPages || [],
    };
  }

  // Additional Supabase-specific methods

  async getRawPages(): Promise<OrganizedPage[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.config.tableName)
        .select('*')
        .eq('user_id', this.userId)
        .eq('organized', false)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load raw pages: ${error.message}`);
      }

      return (data || []).map(this.mapDatabasePageToOrganizedPage);
    } catch (error) {
      console.error('Error loading raw pages:', error);
      return [];
    }
  }

  async searchPages(query: string, organized?: boolean): Promise<OrganizedPage[]> {
    try {
      let queryBuilder = this.supabase
        .from(this.config.tableName)
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_deleted', false)
        .textSearch('content_text', query);

      if (organized !== undefined) {
        queryBuilder = queryBuilder.eq('organized', organized);
      }

      const { data, error } = await queryBuilder.order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to search pages: ${error.message}`);
      }

      return (data || []).map(this.mapDatabasePageToOrganizedPage);
    } catch (error) {
      console.error('Error searching pages:', error);
      return [];
    }
  }

  async getPageByUuid(uuid: string): Promise<OrganizedPage | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.config.tableName)
        .select('*')
        .eq('uuid', uuid)
        .eq('user_id', this.userId)
        .eq('is_deleted', false)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        throw new Error(`Failed to get page: ${error.message}`);
      }

      return this.mapDatabasePageToOrganizedPage(data);
    } catch (error) {
      console.error('Error getting page by UUID:', error);
      return null;
    }
  }

  async updatePageOrganizedStatus(uuid: string, organized: boolean): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(this.config.tableName)
        .update({ 
          organized, 
          updated_at: new Date().toISOString() 
        })
        .eq('uuid', uuid)
        .eq('user_id', this.userId);

      if (error) {
        throw new Error(`Failed to update page organized status: ${error.message}`);
      }
    } catch (error) {
      console.error('Error updating page organized status:', error);
      throw error;
    }
  }

  // Backup methods for brain state and cache to database (optional)
  
  async backupBrainStateToDatabase(): Promise<void> {
    try {
      const brainState = await this.loadBrainState();
      if (!brainState) return;

      // Store as a special metadata entry or dedicated table
      const { error } = await this.supabase
        .from('user_metadata') // You might want to create this table
        .upsert({
          user_id: this.userId,
          key: this.config.brainStateKey,
          value: brainState,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.warn('Failed to backup brain state to database:', error.message);
      }
    } catch (error) {
      console.warn('Error backing up brain state:', error);
    }
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }
} 