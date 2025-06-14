'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Menu, X, FileText } from 'lucide-react'
import { Page } from '@/lib/supabase/types'
import TipTapEditor from '@/components/editor/TipTapEditor'
import { useNotes } from '@/components/left-sidebar/DashboardSidebarProvider'
import logger from '@/lib/logger'

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pageUuid = searchParams.get('pageUuid')
  const notesCtx = useNotes()

  useEffect(() => {
    // If no pageUuid in URL, redirect to last opened page (from localStorage)
    if (!pageUuid) {
      const lastOpened = typeof window !== 'undefined' ? localStorage.getItem('lastOpenedPageUuid') : null
      if (lastOpened) {
        logger.info('Redirecting to last opened page', { pageUuid: lastOpened })
        router.replace(`/dashboard?pageUuid=${lastOpened}`)
      }
    } else {
      // Save this as the last opened page
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastOpenedPageUuid', pageUuid)
      }
    }
  }, [pageUuid, router])

  if (!notesCtx) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  const { pages, activePage, setActivePage } = notesCtx

  return (
    <div className="h-screen bg-[#1a1a1a] flex overflow-hidden">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-[#2a2a2a] p-1.5 rounded text-gray-400 hover:text-white border border-gray-700"
      >
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activePage ? (
          <TipTapEditor 
            page={activePage} 
            allPages={pages}
            onUpdate={(updatedPage: Page) => {
              setActivePage(updatedPage)
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