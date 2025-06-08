'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X, FileText } from 'lucide-react'
import { superMemoryService, SuperMemoryDocument } from '@/lib/supermemory'
import { Page } from '@/lib/supabase/types'

interface DocumentSearchProps {
  onSelectDocument: (document: SuperMemoryDocument) => void
  onSearchResults?: (results: SuperMemoryDocument[], isActive: boolean) => void
  className?: string
}

export default function DocumentSearch({ onSelectDocument, onSearchResults, className = '' }: DocumentSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SuperMemoryDocument[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Debounced search function
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    console.log('Performing semantic search for:', query)

    try {
      const result = await superMemoryService.searchDocuments(query, 8)
      setSearchResults(result.results)
      console.log('Search results:', result.results)
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, performSearch])

  // Notify parent component of search results
  useEffect(() => {
    if (onSearchResults) {
      onSearchResults(searchResults, searchQuery.trim().length > 0)
    }
  }, [searchResults, searchQuery, onSearchResults])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(searchQuery)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setIsExpanded(false)
  }

  const handleDocumentClick = (doc: SuperMemoryDocument) => {
    onSelectDocument(doc)
    // Keep search open but could close if preferred
    // clearSearch()
  }

  // Show expanded state when there's a query or results
  const showExpanded = isExpanded || searchQuery.trim() || searchResults.length > 0

  return (
    <div className={`${className}`}>
      {/* Search Input */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            placeholder="Search documents..."
            className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg py-3 pl-12 pr-12 text-[#cccccc] text-sm placeholder:text-[#969696] focus:outline-none focus:ring-2 focus:ring-[#007acc] focus:border-transparent transition-all"
          />
          
          {/* Search Icon */}
          <Search 
            size={16} 
            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#969696]" 
          />
          
          {/* Clear Button */}
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#969696] hover:text-[#cccccc] transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </form>

      {/* Search Results */}
      {showExpanded && (
        <div className="mt-3 space-y-1">
          {/* Loading State */}
          {isSearching && (
            <div className="text-[#969696] text-sm px-2 py-2">
              Searching...
            </div>
          )}

          {/* No Results */}
          {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
            <div className="text-[#969696] text-sm px-2 py-2">
              No documents found for "{searchQuery}"
            </div>
          )}

          {/* Results */}
          {!isSearching && searchResults.length > 0 && (
            <>
              <div className="text-[#969696] text-xs font-medium uppercase tracking-wider px-2 pb-1">
                Found {searchResults.length} documents
              </div>
              {searchResults.map((doc, index) => (
                <div
                  key={`${doc.id}-${index}`}
                  onClick={() => handleDocumentClick(doc)}
                  className="flex items-center hover:bg-[#2a2d2e] text-sm group transition-colors py-2 px-2 cursor-pointer rounded"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <FileText size={14} className="text-[#519aba]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#cccccc] truncate text-sm font-normal">
                        {doc.title || doc.metadata?.title || 'Untitled'}
                      </div>
                      {doc.content && (
                        <div className="text-[#969696] text-xs truncate">
                          {doc.content.slice(0, 100)}...
                        </div>
                      )}
                    </div>
                    {doc.score && (
                      <div className="text-[#969696] text-xs">
                        {Math.round(doc.score * 100)}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* SuperMemory Status - we'll check this via the API response instead */}
        </div>
      )}
    </div>
  )
} 