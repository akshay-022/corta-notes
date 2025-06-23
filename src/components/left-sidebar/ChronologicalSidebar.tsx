'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/lib/supabase/types'
import { FileText, ArrowLeft, Edit, Trash, EyeOff, Eye } from 'lucide-react'
import { FileHistoryItem } from './fileHistoryUtils'

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
  togglePageVisibility: (page: Page) => void
  isMobile?: boolean
  title?: string
  hideTabs?: boolean
  fileHistory?: FileHistoryItem[]
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
  setRenaming,
  togglePageVisibility,
  isMobile = false,
  title,
  hideTabs = false,
  fileHistory
}: ChronologicalSidebarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [showHiddenItems, setShowHiddenItems] = useState(false)
  const [activeTab, setActiveTab] = useState<'organized' | 'unorganized'>('organized')
  const router = useRouter()

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

  const handlePageClick = (page: Page) => {
    setActivePage(page)
    setSidebarOpen(false)
    // Navigate to the page
    router.push(`/dashboard/page/${page.uuid}`)
  }
  
  // Filter and sort pages by organized status
  const getFilteredPages = (organized: boolean) => {
    return pages
      .filter(page => 
        page.type === 'file' && 
        !page.is_deleted &&
        page.organized === organized &&
        (showHiddenItems || page.visible !== false)
      )
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0)
        const dateB = new Date(b.updated_at || b.created_at || 0)
        return dateB.getTime() - dateA.getTime()
      })
  }

  const organizedPages = getFilteredPages(true)
  const unorganizedPages = getFilteredPages(false)
  const activePages = hideTabs 
    ? pages.filter(page => 
        page.type === 'file' && 
        !page.is_deleted &&
        (showHiddenItems || page.visible !== false)
      ).sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0)
        const dateB = new Date(b.updated_at || b.created_at || 0)
        return dateB.getTime() - dateA.getTime()
      })
    : activeTab === 'organized' ? organizedPages : unorganizedPages

  // Group pages by date
  const groupedPages: GroupedPages = {}
  
  activePages.forEach(page => {
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
    
    // Only show time
    const timeDisplay = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    
    return timeDisplay
  }

  return (
    <div 
      className={`${
        isMobile 
          ? 'relative h-full w-full bg-[#1e1e1e]' 
          : 'fixed lg:relative inset-y-0 left-0 z-40 w-64 bg-[#1e1e1e] border-r border-[#333333] transform transition-transform duration-200 ease-in-out translate-x-0'
      }`}
      onClick={handleClick}
    >
      <div className="flex flex-col h-full">
        {/* Fixed Header with back button and controls */}
        <div className="flex-shrink-0 border-b border-[#333333]">
          <div className="p-4">
            <button
              onClick={onBackToNormal}
              className="flex items-center gap-2 text-[#cccccc] hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span className="text-sm font-medium">{title || 'All Notes'}</span>
            </button>
          </div>
          
          {/* Tabs for organized/unorganized */}
          {!hideTabs && (
            <div className="px-4 pb-2">
              <div className="flex bg-[#2a2a2a] rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('organized')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'organized'
                      ? 'bg-[#007acc] text-white'
                      : 'text-[#cccccc] hover:bg-[#3a3a3a]'
                  }`}
                >
                  Organized ({organizedPages.length})
                </button>
                <button
                  onClick={() => setActiveTab('unorganized')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'unorganized'
                      ? 'bg-[#007acc] text-white'
                      : 'text-[#cccccc] hover:bg-[#3a3a3a]'
                  }`}
                >
                  Unorganized ({unorganizedPages.length})
                </button>
              </div>
            </div>
          )}
          
          {/* Show/Hide toggle temporarily disabled */}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(groupedPages).length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[#969696] text-sm">
                {hideTabs 
                  ? 'No notes found'
                  : `No ${activeTab} notes found`
                }
                {!showHiddenItems && ' (some may be hidden)'}
              </p>
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
                    const isHidden = page.visible === false
                    
                    // Find the action from fileHistory if provided
                    const historyItem = fileHistory?.find(item => item.uuid === page.uuid)
                    const action = historyItem?.action
                    
                    return (
                      <div
                        key={page.uuid}
                        onClick={() => handlePageClick(page)}
                        onContextMenu={(e) => handleContextMenu(e, page)}
                        className={`
                          flex items-center px-4 py-2 mx-3 rounded-md cursor-pointer transition-all duration-200 group
                          ${isActive 
                            ? 'bg-[#37373d] text-[#cccccc]' 
                            : 'hover:bg-[#2a2d2e] text-[#cccccc]'
                          }
                          ${isHidden ? 'opacity-60' : ''}
                        `}
                      >
                        {/* File icon */}
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className={`${isHidden ? 'text-[#969696]' : 'text-[#519aba]'}`} />
                        </div>

                        {/* Note info */}
                        <div className="flex-1 min-w-0 ml-3">
                          <div className="mb-1">
                            <span className={`text-sm font-medium truncate block ${
                              isHidden ? 'text-[#969696]' : 'text-[#cccccc]'
                            }`}>
                              {page.title}
                              {isHidden && <span className="ml-1 text-xs">(hidden)</span>}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-[#969696]">
                            {action && (
                              <span className={`
                                px-1.5 py-0.5 rounded text-xs
                                ${action === 'created' 
                                  ? 'bg-[#1a5a1a] text-[#4caf50]' 
                                  : 'bg-[#1a3a5a] text-[#2196f3]'
                                }
                              `}>
                                {action === 'created' ? 'new' : 'upd'}
                              </span>
                            )}
                            <span>{timeDisplay}</span>
                          </div>
                        </div>
                        
                        {/* Hide/Show button - appears on hover */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePageVisibility(page)
                            }}
                            className="p-1 hover:bg-[#404040] rounded transition-colors"
                            title={page.visible === false ? `Show "${page.title}"` : `Hide "${page.title}"`}
                          >
                            {page.visible === false ? (
                              <Eye size={12} className="text-[#969696] hover:text-[#cccccc]" />
                            ) : (
                              <EyeOff size={12} className="text-[#969696] hover:text-[#cccccc]" />
                            )}
                          </button>
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
              {activePages.length} {activePages.length === 1 ? 'note' : 'notes'}
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
              togglePageVisibility(contextMenu.item)
              setContextMenu(null)
            }}
          >
            {contextMenu.item.visible === false ? (
              <>
                <Eye size={12} />
                Show
              </>
            ) : (
              <>
                <EyeOff size={12} />
                Hide
              </>
            )}
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