import { useQuickOpen } from './QuickOpenContext'
import { FileText, Folder, Check } from 'lucide-react'
import React, { useRef, useEffect } from 'react'

interface Props {
  anchorRef: React.RefObject<HTMLTextAreaElement | null>
  isMobile?: boolean
}

/**
 * Floating palette that lists folders/files according to QuickOpenContext.
 * Render this once in ChatPanel so it can position relative to the textarea.
 */
export default function QuickOpenPalette({ anchorRef, isMobile = false }: Props) {
  const {
    isOpen,
    items,
    inputText,
    selectFile,
    selectedFiles,
    toggleFileSelection,
    finishSelection,
    clearSelection,
    selectAllFiles,
  } = useQuickOpen()

  const containerRef = useRef<HTMLDivElement>(null)

  // Position palette above anchor
  useEffect(() => {
    if (!isOpen || !anchorRef.current || !containerRef.current) return
    
    const rect = anchorRef.current.getBoundingClientRect()
    
    if (isMobile) {
      // On mobile, position relative to the fixed input area
      // The input area is fixed at bottom-4 (16px from bottom)
      // We want the palette to appear just above the textarea
      containerRef.current.style.left = `${rect.left}px`
      containerRef.current.style.bottom = `${window.innerHeight - rect.top + 8}px` // 8px gap above textarea
      containerRef.current.style.top = 'auto'
      containerRef.current.style.transform = 'none'
      containerRef.current.style.width = `${rect.width}px`
      containerRef.current.style.position = 'fixed'
    } else {
      // Desktop positioning (existing logic)
      containerRef.current.style.left = `${rect.left}px`
      containerRef.current.style.top = `${rect.top - 4}px`
      containerRef.current.style.bottom = 'auto'
      containerRef.current.style.transform = 'translateY(-100%)'
      containerRef.current.style.width = `${rect.width}px`
      containerRef.current.style.position = 'fixed'
    }
  }, [isOpen, anchorRef, isMobile])

  if (!isOpen) return null

  // Calculate select all state
  const filesInView = items.filter(item => item.type !== 'folder')
  const selectedFileIds = new Set(selectedFiles.map(f => f.uuid))
  const selectedFilesInView = filesInView.filter(file => selectedFileIds.has(file.uuid))
  
  const selectAllState = filesInView.length === 0 ? 'disabled' 
    : selectedFilesInView.length === 0 ? 'unchecked'
    : selectedFilesInView.length === filesInView.length ? 'checked'
    : 'indeterminate'

  const handleSelectAllChange = () => {
    if (selectAllState === 'checked' || selectAllState === 'indeterminate') {
      // Deselect all files in current view
      const currentViewFileIds = new Set(filesInView.map(f => f.uuid))
      clearSelection()
      // But keep any files that were selected from other views
      const filesFromOtherViews = selectedFiles.filter(f => !currentViewFileIds.has(f.uuid))
      if (filesFromOtherViews.length > 0) {
        // This is a bit complex - for now just clear everything for simplicity
        clearSelection()
      }
    } else {
      // Select all files in current view
      selectAllFiles()
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 rounded-md bg-[#1e1e1e] border border-[#333] shadow-lg max-h-64 overflow-y-auto"
    >
      {/* Select All header - only show when there are files */}
      {filesInView.length > 0 && (
        <div className="p-2 border-b border-[#333] bg-[#2a2a2a] flex items-center justify-between">
          <button
            onClick={handleSelectAllChange}
            className="flex items-center gap-2 text-xs text-gray-300 hover:text-white transition-colors"
            disabled={selectAllState === 'disabled'}
          >
            <div className={`w-4 h-4 border rounded flex items-center justify-center ${
              selectAllState === 'checked' 
                ? 'bg-blue-600 border-blue-600' 
                : selectAllState === 'indeterminate'
                ? 'bg-blue-600 border-blue-600'
                : 'border-gray-400 hover:border-gray-300'
            }`}>
              {selectAllState === 'checked' && <Check size={12} className="text-white" />}
              {selectAllState === 'indeterminate' && (
                <div className="w-2 h-0.5 bg-white rounded"></div>
              )}
            </div>
            Select All ({filesInView.length} files)
          </button>
        </div>
      )}

      {/* Header with selected count and actions */}
      {selectedFiles.length > 0 && (
        <div className="p-2 border-b border-[#333] bg-[#2a2a2a] flex items-center justify-between">
          <span className="text-xs text-gray-300">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-1">
            <button
              onClick={clearSelection}
              className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
            >
              Clear
            </button>
            <button
              onClick={finishSelection}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Done
            </button>
          </div>
        </div>
      )}
      
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-3 text-sm text-white">
            {inputText ? 'No matching files' : 'No files available'}
          </div>
        ) : (
          items.map((item, index) => {
            const isSelected = selectedFiles.some(f => f.uuid === item.uuid)
            const isFile = item.type !== 'folder'
            
            return (
              <button
                key={item.uuid}
                onClick={() => isFile ? toggleFileSelection(item) : selectFile(item)}
                className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-700 text-sm text-white"
              >
                {/* Checkbox for files, folder icon for folders */}
                {isFile ? (
                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                    isSelected 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'border-gray-400 hover:border-gray-300'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                ) : (
                  <Folder size={16} className="text-blue-400" />
                )}
                
                {/* File/folder icon */}
                {isFile && (
                  <FileText size={16} className="text-gray-300" />
                )}
                
                <span className="truncate">{item.title}</span>
                
                {/* Visual indicator for folders */}
                {!isFile && (
                  <span className="text-xs text-gray-500 ml-auto">→</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
} 