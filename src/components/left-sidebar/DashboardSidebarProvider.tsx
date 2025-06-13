"use client"

import { useEffect, useState, ReactNode, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import Sidebar from '@/components/left-sidebar/Sidebar'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { superMemorySyncService } from '@/lib/memory/memory-client-sync'
import { createClient } from '@/lib/supabase/supabase-client'

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
} | null>(null)

export function useNotes() {
  return useContext(NotesContext)
}

export default function DashboardSidebarProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [activePage, setActivePage] = useState<Page | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [highlightedFolders, setHighlightedFolders] = useState<Set<string>>(new Set())
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Helper to extract pageUuid from URL
  function getPageUuidFromPath() {
    const match = pathname.match(/page\/([a-zA-Z0-9\-]+)/)
    return match ? match[1] : null
  }

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // On mount, fetch only the current page first, then fetch all notes in background
  const checkUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        router.push('/login')
        return
      }
      setUser(user)
      setLoading(true)
      // 1. Fetch only the current page first
      const pageUuid = getPageUuidFromPath() || (typeof window !== 'undefined' ? localStorage.getItem('lastOpenedPageUuid') : null)
      let initialPage: Page | null = null
      if (pageUuid) {
        const { data, error } = await supabase
          .from('pages')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .eq('uuid', pageUuid)
          .maybeSingle()
        if (data) {
          initialPage = data
          setActivePage(data)
          setPages([data]) // Only the current page for now
        }
      }
      setLoading(false)
      // 2. In the background, fetch all relevant notes
      loadRelevantNotes(user, initialPage)
    } catch (error) {
      router.push('/login')
    }
  }

  // Only fetch recent notes and auto-organized notes
  const loadRelevantNotes = async (userObj: any, initialPage: Page | null) => {
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userObj.id)
      .eq('is_deleted', false)
      .in('metadata->>organizeStatus', ['soon', 'yes'])
      .order('title', { ascending: true })
    if (data) {
      // Avoid duplicate if initialPage is already in state
      const filtered = initialPage ? data.filter((p: Page) => p.uuid !== initialPage.uuid) : data
      setPages(initialPage ? [initialPage, ...filtered] : data)
    }
  }

  const handleManualSync = async () => {
    try {
      const pendingPages = superMemorySyncService.getPendingSyncPages(pages)
      if (pendingPages.length === 0) return
      await superMemorySyncService.syncAllPending(pages)
    } catch (error) {
      console.error('❌ Manual sync failed:', error)
    }
  }

  const createNewItem = async (isFolder: boolean, parentId?: string, shouldBeOrganized?: boolean) => {
    if (!user) return
    let organizeStatus: string | undefined = undefined
    if (shouldBeOrganized) organizeStatus = 'yes'
    else if (!isFolder) organizeStatus = 'soon'
    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: isFolder ? 'New Folder' : 'Untitled',
        user_id: user.id,
        content: { type: 'doc', content: [] },
        parent_uuid: parentId || null,
        metadata: { isFolder, organizeStatus }
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

  const moveItem = async (itemId: string, newParentId: string | null, newOrganizeStatus: 'soon' | 'yes') => {
    if (!user) return
    const itemToMove = pages.find(p => p.uuid === itemId)
    if (!itemToMove) return
    const newMetadata = { ...(itemToMove.metadata as any), organizeStatus: newOrganizeStatus }
    const { error } = await supabase
      .from('pages')
      .update({ parent_uuid: newParentId, metadata: newMetadata })
      .eq('uuid', itemId)
      .eq('user_id', user.id)
    if (!error) {
      const updatedItem = { ...itemToMove, parent_uuid: newParentId, metadata: newMetadata }
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
        if (result.changedPaths && result.changedPaths.length > 0) {
          const foldersToHighlight = new Set<string>()
          result.changedPaths.forEach((path: string) => {
            const pathParts = path.split('/')
            pathParts.forEach((folderName: string) => {
              foldersToHighlight.add(folderName.trim())
            })
          })
          setHighlightedFolders(foldersToHighlight)
        }
        await loadRelevantNotes(user, activePage)
      } else {
        alert(`Organization failed: ${result.error}`)
      }
    } catch (error) {
      alert('Failed to organize note. Please try again.')
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const dragAndDrop = useDragAndDrop({ onMoveItem: moveItem })

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading sidebar...</div>
      </div>
    )
  }

  return (
    <NotesContext.Provider value={{ pages, activePage, setActivePage }}>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar */}
        <div className="h-screen overflow-y-auto bg-[#1a1a1a] border-r border-[#222] min-w-[220px] max-w-[320px] w-[260px]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden fixed top-3 left-3 z-50 bg-[#2a2a2a] p-1.5 rounded text-gray-400 hover:text-white border border-gray-700"
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
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
            onManualSync={handleManualSync}
            dragAndDrop={dragAndDrop}
          />
        </div>
        {/* Main content */}
        <div className="flex-1 min-w-0 h-screen overflow-y-auto bg-[#181818]">
          {children}
        </div>
      </div>
    </NotesContext.Provider>
  )
} 