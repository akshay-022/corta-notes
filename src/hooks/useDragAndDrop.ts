import { useState, useCallback } from 'react'

export interface DragItem {
  id: string
  type: 'note' | 'folder'
  title: string
  sourceSection: 'recent' | 'organized'
}

export interface DropTarget {
  id: string | null // null for root of organized section
  type: 'folder' | 'section'
  section: 'recent' | 'organized'
}

export interface DragDropState {
  isDragging: boolean
  dragItem: DragItem | null
  dropTarget: DropTarget | null
  dragOverElement: string | null
}

export interface UseDragAndDropProps {
  onMoveItem: (itemId: string, newParentId: string | null, newOrganizeStatus: 'soon' | 'yes') => void
}

export function useDragAndDrop({ onMoveItem }: UseDragAndDropProps) {
  const [dragState, setDragState] = useState<DragDropState>({
    isDragging: false,
    dragItem: null,
    dropTarget: null,
    dragOverElement: null
  })

  const startDrag = useCallback((item: DragItem) => {
    console.log('Starting drag for item:', item)
    setDragState(prev => ({
      ...prev,
      isDragging: true,
      dragItem: item
    }))
  }, [])

  const endDrag = useCallback(() => {
    console.log('Ending drag')
    setDragState({
      isDragging: false,
      dragItem: null,
      dropTarget: null,
      dragOverElement: null
    })
  }, [])

  const setDragOver = useCallback((elementId: string | null) => {
    setDragState(prev => ({
      ...prev,
      dragOverElement: elementId
    }))
  }, [])

  const handleDrop = useCallback((dropTarget: DropTarget) => {
    const { dragItem } = dragState
    if (!dragItem) return

    console.log('Dropping item:', dragItem, 'onto target:', dropTarget)

    // Determine the new organize status and parent
    let newOrganizeStatus: 'soon' | 'yes' = dragItem.sourceSection === 'recent' ? 'soon' : 'yes'
    let newParentId: string | null = null

    if (dropTarget.section === 'organized') {
      newOrganizeStatus = 'yes'
      newParentId = dropTarget.id // null for root, string for folder
    } else if (dropTarget.section === 'recent') {
      newOrganizeStatus = 'soon'
      newParentId = null // Recent notes are always at root level
    }

    // Only move if there's actually a change
    const isMovingToOrganized = dragItem.sourceSection === 'recent' && dropTarget.section === 'organized'
    const isMovingToRecent = dragItem.sourceSection === 'organized' && dropTarget.section === 'recent'
    const isMovingWithinOrganized = dragItem.sourceSection === 'organized' && dropTarget.section === 'organized'

    if (isMovingToOrganized || isMovingToRecent || isMovingWithinOrganized) {
      onMoveItem(dragItem.id, newParentId, newOrganizeStatus)
    }

    endDrag()
  }, [dragState, onMoveItem, endDrag])

  const getDragHandlers = useCallback((item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', item.id)
      startDrag(item)
    },
    onDragEnd: () => {
      endDrag()
    }
  }), [startDrag, endDrag])

  const getDropHandlers = useCallback((target: DropTarget) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation() // Prevent parent elements from handling this
      e.dataTransfer.dropEffect = 'move'
      setDragOver(target.id)
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation() // Prevent parent elements from handling this
      setDragOver(target.id)
    },
    onDragLeave: (e: React.DragEvent) => {
      // Only clear if we're actually leaving this element (not entering a child)
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY
      
      // Check if we're still within the bounds of this element
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setDragOver(null)
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation() // Prevent parent elements from handling this
      handleDrop(target)
    }
  }), [setDragOver, handleDrop])

  return {
    dragState,
    getDragHandlers,
    getDropHandlers
  }
} 