'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import logger from '@/lib/logger'

export default function DashboardPage() {
  const router = useRouter()
  
  useEffect(() => {
    // This page should only redirect - never render content
    const redirectToPage = () => {
      if (typeof window !== 'undefined') {
        const lastOpened = localStorage.getItem('lastOpenedPageUuid')
        if (lastOpened) {
          logger.info('Redirecting to last opened page', { pageUuid: lastOpened })
          router.replace(`/dashboard/page/${lastOpened}`)
          return
        }
      }
      
      // If no last opened page, redirect to a default or show loading
      // We'll let the DashboardSidebarProvider handle finding the first page
      logger.info('No last opened page found, user will need to select a page')
    }
    
    redirectToPage()
  }, [router])

  // Show minimal loading while redirecting
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
      <div className="text-gray-400 text-sm">Redirecting to your notes...</div>
    </div>
  )
} 