'use client'

import { useState, useEffect } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FileHistoryItem } from './fileHistoryUtils'
import { createClient } from '@/lib/supabase/supabase-client'

interface FileHistoryProps {
  isMobile?: boolean
  setSidebarOpen: (open: boolean) => void
}

const MAX_HISTORY_ITEMS = 10
const DISPLAY_ITEMS = 3

export default function FileHistory({ isMobile, setSidebarOpen }: FileHistoryProps) {
  const [history, setHistory] = useState<FileHistoryItem[]>([])
  const [showAll, setShowAll] = useState(false)
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set())
  const router = useRouter()

  // Load history from Supabase profile metadata on mount
  useEffect(() => {
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
      await supabase
        .from('profiles')
        .update({ metadata: { fileHistory: updatedHistory } })
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
  const hasMore = history.length > DISPLAY_ITEMS

  // if (history.length === 0) {
  //   return null
  // }

  return (
    <div className="pb-4">
      <div className="px-4 pb-2">
        <h3 className="text-[#969696] text-xs font-medium uppercase tracking-wider">
          Recent Changes
        </h3>
      </div>
      
      <div className="space-y-0">
        {displayedItems.map((item, index) => {
          const isAnimating = animatingItems.has(item.uuid)
          
          return (
            <div
              key={item.uuid}
              className={`
                flex items-center hover:bg-[#2a2d2e] text-sm group transition-all duration-300 cursor-pointer
                ${isAnimating ? 'animate-pulse bg-[#2a2d2e]' : ''}
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
                  <div className="text-[#cccccc] truncate text-sm font-normal">
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
                </div>
              </div>
            </div>
          )
        })}
        
        {hasMore && (
          <div className="px-4 pt-1">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[#969696] hover:text-[#cccccc] text-xs flex items-center gap-1 transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp size={12} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  See more ({history.length - DISPLAY_ITEMS} more)
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
} 