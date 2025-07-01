'use client'

import { useState, useEffect } from 'react'
import { HelpCircle, X } from 'lucide-react'

interface ParaHelpDialogProps {
  autoOpen?: boolean
  onAutoOpenComplete?: () => void
}

export default function ParaHelpDialog({ autoOpen = false, onAutoOpenComplete }: ParaHelpDialogProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Auto-open when autoOpen prop is true
  useEffect(() => {
    if (autoOpen) {
      setIsOpen(true)
      // Notify parent that auto-open has been handled
      if (onAutoOpenComplete) {
        onAutoOpenComplete()
      }
    }
  }, [autoOpen, onAutoOpenComplete])

  const openDialog = () => {
    setIsOpen(true)
  }

  const closeDialog = () => {
    setIsOpen(false)
  }

  return (
    <>
      {/* Question Mark Button - Bottom Right */}
      <button
        onClick={openDialog}
        className="fixed bottom-4 right-4 z-40 text-gray-500 hover:text-gray-400 hover:bg-[#3a3a3a] rounded p-1 transition-colors"
        title="PARA Method Help"
      >
        <HelpCircle size={24} />
      </button>

      {/* Help Dialog */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2a2a2a] border border-gray-600 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                🎉 Welcome to Your Second Brain!
              </h2>
              <button
                onClick={closeDialog}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="text-gray-300 space-y-4">
              <p className="text-base font-medium">
                Right-click in the auto-organized section to create custom folders (to tell us how you like your brain organized). We've set up a well known <strong>PARA template</strong> to get you started. (Re : <a href="https://fortelabs.co/blog/para/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Building a Second Brain by Tiago Forte</a>)
              </p>

              <div className="space-y-3">
                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-blue-400 font-semibold mb-1">📁 Projects</h3>
                  <p className="text-sm">
                    <strong>Short-term efforts</strong> with clear outcomes
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Examples: Blogs, Assignments, Startup Idea
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-green-400 font-semibold mb-1">📂 Areas</h3>
                  <p className="text-sm">
                    <strong>Ongoing responsibilities</strong> to maintain
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Examples: Co-founders, Relationship, Finances
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-yellow-400 font-semibold mb-1">📚 Resources</h3>
                  <p className="text-sm">
                    <strong>Reference material</strong> for future use
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Examples: Books, Founders, Podcasts
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-gray-400 font-semibold mb-1">📦 Archives</h3>
                  <p className="text-sm">
                    <strong>Completed items</strong> - don't delete, archive!
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Examples: Anything you have finished working on (finished projects etc)
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-purple-400 font-semibold mb-1">👤 Me</h3>
                  <p className="text-sm">
                    <strong>Personal notes</strong> and self-reflection
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Examples: Introspection, About me
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-3">
                  <h3 className="text-red-400 font-semibold mb-1">✅ TODOs</h3>
                  <p className="text-sm">
                    <strong>Universal task list</strong> - review daily
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
                <h4 className="text-blue-300 font-semibold mb-2">💡 Key Rule:</h4>
                <p className="text-sm">
                  Organize by <strong>when you'll need it</strong>, not what it is
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={closeDialog}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
} 