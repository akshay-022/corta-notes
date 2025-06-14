'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { FileText, Edit3, MessageSquare } from 'lucide-react'

interface MobileLayoutWrapperProps {
  sidebar: ReactNode
  editor: ReactNode
  chatPanel: ReactNode
  isChatOpen: boolean
  onChatToggle: () => void
}

export default function MobileLayoutWrapper({
  sidebar,
  editor,
  chatPanel,
  isChatOpen,
  onChatToggle
}: MobileLayoutWrapperProps) {
  const [activeView, setActiveView] = useState<'sidebar' | 'editor' | 'chat'>('editor')
  const pathname = usePathname()

  // Auto-switch to editor when URL changes (navigation)
  useEffect(() => {
    setActiveView('editor')
  }, [pathname])

  // Auto-switch to chat when chat panel opens
  useEffect(() => {
    if (isChatOpen) {
      setActiveView('chat')
    } else if (activeView === 'chat') {
      // If chat is closed and we're currently on chat view, switch to editor
      setActiveView('editor')
    }
  }, [isChatOpen, activeView])

  // Remember last active view
  useEffect(() => {
    const savedView = localStorage.getItem('mobile-active-view')
    if (savedView && ['sidebar', 'editor', 'chat'].includes(savedView)) {
      setActiveView(savedView as 'sidebar' | 'editor' | 'chat')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('mobile-active-view', activeView)
  }, [activeView])

  const handleViewChange = (view: 'sidebar' | 'editor' | 'chat') => {
    setActiveView(view)
    if (view === 'chat' && !isChatOpen) {
      onChatToggle()
    } else if (view !== 'chat' && isChatOpen) {
      onChatToggle()
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#181818]">
      {/* Mobile Toggle Bar */}
      <div className="flex bg-[#1e1e1e] border-b border-[#333333] p-2 md:hidden">
        <button
          onClick={() => handleViewChange('sidebar')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-colors ${
            activeView === 'sidebar'
              ? 'bg-[#007acc] text-white'
              : 'text-[#cccccc] hover:bg-[#2a2a2a]'
          }`}
        >
          <FileText size={16} />
          <span>Notes</span>
        </button>
        <button
          onClick={() => handleViewChange('editor')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-colors mx-1 ${
            activeView === 'editor'
              ? 'bg-[#007acc] text-white'
              : 'text-[#cccccc] hover:bg-[#2a2a2a]'
          }`}
        >
          <Edit3 size={16} />
          <span>Editor</span>
        </button>
        <button
          onClick={() => handleViewChange('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-colors ${
            activeView === 'chat'
              ? 'bg-[#007acc] text-white'
              : 'text-[#cccccc] hover:bg-[#2a2a2a]'
          }`}
        >
          <MessageSquare size={16} />
          <span>Chat</span>
        </button>
      </div>

      {/* Views Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Sidebar View */}
        <div className={`absolute inset-0 ${activeView === 'sidebar' ? 'block' : 'hidden'} md:relative md:block md:w-[260px] md:flex-shrink-0 overflow-y-auto`}>
          <div className="h-full">
            {sidebar}
          </div>
        </div>
        
        {/* Editor View */}
        <div className={`absolute inset-0 ${activeView === 'editor' ? 'block' : 'hidden'} md:relative md:block md:flex-1 overflow-y-auto`}>
          <div className="h-full">
            {editor}
          </div>
        </div>
        
        {/* Chat View */}
        <div className={`absolute inset-0 ${activeView === 'chat' ? 'block' : 'hidden'} md:relative md:block md:w-[400px] md:flex-shrink-0 ${isChatOpen ? 'md:block' : 'md:hidden'}`}>
          {chatPanel}
        </div>
      </div>
    </div>
  )
} 