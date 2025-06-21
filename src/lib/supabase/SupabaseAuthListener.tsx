'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from './supabase-client'
import logger from '@/lib/logger'

/**
 * Keeps Supabase auth state (cookies) in sync between client and server.
 * Only refreshes on meaningful auth events to prevent excessive recompilation.
 */
export default function SupabaseAuthListener() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      logger.info('Auth state changed', { event })
      
      // Only refresh on events that actually matter for SSR
      const shouldRefresh = ['SIGNED_IN', 'SIGNED_OUT'].includes(event)
      
      if (shouldRefresh) {
        logger.info('Refreshing router for auth change', { event })
        router.refresh()
      } else {
        logger.info('Skipping router refresh for auth event', { event })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // We only want this to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
} 