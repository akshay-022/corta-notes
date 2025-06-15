"use client"

import { ReactNode, useContext, createContext, useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import Sidebar from '@/components/left-sidebar/Sidebar'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { superMemorySyncService } from '@/lib/memory/memory-client-sync'
import { createClient } from '@/lib/supabase/supabase-client'
import { loadRelevantNotes } from '@/lib/supabase/page-loader'
import logger from '@/lib/logger'
import MobileLayoutWrapper from '@/components/mobile/MobileLayoutWrapper'
import ChatPanel, { ChatPanelHandle } from '../right-sidebar/ChatPanel'

interface ContextMenu {
  x: number
  y: number
  type: 'folder' | 'file' | 'root'
  item?: Page
}

// Context to provide notes to children
export const NotesContext = createContext<{
  pages: Page[]
  activePage: Page | null
  setActivePage: (page: Page | null) => void
  updatePage: (updatedPage: Page) => void
  refreshOrganizedNotes: () => Promise<void>
} | null>(null)

export function useNotes() {
  return useContext(NotesContext)
}

export default function DashboardSidebarProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  
  const [user, setUser] = useState<any>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [activePage, setActivePage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [highlightedFolders, setHighlightedFolders] = useState<Set<string>>(new Set())
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [selections, setSelections] = useState<any[]>([])
  const [newlyCreatedItem, setNewlyCreatedItem] = useState<Page | null>(null)
  const chatPanelRef = useRef<ChatPanelHandle>(null)

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Helper to extract pageUuid from URL
  function getPageUuidFromPath() {
    const match = pathname.match(/page\/([a-zA-Z0-9\-]+)/)
    return match ? match[1] : null
  }

  // Single useEffect for initial data loading
  useEffect(() => {
    let isMounted = true

    const initializeData = async () => {
      try {
        logger.info('Initializing dashboard data...')
        
        // 1. Check user authentication
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          logger.info('No user found, redirecting to login')
          router.push('/login')
          return
        }

        if (!isMounted) return
        setUser(user)
        logger.info('User authenticated:', { userId: user.id })

        // 2. Get current page UUID
        const pageUuid = getPageUuidFromPath() || 
          (typeof window !== 'undefined' ? localStorage.getItem('lastOpenedPageUuid') : null)
        
        // 3. Load all pages in a single query
        const { data: pagesData, error: pagesError } = await supabase
          .from('pages')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .order('title', { ascending: true })

        if (pagesError) {
          logger.error('Error loading pages:', pagesError)
          return
        }

        if (!isMounted) return

        // 4. Update state with all data at once
        if (pagesData) {
          logger.info('Pages loaded successfully', { count: pagesData.length })
          setPages(pagesData)

          // Set active page if we have a pageUuid
          if (pageUuid) {
            const currentPage = pagesData.find(p => p.uuid === pageUuid)
            if (currentPage) {
              logger.info('Setting active page:', { pageId: currentPage.uuid })
              setActivePage(currentPage)
              // Save to localStorage
              if (typeof window !== 'undefined') {
                localStorage.setItem('lastOpenedPageUuid', pageUuid)
              }
            }
          } else if (pagesData.length > 0) {
            // Find first file (not folder) if no pageUuid
            const firstFile = pagesData.find(p => p.type === 'file')
            if (firstFile) {
              logger.info('Setting first file as active:', { pageId: firstFile.uuid })
              setActivePage(firstFile)
            }
          }
        }

        setLoading(false)
      } catch (error) {
        logger.error('Error initializing dashboard:', error)
        router.push('/login')
      }
    }

    initializeData()

    // Cleanup function
    return () => {
      isMounted = false
    }
  }, []) // Empty dependency array since this should only run once

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleManualSync = async () => {
    try {
      const pendingPages = superMemorySyncService.getPendingSyncPages(pages)
      if (pendingPages.length === 0) return
      await superMemorySyncService.syncAllPending(pages)
    } catch (error) {
      console.error('❌ Manual sync failed:', error)
    }
  }

  const refreshOrganizedNotes = async () => {
    if (!user) return
    try {
      console.log('🔄 Refreshing all pages from database to clear cache...')
      
      // Load ALL pages (same as initial load) to ensure we get newly created organized notes
      const { data: freshPages, error } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('title', { ascending: true })

      if (error) {
        console.error('❌ Error refreshing pages:', error)
        return
      }

      console.log(`🔄 Loaded ${freshPages?.length || 0} fresh pages from database`)
      
      if (freshPages) {
        // Replace all pages with fresh data from database
        setPages(freshPages)
        
        // Update active page if it exists in the fresh data
        if (activePage) {
          const updatedActivePage = freshPages.find(p => p.uuid === activePage.uuid)
          if (updatedActivePage) {
            setActivePage(updatedActivePage)
          }
        }
      }
      
      console.log('🔄 ✅ All pages refreshed from database - cache cleared')
    } catch (error) {
      console.error('❌ Failed to refresh pages:', error)
    }
  }

  const createNewItem = async (isFolder: boolean, parentId?: string, shouldBeOrganized?: boolean) => {
    if (!user) return
    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: isFolder ? 'New Folder' : 'Untitled',
        user_id: user.id,
        content: { type: 'doc', content: [] },
        parent_uuid: parentId || null,
        type: isFolder ? 'folder' : 'file',
        organized: shouldBeOrganized === true,
        visible: true
      })
      .select()
      .single()
    if (data) {
      setPages([...pages, data])
      if (!isFolder) {
        setActivePage(data)
        setSidebarOpen(false)
      }
      if (parentId) setExpandedFolders(prev => new Set([...prev, parentId]))
      
      // Auto-trigger rename mode for the newly created item
      // We need to use a small delay to ensure the item is rendered first
      setTimeout(() => {
        setNewlyCreatedItem(data)
      }, 100)
    }
    setContextMenu(null)
  }

  const renameItem = async (updatedPage: Page) => {
    if (!user) return
    const { error } = await supabase
      .from('pages')
      .update({ title: updatedPage.title })
      .eq('uuid', updatedPage.uuid)
      .eq('user_id', user.id)
    if (!error) {
      setPages(pages.map(p => p.uuid === updatedPage.uuid ? updatedPage : p))
      if (activePage?.uuid === updatedPage.uuid) setActivePage(updatedPage)
    }
  }

  const deleteItem = async (pageToDelete: Page) => {
    if (!user) return
    if (!confirm(`Are you sure you want to delete "${pageToDelete.title}"?`)) return
    try {
      await fetch('/api/memory/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', pageUuid: pageToDelete.uuid })
      })
    } catch {}
    const { error } = await supabase
      .from('pages')
      .update({ is_deleted: true })
      .eq('uuid', pageToDelete.uuid)
      .eq('user_id', user.id)
    if (!error) {
      setPages(pages.filter(p => p.uuid !== pageToDelete.uuid))
      if (activePage?.uuid === pageToDelete.uuid) setActivePage(null)
    }
  }

  const updatePageMetadata = async (page: Page, metadata: any) => {
    if (!user) return
    const { error } = await supabase
      .from('pages')
      .update({ metadata })
      .eq('uuid', page.uuid)
      .eq('user_id', user.id)
    if (!error) {
      const updatedPage = { ...page, metadata }
      setPages(pages.map(p => p.uuid === page.uuid ? updatedPage : p))
      if (activePage?.uuid === page.uuid) setActivePage(updatedPage)
    }
  }

  const moveItem = async (itemId: string, newParentId: string | null, newOrganizedStatus: boolean) => {
    if (!user) return
    const itemToMove = pages.find(p => p.uuid === itemId)
    if (!itemToMove) return
    const { error } = await supabase
      .from('pages')
      .update({ 
        parent_uuid: newParentId, 
        organized: newOrganizedStatus 
      })
      .eq('uuid', itemId)
      .eq('user_id', user.id)
    if (!error) {
      const updatedItem = { ...itemToMove, parent_uuid: newParentId, organized: newOrganizedStatus }
      setPages(pages.map(p => p.uuid === itemId ? updatedItem : p))
      if (activePage?.uuid === itemId) setActivePage(updatedItem)
      if (newParentId) setExpandedFolders(prev => new Set([...prev, newParentId]))
    }
  }

  const sendForOrganization = async (page: Page) => {
    if (!user) return
    try {
      const organizationInstructions = (page.metadata as any)?.organizationInstructions || ''
      const response = await fetch('/api/organize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: page.uuid,
          noteContent: page.content,
          organizationInstructions: organizationInstructions,
          fileTree: pages
        }),
      })
      const result = await response.json()
      if (result.success) {
        console.log('🗂️ Organization successful, refreshing organized notes...')
        
        // Refresh organized notes to show newly created/updated files
        await refreshOrganizedNotes()
        
        if (result.changedPaths && result.changedPaths.length > 0) {
          const foldersToHighlight = new Set<string>()
          result.changedPaths.forEach((path: string) => {
            const pathParts = path.split('/')
            pathParts.forEach((folderName: string) => {
              foldersToHighlight.add(folderName.trim())
            })
          })
          setHighlightedFolders(foldersToHighlight)
          console.log('🗂️ ✅ Highlighting folders:', Array.from(foldersToHighlight))
        }
      } else {
        alert(`Organization failed: ${result.error}`)
      }
    } catch (error) {
      console.error('❌ Organization error:', error)
      alert('Failed to organize note. Please try again.')
    }
  }

  // Function to update a page in the context (for editor updates)
  const updatePage = (updatedPage: Page) => {
    setPages(pages.map(p => p.uuid === updatedPage.uuid ? updatedPage : p))
    if (activePage?.uuid === updatedPage.uuid) {
      setActivePage(updatedPage)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const dragAndDrop = useDragAndDrop({ onMoveItem: moveItem })

  // Function to clear newly created item (called when rename is done)
  const clearNewlyCreatedItem = () => {
    setNewlyCreatedItem(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading sidebar...</div>
      </div>
    )
  }

  return (
    <NotesContext.Provider value={{ pages, activePage, setActivePage, updatePage, refreshOrganizedNotes }}>
      {isMobile ? (
        <MobileLayoutWrapper
          sidebar={
            <Sidebar
              pages={pages}
              activePage={activePage}
              setActivePage={setActivePage}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              contextMenu={contextMenu}
              setContextMenu={setContextMenu}
              sidebarOpen={true} // Always open in mobile wrapper
              setSidebarOpen={setSidebarOpen}
              createNewItem={createNewItem}
              setRenaming={renameItem}
              deleteItem={deleteItem}
              updatePageMetadata={updatePageMetadata}
              sendForOrganization={sendForOrganization}
              highlightedFolders={highlightedFolders}
              onRefreshOrganizedNotes={refreshOrganizedNotes}
              setHighlightedFolders={setHighlightedFolders}
              logout={logout}
              onManualSync={handleManualSync}
              dragAndDrop={dragAndDrop}
              isMobile={true}
              newlyCreatedItem={newlyCreatedItem}
              onClearNewlyCreatedItem={clearNewlyCreatedItem}
            />
          }
          editor={children}
          chatPanel={
            <ChatPanel
              ref={chatPanelRef}
              isOpen={true} // Always open in mobile view when chat tab is active
              onClose={() => {
                // In mobile, "closing" chat means switching to editor view
                logger.info('Mobile chat close button clicked, setting isChatOpen to false')
                setIsChatOpen(false)
              }}
              currentPage={activePage || undefined}
              allPages={pages}
              selections={selections}
              setSelections={setSelections}
              onApplyAiResponseToEditor={undefined} // Mobile doesn't need this callback
              editor={null} // Mobile doesn't pass editor reference
              isMobile={true}
            />
          }
          isChatOpen={isChatOpen}
          onChatToggle={() => setIsChatOpen(!isChatOpen)}
        />
      ) : (
        <div className="flex h-screen w-screen overflow-hidden">
          {/* Desktop Sidebar */}
          <div className="h-screen overflow-y-auto bg-[#1a1a1a] border-r border-[#222] min-w-[220px] max-w-[320px] w-[260px]">
            <Sidebar
              pages={pages}
              activePage={activePage}
              setActivePage={setActivePage}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              contextMenu={contextMenu}
              setContextMenu={setContextMenu}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              createNewItem={createNewItem}
              setRenaming={renameItem}
              deleteItem={deleteItem}
              updatePageMetadata={updatePageMetadata}
              sendForOrganization={sendForOrganization}
              highlightedFolders={highlightedFolders}
              setHighlightedFolders={setHighlightedFolders}
              logout={logout}
              onRefreshOrganizedNotes={refreshOrganizedNotes}
              onManualSync={handleManualSync}
              dragAndDrop={dragAndDrop}
              isMobile={false}
              newlyCreatedItem={newlyCreatedItem}
              onClearNewlyCreatedItem={clearNewlyCreatedItem}
            />
          </div>
          {/* Desktop Main content */}
          <div className="flex-1 min-w-0 h-screen overflow-y-auto bg-[#181818]">
            {children}
          </div>
        </div>
      )}
    </NotesContext.Provider>
  )
} 