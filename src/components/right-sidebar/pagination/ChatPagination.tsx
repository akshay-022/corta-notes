'use client'

import { useState } from 'react'
import { ChevronUp } from 'lucide-react'

interface ChatPaginationProps {
  hasOlderMessages: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => void
}

export default function ChatPagination({
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder
}: ChatPaginationProps) {
  if (!hasOlderMessages) {
    return null
  }

  return (
    <div className="flex justify-center py-2">
      <button
        onClick={onLoadOlder}
        disabled={isLoadingOlder}
        className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#969696] hover:text-[#cccccc] hover:bg-[#2a2a2a] rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-[#333333] hover:border-[#404040]"
      >
        {isLoadingOlder ? (
          <>
            <span className="inline-block w-2.5 h-2.5 animate-spin rounded-full border border-[#969696] border-t-transparent" />
            Loading...
          </>
        ) : (
          <>
            <ChevronUp size={10} />
            Load older
          </>
        )}
      </button>
    </div>
  )
} 