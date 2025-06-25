"use client"

import { ReactNode, useContext, createContext, useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import Sidebar from '@/components/left-sidebar/Sidebar'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { superMemorySyncService } from '@/lib/memory/memory-client-sync'
import { createClient } from '@/lib/supabase/supabase-client'
import { resetClient } from '@/lib/supabase/supabase-client'
import { loadRelevantNotes } from '@/lib/supabase/page-loader'
import logger from '@/lib/logger'
import MobileLayoutWrapper from '@/components/mobile/MobileLayoutWrapper'
import ChatPanel, { ChatPanelHandle } from '../right-sidebar/ChatPanel'
import { useFileTreeEvents } from '@/hooks/useFileTreeEvents'
import { useResizablePanel } from '@/hooks/useResizablePanel'
import { useResizableChatPanel } from '@/hooks/useResizableChatPanel'

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
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
  selections: any[]
  setSelections: (selections: any[]) => void
  chatPanelWidth: number
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

  // Resizable panels
  const leftSidebar = useResizablePanel({
    storageKey: 'corta-left-sidebar-width',
    defaultWidth: 260,
    minWidth: 220,
    maxWidth: 400
  })

  const chatPanel = useResizableChatPanel({
    storageKey: 'corta-chat-panel-width',
    defaultWidth: 400,
    minWidth: 300,
    maxWidth: 600
  })

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
    const match = pathname.match(/\/dashboard\/page\/([a-zA-Z0-9\-]+)/)
    return match ? match[1] : null
  }

  // Initial data loading - run once
  useEffect(() => {
    let isMounted = true

    const initializeData = async () => {
      try {
        logger.info('Initializing dashboard data...')
        
        // 1. Check user authentication with timeout
        const authPromise = supabase.auth.getUser()
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Auth check timeout')), 10000)
        })
        
        const { data: { user }, error } = await Promise.race([authPromise, timeoutPromise]) as any
        
        if (error) {
          logger.error('Auth check failed:', error)
          // Only redirect on actual auth errors, not timeouts
          if (error.message !== 'Auth check timeout') {
            logger.info('Auth error detected, redirecting to login')
            router.push('/login')
            return
          } else {
            logger.warn('Auth check timed out, but continuing...')
            // Continue without redirect on timeout - might be slow network
          }
        }
        
        if (!user) {
          logger.info('No user found, redirecting to login')
          router.push('/login')
          return
        }

        if (!isMounted) return
        setUser(user)
        logger.info('User authenticated:', { userId: user.id })
        
        // 2. Load all pages in a single query
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

        // 3. Update state with pages data
        if (pagesData) {
          logger.info('Pages loaded successfully', { count: pagesData.length })
          setPages(pagesData)
        }

        setLoading(false)
      } catch (error) {
        // Ignore HMR-related errors in development
        if (error instanceof Error && error.message.includes('no longer runnable')) {
          logger.warn('Dashboard initialization interrupted by HMR, ignoring...', { error: error.message })
          return
        }
        
        logger.error('Error initializing dashboard:', error)
        router.push('/login')
      }
    }

    initializeData()

    // Cleanup function
    return () => {
      isMounted = false
    }
  }, []) // Empty dependency array - run only once

  // Listen for fileTree INSERT/DELETE events to refresh sidebar
  useFileTreeEvents((eventType, page) => {
    logger.info('FileTree event received in sidebar', { eventType, pageTitle: page.title, pageUuid: page.uuid })
    
    if (eventType === 'INSERT') {
      // Refresh pages to include the new page
      refreshOrganizedNotes()
    } else if (eventType === 'DELETE') {
      // Remove the deleted page from state immediately for better UX
      setPages(prevPages => prevPages.filter(p => p.uuid !== page.uuid))
      
      // If the deleted page was active, clear active page
      if (activePage?.uuid === page.uuid) {
        setActivePage(null)
        router.push('/dashboard')
      }
    }
  }, !loading) // Only enable after initial load is complete

  // Separate useEffect to handle active page changes when URL changes
  useEffect(() => {
    if (pages.length > 0) {
      const pageUuid = getPageUuidFromPath()
      if (pageUuid) {
        const currentPage = pages.find(p => p.uuid === pageUuid)
        if (currentPage && currentPage.uuid !== activePage?.uuid) {
          logger.info('Setting active page from URL:', { pageId: currentPage.uuid })
          setActivePage(currentPage)
          // Save to localStorage only when not on any login page
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            localStorage.setItem('lastOpenedPageUuid', pageUuid)
          }
        }
      }
    }
  }, [pathname, pages.length]) // Only react to pathname and pages.length, not the full pages array

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Listen for thought-tracking organization completion events
  useEffect(() => {
    const handleOrganizationComplete = async (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('🧠 Organization completed from thought tracker:', customEvent.detail)
      
      // Add a small delay to ensure Supabase operations are complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Refresh all pages from Supabase to get the latest organized content
      console.log('🧠 Refreshing pages from database after organization...')
      
      await refreshOrganizedNotes()
      
      console.log('🧠 ✅ Page refresh completed after organization')
      
      // Show notification if provided
      if (customEvent.detail.notification?.message) {
        // Use window.postMessage to trigger notification in Sidebar
        window.postMessage({
          type: 'ORGANIZATION_NOTIFICATION',
          data: { message: customEvent.detail.notification.message }
        }, '*')
      }
    }

    const handleOrganizationError = (event: Event) => {
      const customEvent = event as CustomEvent
      console.error('🧠 Organization error from thought tracker:', customEvent.detail)
      // Could show error notification here
    }

    // Enhanced cache update handlers for optimized performance
    const handleCacheUpdate = async (event: MessageEvent) => {
      if (event.data.type === 'ORGANIZATION_CACHE_UPDATE') {
        const { updatedPages, newPages, timestamp } = event.data.data
        console.log('🧠 Received optimized cache update:', { 
          updatedCount: updatedPages.length, 
          newCount: newPages.length,
          timestamp 
        })
        
        // Immediately update the local state with the new data
        setPages(prevPages => {
          const updatedPageMap = new Map(updatedPages.map((page: Page) => [page.uuid, page]))
          const newPageMap = new Map(newPages.map((page: Page) => [page.uuid, page]))
          
          // Update existing pages
          const updatedExistingPages = prevPages.map(page => {
            if (updatedPageMap.has(page.uuid)) {
              return updatedPageMap.get(page.uuid)!
            }
            return page
          })
          
          // Add new pages
          const finalPages = [...updatedExistingPages, ...newPages]
          
          console.log('🧠 ✅ Immediate cache update applied:', { 
            totalPages: finalPages.length,
            newlyAdded: newPages.length
          })
          
          return finalPages
        })
        
        // Update active page if it was modified - get current active page at runtime
        setActivePage(currentActive => {
          if (currentActive) {
            const updatedActivePage = updatedPages.find((page: Page) => page.uuid === currentActive.uuid)
            if (updatedActivePage) {
              console.log('🧠 ✅ Active page updated immediately')
              return updatedActivePage
            }
          }
          return currentActive
        })
        
        // Show immediate notification
        window.postMessage({
          type: 'ORGANIZATION_NOTIFICATION',
          data: { 
            message: `✅ Organization complete: ${updatedPages.length} updated, ${newPages.length} created`
          }
        }, '*')
      }
    }

    const handleRefreshRequired = async (event: MessageEvent) => {
      if (event.data.type === 'ORGANIZATION_REFRESH_REQUIRED') {
        const { reason, timestamp } = event.data.data
        console.log('🧠 Full refresh requested:', { reason, timestamp })
        
        // Perform a full refresh to ensure data consistency
        await refreshOrganizedNotes()
        console.log('🧠 ✅ Full refresh completed for consistency')
      }
    }

    // Listen for thought-tracking events
    window.addEventListener('thought-tracking:organization-complete', handleOrganizationComplete)
    window.addEventListener('thought-tracking:organization-error', handleOrganizationError)
    
    // Listen for optimized cache update events
    window.addEventListener('message', handleCacheUpdate)
    window.addEventListener('message', handleRefreshRequired)

    return () => {
      window.removeEventListener('thought-tracking:organization-complete', handleOrganizationComplete)
      window.removeEventListener('thought-tracking:organization-error', handleOrganizationError)
      window.removeEventListener('message', handleCacheUpdate)
      window.removeEventListener('message', handleRefreshRequired)
    }
  }, []) // Remove pages and activePage dependencies to prevent infinite loops

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
        console.log('🔄 Pages state updated with fresh data')
        
        // Update active page if it exists in the fresh data
        if (activePage) {
          const updatedActivePage = freshPages.find(p => p.uuid === activePage.uuid)
          if (updatedActivePage) {
            setActivePage(updatedActivePage)
            console.log('🔄 Active page updated with fresh data')
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
        // Navigate to the newly created page
        router.push(`/dashboard/page/${data.uuid}`)
      }
      if (parentId) setExpandedFolders(prev => new Set([...prev, parentId]))
      
      // Auto-trigger rename mode for the newly created item immediately
      setNewlyCreatedItem(data)
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

  const togglePageVisibility = async (page: Page) => {
    if (!user) return
    const newVisibility = !page.visible
    const { error } = await supabase
      .from('pages')
      .update({ visible: newVisibility })
      .eq('uuid', page.uuid)
      .eq('user_id', user.id)
    
    if (!error) {
      const updatedPage = { ...page, visible: newVisibility }
      setPages(pages.map(p => p.uuid === page.uuid ? updatedPage : p))
      if (activePage?.uuid === page.uuid) {
        setActivePage(updatedPage)
      }
      logger.info(`Page visibility toggled: ${page.title} is now ${newVisibility ? 'visible' : 'hidden'}`)
    } else {
      logger.error('Failed to toggle page visibility:', error)
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
    try {
      logger.info('Starting logout process...')
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      logger.info('Supabase signOut completed')
      
      // Reset the singleton client to clear auth state
      resetClient()
      logger.info('Client singleton reset')
      
      // Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lastOpenedPageUuid')
        logger.info('Cleared localStorage')
      }
      
      // Redirect to login
      logger.info('Redirecting to login page')
      router.push('/login')
      
    } catch (error) {
      logger.error('Logout failed:', error)
      // Force redirect even if logout fails
      resetClient()
      router.push('/login')
    }
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
    <NotesContext.Provider value={{ pages, activePage, setActivePage, updatePage, refreshOrganizedNotes, isChatOpen, setIsChatOpen, selections, setSelections, chatPanelWidth: chatPanel.width }}>
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
              togglePageVisibility={togglePageVisibility}
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
              onPageUpdate={updatePage}
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
          <div 
            className="h-screen overflow-y-auto bg-[#1a1a1a] border-r border-[#222] relative flex-shrink-0"
            style={{ width: `${leftSidebar.width}px` }}
          >
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
              togglePageVisibility={togglePageVisibility}
              dragAndDrop={dragAndDrop}
              isMobile={false}
              newlyCreatedItem={newlyCreatedItem}
              onClearNewlyCreatedItem={clearNewlyCreatedItem}
            />
            {/* Left sidebar resize handle */}
            <div
              className={`absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 ${leftSidebar.isResizing ? 'bg-blue-500/60' : 'bg-transparent hover:bg-blue-500/40'}`}
              onMouseDown={leftSidebar.startResize}
              title="Drag to resize sidebar"
            />
          </div>
          {/* Desktop Main content - adjust width based on chat panel state */}
          <div className={`h-screen overflow-y-auto bg-[#181818] transition-all duration-75 ${
            isChatOpen ? 'flex-1 min-w-0' : 'flex-1 min-w-0'
          }`}>
            <div className="h-full">
              {children}
            </div>
          </div>
          {/* Desktop Chat Panel - always mounted, hidden when closed */}
          <div 
            className={`h-screen border-l border-[#333333] bg-[#1e1e1e] relative z-50 transition-all duration-[25ms] flex-shrink-0 ${
              isChatOpen ? '' : 'w-0 overflow-hidden'
            }`}
            style={{ width: isChatOpen ? chatPanel.width : 0 }}
          >
            {/* Chat panel resize handle */}
            {isChatOpen && (
              <div
                className={`absolute top-0 left-0 w-1 h-full cursor-col-resize transition-colors group ${
                  chatPanel.isResizing ? 'bg-blue-500/50' : 'hover:bg-blue-500/30'
                }`}
                onMouseDown={chatPanel.startResize}
              >
                <div className="w-full h-full" />
              </div>
            )}
            <div className="h-full" style={{ width: chatPanel.width, marginLeft: isChatOpen ? 4 : 0 }}>
              <ChatPanel
                ref={chatPanelRef}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                currentPage={activePage || undefined}
                allPages={pages}
                selections={selections}
                setSelections={setSelections}
                onApplyAiResponseToEditor={undefined}
                onPageUpdate={updatePage}
                editor={null}
                isMobile={false}
              />
            </div>
          </div>
        </div>
      )}
    </NotesContext.Provider>
  )
} 