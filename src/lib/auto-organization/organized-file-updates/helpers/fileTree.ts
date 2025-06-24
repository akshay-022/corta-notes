import { FileTreeNode } from './types'
import { createClient } from '@/lib/supabase/supabase-client'
import logger from '@/lib/logger'

export interface OrganizedPageSlim {
  uuid: string
  title: string
  type: 'file' | 'folder'
  parent_uuid: string | null
  path?: string
}

// Event callback types
export type FileTreeEventType = 'INSERT' | 'DELETE'
export type FileTreeEventCallback = (event: FileTreeEventType, page: OrganizedPageSlim) => void

// Simple event manager for fileTree changes
class FileTreeEventManager {
  private callbacks: FileTreeEventCallback[] = []
  private subscription: any = null
  private supabase = createClient()

  subscribe(callback: FileTreeEventCallback) {
    this.callbacks.push(callback)
    
    // Setup real-time subscription on first callback
    if (this.callbacks.length === 1) {
      this.setupRealtimeSubscription()
    }
    
    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback)
      if (this.callbacks.length === 0) {
        this.cleanup()
      }
    }
  }

  private setupRealtimeSubscription() {
    logger.info('Setting up fileTree real-time subscription for INSERT/DELETE events')
    
    this.subscription = this.supabase
      .channel('fileTree-changes')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'pages' 
        }, 
        (payload) => {
          const page = this.mapToOrganizedPageSlim(payload.new)
          if (page) {
            logger.info('FileTree INSERT event detected', { pageTitle: page.title, pageUuid: page.uuid })
            this.callbacks.forEach(cb => cb('INSERT', page))
          }
        }
      )
      .on('postgres_changes', 
        { 
          event: 'DELETE', 
          schema: 'public', 
          table: 'pages' 
        }, 
        (payload) => {
          const page = this.mapToOrganizedPageSlim(payload.old)
          if (page) {
            logger.info('FileTree DELETE event detected', { pageTitle: page.title, pageUuid: page.uuid })
            this.callbacks.forEach(cb => cb('DELETE', page))
          }
        }
      )
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'pages',
          filter: 'is_deleted=eq.true'
        }, 
        (payload) => {
          const page = this.mapToOrganizedPageSlim(payload.new)
          if (page) {
            logger.info('FileTree soft DELETE event detected (is_deleted=true)', { pageTitle: page.title, pageUuid: page.uuid })
            this.callbacks.forEach(cb => cb('DELETE', page))
          }
        }
      )
      .subscribe()
  }

  private mapToOrganizedPageSlim(data: any): OrganizedPageSlim | null {
    if (!data || !data.uuid || !data.title) return null
    
    return {
      uuid: data.uuid,
      title: data.title,
      type: data.type || 'file',
      parent_uuid: data.parent_uuid
    }
  }

  private cleanup() {
    if (this.subscription) {
      logger.info('Cleaning up fileTree real-time subscription')
      this.supabase.removeChannel(this.subscription)
      this.subscription = null
    }
  }
}

// Global event manager instance
export const fileTreeEvents = new FileTreeEventManager()

export function buildFileTree(pages: OrganizedPageSlim[]): FileTreeNode[] {
  const buildHierarchy = (parentUuid: string | null = null, parentPath = ''): FileTreeNode[] => {
    return pages
      .filter((p) => p.parent_uuid === parentUuid)
      .map((p) => {
        const path = parentPath + '/' + p.title
        const node: FileTreeNode = {
          uuid: p.uuid,
          title: p.title,
          type: p.type,
          path,
          parent_uuid: p.parent_uuid,
        }
        if (p.type === 'folder') {
          node.children = buildHierarchy(p.uuid, path)
        }
        return node
      })
  }
  return buildHierarchy()
}

export function serializeFileTree(nodes: FileTreeNode[], level = 0): string {
  const indent = '  '.repeat(level)
  return nodes
    .map((n) => {
      const prefix = n.type === 'folder' ? '[DIR]' : '[FILE]'
      const line = `${indent}${prefix} ${n.title}`
      if (n.children && n.children.length) {
        return line + '\n' + serializeFileTree(n.children, level + 1)
      }
      return line
    })
    .join('\n')
} 