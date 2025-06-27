import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface ModelOption {
  id: string
  name: string
  description: string
}

interface Props {
  selectedModel: string
  onModelChange: (modelId: string) => void
  availableModels: ModelOption[]
}

export default function ModelSelector({ selectedModel, onModelChange, availableModels }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedModelData = availableModels.find(m => m.id === selectedModel)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-[#2a2a2a] border border-[#404040] rounded px-3 py-1.5 text-[#cccccc] text-xs hover:bg-[#333333] hover:border-[#505050] focus:outline-none transition-all duration-200 min-w-[140px]"
      >
        <span className="truncate">{selectedModelData?.name || selectedModel}</span>
        <ChevronDown 
          size={12} 
          className={`text-[#969696] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-full min-w-[200px] bg-[#1e1e1e] border border-[#404040] rounded-md shadow-lg z-50 overflow-hidden">
          <div className="py-1">
            {availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model.id)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#2a2a2a] transition-colors"
              >
                <div className="flex-1">
                  <div className="text-sm text-[#cccccc] font-medium">
                    {model.name}
                  </div>
                </div>
                {selectedModel === model.id && (
                  <Check size={14} className="text-blue-400 ml-2 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 