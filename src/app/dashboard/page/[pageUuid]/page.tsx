"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/lib/supabase/types'
import TipTapEditor from '@/components/editor/TipTapEditor'
import { useParams } from 'next/navigation'
import { FileText } from 'lucide-react'
import { useNotes } from '@/components/left-sidebar/DashboardSidebarProvider'
import { createClient } from '@/lib/supabase/supabase-client'
import logger from '@/lib/logger'

// Configure Edge Runtime for Cloudflare Pages
export const runtime = 'edge'

export default function DashboardPageByUuid() {
  const router = useRouter()
  const params = useParams()
  const pageUuid = params.pageUuid as string
  const notesCtx = useNotes()
  const supabase = createClient()

  const [activePage, setActivePage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pageUuid) {
      setLoading(false)
      return
    }

    // Always fetch fresh data from Supabase when page loads
    const fetchPageFromSupabase = async () => {
      try {
        logger.info('Fetching fresh page data from Supabase', { pageUuid })
        
        const { data: user } = await supabase.auth.getUser()
        if (!user.user) {
          logger.error('No authenticated user found')
          router.push('/login')
          return
        }

        const { data: pageData, error } = await supabase
          .from('pages')
          .select('*')
          .eq('user_id', user.user.id)
          .eq('uuid', pageUuid)
          .eq('is_deleted', false)
          .maybeSingle()

        if (error) {
          logger.error('Error fetching page from Supabase:', error)
          setActivePage(null)
          setLoading(false)
          return
        }

        if (!pageData) {
          logger.warn('Page not found in Supabase', { pageUuid })
          setActivePage(null)
          setLoading(false)
          return
        }

        logger.info('Successfully fetched fresh page data', { 
          pageUuid, 
          title: pageData.title,
          updated_at: pageData.updated_at 
        })
        
        setActivePage(pageData)
        
        // Update the context with fresh data too
        if (notesCtx) {
          notesCtx.setActivePage(pageData)
        }
        
        setLoading(false)
      } catch (error) {
        logger.error('Exception fetching page:', error)
        setActivePage(null)
        setLoading(false)
      }
    }

    fetchPageFromSupabase()
  }, [pageUuid]) // Only depend on pageUuid - fetch fresh data every time

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
        <div className="flex-1 flex items-center justify-center h-full min-h-screen">
          <p className="text-gray-400 text-sm">Click on a page to get started!</p>
        </div>
      )}
    </div>
  )
} 