'use client'

import { useState } from 'react'
import { Page } from '@/lib/supabase/types'
import { FileText, ArrowLeft, Edit, Trash } from 'lucide-react'

interface ContextMenu {
  x: number
  y: number
  type: 'file'
  item: Page
}

interface ChronologicalSidebarProps {
  pages: Page[]
  activePage: Page | null
  setActivePage: (page: Page) => void
  setSidebarOpen: (open: boolean) => void
  onBackToNormal: () => void
  deleteItem: (page: Page) => void
  setRenaming: (page: Page) => void
}

interface GroupedPages {
  [dateKey: string]: {
    displayDate: string
    pages: Page[]
  }
}

export default function ChronologicalSidebar({
  pages,
  activePage,
  setActivePage,
  setSidebarOpen,
  onBackToNormal,
  deleteItem,
  setRenaming
}: ChronologicalSidebarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  const handleContextMenu = (e: React.MouseEvent, page: Page) => {
    e.preventDefault()
    e.stopPropagation()
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'file',
      item: page
    })
  }

  // Close context menu when clicking outside
  const handleClick = () => {
    if (contextMenu) {
      setContextMenu(null)
    }
  }
  
  // Filter out folders and deleted items, then sort by updated_at descending
  const sortedPages = pages
    .filter(page => 
      !(page.metadata as any)?.isFolder && 
      !page.is_deleted
    )
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0)
      const dateB = new Date(b.updated_at || b.created_at || 0)
      return dateB.getTime() - dateA.getTime()
    })

  // Group pages by date
  const groupedPages: GroupedPages = {}
  
  sortedPages.forEach(page => {
    const pageDate = new Date(page.updated_at || page.created_at || 0)
    const dateKey = pageDate.toDateString() // "Mon Oct 23 2023"
    
    if (!groupedPages[dateKey]) {
      groupedPages[dateKey] = {
        displayDate: formatDateHeader(pageDate),
        pages: []
      }
    }
    groupedPages[dateKey].pages.push(page)
  })

  function formatDateHeader(date: Date): string {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const dateStr = date.toDateString()
    const todayStr = today.toDateString()
    const yesterdayStr = yesterday.toDateString()
    
    if (dateStr === todayStr) {
      return 'Today'
    } else if (dateStr === yesterdayStr) {
      return 'Yesterday'
    } else {
      // Format as "October 23, 2023"
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    }
  }

  function formatDateTime(dateString: string, groupDisplayDate: string): string {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const dateStr = date.toDateString()
    const todayStr = today.toDateString()
    const yesterdayStr = yesterday.toDateString()
    
    // Only show time if we're in a date group header
    const timeDisplay = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    
    return timeDisplay
  }

  // No longer need the badge function - keeping it simple

  return (
    <div 
      className="fixed lg:relative inset-y-0 left-0 z-40 w-64 bg-[#1e1e1e] border-r border-[#333333] transform transition-transform duration-200 ease-in-out translate-x-0"
      onClick={handleClick}
    >
      <div className="flex flex-col h-full">
        {/* Fixed Header with back button */}
        <div className="flex-shrink-0 p-4 border-b border-[#333333]">
          <button
            onClick={onBackToNormal}
            className="flex items-center gap-2 text-[#cccccc] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">All Notes</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(groupedPages).length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[#969696] text-sm">No notes found</p>
            </div>
          ) : (
            Object.entries(groupedPages).map(([dateKey, group]) => (
              <div key={dateKey} className="mb-6">
                {/* Date header */}
                <div className="px-4 py-2 mb-2">
                  <h3 className="text-[#969696] text-xs font-semibold uppercase tracking-wide">
                    {group.displayDate}
                  </h3>
                </div>

                {/* Notes for this date */}
                <div>
                  {group.pages.map((page, index) => {
                    const isActive = activePage?.uuid === page.uuid
                    const timeDisplay = formatDateTime(page.updated_at || page.created_at || '', group.displayDate)
                    
                    return (
                      <div
                        key={page.uuid}
                        onClick={() => {
                          setActivePage(page)
                          setSidebarOpen(false)
                        }}
                        onContextMenu={(e) => handleContextMenu(e, page)}
                        className={`
                          flex items-center px-4 py-2 mx-3 rounded-md cursor-pointer transition-all duration-200 group
                          ${isActive 
                            ? 'bg-[#37373d] text-[#cccccc]' 
                            : 'hover:bg-[#2a2d2e] text-[#cccccc]'
                          }
                        `}
                      >
                        {/* File icon */}
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-[#519aba]" />
                        </div>

                        {/* Note info */}
                        <div className="flex-1 min-w-0 ml-3">
                          <div className="mb-1">
                            <span className="text-sm font-medium text-[#cccccc] truncate block">
                              {page.title}
                            </span>
                          </div>
                          
                          <div className="text-xs text-[#969696]">
                            {timeDisplay}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Fixed Footer info */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-[#333333]/30">
          <div className="flex items-center justify-center gap-2">
            <div className="w-1 h-1 bg-[#666666] rounded-full"></div>
            <span className="text-[#666666] text-xs font-medium">
              {sortedPages.length} {sortedPages.length === 1 ? 'note' : 'notes'}
            </span>
            <div className="w-1 h-1 bg-[#666666] rounded-full"></div>
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
            onClick={() => {
              setRenaming(contextMenu.item)
              setContextMenu(null)
            }}
          >
            <Edit size={12} />
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
            onClick={() => {
              deleteItem(contextMenu.item)
              setContextMenu(null)
            }}
          >
            <Trash size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
} 