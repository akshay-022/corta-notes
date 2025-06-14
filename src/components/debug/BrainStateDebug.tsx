'use client'

import { useState, useEffect } from 'react'
import { 
  getBrainState, 
  getBrainStateStats, 
  clearStoredBrainState, 
  resetBrainState,
  getThoughtsByCategory,
  deleteThought
} from '@/lib/thought-tracking/brain-state'
import { Brain, Trash2, RefreshCw, Eye, EyeOff } from 'lucide-react'

export default function BrainStateDebug() {
  const [isVisible, setIsVisible] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (isVisible) {
      const currentStats = getBrainStateStats()
      setStats(currentStats)
    }
  }, [isVisible, refreshKey])

  const refresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleClearBrainState = () => {
    if (confirm('Are you sure you want to clear all brain state? This cannot be undone.')) {
      clearStoredBrainState()
      refresh()
    }
  }

  const handleResetBrainState = () => {
    if (confirm('Are you sure you want to reset brain state? This cannot be undone.')) {
      resetBrainState()
      refresh()
    }
  }



  const handleDeleteThought = (thoughtId: string) => {
    if (confirm('Delete this thought?')) {
      deleteThought(thoughtId)
      refresh()
    }
  }

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg"
          title="Show Brain State Debug"
        >
          <Brain className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900 border border-gray-700 rounded-lg p-4 w-96 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4" />
          Brain State Debug
        </h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>

      {stats && (
        <div className="space-y-4">
          {/* Stats Overview */}
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Overview</h4>
            <div className="text-xs text-gray-400 space-y-1">
              <div>Total Thoughts: {stats.totalThoughts}</div>
              <div>Categories: {stats.totalCategories}</div>
              <div>Pages: {stats.totalPages}</div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Categories</h4>
            <div className="space-y-1">
              {stats.categories.map((cat: any) => (
                <div key={cat.name} className="flex justify-between items-center">
                  <button
                    onClick={() => setSelectedCategory(
                      selectedCategory === cat.name ? null : cat.name
                    )}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {cat.name} ({cat.count})
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Category Thoughts */}
          {selectedCategory && (
            <div className="bg-gray-800 p-3 rounded">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                {selectedCategory} Thoughts
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {getThoughtsByCategory(selectedCategory).map((thought) => (
                  <div key={thought.id} className="flex justify-between items-start gap-2">
                    <div className="text-xs text-gray-400 flex-1">
                      {thought.content.substring(0, 50)}...
                    </div>
                    <button
                      onClick={() => handleDeleteThought(thought.id)}
                      className="text-red-400 hover:text-red-300 flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-3 rounded flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleResetBrainState}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs py-2 px-3 rounded"
            >
              Reset
            </button>
            <button
              onClick={handleClearBrainState}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 px-3 rounded"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 