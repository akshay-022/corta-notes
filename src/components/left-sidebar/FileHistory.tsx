'use client'

import { useState, useEffect } from 'react'
import { FileText, RotateCcw, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FileHistoryItem, EnhancedFileHistoryItem } from './fileHistoryUtils'
import { createClient } from '@/lib/supabase/supabase-client'
import { revertService, loadEnhancedHistoryFromStorage } from '@/lib/auto-organization/organized-file-updates/reverting-files'
import logger from '@/lib/logger'

interface FileHistoryProps {
  isMobile?: boolean
  setSidebarOpen: (open: boolean) => void
  onSeeAll?: () => void
}

const MAX_HISTORY_ITEMS = 10
const DISPLAY_ITEMS = 3

export default function FileHistory({ isMobile, setSidebarOpen, onSeeAll }: FileHistoryProps) {
  const [history, setHistory] = useState<FileHistoryItem[]>([])
  const [showAll, setShowAll] = useState(false)
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set())
  const [enhancedHistory, setEnhancedHistory] = useState<EnhancedFileHistoryItem[]>([])
  const [revertingItems, setRevertingItems] = useState<Set<string>>(new Set())
  const [confirmRevert, setConfirmRevert] = useState<EnhancedFileHistoryItem | null>(null)
  const router = useRouter()

  console.log('🔍 FileHistory: Component mounted/re-rendered')

  // Load history from Supabase profile metadata on mount
  useEffect(() => {
    console.log('🔍 FileHistory: Initial load useEffect triggered')
    const init = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('metadata')
          .eq('user_id', user.id)
          .single()
        const remoteHistory: FileHistoryItem[] | undefined = profile?.metadata?.fileHistory
        if (remoteHistory && Array.isArray(remoteHistory)) {
          setHistory(remoteHistory)
        }
      } catch (err) {
        console.error('Failed to load file history from Supabase', err)
      }
    }
    init()
  }, [])

  // Load enhanced history from localStorage on mount
  useEffect(() => {
    console.log('🔍 FileHistory: Enhanced history load useEffect triggered')
    const loadEnhancedHistory = () => {
      const enhanced = loadEnhancedHistoryFromStorage()
      setEnhancedHistory(enhanced)
    }
    loadEnhancedHistory()
  }, [])

  // Real-time listener for profile metadata changes (file history updates)
  useEffect(() => {
    const supabase = createClient()
    let channel: any = null

    const setupRealtimeListener = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
          console.log('🔍 FileHistory: No user found, skipping real-time setup')
          return
        }

        console.log('🔍 FileHistory: Setting up real-time listener for profile metadata', { userId: user.id })

        channel = supabase
          .channel('file-history-updates')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              console.log('🔍 FileHistory: RAW real-time payload received:', payload)
              console.log('🔍 FileHistory: Profile metadata updated via real-time', { 
                userId: user.id,
                hasMetadata: !!payload.new.metadata,
                hasFileHistory: !!(payload.new.metadata as any)?.fileHistory,
                oldMetadata: payload.old?.metadata,
                newMetadata: payload.new.metadata
              })
              
              const remoteHistory: FileHistoryItem[] | undefined = (payload.new.metadata as any)?.fileHistory
              if (remoteHistory && Array.isArray(remoteHistory)) {
                console.log('🔍 FileHistory: Updating file history from real-time', { 
                  historyCount: remoteHistory.length,
                  historyItems: remoteHistory.map(h => ({ uuid: h.uuid, title: h.title, action: h.action }))
                })
                setHistory(remoteHistory)
              } else {
                console.log('🔍 FileHistory: No valid file history in payload', { remoteHistory })
              }
            }
          )
          .subscribe((status) => {
            console.log('🔍 FileHistory: Subscription status:', status)
          })

        console.log('🔍 FileHistory: Real-time listener setup complete')
      } catch (err) {
        console.error('🔍 FileHistory: Failed to setup real-time listener:', err)
      }
    }

    setupRealtimeListener()

    return () => {
      if (channel) {
        console.log('🔍 FileHistory: Cleaning up real-time listener')
        supabase.removeChannel(channel)
      }
    }
  }, []) // Empty dependency array - setup once

  // Listen for file history updates
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'FILE_HISTORY_UPDATE' && event.data.data) {
        const newItems: FileHistoryItem[] = event.data.data
        addToHistory(newItems)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const saveToSupabase = async (updatedHistory: FileHistoryItem[]) => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) return
      
      // First, get current metadata to preserve existing keys
      const { data: profile } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('user_id', user.id)
        .single()
      
      const currentMetadata = (profile?.metadata as any) || {}
      const updatedMetadata = {
        ...currentMetadata,
        fileHistory: updatedHistory  // Only update fileHistory, preserve other keys
      }
      
      await supabase
        .from('profiles')
        .update({ metadata: updatedMetadata })
        .eq('user_id', user.id)
    } catch (err) {
      console.error('Failed to save file history to Supabase', err)
    }
  }

  const addToHistory = (newItems: FileHistoryItem[]) => {
    setHistory(prevHistory => {
      // Create a map of existing items by uuid for deduplication
      const existingMap = new Map(prevHistory.map(item => [item.uuid, item]))
      
      // Add new items, replacing any existing ones with same uuid
      newItems.forEach(item => {
        existingMap.set(item.uuid, item)
      })
      
      // Convert back to array and sort by timestamp (newest first)
      const updatedHistory = Array.from(existingMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_HISTORY_ITEMS)
      
      // Persist to Supabase (fire and forget)
      saveToSupabase(updatedHistory)
      
      // Trigger animation for new items
      const newUuids = new Set(newItems.map(item => item.uuid))
      setAnimatingItems(newUuids)
      
      // Clear animation after a short delay
      setTimeout(() => {
        setAnimatingItems(new Set())
      }, 600)
      
      return updatedHistory
    })
  }

  const handleFileClick = (item: FileHistoryItem) => {
    router.push(`/dashboard/page/${item.uuid}`)
    if (!isMobile) {
      setSidebarOpen(false)
    }
  }

  const handleRevertClick = (e: React.MouseEvent, item: FileHistoryItem) => {
    e.stopPropagation() // Prevent file navigation
    
    // Find the enhanced history item for this file
    const enhancedItem = enhancedHistory.find(h => h.uuid === item.uuid)
    if (enhancedItem) {
      setConfirmRevert(enhancedItem)
    } else {
      logger.warn('No enhanced history found for revert', { uuid: item.uuid })
    }
  }

  const confirmRevertAction = async () => {
    if (!confirmRevert) return

    setRevertingItems(prev => new Set([...prev, confirmRevert.uuid]))
    
    try {
      const result = await revertService.revertFileChange(confirmRevert)
      
      if (result.success) {
        logger.info('File successfully reverted', { 
          pageUuid: result.pageUuid?.substring(0, 8),
          pageTitle: result.pageTitle 
        })
        
        // Remove from enhanced history
        setEnhancedHistory(prev => prev.filter(h => h.uuid !== confirmRevert.uuid))
        
        // Show success feedback (you could add a toast notification here)
        console.log(`✅ Successfully reverted "${result.pageTitle}"`)
        
        // Refresh the page if user is currently viewing the reverted file
        const currentPath = window.location.pathname
        if (currentPath.includes(confirmRevert.uuid)) {
          window.location.reload()
        }
      } else {
        logger.error('Revert failed', { error: result.error })
        console.error(`❌ Revert failed: ${result.error}`)
      }
    } catch (error) {
      logger.error('Revert operation error', { error })
      console.error('❌ Revert operation error:', error)
    } finally {
      setRevertingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(confirmRevert.uuid)
        return newSet
      })
      setConfirmRevert(null)
    }
  }

  const cancelRevert = () => {
    setConfirmRevert(null)
  }

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const displayedItems = showAll ? history : history.slice(0, DISPLAY_ITEMS)
  const hasMore = false // hide show more button

  // if (history.length === 0) {
  //   return null
  // }

  return (
    <div className="pb-4">
      <div className="px-4 pb-2 flex items-center justify-between">
        <h3 className="text-[#969696] text-xs font-medium uppercase tracking-wider">
          Recent Changes
        </h3>
        {history.length > DISPLAY_ITEMS && (
          <button
            onClick={() => {
              if (onSeeAll) {
                onSeeAll()
              } else {
                setShowAll(true)
              }
            }}
            className="text-[#969696] hover:text-[#cccccc] text-[10px] tracking-wide"
          >
            See All
          </button>
        )}
      </div>
      
      <div className="space-y-0">
        {displayedItems.map((item, index) => {
          const isAnimating = animatingItems.has(item.uuid)
          const isReverting = revertingItems.has(item.uuid)
          const canRevert = enhancedHistory.some(h => h.uuid === item.uuid)
          
          return (
            <div
              key={item.uuid}
              className={`
                flex items-center hover:bg-[#2a2d2e] text-sm group transition-all duration-300 cursor-pointer
                ${isAnimating ? 'animate-pulse bg-[#2a2d2e]' : ''}
                ${isReverting ? 'opacity-60' : ''}
              `}
              style={{ 
                paddingLeft: '16px', 
                paddingRight: '16px',
                transform: isAnimating ? 'translateX(-4px)' : 'translateX(0)',
                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onClick={() => handleFileClick(item)}
            >
              <div className="flex items-center gap-1 py-1.5 flex-1 min-w-0">
                <div className="w-4 h-4 flex items-center justify-center">
                  <FileText size={14} className="text-[#519aba]" />
                </div>
                
                <div className="flex-1 min-w-0 ml-1">
                  <div
                    className="text-[#cccccc] truncate text-sm font-normal"
                    title={item.path || item.title}
                  >
                    {item.title}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-[#969696]">
                  <span className={`
                    px-1.5 py-0.5 rounded text-xs
                    ${item.action === 'created' 
                      ? 'bg-[#1a5a1a] text-[#4caf50]' 
                      : 'bg-[#1a3a5a] text-[#2196f3]'
                    }
                  `}>
                    {item.action === 'created' ? 'new' : 'upd'}
                  </span>
                  <span>{getTimeAgo(item.timestamp)}</span>
                  
                  {/* Revert button - only show if we have enhanced history for this item */}
                  {canRevert && (
                    <button
                      onClick={(e) => handleRevertClick(e, item)}
                      disabled={isReverting}
                      className={`
                        p-1 rounded transition-colors opacity-0 group-hover:opacity-100
                        ${isReverting 
                          ? 'text-[#666] cursor-not-allowed' 
                          : 'text-[#969696] hover:text-[#ff6b6b] hover:bg-[#3a2a2a]'
                        }
                      `}
                      title={isReverting ? 'Reverting...' : 'Revert this change'}
                    >
                      <RotateCcw size={12} className={isReverting ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirmation Dialog */}
      {confirmRevert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] border border-[#404040] rounded-lg p-6 w-96 max-w-[90vw]">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-[#ff6b6b]" />
              <h3 className="text-[#cccccc] font-medium">
                {revertService.getRevertPreview(confirmRevert).action}
              </h3>
            </div>
            
            <div className="mb-4">
              <p className="text-[#cccccc] text-sm mb-2">
                {revertService.getRevertPreview(confirmRevert).description}
              </p>
              {revertService.getRevertPreview(confirmRevert).warning && (
                <p className="text-[#ff6b6b] text-xs">
                  ⚠️ {revertService.getRevertPreview(confirmRevert).warning}
                </p>
              )}
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelRevert}
                className="px-4 py-2 text-[#cccccc] hover:bg-[#3a3a3a] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevertAction}
                className="px-4 py-2 bg-[#ff6b6b] text-white hover:bg-[#ff5555] rounded transition-colors"
              >
                {confirmRevert.action === 'created' ? 'Delete File' : 'Revert Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 