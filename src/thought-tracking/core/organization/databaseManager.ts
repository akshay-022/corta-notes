import { createClient } from '@/lib/supabase/supabase-server';
import { OrganizedPage, DatabasePage, LineEdit } from './types';
import { updateMetadataByParagraphIdInDB } from '@/components/editor/paragraph-metadata';

export class DatabaseManager {
  private supabase: any;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.supabase = createClient();
  }

  /**
   * Load existing organized pages from database
   */
  async loadOrganizedPages(): Promise<OrganizedPage[]> {
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

      return data.map(this.mapDatabasePageToOrganizedPage);
    } catch (error) {
      console.error('Error loading organized pages:', error);
      return [];
    }
  }

  /**
   * Load existing unorganized pages from database
   */
  async loadUnorganizedPages(): Promise<OrganizedPage[]> {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .select('*')
        .eq('user_id', this.userId)
        .eq('organized', false)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading unorganized pages:', error);
        return [];
      }

      return data.map(this.mapDatabasePageToOrganizedPage);
    } catch (error) {
      console.error('Error loading unorganized pages:', error);
      return [];
    }
  }

  /**
   * Create a new file in the database
   */
  async createNewFile(
    title: string,
    content: any,
    contentText: string,
    parentUuid?: string
  ): Promise<OrganizedPage | null> {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .insert({
          user_id: this.userId,
          title,
          content,
          content_text: contentText,
          parent_uuid: parentUuid,
          type: 'file',
          organized: true,
          visible: true,
          is_deleted: false,
          is_published: false,
          is_locked: false,
          metadata: {
            createdFromOrganization: true,
            organizationTimestamp: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating new file:', error);
        return null;
      }

      return this.mapDatabasePageToOrganizedPage(data);
    } catch (error) {
      console.error('Error creating new file:', error);
      return null;
    }
  }

  /**
   * Create a new folder in the database
   */
  async createNewFolder(
    title: string,
    parentUuid?: string
  ): Promise<OrganizedPage | null> {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .insert({
          user_id: this.userId,
          title,
          content: { type: "doc", content: [] },
          content_text: '',
          parent_uuid: parentUuid,
          type: 'folder',
          organized: true,
          visible: true,
          is_deleted: false,
          is_published: false,
          is_locked: false,
          metadata: {
            createdFromOrganization: true,
            organizationTimestamp: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating new folder:', error);
        return null;
      }

      return this.mapDatabasePageToOrganizedPage(data);
    } catch (error) {
      console.error('Error creating new folder:', error);
      return null;
    }
  }

  /**
   * Update an existing page with new content
   */
  async updateExistingPage(
    pageUuid: string,
    content: any,
    contentText: string
  ): Promise<OrganizedPage | null> {
    try {
      const { data, error } = await this.supabase
        .from('pages')
        .update({
          content,
          content_text: contentText,
          updated_at: new Date().toISOString(),
          metadata: {
            lastOrganizationUpdate: new Date().toISOString()
          }
        })
        .eq('uuid', pageUuid)
        .eq('user_id', this.userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating existing page:', error);
        return null;
      }

      return this.mapDatabasePageToOrganizedPage(data);
    } catch (error) {
      console.error('Error updating existing page:', error);
      return null;
    }
  }

  /**
   * Find page by path
   */
  async findPageByPath(filePath: string, organizedPages: OrganizedPage[]): Promise<OrganizedPage | null> {
    // Build path map
    const pathMap = new Map<string, OrganizedPage>();
    
    const buildPathMap = (pages: OrganizedPage[]) => {
      pages.forEach(page => {
        const path = this.getFullPath(page, pages);
        pathMap.set(path, page);
      });
    };

    buildPathMap(organizedPages);
    return pathMap.get(filePath) || null;
  }

  /**
   * Update paragraph metadata to track organization
   */
  async updateParagraphOrganizationMetadata(
    edits: LineEdit[],
    targetPage: OrganizedPage
  ): Promise<void> {
    const updatePromises = edits.map(async (edit) => {
      try {
        const metadata = {
          organizationStatus: 'yes' as const,
          isOrganized: true,
          whereOrganized: [
            {
              filePath: targetPage.uuid,
              organizedAt: new Date().toISOString(),
            },
          ],
        };
        
        await updateMetadataByParagraphIdInDB(edit.pageId, edit.lineId, metadata);
      } catch (error) {
        console.error(`Failed to update metadata for paragraph ${edit.lineId}:`, error);
      }
    });

    await Promise.allSettled(updatePromises);
  }

  /**
   * Get full path for a page
   */
  private getFullPath(page: OrganizedPage, allPages: OrganizedPage[]): string {
    const path: string[] = [];
    let currentPage: OrganizedPage | null = page;

    while (currentPage) {
      path.unshift(currentPage.title);
      
      if (currentPage.parent_uuid) {
        currentPage = allPages.find(p => p.uuid === currentPage!.parent_uuid) || null;
      } else {
        currentPage = null;
      }
    }

    return '/' + path.join('/');
  }

  /**
   * Map database page to organized page
   */
  private mapDatabasePageToOrganizedPage(dbPage: DatabasePage): OrganizedPage {
    return {
      uuid: dbPage.uuid,
      title: dbPage.title,
      content: dbPage.content,
      content_text: dbPage.content_text,
      organized: dbPage.organized,
      type: dbPage.type,
      parent_uuid: dbPage.parent_uuid,
      emoji: dbPage.emoji,
      description: dbPage.description,
      visible: dbPage.visible,
      is_deleted: dbPage.is_deleted,
      metadata: dbPage.metadata,
      created_at: dbPage.created_at,
      updated_at: dbPage.updated_at
    };
  }
} 