'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, LogOut, Plus, Edit3, Edit, Check, X, RefreshCw, Clock, Trash, Eye, EyeOff, Download } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import { DragDropStyles, isValidDrop, DropZoneIndicator } from '@/components/left-sidebar/DragDropStyles'
import type { DragItem, DropTarget } from '@/hooks/useDragAndDrop'
import DocumentSearch from '@/components/left-sidebar/DocumentSearch'
import { SuperMemoryDocument } from '@/lib/memory-providers/memory-client'
import ChronologicalSidebar from './ChronologicalSidebar'
import FileHistory from './FileHistory'
import { FileHistoryItem } from './fileHistoryUtils'
import { useRouter } from 'next/navigation'
import logger from '@/lib/logger'
import { createClient } from '@/lib/supabase/supabase-client'

interface ContextMenu {
  x: number
  y: number
  type: 'folder' | 'file' | 'root'
  item?: Page
  isInOrganizedSection?: boolean
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
  createNewItem: (isFolder: boolean, parentId?: string, shouldBeOrganized?: boolean) => void
  setRenaming: (page: Page) => void
  deleteItem: (page: Page) => void
  updatePageMetadata: (page: Page, metadata: any) => void
  sendForOrganization: (page: Page) => void
  highlightedFolders: Set<string>
  setHighlightedFolders: (folders: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  logout: () => void
  onRefreshOrganizedNotes: () => Promise<void>
  onManualSync: () => void
  togglePageVisibility: (page: Page) => void
  dragAndDrop: {
    dragState: { isDragging: boolean; dragItem: DragItem | null; dragOverElement: string | null }
    getDragHandlers: (item: DragItem) => any
    getDropHandlers: (target: DropTarget) => any
  }
  isMobile?: boolean
  newlyCreatedItem?: Page | null
  onClearNewlyCreatedItem?: () => void
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
  updatePageMetadata,
  sendForOrganization,
  highlightedFolders,
  setHighlightedFolders,
  logout,
  onRefreshOrganizedNotes,
  onManualSync,
  togglePageVisibility,
  dragAndDrop,
  isMobile,
  newlyCreatedItem,
  onClearNewlyCreatedItem
}: SidebarProps) {
  const [renamingItem, setRenamingItem] = useState<Page | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [organizingItem, setOrganizingItem] = useState<Page | null>(null)
  const [organizationInstructions, setOrganizationInstructions] = useState('')
  const [searchResults, setSearchResults] = useState<SuperMemoryDocument[]>([])
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [viewMode, setViewMode] = useState<'normal' | 'chronological' | 'recent-changes' | 'recent-notes'>('normal')
  const [showHiddenItems, setShowHiddenItems] = useState(false)
  const [fileHistory, setFileHistory] = useState<FileHistoryItem[]>([])
  const [isRecentNotesExpanded, setIsRecentNotesExpanded] = useState(false)

  // Add state for global organization instructions
  const [globalOrganizationRules, setGlobalOrganizationRules] = useState('')
  const [isGlobalOrganizationRulesOpen, setIsGlobalOrganizationRulesOpen] = useState(false)

  const router = useRouter();

  // Load global organization rules from profiles table
  useEffect(() => {
    const loadGlobalOrganizationRules = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('user_id', user.id)
            .single()
          
          if (profile?.metadata) {
            const metadata = profile.metadata as any
            setGlobalOrganizationRules(metadata.globalOrganizationRules || '')
          }
        }
      } catch (error) {
        logger.error('Failed to load global organization rules:', error)
      }
    }
    
    loadGlobalOrganizationRules()
  }, [])

  // Auto-trigger rename mode for newly created items
  useEffect(() => {
    if (newlyCreatedItem) {
      logger.info('Auto-triggering rename for newly created item:', { title: newlyCreatedItem.title })
      // Set as renaming item so the input field works properly
      setRenamingItem(newlyCreatedItem)
      setRenameValue('') // Start with blank for new items
      // Clear the newly created item to prevent re-triggering
      if (onClearNewlyCreatedItem) {
        onClearNewlyCreatedItem()
      }
    }
  }, [newlyCreatedItem, onClearNewlyCreatedItem])

  // Load file history from Supabase
  useEffect(() => {
    const loadFileHistory = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('metadata')
          .eq('user_id', user.id)
          .single()
        
        const remoteHistory: FileHistoryItem[] | undefined = profile?.metadata?.fileHistory
        if (remoteHistory && Array.isArray(remoteHistory)) {
          setFileHistory(remoteHistory)
        }
      } catch (err) {
        console.error('Failed to load file history from Supabase', err)
      }
    }
    
    loadFileHistory()
  }, [])

  // Listen for profile metadata updates via Supabase realtime to refresh fileHistory
  useEffect(() => {
    const supabase = createClient()
    let channel: any
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return

      channel = supabase
        .channel('profile-filehistory')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`
        }, (payload: any) => {
          try {
            const metadata = (payload.new as any)?.metadata
            const newHistory: FileHistoryItem[] | undefined = metadata?.fileHistory
            if (newHistory && Array.isArray(newHistory)) {
              setFileHistory(newHistory)
            }
          } catch (err) {
            console.error('Failed to process realtime profile update', err)
          }
        })
        .subscribe()
    })()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [])

  const startRename = (item: Page) => {
    setRenamingItem(item)
    setRenameValue(item.title)
  }

  const startRenameForNewItem = (item: Page) => {
    setRenamingItem(item)
    setRenameValue('') // Start with blank field for newly created items
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

  const startOrganizing = (item: Page) => {
    setOrganizingItem(item)
    setOrganizationInstructions((item.metadata as any)?.organizationInstructions || '')
  }

  const handleOrganizationSubmit = () => {
    if (organizingItem) {
      const currentMetadata = organizingItem.metadata as any || {}
      const updatedMetadata = {
        ...currentMetadata,
        organizationInstructions: organizationInstructions.trim() // Can be empty string
      }
      updatePageMetadata(organizingItem, updatedMetadata)
    }
    setOrganizingItem(null)
    setOrganizationInstructions('')
  }

  const handleOrganizationCancel = () => {
    setOrganizingItem(null)
    setOrganizationInstructions('')
  }

  // Global organization rules functions
  const openGlobalOrganizationRules = () => {
    setIsGlobalOrganizationRulesOpen(true)
  }

  const saveGlobalOrganizationRules = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // First, get current profile metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('user_id', user.id)
        .single()

      const currentMetadata = (profile?.metadata as any) || {}
      const updatedMetadata = {
        ...currentMetadata,
        globalOrganizationRules: globalOrganizationRules.trim()
      }

      const { error } = await supabase
        .from('profiles')
        .update({ metadata: updatedMetadata })
        .eq('user_id', user.id)

      if (error) {
        logger.error('Error saving global organization rules:', error)
      } else {
        logger.info('Global organization rules saved successfully')
        setIsGlobalOrganizationRulesOpen(false)
      }
    } catch (error) {
      logger.error('Exception saving global organization rules:', error)
    }
  }

  const handleSearchDocumentSelect = (doc: SuperMemoryDocument) => {
    console.log('Selected search document:', doc)
    
    // Try to find the corresponding page in our local pages
    const matchingPage = pages.find(page => 
      page.uuid === doc.metadata?.pageUuid || 
      page.title === doc.title || 
      page.title === doc.metadata?.title
    )
    
    if (matchingPage) {
      // Navigate to the page using router.push like other navigation
      router.push(`/dashboard/page/${matchingPage.uuid}`)
      setSidebarOpen(false)
    } else {
      console.log('No matching local page found for search result:', doc)
      // Could potentially create a new page or show a message
    }
  }

  const handleSearchResults = (results: SuperMemoryDocument[]) => {
    setSearchResults(results)
    setIsSearchActive(results.length > 0)
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'file' | 'root', item?: Page) => {
    e.preventDefault()
    e.stopPropagation()
    
    logger.info('Right-click context menu triggered', { type, item: item?.title, target: (e.target as HTMLElement).className })
    
    // Determine if we're in the organized section
    let isInOrganizedSection = false
    
    if (type === 'root') {
      // Check if the right-click happened in the auto-organized notes area
      // We can determine this by checking if the target is within the organized section
      const target = e.target as HTMLElement
      const organizedSection = target.closest('[data-section="auto-organized"]')
      isInOrganizedSection = !!organizedSection
      
      logger.info('Root context menu detection', { 
        hasOrganizedSection: !!organizedSection, 
        targetClass: target.className,
        isInOrganizedSection 
      })
    } else if (item) {
      // If right-clicking on an item, check if that item is organized
      isInOrganizedSection = item.organized === true
      
      logger.info('Item context menu detection', { 
        itemTitle: item.title,
        isFolder: item.type === 'folder',
        organized: item.organized,
        isInOrganizedSection 
      })
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      item,
      isInOrganizedSection
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

  const removeHighlight = (itemTitle: string) => {
    setHighlightedFolders(prev => {
      const newSet = new Set(prev)
      newSet.delete(itemTitle)
      return newSet
    })
  }

  // Helper function to filter pages by organized status and visibility
  const getUnorganizedPages = () => {
    return pages.filter(page => 
      page.organized === false && 
      // (showHiddenItems || page.visible !== false) && // Show all pages if showHiddenItems is true, otherwise only visible
      !page.is_deleted // Exclude deleted pages
    )
  }

  const getOrganizedPages = () => {
    return pages.filter(page => 
      page.organized === true &&
      // (showHiddenItems || page.visible !== false) && // Show all pages if showHiddenItems is true, otherwise only visible
      !page.is_deleted // Exclude deleted pages
    )
  }

  // Helper function to get recent unorganized notes (for the recent section)
  const getRecentUnorganizedNotes = () => {
    const allUnorganized = getUnorganizedPages()
      .filter(page => page.type === 'file')
      .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
    
    return isRecentNotesExpanded ? allUnorganized : allUnorganized.slice(0, 3) // Show all notes when expanded, 3 when collapsed
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
    
    // console.log(`Building tree for parentId: ${parentId}, found ${filtered.length} items:`, 
    //   filtered.map(item => ({ title: item.title, uuid: item.uuid, parent_uuid: item.parent_uuid })))
    
    return filtered.sort((a, b) => {
      const aIsFolder = a.type === 'folder'
      const bIsFolder = b.type === 'folder'
      // Folders first
      if (aIsFolder && !bIsFolder) return -1
      if (!aIsFolder && bIsFolder) return 1
      // Then alphabetical
      return a.title.localeCompare(b.title)
    })
  }

  const renderTreeItem = (item: Page, level: number = 0, section: 'organized' | 'unorganized' = 'organized') => {
    const isFolder = item.type === 'folder'
    const isExpanded = expandedFolders.has(item.uuid)
    
    // For tree items, get children from the same section (organized/unorganized)
    const sectionPages = section === 'organized' ? getOrganizedPages() : getUnorganizedPages()
    const children = buildTree(sectionPages, item.uuid)
    const hasChildren = children.length > 0
    const isHighlighted = highlightedFolders.has(item.title)
    
    // Debug highlighting
    if (highlightedFolders.size > 0) {
      console.log('Highlighting check:', {
        itemTitle: item.title,
        isFolder: isFolder,
        highlightedFolders: Array.from(highlightedFolders),
        isHighlighted: isHighlighted
      })
    }

    // Set up drag functionality using the new structure
    const dragItem: DragItem = {
      id: item.uuid,
      type: isFolder ? 'folder' : 'note',
      title: item.title,
      sourceSection: section // Use the section parameter directly
    }
    const dragHandlers = dragAndDrop.getDragHandlers(dragItem)
    const isDraggedItem = dragAndDrop.dragState.dragItem?.id === item.uuid

    // Set up drop functionality for folders
    const dropTarget: DropTarget = {
      id: isFolder ? item.uuid : null,
      type: isFolder ? 'folder' : 'section',
      section: section // Use the section parameter directly
    }
    const dropHandlers = isFolder ? dragAndDrop.getDropHandlers(dropTarget) : {}
    const isDropTarget = dragAndDrop.dragState.dragOverElement === item.uuid
    
    // Update validation for new structure: only allow drops from unorganized to organized, or within organized
    const isValidDropTarget = isFolder && (
      (dragAndDrop.dragState.dragItem?.sourceSection === 'unorganized' && section === 'organized') ||
      (dragAndDrop.dragState.dragItem?.sourceSection === 'organized' && section === 'organized')
    )

    return (
      <div key={item.uuid}>
        <DragDropStyles
          isDragging={dragAndDrop.dragState.isDragging}
          isDraggedItem={isDraggedItem}
          isDropTarget={isDropTarget}
          isValidDropTarget={isValidDropTarget}
          className={`relative flex items-center cursor-pointer text-sm group transition-all duration-300 ${
            isHighlighted 
              ? 'border-l-2 border-[#65a30d]' 
              : 'hover:bg-[#2a2d2e]'
          }`}
        >
          <div
            {...dragHandlers}
            {...dropHandlers}
            style={{ 
              paddingLeft: isHighlighted ? `${16 + level * 16 - 2}px` : `${16 + level * 16}px`, // Subtract 2px when highlighted to compensate for border
              paddingRight: '16px',
              backgroundColor: isHighlighted ? 'rgba(101, 163, 13, 0.25)' : undefined,
              width: '100%'
            }}
            onClick={(e) => {
              // If item is highlighted, remove highlighting but still allow normal click behavior
              if (isHighlighted) {
                removeHighlight(item.title)
              }
              
              if (isFolder) {
                toggleFolder(item.uuid)
              } else {
                router.push(`/dashboard/page/${item.uuid}`)
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
            {(renamingItem?.uuid === item.uuid || newlyCreatedItem?.uuid === item.uuid) ? (
              <input
                type="text"
                value={newlyCreatedItem?.uuid === item.uuid ? '' : renameValue}
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
              <span className={`flex-1 truncate transition-colors duration-150 ${
                // item.visible === false ? 'text-[#969696] opacity-60' : 
                'text-[#cccccc]'
              }`}>
                {item.title}
              </span>
            )}
            

            
            {/* Hide/Show button - appears on hover */}
            {/* <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  togglePageVisibility(item)
                }}
                className="p-1 hover:bg-[#404040] rounded transition-colors"
                title={item.visible === false ? `Show "${item.title}"` : `Hide "${item.title}"`}
              >
                {item.visible === false ? (
                  <Eye size={12} className="text-[#969696] hover:text-[#cccccc]" />
                ) : (
                  <EyeOff size={12} className="text-[#969696] hover:text-[#cccccc]" />
                )}
              </button>
            </div> */}
          </div>
          

          </div>
        </DragDropStyles>
        
        {/* Children - show when folder is expanded */}
        {isFolder && isExpanded && (
          <div>
            {children.map(child => 
              renderTreeItem(child, level + 1, section)
            )}
          </div>
        )}
      </div>
    )
  }

  // Show chronological view if selected
  if (viewMode === 'chronological') {
    return (
      <>
        <ChronologicalSidebar
          pages={pages}
          activePage={activePage}
          setActivePage={setActivePage}
          setSidebarOpen={setSidebarOpen}
          onBackToNormal={() => setViewMode('normal')}
          deleteItem={deleteItem}
          setRenaming={setRenaming}
          togglePageVisibility={togglePageVisibility}
          isMobile={isMobile}
        />
        
        {/* Mobile overlay - only show on desktop */}
        {!isMobile && sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </>
    )
  }

  // Show recent changes view if selected
  if (viewMode === 'recent-changes') {
    // Filter pages to only those that appear in fileHistory
    const fileHistoryUuids = new Set(fileHistory.map(item => item.uuid))
    const recentChangesPages = pages.filter(page => fileHistoryUuids.has(page.uuid))
    
    return (
      <>
        <ChronologicalSidebar
          pages={recentChangesPages}
          activePage={activePage}
          setActivePage={setActivePage}
          setSidebarOpen={setSidebarOpen}
          onBackToNormal={() => setViewMode('normal')}
          deleteItem={deleteItem}
          setRenaming={setRenaming}
          togglePageVisibility={togglePageVisibility}
          isMobile={isMobile}
          title="Recent Changes"
          hideTabs={true}
          fileHistory={fileHistory}
        />
        
        {/* Mobile overlay - only show on desktop */}
        {!isMobile && sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </>
    )
  }

  // Show recent notes view if selected
  if (viewMode === 'recent-notes') {
    return (
      <>
        <ChronologicalSidebar
          pages={pages.filter(page => page.organized === false)} // Only show unorganized pages (recent notes)
          activePage={activePage}
          setActivePage={setActivePage}
          setSidebarOpen={setSidebarOpen}
          onBackToNormal={() => setViewMode('normal')}
          deleteItem={deleteItem}
          setRenaming={setRenaming}
          togglePageVisibility={togglePageVisibility}
          isMobile={isMobile}
          title="Recent Notes"
          hideTabs={true}
        />
        
        {/* Mobile overlay - only show on desktop */}
        {!isMobile && sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      {/* Sidebar - VS Code style */}
      <div className={`
        ${isMobile 
          ? 'relative h-full w-full bg-[#1e1e1e]' 
          : 'fixed lg:relative inset-y-0 left-0 z-40 w-full bg-[#1e1e1e] border-r border-[#333333] transform transition-transform duration-200 ease-in-out lg:h-full'
        }
        ${!isMobile && sidebarOpen ? 'translate-x-0' : !isMobile ? '-translate-x-full lg:translate-x-0' : ''}
      `}>
        <div className="flex flex-col h-full">
          {/* Fixed Header Section */}
          <div className="flex-shrink-0">
            {/* Clean Header with show/hide toggle */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[#cccccc] text-sm font-medium">Notes</span>
                <button
                  onClick={logout}
                  className="text-[#969696] hover:text-[#cccccc] p-1 rounded transition-colors"
                  title="Logout"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
            
            {/* New Note Button - ChatGPT style */}
            <div className="pb-2">
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

            {/* Sync Button */}
            <div className="pb-2">
              <button
                onClick={onManualSync}
                className="w-full bg-transparent hover:bg-[#2a2a2a] text-[#cccccc] rounded-lg py-1 text-sm flex items-center gap-1 transition-all duration-200"
                style={{ paddingLeft: '16px', paddingRight: '16px' }}
                title="Sync notes to SuperMemory with hierarchical path tags"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <RefreshCw size={14} className="text-[#969696]" />
                </div>
                <span className="ml-1 text-[#969696]">Sync to Memory</span>
              </button>
            </div>

            {/* Export Button */}
            <div className="pb-4">
              <button
                onClick={async () => {
                  try {
                    logger.info('🗂️ Starting export...')
                    const response = await fetch('/api/export')
                    
                    if (!response.ok) {
                      const errorData = await response.json()
                      logger.error('❌ Export failed', { error: errorData })
                      alert(`Export failed: ${errorData.error}`)
                      return
                    }
                    
                    // Get the blob and create download link
                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `corta-export-${new Date().toISOString().split('T')[0]}.zip`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    window.URL.revokeObjectURL(url)
                    
                    logger.info('✅ Export downloaded successfully')
                  } catch (error) {
                    logger.error('❌ Export error', { error })
                    alert('Export failed. Please try again.')
                  }
                }}
                className="w-full bg-transparent hover:bg-[#2a2a2a] text-[#cccccc] rounded-lg py-1 text-sm flex items-center gap-1 transition-all duration-200"
                style={{ paddingLeft: '16px', paddingRight: '16px' }}
                title="Export all organized pages as markdown files"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Download size={14} className="text-[#969696]" />
                </div>
                <span className="ml-1 text-[#969696]">Export Markdown</span>
              </button>
            </div>

            {/* Document Search */}
            <div className="pb-6 px-4">
              <DocumentSearch 
                onSelectDocument={handleSearchDocumentSelect}
                onSearchResults={handleSearchResults}
              />
            </div>
          </div>

          {/* Scrollable Content Section */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Recent unorganized notes OR Search Results */}
            {(isSearchActive || getRecentUnorganizedNotes().length > 0) && (
              <div className={`flex-shrink-0 ${isRecentNotesExpanded ? 'mb-4' : ''}`}>
                <div className="px-4 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[#969696] text-xs font-medium uppercase tracking-wider">
                      {isSearchActive ? 'Search Results' : 'Recent notes'}
                    </h3>
                    {!isSearchActive && (
                      <button
                        onClick={() => {
                          const allUnorganized = getUnorganizedPages().filter(page => page.type === 'file')
                          logger.info('Recent notes expansion toggled', { 
                            wasExpanded: isRecentNotesExpanded,
                            willBeExpanded: !isRecentNotesExpanded,
                            currentNotesCount: getRecentUnorganizedNotes().length,
                            totalUnorganizedNotes: allUnorganized.length
                          })
                          setIsRecentNotesExpanded(!isRecentNotesExpanded)
                        }}
                        className="text-[#969696] hover:text-[#cccccc] text-[10px] tracking-wide"
                      >
                        {isRecentNotesExpanded ? 'Show Less' : 'See All'}
                      </button>
                    )}
                  </div>
                </div>
                <div 
                  {...(() => {
                    const handlers = dragAndDrop.getDropHandlers({
                      id: null,
                      type: 'section',
                      section: 'unorganized'
                    })
                    const { className: _, ...rest } = handlers
                    return rest
                  })()}
                  className={`pb-6 relative ${isRecentNotesExpanded ? 'max-h-48' : 'max-h-64'} overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800`}
                >
                <DropZoneIndicator 
                  isActive={false}
                  message="Drop here to move to unorganized notes"
                />
{isSearchActive ? (
                  // Show search results - make them draggable
                  searchResults.map((doc, index) => {
                    // Find the corresponding page for this search result
                    const correspondingPage = pages.find(page => 
                      page.uuid === doc.metadata?.pageUuid
                    )

                    if (!correspondingPage) {
                      // If no corresponding page found, show non-draggable result
                      return (
                        <div
                          key={`search-${doc.id}-${index}`}
                          className="flex items-center hover:bg-[#2a2d2e] text-sm group transition-colors py-1 cursor-pointer"
                          style={{ paddingLeft: '16px', paddingRight: '16px' }}
                          onClick={() => handleSearchDocumentSelect(doc)}
                        >
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <div className="w-4 h-4 flex items-center justify-center">
                              <FileText size={14} className="text-[#519aba]" />
                            </div>
                            <div className="flex-1 min-w-0 ml-1">
                              <div className="text-[#cccccc] truncate text-sm font-normal">
                                {doc.title || doc.metadata?.title || 'Untitled'}
                              </div>
                              {doc.content && doc.score && doc.score < 1.0}
                            </div>
                            {doc.score && doc.score < 1.0 && (
                              <div className="text-[#969696] text-xs">
                                {Math.round(doc.score * 100)}%
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }

                    // Make search results both clickable and draggable
                    const dragItem: DragItem = {
                      id: correspondingPage.uuid,
                      type: 'note',
                      title: correspondingPage.title,
                      sourceSection: 'unorganized' // Search results act like unorganized notes for drag purposes
                    }
                    const dragHandlers = dragAndDrop.getDragHandlers(dragItem)
                    const isDraggedItem = dragAndDrop.dragState.dragItem?.id === correspondingPage.uuid

                    return (
                      <DragDropStyles
                        key={`search-${doc.id}-${index}`}
                        isDragging={dragAndDrop.dragState.isDragging}
                        isDraggedItem={isDraggedItem}
                        isDropTarget={false}
                        isValidDropTarget={false}
                        className="flex items-center hover:bg-[#2a2d2e] text-sm group transition-colors py-1 cursor-pointer"
                      >
                        <div
                          {...dragHandlers}
                          style={{ paddingLeft: '16px', paddingRight: '16px' }}
                          onClick={(e) => {
                            // Only handle click if not dragging
                            if (!dragAndDrop.dragState.isDragging) {
                              e.preventDefault()
                              e.stopPropagation()
                              logger.info('Search result clicked', { title: doc.title, id: doc.id })
                              handleSearchDocumentSelect(doc)
                            }
                          }}
                          className="flex items-center w-full"
                        >
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <div className="w-4 h-4 flex items-center justify-center">
                              <FileText size={14} className="text-[#519aba]" />
                            </div>
                            <div className="flex-1 min-w-0 ml-1">
                              <div className="truncate text-sm font-normal text-[#cccccc]">
                                {doc.title || doc.metadata?.title || 'Untitled'}
                              </div>
                            </div>
                            {doc.score && doc.score < 1.0 && (
                              <div className="text-[#969696] text-xs">
                                {Math.round(doc.score * 100)}%
                              </div>
                            )}
                          </div>
                        </div>
                      </DragDropStyles>
                    )
                  })
                ) : (
                  // Show recent unorganized notes
                  getRecentUnorganizedNotes().map(item => {
                      const dragItem: DragItem = {
                        id: item.uuid,
                        type: 'note',
                        title: item.title,
                        sourceSection: 'unorganized'
                      }
                      const dragHandlers = dragAndDrop.getDragHandlers(dragItem)
                      const isDraggedItem = dragAndDrop.dragState.dragItem?.id === item.uuid
                      
                      return (
                        <DragDropStyles
                          key={item.uuid}
                          isDragging={dragAndDrop.dragState.isDragging}
                          isDraggedItem={isDraggedItem}
                          isDropTarget={false}
                          isValidDropTarget={false}
                          className="flex items-center hover:bg-[#2a2d2e] text-sm group transition-colors py-1 cursor-pointer"
                        >
                          <div
                            {...dragHandlers}
                            style={{ paddingLeft: '16px', paddingRight: '16px' }}
                            onClick={() => {
                              router.push(`/dashboard/page/${item.uuid}`)
                              setSidebarOpen(false)
                            }}
                            onContextMenu={(e) => handleContextMenu(e, 'file', item)}
                            className="flex items-center w-full"
                          >
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <div className="w-4 h-4 flex items-center justify-center">
                                <FileText size={14} className="text-[#519aba]" />
                              </div>
                              <span className="truncate text-sm font-normal ml-1 text-[#cccccc]">
                                {item.title}
                              </span>
                            </div>
                            
                            {/* Gray dot indicator for files that are not fully organized */}
                            {(item.metadata as any)?.fullyOrganized !== true && (
                              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full flex-shrink-0 ml-2" 
                                   title="Not fully organized - has been edited since last organization" />
                            )}
                            
                            {/* Action buttons temporarily disabled */}
                          </div>
                        </DragDropStyles>
                      )
                    })
                )}
                </div>
              </div>
            )}

            {/* Auto-organized notes section - takes all remaining space */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-[#969696] text-xs font-medium uppercase tracking-wider">Auto-organized notes</h3>
                  <button
                    onClick={openGlobalOrganizationRules}
                    className="text-[#969696] hover:text-[#cccccc] transition-colors p-1 rounded hover:bg-[#2a2d2e]"
                    title="Edit global organization instructions"
                  >
                    <Edit size={12} />
                  </button>
                </div>
              </div>

              {/* File tree - only organized notes and folders - takes all remaining space */}
              <div 
                className="relative flex-1 min-h-0 overflow-y-auto"
                data-section="auto-organized"
                onContextMenu={(e) => handleContextMenu(e, 'root')}
              >
              {/* Only show section drop zone when there are no organized items or when specifically hovering empty space */}
              {buildTree(getOrganizedPages()).length === 0 && dragAndDrop.dragState.isDragging && (
                <div 
                  className="h-full flex items-center justify-center"
                  {...dragAndDrop.getDropHandlers({
                    id: null,
                    type: 'section',
                    section: 'organized'
                  })}
                >
                  <div className="text-center p-8 rounded-lg hover:bg-[#2a2d2e] transition-colors">
                    <span className="text-[#969696] text-sm">
                      Drop here to organize
                    </span>
                  </div>
                </div>
              )}
              
              {/* Render the organized tree items */}
              {buildTree(getOrganizedPages()).map(item => renderTreeItem(item, 0, 'organized'))}
              
              {/* Bottom drop zone for root level when items exist */}
              {buildTree(getOrganizedPages()).length > 0 && dragAndDrop.dragState.isDragging && (
                <div 
                  className="h-16 flex items-center justify-center mx-4 mt-2"
                  {...dragAndDrop.getDropHandlers({
                    id: null,
                    type: 'section',
                    section: 'organized'
                  })}
                >
                  <div className="w-full text-center py-3 rounded-lg bg-[#2a2d2e] opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-[#969696] text-xs">
                      Drop here for root level
                    </span>
                  </div>
                </div>
              )}
              
              {/* Invisible fill area to ensure all empty space is clickable */}
              {buildTree(getOrganizedPages()).length > 0 && (
                <div className="flex-1 min-h-[100px]" />
              )}
              </div>
            </div>
          </div>

          {/* File History */}
          <div className="flex-shrink-0">
            <FileHistory isMobile={isMobile} setSidebarOpen={setSidebarOpen} onSeeAll={() => setViewMode('recent-changes')} />
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
            onClick={() => createNewItem(false, contextMenu.item?.uuid, contextMenu.isInOrganizedSection)}
          >
            <FileText size={12} />
            New File
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
            onClick={() => createNewItem(true, contextMenu.item?.uuid, contextMenu.isInOrganizedSection)}
          >
            <Folder size={12} />
            New Folder
          </button>
          
          {/* Show rename and delete options when right-clicking on an item */}
          {contextMenu.item && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
                onClick={() => {
                  startRename(contextMenu.item!)
                  setContextMenu(null)
                }}
              >
                <Edit size={12} />
                Rename
              </button>
              {/* Visibility toggle commented out - showing all items now */}
              {/* <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
                onClick={() => {
                  togglePageVisibility(contextMenu.item!)
                  setContextMenu(null)
                }}
              >
                {contextMenu.item.visible === false ? (
                  <>
                    <FileText size={12} />
                    Show
                  </>
                ) : (
                  <>
                    <FileText size={12} className="opacity-50" />
                    Hide
                  </>
                )}
              </button> */}
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3a3a3a] flex items-center gap-2"
                onClick={() => {
                  deleteItem(contextMenu.item!)
                  setContextMenu(null)
                }}
              >
                <Trash size={12} />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Organization Instructions Dialog */}
      {organizingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] border border-[#404040] rounded-lg p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#cccccc] font-medium">Organization Instructions</h3>
              <button
                onClick={handleOrganizationCancel}
                className="text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-[#969696] text-sm mb-2">
                How should "{organizingItem.title}" be organized?
              </p>
              <p className="text-[#888888] text-xs mb-4">
                Provide instructions on what folder this note should go into, 
                or how it should be categorized. For example: "Put this in the 
                'Work Projects' folder" or "Create a new 'Meeting Notes' folder".
              </p>
              <textarea
                value={organizationInstructions}
                onChange={(e) => setOrganizationInstructions(e.target.value)}
                placeholder="Enter organization instructions..."
                className="w-full bg-[#1a1a1a] border border-[#404040] rounded px-3 py-2 text-[#cccccc] text-sm resize-none"
                rows={4}
                autoFocus
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleOrganizationCancel}
                className="px-3 py-1.5 text-sm text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOrganizationSubmit}
                className="px-3 py-1.5 bg-[#007acc] hover:bg-[#005a9e] text-white text-sm rounded transition-colors"
              >
                Save Instructions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Organization Rules Dialog */}
      {isGlobalOrganizationRulesOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] border border-[#404040] rounded-lg p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#cccccc] font-medium">Global Organization Instructions</h3>
              <button
                onClick={() => setIsGlobalOrganizationRulesOpen(false)}
                className="text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-[#969696] text-sm mb-2">
                Set global instructions for how all your notes should be organized.
              </p>
              <p className="text-[#888888] text-xs mb-4">
                These rules will be applied to all auto-organization. For example: "Group work tasks into 'Work' folder, keep meeting notes in 'Meetings', use date-based folders for journals."
              </p>
              <textarea
                value={globalOrganizationRules}
                onChange={(e) => setGlobalOrganizationRules(e.target.value)}
                placeholder="Enter your global organization preferences..."
                className="w-full bg-[#1a1a1a] border border-[#404040] rounded px-3 py-2 text-[#cccccc] text-sm resize-none"
                rows={6}
                autoFocus
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsGlobalOrganizationRulesOpen(false)}
                className="px-3 py-1.5 text-sm text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveGlobalOrganizationRules}
                className="px-3 py-1.5 bg-[#007acc] hover:bg-[#005a9e] text-white text-sm rounded transition-colors"
              >
                Save Instructions
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
} 