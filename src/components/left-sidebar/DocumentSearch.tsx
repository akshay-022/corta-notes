'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X, FileText } from 'lucide-react'
import { SuperMemoryDocument } from '@/lib/memory-providers/memory-client'
import { Page } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/supabase-client'

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
  const [hasSearched, setHasSearched] = useState(false)
  const supabase = createClient()

  // Search local pages for title matches
  const searchLocalTitles = useCallback(async (query: string): Promise<SuperMemoryDocument[]> => {
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return []

      const { data: pages, error } = await supabase
        .from('pages')
        .select('uuid, title, content_text, metadata, created_at, updated_at')
        .eq('user_id', user.user.id)
        .eq('is_deleted', false)
        .ilike('title', `%${query}%`)
        .order('updated_at', { ascending: false })
        .limit(5)

      if (error) throw error

      return pages.map(page => ({
        id: page.uuid,
        title: page.title,
        content: page.content_text?.slice(0, 200) + '...' || '',
        score: page.title.toLowerCase() === query.toLowerCase() ? 1.0 : 1.0, // Higher score for exact matches
        metadata: {
          pageUuid: page.uuid,
          title: page.title,
          isLocalTitleMatch: true
        }
      }))
    } catch (error) {
      console.error('Error searching local titles:', error)
      return []
    }
  }, [supabase])

  // Combined search function with prioritization
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    console.log('🔍 Performing local search for:', query)

    try {
      // Only search local titles (no SuperMemory)
      console.log('📝 Running local title search only...')
      const localTitleMatches = await searchLocalTitles(query)
      
      setSearchResults(localTitleMatches)
      console.log('✅ Local search results:', {
        localTitleMatches: localTitleMatches.length
      })
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchLocalTitles])

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery]) // Remove performSearch dependency to prevent multiple calls

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
    setHasSearched(false)
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

      {/* Show loading state only */}
      {isSearching && (
        <div className="mt-3">
          <div className="text-[#969696] text-sm px-2 py-2">
            Searching...
          </div>
        </div>
      )}

      {/* Show no results message only */}
      {!isSearching && hasSearched && searchQuery.trim() && searchResults.length === 0 && (
        <div className="mt-3">
          <div className="text-[#969696] text-sm px-2 py-2">
            No documents found for "{searchQuery}"
          </div>
        </div>
      )}
    </div>
  )
} 