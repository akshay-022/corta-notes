'use client'

import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react'
import { Page } from '@/lib/supabase/types'

interface ContextMenu {
  x: number
  y: number
  type: 'folder' | 'file' | 'root'
  item?: Page
}

interface SidebarProps {
  pages: Page[]
  activePage: Page | null
  setActivePage: (page: Page) => void
  expandedFolders: Set<string>
  setExpandedFolders: (folders: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  contextMenu: ContextMenu | null
  setContextMenu: (menu: ContextMenu | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  createNewItem: (isFolder: boolean, parentId?: string) => void
  logout: () => void
}

export default function Sidebar({
  pages,
  activePage,
  setActivePage,
  expandedFolders,
  setExpandedFolders,
  contextMenu,
  setContextMenu,
  sidebarOpen,
  setSidebarOpen,
  createNewItem,
  logout
}: SidebarProps) {

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'file' | 'root', item?: Page) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      item
    })
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderId)) {
        newSet.delete(folderId)
      } else {
        newSet.add(folderId)
      }
      return newSet
    })
  }

  const buildTree = (items: Page[], parentId?: string) => {
    return items
      .filter(item => item.parent_uuid === parentId)
      .sort((a, b) => {
        const aIsFolder = (a.metadata as any)?.isFolder
        const bIsFolder = (b.metadata as any)?.isFolder
        if (aIsFolder && !bIsFolder) return -1
        if (!aIsFolder && bIsFolder) return 1
        return a.title.localeCompare(b.title)
      })
  }

  const renderTreeItem = (item: Page, level: number = 0) => {
    const isFolder = (item.metadata as any)?.isFolder
    const isExpanded = expandedFolders.has(item.uuid)
    const hasChildren = pages.some(p => p.parent_uuid === item.uuid)

    return (
      <div key={item.uuid}>
        <div
          className={`flex items-center hover:bg-[#2a2a2a] cursor-pointer text-sm ${
            activePage?.uuid === item.uuid && !isFolder ? 'bg-[#2a2a2a]' : ''
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              if (hasChildren) toggleFolder(item.uuid)
            } else {
              setActivePage(item)
              setSidebarOpen(false)
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, isFolder ? 'folder' : 'file', item)}
        >
          <div className="flex items-center gap-1 py-1 flex-1 min-w-0">
            {isFolder && hasChildren && (
              <div className="w-4 h-4 flex items-center justify-center">
                {isExpanded ? (
                  <ChevronDown size={12} className="text-gray-400" />
                ) : (
                  <ChevronRight size={12} className="text-gray-400" />
                )}
              </div>
            )}
            {isFolder && !hasChildren && <div className="w-4" />}
            
            <div className="w-4 h-4 flex items-center justify-center">
              {isFolder ? (
                isExpanded ? (
                  <FolderOpen size={14} className="text-gray-400" />
                ) : (
                  <Folder size={14} className="text-gray-400" />
                )
              ) : (
                <FileText size={14} className="text-gray-400" />
              )}
            </div>
            
            <span className="text-gray-300 truncate text-xs">{item.title}</span>
          </div>
        </div>
        
        {isFolder && isExpanded && hasChildren && (
          <div>
            {buildTree(pages, item.uuid).map(child => 
              renderTreeItem(child, level + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Sidebar - Cursor style */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-40 w-64 bg-[#161616] border-r border-gray-800 transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Minimal header */}
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Explorer</span>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-gray-300 p-1"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>

          {/* File tree */}
          <div 
            className="flex-1 overflow-y-auto py-1"
            onContextMenu={(e) => handleContextMenu(e, 'root')}
          >
            {buildTree(pages).map(item => renderTreeItem(item))}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#2a2a2a] border border-gray-700 rounded-md shadow-lg py-1 z-50 min-w-[150px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
            onClick={() => createNewItem(false, contextMenu.item?.uuid)}
          >
            <FileText size={12} />
            New File
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
            onClick={() => createNewItem(true, contextMenu.item?.uuid)}
          >
            <Folder size={12} />
            New Folder
          </button>
        </div>
      )}
    </>
  )
} 