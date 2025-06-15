import { useState, useCallback } from 'react'

export interface DragItem {
  id: string
  type: 'note' | 'folder'
  title: string
  sourceSection: 'unorganized' | 'organized'
}

export interface DropTarget {
  id: string | null // null for root of section
  type: 'folder' | 'section'
  section: 'unorganized' | 'organized'
}

export interface DragDropState {
  isDragging: boolean
  dragItem: DragItem | null
  dropTarget: DropTarget | null
  dragOverElement: string | null
}

export interface UseDragAndDropProps {
  onMoveItem: (itemId: string, newParentId: string | null, newOrganizedStatus: boolean) => void
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

    // Determine the new organized status based on target section
    let newOrganizedStatus: boolean
    let newParentId: string | null = null

    if (dropTarget.section === 'organized') {
      // Moving to organized section - set organized = true
      newOrganizedStatus = true
      newParentId = dropTarget.id // null for root, string for folder
    } else if (dropTarget.section === 'unorganized') {
      // Moving to unorganized section - set organized = false
      newOrganizedStatus = false
      newParentId = null // Unorganized notes are always at root level
    } else {
      // Fallback - shouldn't happen
      return
    }

    // Validate allowed moves based on new structure:
    // 1. Unorganized items can move to organized section (organize them)
    // 2. Organized items can move within organized section (reorganize them)
    // 3. Organized items CANNOT move back to unorganized section (separate trees)
    
    const isMovingToOrganized = dragItem.sourceSection === 'unorganized' && dropTarget.section === 'organized'
    const isMovingWithinOrganized = dragItem.sourceSection === 'organized' && dropTarget.section === 'organized'
    const isMovingToUnorganized = dragItem.sourceSection === 'organized' && dropTarget.section === 'unorganized'

    if (isMovingToUnorganized) {
      console.log('Cannot move organized items back to unorganized section')
      endDrag()
      return
    }

    // Allow valid moves
    if (isMovingToOrganized || isMovingWithinOrganized) {
      onMoveItem(dragItem.id, newParentId, newOrganizedStatus)
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