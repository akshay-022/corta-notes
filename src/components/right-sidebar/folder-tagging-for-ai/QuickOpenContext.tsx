import { createContext, useContext, useState, useMemo, ReactNode, useCallback } from 'react'
import { Page } from '@/lib/supabase/types'

/**
 * Quick-open context for "@" file/folder tagging in the chat panel.
 * Keeps UI/selection state separate from the rendering component so the
 * chat input, palette, and any future consumers can share one store.
 */
interface QuickOpenContextValue {
  // state
  isOpen: boolean
  inputText: string // the actual text after @ in chat input
  items: Page[] // children under currentPath + filter applied (folders first)
  selectedFiles: Page[] // multi-selected files
  // actions
  open: (caretIndex?: number) => void
  close: () => void
  setInputText: (value: string) => void
  selectFile: (page: Page) => void
  toggleFileSelection: (page: Page) => void
  finishSelection: () => void
  clearSelection: () => void
  selectAllFiles: () => void
}

const QuickOpenContext = createContext<QuickOpenContextValue | null>(null)

interface Props {
  pages: Page[] // full flat list from Supabase
  onSelectFile: (page: Page) => void // consumer callback when user chooses file
  onSelectMultipleFiles?: (pages: Page[]) => void // consumer callback for multi-select
  children: ReactNode
}

export function QuickOpenProvider({ pages, onSelectFile, onSelectMultipleFiles, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Page[]>([])

  // helper: parse input text after @ and find matching files/folders
  const getMatchingFiles = useCallback(
    (inputAfterAt: string): Page[] => {
      console.log('getMatchingFiles called with:', inputAfterAt)
      
      // Check if input contains / (user is navigating folders)
      if (inputAfterAt.includes('/')) {
        const lastSlashIndex = inputAfterAt.lastIndexOf('/')
        const folderPath = inputAfterAt.slice(0, lastSlashIndex) // Everything before last /
        const searchTerm = inputAfterAt.slice(lastSlashIndex + 1) // Everything after last /
        
        console.log('Folder navigation:', { folderPath, searchTerm, fullInput: inputAfterAt })
        
        // Navigate to the target folder
        const pathSegments = folderPath.split('/').filter(Boolean)
        let currentParentUuid: string | null = null
        
        for (const segment of pathSegments) {
          console.log('Searching for segment:', segment, 'with parent:', currentParentUuid)
          const folder = pages.find(p => 
            p.title.toLowerCase() === segment.toLowerCase() && 
            p.parent_uuid === currentParentUuid && 
            p.is_deleted === false
          )
          console.log('Found folder for segment:', segment, folder ? { title: folder.title, uuid: folder.uuid.slice(0, 8) } : 'NOT FOUND')
          if (!folder) return [] // Path doesn't exist
          currentParentUuid = folder.uuid
        }
        
        // Get children of this folder and filter by search term
        const children = pages.filter(p => 
          p.parent_uuid === currentParentUuid && 
          p.is_deleted === false &&
          (searchTerm === '' || p.title.toLowerCase().startsWith(searchTerm.toLowerCase()))
        )
        console.log('Filtered children:', children.map(p => ({ title: p.title, type: p.type })))
        return children
      } else {
        // User is typing a filename/foldername - search all organized files
        const searchTerm = inputAfterAt.toLowerCase()
        const matches = pages.filter(p => 
          p.organized && 
          p.is_deleted === false && 
          p.title.toLowerCase().includes(searchTerm)
        )
        console.log('Search matches:', matches.map(p => ({ title: p.title, type: p.type })))
        return matches
      }
    },
    [pages]
  )

  const items = useMemo(() => {
    let children = getMatchingFiles(inputText)
    // folders first
    return children.sort((a, b) => {
      const af = a.type === 'folder'
      const bf = b.type === 'folder'
      if (af && !bf) return -1
      if (!af && bf) return 1
      return a.title.localeCompare(b.title)
    })
  }, [inputText, getMatchingFiles])

  const open = (caret?: number) => {
    setIsOpen(true)
    setInputText('')
  }
  const close = () => {
    setIsOpen(false)
    setSelectedFiles([]) // Clear selection when closing
  }

  const updateInputText = (value: string) => {
    setInputText(value)
  }

  const selectFile = (page: Page) => {
    // Let ChatPanel handle the text updates and closing logic
    onSelectFile(page)
    if (page.type !== 'folder') {
      close()
    }
  }

  const toggleFileSelection = (page: Page) => {
    if (page.type === 'folder') {
      // For folders, navigate directly (don't multi-select)
      selectFile(page)
      return
    }
    
    setSelectedFiles(prev => {
      const isAlreadySelected = prev.some(f => f.uuid === page.uuid)
      if (isAlreadySelected) {
        return prev.filter(f => f.uuid !== page.uuid)
      } else {
        return [...prev, page]
      }
    })
  }

  const finishSelection = () => {
    if (selectedFiles.length === 0) return
    
    // Use multi-select callback if available, otherwise fall back to individual calls
    if (onSelectMultipleFiles) {
      onSelectMultipleFiles(selectedFiles)
    } else {
      // Fallback: send files individually
      selectedFiles.forEach(file => onSelectFile(file))
    }
    
    setSelectedFiles([])
    close()
  }

  const clearSelection = () => {
    setSelectedFiles([])
  }

  const selectAllFiles = () => {
    // Get all files (not folders) from current items
    const allFiles = items.filter(item => item.type !== 'folder')
    setSelectedFiles(allFiles)
  }

      const value: QuickOpenContextValue = {
      isOpen,
      inputText,
      items,
      selectedFiles,
      open,
      close,
      setInputText: updateInputText,
      selectFile,
      toggleFileSelection,
      finishSelection,
      clearSelection,
      selectAllFiles,
    }

  return (
    <QuickOpenContext.Provider value={value}>{children}</QuickOpenContext.Provider>
  )
}

export function useQuickOpen() {
  const ctx = useContext(QuickOpenContext)
  if (!ctx) throw new Error('useQuickOpen must be used within QuickOpenProvider')
  return ctx
} 