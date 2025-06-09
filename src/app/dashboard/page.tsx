'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/supabase-client'
import { useRouter } from 'next/navigation'
import { Menu, X, FileText } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import TipTapEditor from '@/components/TipTapEditor'
import Sidebar from '@/components/Sidebar'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { superMemorySyncService } from '@/lib/supermemory/superMemorySync'

interface ContextMenu {
  x: number
  y: number
  type: 'folder' | 'file' | 'root'
  item?: Page
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [activePage, setActivePage] = useState<Page | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [highlightedFolders, setHighlightedFolders] = useState<Set<string>>(new Set())
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const checkUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user) {
        console.log('No user found, redirecting to login')
        router.push('/login')
        return
      }
      
      console.log('User found:', user.id)
      setUser(user)
      setLoading(false)
      
      // Load pages directly with the user from the API call
      await loadPagesForUser(user)
    } catch (error) {
      console.error('Auth error:', error)
      router.push('/login')
    }
  }

  const loadPagesForUser = async (userObj: any) => {
    console.log('Loading pages for user:', userObj.id)
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userObj.id)
      .eq('is_deleted', false)
      .order('title', { ascending: true })

    if (error) {
      console.error('Error loading pages:', error)
      return
    }

    if (data) {
      console.log('Loaded pages:', data.length)
      setPages(data)
      if (data.length > 0 && !activePage) {
        // Find first file (not folder)
        const firstFile = data.find(p => !(p.metadata as any)?.isFolder)
        if (firstFile) setActivePage(firstFile)
      }
    }
  }

  const loadPages = async () => {
    if (!user) {
      console.log('No user, skipping loadPages')
      return
    }
    
    await loadPagesForUser(user)
  }

  const handleManualSync = async () => {
    try {
      console.log('🔄 Manual SuperMemory sync triggered...')
      
      // Get pages that need syncing
      const pendingPages = superMemorySyncService.getPendingSyncPages(pages)
      console.log(`Found ${pendingPages.length} pages that need syncing to SuperMemory`)
      
      if (pendingPages.length === 0) {
        console.log('✅ All pages are already synced with SuperMemory')
        return
      }

      // Log which pages will be synced
      console.log('📋 Pages to sync:')
      pendingPages.forEach(page => {
        const syncStatus = superMemorySyncService.getSyncStatus(page)
        console.log(`- ${page.title} (status: ${syncStatus})`)
      })

      // Start sync and await completion for development
      await superMemorySyncService.syncAllPending(pages)
      console.log('🎉 Manual sync completed!')

    } catch (error) {
      console.error('❌ Manual sync failed:', error)
    }
  }

  const createNewItem = async (isFolder: boolean, parentId?: string, shouldBeOrganized?: boolean) => {
    if (!user) return

    console.log('Creating new item:', { isFolder, parentId, shouldBeOrganized })

    // Determine the organize status based on the context
    let organizeStatus: string | undefined = undefined
    if (shouldBeOrganized) {
      // Both files and folders in auto-organized section get 'yes' status
      organizeStatus = 'yes'
    } else if (!isFolder) { 
      // Only files in recent notes section get 'soon' status
      // Folders elsewhere don't get organize status
      organizeStatus = 'soon'
    }

    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: isFolder ? 'New Folder' : 'Untitled',
        user_id: user.id,
        content: { type: 'doc', content: [] },
        parent_uuid: parentId || null,
        metadata: { 
          isFolder,
          organizeStatus
        }
      })
      .select()
      .single()

    if (data) {
      console.log('Successfully created item:', data.title, 'with organizeStatus:', organizeStatus)
      setPages([...pages, data])
      if (!isFolder) {
        setActivePage(data)
        setSidebarOpen(false)
      }
      if (parentId) {
        setExpandedFolders(prev => new Set([...prev, parentId]))
      }
    } else if (error) {
      console.error('Error creating item:', error)
    }
    setContextMenu(null)
  }

  const renameItem = async (updatedPage: Page) => {
    if (!user) return
    
    console.log('Renaming item:', updatedPage.title)
    const { error } = await supabase
      .from('pages')
      .update({ title: updatedPage.title })
      .eq('uuid', updatedPage.uuid)
      .eq('user_id', user.id)

    if (!error) {
      setPages(pages.map(p => p.uuid === updatedPage.uuid ? updatedPage : p))
      if (activePage?.uuid === updatedPage.uuid) {
        setActivePage(updatedPage)
      }
    } else {
      console.error('Error renaming item:', error)
    }
  }

  const deleteItem = async (pageToDelete: Page) => {
    if (!user) return
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${pageToDelete.title}"?`)) {
      return
    }
    
    console.log('Deleting item:', pageToDelete.title)
    
    // First, delete from SuperMemory if it exists
    try {
      console.log('🧠 Attempting to delete from SuperMemory...')
      const superMemoryResponse = await fetch('/api/supermemory/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'delete',
          pageUuid: pageToDelete.uuid
        })
      })

      if (superMemoryResponse.ok) {
        const result = await superMemoryResponse.json()
        console.log('✅ SuperMemory deletion result:', result)
      } else {
        console.warn('⚠️ SuperMemory deletion failed, but continuing with local deletion')
      }
    } catch (error) {
      console.warn('⚠️ SuperMemory deletion error:', error, 'but continuing with local deletion')
    }

    // Then delete from local database
    const { error } = await supabase
      .from('pages')
      .update({ is_deleted: true })
      .eq('uuid', pageToDelete.uuid)
      .eq('user_id', user.id)

    if (!error) {
      setPages(pages.filter(p => p.uuid !== pageToDelete.uuid))
      if (activePage?.uuid === pageToDelete.uuid) {
        setActivePage(null)
      }
      console.log('🎯 Item deleted successfully from both SuperMemory and local database')
    } else {
      console.error('Error deleting item:', error)
    }
  }

  const updatePageMetadata = async (page: Page, metadata: any) => {
    if (!user) return
    
    console.log('Updating metadata for:', page.title, metadata)
    const { error } = await supabase
      .from('pages')
      .update({ metadata })
      .eq('uuid', page.uuid)
      .eq('user_id', user.id)

    if (!error) {
      const updatedPage = { ...page, metadata }
      setPages(pages.map(p => p.uuid === page.uuid ? updatedPage : p))
      if (activePage?.uuid === page.uuid) {
        setActivePage(updatedPage)
      }
    } else {
      console.error('Error updating metadata:', error)
    }
  }

  const moveItem = async (itemId: string, newParentId: string | null, newOrganizeStatus: 'soon' | 'yes') => {
    if (!user) return

    const itemToMove = pages.find(p => p.uuid === itemId)
    if (!itemToMove) return

    console.log('Moving item:', itemToMove.title, 'to parent:', newParentId, 'with status:', newOrganizeStatus)

    // Update the item's parent and organize status
    const newMetadata = {
      ...(itemToMove.metadata as any),
      organizeStatus: newOrganizeStatus
    }

    const { error } = await supabase
      .from('pages')
      .update({ 
        parent_uuid: newParentId,
        metadata: newMetadata
      })
      .eq('uuid', itemId)
      .eq('user_id', user.id)

    if (!error) {
      // Update local state
      const updatedItem = { 
        ...itemToMove, 
        parent_uuid: newParentId,
        metadata: newMetadata
      }
      setPages(pages.map(p => p.uuid === itemId ? updatedItem : p))
      
      // Update active page if it's the one being moved
      if (activePage?.uuid === itemId) {
        setActivePage(updatedItem)
      }

      // If moving to a folder, expand that folder
      if (newParentId) {
        setExpandedFolders(prev => new Set([...prev, newParentId]))
      }

      console.log('Successfully moved item:', itemToMove.title)
    } else {
      console.error('Error moving item:', error)
    }
  }

  // Initialize drag and drop functionality
  const dragAndDrop = useDragAndDrop({ onMoveItem: moveItem })

  const sendForOrganization = async (page: Page) => {
    if (!user) return
    
    console.log('Sending for organization:', page.title)
    
    try {
      // Get organization instructions from metadata (can be empty)
      const organizationInstructions = (page.metadata as any)?.organizationInstructions || ''

      // Call the organization API
      const response = await fetch('/api/organize-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          noteId: page.uuid,
          noteContent: page.content,
          organizationInstructions: organizationInstructions,
          fileTree: pages
        }),
      })

      const result = await response.json()

      if (result.success) {
        console.log('Organization successful:', result.message)
        console.log('Changed paths:', result.changedPaths)
        
        // Highlight folders in the changed paths
        if (result.changedPaths && result.changedPaths.length > 0) {
          const foldersToHighlight = new Set<string>()
          
          result.changedPaths.forEach((path: string) => {
            // Split path and add each folder level for highlighting
            const pathParts = path.split('/')
            pathParts.forEach((folderName: string) => {
              foldersToHighlight.add(folderName.trim())
            })
          })
          
          console.log('Setting highlighted folders:', Array.from(foldersToHighlight))
          setHighlightedFolders(foldersToHighlight)
          
        }
        
        // Refresh the pages to show the organized note
        await loadPages()
      } else {
        console.error('Organization failed:', result.error)
        alert(`Organization failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Error calling organization API:', error)
      alert('Failed to organize note. Please try again.')
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#1a1a1a] flex overflow-hidden">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-[#2a2a2a] p-1.5 rounded text-gray-400 hover:text-white border border-gray-700"
      >
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Sidebar Component */}
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
        logout={logout}
        onManualSync={handleManualSync}
        dragAndDrop={dragAndDrop}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activePage ? (
          <TipTapEditor 
            page={activePage} 
            onUpdate={(updatedPage: Page) => {
              setActivePage(updatedPage)
              setPages(pages.map(p => p.uuid === updatedPage.uuid ? updatedPage : p))
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Select a file to view</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
} 