'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/supabase-client'
import { useRouter } from 'next/navigation'
import { Menu, X, FileText } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import TipTapEditor from '@/components/TipTapEditor'
import Sidebar from '@/components/Sidebar'

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
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
    loadPages()
  }, [])

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setUser(user)
    setLoading(false)
  }

  const loadPages = async () => {
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('is_deleted', false)
      .order('title', { ascending: true })

    if (data) {
      setPages(data)
      if (data.length > 0 && !activePage) {
        // Find first file (not folder)
        const firstFile = data.find(p => !(p.metadata as any)?.isFolder)
        if (firstFile) setActivePage(firstFile)
      }
    }
  }

  const createNewItem = async (isFolder: boolean, parentId?: string) => {
    if (!user) return

    const { data, error } = await supabase
      .from('pages')
      .insert({
        title: isFolder ? 'New Folder' : 'Untitled',
        user_id: user.id,
        content: { type: 'doc', content: [] },
        parent_uuid: parentId || null,
        metadata: { isFolder }
      })
      .select()
      .single()

    if (data) {
      setPages([...pages, data])
      if (!isFolder) {
        setActivePage(data)
        setSidebarOpen(false)
      }
      if (parentId) {
        setExpandedFolders(prev => new Set([...prev, parentId]))
      }
    }
    setContextMenu(null)
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
    <div className="min-h-screen bg-[#1a1a1a] flex">
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
        logout={logout}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-0">
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