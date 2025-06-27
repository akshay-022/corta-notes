import React, { useEffect } from 'react'
import { useQuickOpen } from './QuickOpenContext'
import { Page } from '@/lib/supabase/types'

interface MentionInputProps {
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  allPages: Page[]
}

/**
 * Handles @ mention detection and input text updates for file/folder tagging
 */
export function MentionInput({ input, setInput, textareaRef, allPages }: MentionInputProps) {
  const quickOpen = useQuickOpen()

  // Simple: just find the last @ and use everything after it
  useEffect(() => {
    const lastAtIndex = input.lastIndexOf('@')
    
    console.log('🔍 MentionInput useEffect:', {
      input,
      lastAtIndex
    })
    
    // If we found an @ and there's no space/newline after it, we're in a mention
    if (lastAtIndex >= 0) {
      const textAfterAt = input.slice(lastAtIndex + 1)
      console.log('📝 Found @ mention, textAfterAt:', textAfterAt)
      
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // We're typing a mention - open popup and set the text
        console.log('✅ Setting QuickOpen input text to:', textAfterAt)
        if (!quickOpen.isOpen) quickOpen.open()
        quickOpen.setInputText(textAfterAt)
        return
      }
    }
    
    // Not in a mention - close popup
    console.log('❌ Not in mention, closing popup')
    if (quickOpen.isOpen) quickOpen.close()
  }, [input, quickOpen])

  // Build full path by traversing parent relationships
  const buildFullPath = (page: Page): string => {
    console.log('🏗️ buildFullPath called for:', { title: page.title, uuid: page.uuid.slice(0, 8), parent_uuid: page.parent_uuid?.slice(0, 8) })
    
    const pathSegments: string[] = []
    let currentPage: Page | null = page
    
    // Traverse up the parent chain
    while (currentPage) {
      console.log('🔍 Processing page:', { title: currentPage.title, uuid: currentPage.uuid.slice(0, 8), parent_uuid: currentPage.parent_uuid?.slice(0, 8) })
      pathSegments.unshift(currentPage.title)
      
      // Find parent
      if (currentPage.parent_uuid) {
        const parent = allPages.find(p => p.uuid === currentPage.parent_uuid)
        console.log('🔍 Found parent:', parent ? { title: parent.title, uuid: parent.uuid.slice(0, 8) } : 'NOT FOUND')
        currentPage = parent || null
      } else {
        console.log('🔍 No parent_uuid, stopping')
        currentPage = null
      }
    }
    
    const fullPath = pathSegments.join('/')
    console.log('🏗️ buildFullPath result:', { pathSegments, fullPath })
    return fullPath
  }

  // Simple file selection - just replace the last @ mention
  const handleFileSelect = (page: Page) => {
    console.log('🎯 handleFileSelect ENTRY:', { title: page.title, type: page.type, uuid: page.uuid.slice(0, 8) })
    
    const textarea = textareaRef.current
    if (!textarea) return

    // Find the last @ in the input
    const lastAtIndex = input.lastIndexOf('@')
    if (lastAtIndex === -1) return
    
    const isFolder = page.type === 'folder'
    let replacement
    
    if (isFolder) {
      // For folders: build full path + /
      const fullPath = buildFullPath(page)
      replacement = `@${fullPath}/`
      console.log('📁 Folder logic:', { fullPath, replacement })
    } else {
      // For files: build full path + space
      const fullPath = buildFullPath(page)
      replacement = `@${fullPath} `
      console.log('📄 File logic:', { fullPath, replacement })
    }
    
    // Replace everything from the last @ to the end with our replacement
    const newText = input.slice(0, lastAtIndex) + replacement
    
    console.log('🔄 Updating text:', { 
      oldInput: input, 
      newText, 
      lastAtIndex,
      replacement 
    })
    
    // Update both textarea and React state
    textarea.value = newText
    setInput(newText)
    
    // Put cursor at the end
    const newCursorPos = newText.length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
    textarea.focus()
  }

  return {
    handleFileSelect,
    handleKeyDown: () => {} // Not needed anymore
  }
} 