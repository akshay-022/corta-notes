import { useState, useEffect, useCallback, useRef } from 'react'

interface UseResizableChatPanelOptions {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

export function useResizableChatPanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth
}: UseResizableChatPanelOptions) {
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Load width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(storageKey)
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10)
      if (parsedWidth >= minWidth && parsedWidth <= maxWidth) {
        setWidth(parsedWidth)
      }
    }
  }, [storageKey, minWidth, maxWidth])

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(storageKey, width.toString())
  }, [width, storageKey])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
    
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.documentElement.style.pointerEvents = 'none'
  }, [width])

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    // For chat panel, moving left (negative deltaX) increases width
    const deltaX = startXRef.current - e.clientX
    const newWidth = startWidthRef.current + deltaX
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
    
    setWidth(clampedWidth)
  }, [isResizing, minWidth, maxWidth])

  const stopResize = useCallback(() => {
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.documentElement.style.pointerEvents = ''
  }, [])

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize)
      document.addEventListener('mouseup', stopResize)
      
      return () => {
        document.removeEventListener('mousemove', handleResize)
        document.removeEventListener('mouseup', stopResize)
      }
    }
  }, [isResizing, handleResize, stopResize])

  return {
    width,
    isResizing,
    startResize
  }
} 