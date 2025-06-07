'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, MoreHorizontal, Plus, Edit3 } from 'lucide-react'
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
  setRenaming: (page: Page) => void
  deleteItem: (page: Page) => void
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
  setRenaming,
  deleteItem,
  logout
}: SidebarProps) {
  const [renamingItem, setRenamingItem] = useState<Page | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const startRename = (item: Page) => {
    setRenamingItem(item)
    setRenameValue(item.title)
  }

  const handleRenameSubmit = () => {
    if (renamingItem && renameValue.trim()) {
      setRenaming({ ...renamingItem, title: renameValue.trim() })
    }
    setRenamingItem(null)
    setRenameValue('')
  }

  const handleRenameCancel = () => {
    setRenamingItem(null)
    setRenameValue('')
  }

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

  const buildTree = (items: Page[], parentId?: string | null) => {
    const filtered = items.filter(item => {
      // If no parentId provided, get root level items (no parent or null parent)
      if (parentId === undefined || parentId === null) {
        return item.parent_uuid === null || item.parent_uuid === undefined
      }
      // Otherwise, get items with the specific parent
      return item.parent_uuid === parentId
    })
    
    console.log(`Building tree for parentId: ${parentId}, found ${filtered.length} items:`, 
      filtered.map(item => ({ title: item.title, uuid: item.uuid, parent_uuid: item.parent_uuid })))
    
    return filtered.sort((a, b) => {
      const aIsFolder = (a.metadata as any)?.isFolder
      const bIsFolder = (b.metadata as any)?.isFolder
      // Folders first
      if (aIsFolder && !bIsFolder) return -1
      if (!aIsFolder && bIsFolder) return 1
      // Then alphabetical
      return a.title.localeCompare(b.title)
    })
  }

  const renderTreeItem = (item: Page, level: number = 0) => {
    const isFolder = (item.metadata as any)?.isFolder
    const isExpanded = expandedFolders.has(item.uuid)
    const children = buildTree(pages, item.uuid)
    const hasChildren = children.length > 0

    return (
      <div key={item.uuid}>
        <div
          className="flex items-center hover:bg-[#2a2d2e] cursor-pointer text-sm group transition-colors"
          style={{ paddingLeft: `${16 + level * 16}px`, paddingRight: '16px' }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(item.uuid)
            } else {
              setActivePage(item)
              setSidebarOpen(false)
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, isFolder ? 'folder' : 'file', item)}
        >
          <div className="flex items-center gap-1 py-1 flex-1 min-w-0">
            {/* Chevron for folders OR file icon for files - aligned in same position */}
            <div className="w-4 h-4 flex items-center justify-center">
              {isFolder ? (
                isExpanded ? (
                  <ChevronDown size={12} className="text-[#cccccc]" />
                ) : (
                  <ChevronRight size={12} className="text-[#cccccc]" />
                )
              ) : (
                <FileText size={14} className="text-[#519aba]" />
              )}
            </div>
            
            {/* Title - with inline editing */}
            {renamingItem?.uuid === item.uuid ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit()
                  if (e.key === 'Escape') handleRenameCancel()
                }}
                className="bg-[#3c3c3c] text-[#cccccc] text-sm border border-[#007acc] rounded px-1 py-0 ml-1 flex-1 min-w-0"
                autoFocus
              />
            ) : (
              <span className="text-[#cccccc] truncate text-sm font-normal ml-1">{item.title}</span>
            )}
          </div>
        </div>
        
        {/* Children - show when folder is expanded */}
        {isFolder && isExpanded && (
          <div>
            {children.map(child => 
              renderTreeItem(child, level + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Sidebar - VS Code style */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-40 w-64 bg-[#1e1e1e] border-r border-[#333333] transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Clean Header */}
          <div className="p-4 flex justify-end">
            <button
              onClick={logout}
              className="text-[#969696] hover:text-[#cccccc] p-1 rounded transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
          
          {/* New Note Button - ChatGPT style */}
          <div className="pb-8">
            <button
              onClick={() => createNewItem(false)}
              className="w-full bg-transparent hover:bg-[#2a2a2a] text-[#cccccc] rounded-lg py-1 text-sm flex items-center gap-1 transition-all duration-200"
              style={{ paddingLeft: '16px', paddingRight: '16px' }}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <Edit3 size={14} className="text-[#cccccc]" />
              </div>
              <span className="ml-1">New Note</span>
            </button>
          </div>

          {/* Section Header */}
          <div className="px-4 pb-2">
            <h3 className="text-[#969696] text-xs font-medium uppercase tracking-wider">Auto-organized notes</h3>
          </div>

          {/* File tree */}
          <div 
            className="flex-1 overflow-y-auto"
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
          
          {/* Show rename and delete options when right-clicking on an item */}
          {contextMenu.item && (
            <>
              <div className="border-t border-gray-600 my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
                onClick={() => {
                  startRename(contextMenu.item!)
                  setContextMenu(null)
                }}
              >
                <span className="w-3 h-3 text-center">✏️</span>
                Rename
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[#3a3a3a] flex items-center gap-2"
                onClick={() => {
                  deleteItem(contextMenu.item!)
                  setContextMenu(null)
                }}
              >
                <span className="w-3 h-3 text-center">🗑️</span>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
} 