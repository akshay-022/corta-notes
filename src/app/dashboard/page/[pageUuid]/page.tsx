"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/lib/supabase/types'
import TipTapEditor from '@/components/editor/TipTapEditor'
import { useParams } from 'next/navigation'
import { FileText } from 'lucide-react'
import { useNotes } from '@/components/left-sidebar/DashboardSidebarProvider'

// Configure Edge Runtime for Cloudflare Pages
export const runtime = 'edge'

export default function DashboardPageByUuid() {
  const router = useRouter()
  const params = useParams()
  const pageUuid = params.pageUuid as string
  const notesCtx = useNotes()

  const [activePage, setActivePage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!notesCtx) return
    setLoading(true)
    if (notesCtx.pages.length > 0 && pageUuid) {
      const found = notesCtx.pages.find(p => p.uuid === pageUuid)
      setActivePage(found || null)
      setLoading(false)
    }
  }, [notesCtx, pageUuid])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {activePage ? (
        <TipTapEditor 
          page={activePage} 
          allPages={notesCtx?.pages || []}
          pageRefreshCallback={notesCtx?.refreshOrganizedNotes}
          onUpdate={(updatedPage: Page) => {
            setActivePage(updatedPage)
            if (notesCtx) {
              notesCtx.setActivePage(updatedPage)
              notesCtx.updatePage(updatedPage) // Update the pages array in context
            }
          }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Page not found or you do not have access.</p>
          </div>
        </div>
      )}
    </div>
  )
} 