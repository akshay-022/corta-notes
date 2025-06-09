import React from 'react'

export interface DragDropStylesProps {
  isDragging: boolean
  isDraggedItem: boolean
  isDropTarget: boolean
  isValidDropTarget: boolean
  children: React.ReactNode
  className?: string
}

export const DragDropStyles: React.FC<DragDropStylesProps> = ({
  isDragging,
  isDraggedItem,
  isDropTarget,
  isValidDropTarget,
  children,
  className = ''
}) => {
  let finalClassName = className

  // Styles for the item being dragged
  if (isDraggedItem) {
    finalClassName += ' opacity-50 transform scale-95'
  }

  // Only highlight the specific folder being hovered over - subtle highlight like sidebar hover
  if (isDropTarget && isValidDropTarget) {
    finalClassName += ' bg-[#2a2d2e]'
  }

  // Styles for invalid drop targets
  if (isDragging && !isValidDropTarget && !isDraggedItem) {
    finalClassName += ' opacity-60'
  }

  return (
    <div className={finalClassName.trim()}>
      {children}
    </div>
  )
}

// Utility function to determine if a drop is valid
export const isValidDrop = (
  dragSourceSection: 'recent' | 'organized',
  dropTargetSection: 'recent' | 'organized',
  dropTargetType: 'folder' | 'section'
): boolean => {
  // Can always move from recent to organized
  if (dragSourceSection === 'recent' && dropTargetSection === 'organized') {
    return true
  }

  // Can move from organized back to recent (but only to the section, not folders)
  if (dragSourceSection === 'organized' && dropTargetSection === 'recent' && dropTargetType === 'section') {
    return true
  }

  // Can move within organized section (to folders or section root)
  if (dragSourceSection === 'organized' && dropTargetSection === 'organized') {
    return true
  }

  return false
}

// Visual indicator component for drop zones
export const DropZoneIndicator: React.FC<{ isActive: boolean; message: string }> = ({
  isActive,
  message
}) => {
  if (!isActive) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-10 border-2 border-blue-400 border-dashed rounded-lg z-10">
      <span className="text-blue-400 text-sm font-medium bg-[#1a1a1a] px-2 py-1 rounded">
        {message}
      </span>
    </div>
  )
} 