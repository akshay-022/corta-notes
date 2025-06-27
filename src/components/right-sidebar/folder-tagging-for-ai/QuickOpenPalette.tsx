import { useQuickOpen } from './QuickOpenContext'
import { FileText, Folder } from 'lucide-react'
import React, { useRef, useEffect } from 'react'

interface Props {
  anchorRef: React.RefObject<HTMLTextAreaElement | null>
}

/**
 * Floating palette that lists folders/files according to QuickOpenContext.
 * Render this once in ChatPanel so it can position relative to the textarea.
 */
export default function QuickOpenPalette({ anchorRef }: Props) {
  const {
    isOpen,
    items,
    inputText,
    selectFile,
  } = useQuickOpen()

  const containerRef = useRef<HTMLDivElement>(null)

  // Position palette under anchor
  useEffect(() => {
    if (!isOpen || !anchorRef.current || !containerRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    containerRef.current.style.left = `${rect.left}px`
    containerRef.current.style.top = `${rect.top - 4}px`
    containerRef.current.style.transform = 'translateY(-100%)'
    containerRef.current.style.width = `${rect.width}px`
  }, [isOpen, anchorRef])

  if (!isOpen) return null

  return (
    <div
      ref={containerRef}
      className="fixed z-50 rounded-md bg-[#1e1e1e] border border-[#333] shadow-lg max-h-64 overflow-y-auto"
    >
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-3 text-sm text-white">
            {inputText ? 'No matching files' : 'No files available'}
          </div>
        ) : (
          items.map((item, index) => {
            return (
              <button
                key={item.uuid}
                onClick={() => selectFile(item)}
                className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-700 text-sm text-white"
              >
                {item.type === 'folder' ? (
                  <Folder size={16} className="text-blue-400" />
                ) : (
                  <FileText size={16} className="text-gray-300" />
                )}
                <span className="truncate">{item.title}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
} 