'use client'

import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Page, PageUpdate } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/supabase-client'
import { Info, Edit2, Save, X, FileText, Eye, Edit3, MessageSquare } from 'lucide-react'

import { setupAutoOrganization } from '@/lib/auto-organization/organized-file-updates'
import { useNotes } from '@/components/left-sidebar/DashboardSidebarProvider'
import logger from '@/lib/logger'
import { DateDividerPlugin } from '@/lib/organized-notes-formatting/dateDividerPlugin'
import { NodeMetadata } from '@/lib/tiptap/NodeMetadata'
import { FormattingBubbleMenu } from '@/lib/tiptap/FormattingBubbleMenu'

interface TipTapEditorProps {
  page: Page
  onUpdate: (page: Page) => void
  allPages?: Page[] // Add pages data for context
  pageRefreshCallback?: () => Promise<void> // Add page refresh callback
}

export default function TipTapEditor({ page, onUpdate, allPages = [], pageRefreshCallback }: TipTapEditorProps) {
  const notesCtx = useNotes()
  const [title, setTitle] = useState(page.title)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [isUserEditingTitle, setIsUserEditingTitle] = useState(false) // Track title editing specifically

  const [selectedParagraphMetadata, setSelectedParagraphMetadata] = useState<{id: string, metadata: any, pos?: number, nodeType?: string} | null>(null)
  const [showSummary, setShowSummary] = useState(false) // Toggle between content and summary
  const [isOrganizationRulesOpen, setIsOrganizationRulesOpen] = useState(false)
  const [organizationRules, setOrganizationRules] = useState('')

  
  const titleInputRef = useRef<HTMLInputElement>(null)
  const currentPageRef = useRef(page.uuid)

  const supabase = createClient()

  // Use refs to prevent unnecessary re-renders
  const allPagesRef = useRef(allPages)
  const pageRefreshCallbackRef = useRef(pageRefreshCallback)
  
  // Update refs when values change
  allPagesRef.current = allPages
  pageRefreshCallbackRef.current = pageRefreshCallback

  // Determine which content to show based on toggle
  const currentContent = showSummary ? (page.page_summary || page.content) : page.content

  // Helper: build breadcrumb path titles from parent hierarchy
  const buildBreadcrumbPath = (): string => {
    if (!notesCtx?.pages) return page.title
    const pagesMap = new Map(notesCtx.pages.map((p: any) => [p.uuid, p]))
    const segments: string[] = []
    let current: any | undefined = page
    // Traverse up to root
    while (current) {
      segments.push(current.title)
      if (!current.parent_uuid) break
      current = pagesMap.get(current.parent_uuid)
    }
    const path = segments.reverse()
    // Always show full path including filename
    return path.join(' › ')
  }

  const breadcrumbPath = buildBreadcrumbPath()

  const editor = useEditor({
    extensions: [
      StarterKit,
      HorizontalRule.configure({
        HTMLAttributes: {
          class: 'my-6 border-gray-700',
        },
      }),
      Placeholder.configure({
        placeholder: showSummary ? "Page summary..." : "Start thinking!",
      }),
      Typography,
      DateDividerPlugin,
      NodeMetadata,
      Underline,
    ],
    content: currentContent as any,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-180px)] md:min-h-[calc(100vh-120px)] py-4 md:py-8 prose-sm md:prose-base text-sm md:text-base leading-relaxed',
      },
    },
    editable: !showSummary, // Make read-only when showing summary
    onUpdate: ({ editor }) => {
      setIsUserTyping(true)
      debounceUpdate(editor.getJSON(), editor.getText())
    },
  })

  // Debounced update function
  const debounceUpdate = (() => {
    let timeoutId: NodeJS.Timeout
    return (content: any, textContent: string) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setIsUserTyping(false) // User stopped typing (set first so updatePage can propagate changes)
        updatePage(content, textContent)
      }, 1000) // Save after 1 second of inactivity
    }
  })()

  const updatePage = async (content: any, textContent: string) => {
    setIsSaving(true)
    
    const updates: PageUpdate = {
      content,
      content_text: textContent,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('pages')
      .update(updates)
      .eq('uuid', page.uuid)
      .select()
      .single()

    if (data) {
      // Always update parent state after successful save
      onUpdate(data)
    }

    setIsSaving(false)
  }

  const updateTitle = async (newTitle: string) => {
    const { data, error } = await supabase
      .from('pages')
      .update({ 
        title: newTitle,
        updated_at: new Date().toISOString()
      })
      .eq('uuid', page.uuid)
      .select()
      .single()

    if (data) {
      onUpdate(data)
    } else if (error) {
      console.error('updateTitle error:', error)
    }
    
    // Clear the editing flag after the update is complete
    setIsUserEditingTitle(false)
  }

  const handleTitleSubmit = () => {
    console.log('handleTitleSubmit', title)
    setIsEditingTitle(false)
    if (title !== page.title && title.trim()) {
      console.log('updateTitle', title.trim())
      updateTitle(title.trim())
    } else {
      console.log('resetTitle', page.title)
      setTitle(page.title) // Reset if unchanged
      setIsUserEditingTitle(false) // Only clear flag if no update needed
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSubmit()
      editor?.commands.focus()
    } else if (e.key === 'Escape') {
      setTitle(page.title)
      setIsEditingTitle(false)
      setIsUserEditingTitle(false) // Clear the title editing flag
      editor?.commands.focus()
    }
  }

  const startEditingTitle = () => {
    setIsEditingTitle(true)
    setIsUserEditingTitle(true) // Set the title editing flag
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  // Initialize organization rules from page metadata
  useEffect(() => {
    const pageMetadata = page.metadata as any
    const rules = pageMetadata?.organizationRules || ''
    setOrganizationRules(rules)
  }, [page.metadata])

  // Update editor content when page prop changes (for external updates like from chat panel)
  useEffect(() => {
    if (editor && page.uuid !== currentPageRef.current) {
      logger.info('Page UUID changed, updating editor content', { 
        oldUuid: currentPageRef.current, 
        newUuid: page.uuid 
      })
      currentPageRef.current = page.uuid
      const newContent = showSummary ? (page.page_summary || page.content) : page.content
      editor.commands.setContent(newContent as any)
      setTitle(page.title)
    }
  }, [page.uuid, editor, showSummary]) // Only trigger on UUID change, not all page changes

  // Listen for external content updates (from chat panel events)
  useEffect(() => {
    const handleExternalUpdate = (event: CustomEvent) => {
      const { updatedPage } = event.detail
      if (updatedPage && updatedPage.uuid === page.uuid && editor && !isUserTyping) {
        logger.info('External page update received, refreshing editor content', { pageUuid: page.uuid })
        const newContent = showSummary ? (updatedPage.page_summary || updatedPage.content) : updatedPage.content
        editor.commands.setContent(newContent as any)
        setTitle(updatedPage.title)
      }
    }

    window.addEventListener('updatePageContent', handleExternalUpdate as EventListener)
    return () => window.removeEventListener('updatePageContent', handleExternalUpdate as EventListener)
  }, [editor, page.uuid, showSummary, isUserTyping])

  // Update title when page prop changes
  useEffect(() => {
    if (!isUserEditingTitle) {
      setTitle(page.title)
    }
  }, [page.title, isUserEditingTitle])

  // Open organization rules dialog
  const openOrganizationRules = () => {
    setIsOrganizationRulesOpen(true)
  }

  // Save organization rules to page metadata
  const saveOrganizationRules = async () => {
    try {
      const currentMetadata = (page.metadata as any) || {}
      const updatedMetadata = {
        ...currentMetadata,
        organizationRules: organizationRules.trim()
      }

      const { data, error } = await supabase
        .from('pages')
        .update({ 
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', page.uuid)
        .select()
        .single()

      if (data) {
        onUpdate(data)
        logger.info('Organization rules saved', { pageUuid: page.uuid })
        setIsOrganizationRulesOpen(false)
      } else if (error) {
        logger.error('Error saving organization rules:', error)
      }
    } catch (error) {
      logger.error('Exception saving organization rules:', error)
    }
  }

  // Organize the entire page


  // Capture current selection when opening chat (only when Command+K is pressed)
  const captureCurrentSelection = useCallback(() => {
    console.log('🔍 captureCurrentSelection called', { hasEditor: !!editor })
    
    if (!editor || !notesCtx) {
      console.log('❌ No editor or context available for capturing selection')
      return
    }
    
    const { from, to } = editor.state.selection
    console.log('📍 Selection range:', { from, to })
    
    if (from === to) {
      console.log('🔄 No selection found, clearing existing selections')
      notesCtx.setSelections([])
      return
    }

    const selectedText = editor.state.doc.textBetween(from, to)
    console.log('📝 Selected text:', { text: selectedText, length: selectedText.length })
    
    if (selectedText.trim()) {
      const selectionId = `selection-${Date.now()}`
      const newSelection = {
        id: selectionId,
        text: selectedText.trim(),
        startLine: 1, // TipTap doesn't have line numbers, so we use 1
        endLine: 1
      }
      console.log('✅ Adding selection to context:', newSelection)
      const currentSelections = notesCtx.selections || []
      console.log('📊 Previous selections count:', currentSelections.length)
      const updated = [...currentSelections, newSelection]
      console.log('📊 Updated selections count:', updated.length)
      notesCtx.setSelections(updated)
    } else {
      console.log('⚠️ Selected text is empty after trimming')
      // Don't clear existing selections if current selection is empty
    }
  }, [editor, notesCtx])

  // Function to get node metadata from current selection (any node type)
  const getSelectedNodeMetadata = useCallback(() => {
    if (!editor) return null

    const { from, to } = editor.state.selection
    
    // Find any node that contains the selection and has metadata
    let selectedNode: any = null
    let selectedPos = -1

    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      // Check any node type that has attributes and metadata
      if (node.attrs && (node.attrs.metadata || node.attrs.id)) {
        selectedNode = node
        selectedPos = pos
        return false // Stop traversal - take the first node with metadata
      }
    })

    if (selectedNode && selectedNode.attrs) {
      return {
        id: selectedNode.attrs.id,
        metadata: selectedNode.attrs.metadata,
        pos: selectedPos,
        nodeType: selectedNode.type.name
      }
    }

    return null
  }, [editor])

  // Function to update node metadata (any node type)
  const updateNodeMetadata = useCallback((newMetadata: any) => {
    if (!editor || selectedParagraphMetadata?.pos === undefined) return

    try {
      const parsedMetadata = typeof newMetadata === 'string' ? JSON.parse(newMetadata) : newMetadata
      
      const { state } = editor
      const tr = state.tr
      const node = state.doc.nodeAt(selectedParagraphMetadata.pos)
      
      if (node) {
        tr.setNodeMarkup(selectedParagraphMetadata.pos, undefined, {
          ...node.attrs,
          metadata: parsedMetadata
        })
        
        editor.view.dispatch(tr)
      }

      // Update local state
      setSelectedParagraphMetadata(prev => prev ? { ...prev, metadata: parsedMetadata } : null)
    } catch (error) {
      console.error('Error updating metadata:', error)
      // Could add toast notification here
    }
  }, [editor, selectedParagraphMetadata])

  // Update selected paragraph metadata when selection changes
  useEffect(() => {
    if (!editor) return

    const updateSelection = () => {
      const metadata = getSelectedNodeMetadata()
      // console.log('Selection updated, metadata:', metadata) // Disabled to reduce noise
      setSelectedParagraphMetadata(metadata)
    }

    editor.on('selectionUpdate', updateSelection)
    
    return () => {
      editor.off('selectionUpdate', updateSelection)
    }
  }, [editor]) // Removed getSelectedNodeMetadata dependency to prevent loop

  // Command+K keyboard shortcut to toggle chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        
        if (notesCtx) {
          // Always capture current selection when Command+K is pressed
          captureCurrentSelection()
          
          // Only open chat if it's not already open
          if (!notesCtx.isChatOpen) {
            console.log('🚀 Command+K pressed! Opening chat')
            notesCtx.setIsChatOpen(true)
          } else {
            console.log('💬 Command+K pressed! Chat already open, selection captured')
          }
        }
      }
    }

    console.log('🎮 Setting up Command+K event listener')
    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      console.log('🧹 Cleaning up Command+K event listener')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [captureCurrentSelection]) // Include captureCurrentSelection dependency so it captures fresh state


  // Apply AI response to editor
  const handleApplyAiResponse = async (responseText: string, targetSelections?: Array<{id: string, text: string, startLine: number, endLine: number}>) => {
    if (!editor) return

    try {
      console.log('Applying AI response to editor', { responseText: responseText.substring(0, 100) + '...' })
      
      if (targetSelections && targetSelections.length > 0) {
        // Replace the selected text with AI response
        const { from, to } = editor.state.selection
        if (from !== to) {
          editor.chain().focus().deleteSelection().insertContent(responseText).run()
        } else {
          // If no current selection, just insert at cursor
          editor.chain().focus().insertContent(responseText).run()
        }
      } else {
        // No specific selection, insert at cursor position
        editor.chain().focus().insertContent(responseText).run()
      }
      
      // Clear selections after applying
      if (notesCtx) {
        notesCtx.setSelections([])
      }
    } catch (error) {
      console.error('Error applying AI response to editor:', error)
      throw error
    }
  }

  // Setup auto-organization triggers when editor is ready
  useEffect(() => {
    let cleanup: (() => void) | undefined

      if (editor) {
      // Clean up previous listeners if any
      if (cleanup) cleanup()

              cleanup = setupAutoOrganization(editor, page.uuid, page.title)
      logger.info('⚡ Auto-organization initialized for page', { pageUuid: page.uuid })
      }

    return () => {
      if (cleanup) cleanup()
    }
  }, [editor, page.uuid, page.title])

  // Update editor content when page changes or toggle changes
  useEffect(() => {
    // Only update content if we switched to a different page
    const pageChanged = currentPageRef.current !== page.uuid
    
    if (pageChanged) {
      currentPageRef.current = page.uuid
      if (editor) {
        editor.commands.setContent(currentContent as any)
      }
      setTitle(page.title)
      setIsUserTyping(false)
      setIsUserEditingTitle(false) // Reset title editing flag on page change
    } else if (!isUserEditingTitle) {
      // Update title from props if user is not actively editing the title
      // (regardless of whether they're typing in the editor content)
      setTitle(page.title)
    }
    
    // CRITICAL FIX: Remove page.content from dependencies to prevent cursor jumping
    // Content updates from user typing should NOT trigger editor.setContent()
  }, [page.uuid, page.title, editor]) // Removed page.content dependency

  // Update editor content when summary toggle changes
  useEffect(() => {
    if (editor) {
      editor.commands.setContent(currentContent as any)
      editor.setEditable(!showSummary) // Update editable state
    }
  }, [showSummary, page.uuid, editor])

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a1a]">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div 
      className="flex-1 bg-[#1a1a1a] flex flex-col overflow-hidden w-full"
      data-editor
    >
      {/* Minimal toolbar - hidden when chat is open */}
      {!notesCtx?.isChatOpen && (
        <div className="absolute top-4 right-4 md:right-6 z-10">
        <div className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg p-1 border border-gray-700">
          {/* Summary Toggle - show for organized pages */}
          {page.organized && (
            <>
              <button
                onClick={() => {
                  const newShowSummary = !showSummary
                  setShowSummary(newShowSummary)
                  logger.info(`Toggled to ${newShowSummary ? 'summary' : 'content'} view`, {
                    pageUuid: page.uuid,
                    pageTitle: page.title,
                    hasSummary: !!page.page_summary,
                    summaryEmpty: !page.page_summary
                  })
                }}
                className={`p-1.5 rounded transition-colors ${
                  showSummary 
                    ? 'text-blue-400 bg-blue-500/20' 
                    : 'text-gray-400 hover:text-white hover:bg-[#3a3a3a]'
                }`}
                title={showSummary ? "Show full content" : "Show summary"}
              >
                {showSummary ? <FileText size={14} /> : <Eye size={14} />}
              </button>
              
              <div className="w-px h-4 bg-gray-600" />
            </>
          )}
          

          {/* Organization Rules Button */}
          <button
            onClick={openOrganizationRules}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
            title="Edit Organization Rules"
          >
            <Edit3 size={14} />
          </button>
          

          
          {/* Chat Toggle Button */}
          <button
            onClick={() => {
              if (notesCtx) {
                captureCurrentSelection()
                const newChatState = !notesCtx.isChatOpen
                console.log('💬 Chat button clicked, toggling:', newChatState)
                notesCtx.setIsChatOpen(newChatState)
                
                // Note: captureCurrentSelection already handles adding selections to context
              }
            }}
            className={`p-1.5 rounded transition-colors ${
              notesCtx?.isChatOpen 
                ? 'text-blue-400 bg-blue-500/20' 
                : 'text-gray-400 hover:text-white hover:bg-[#3a3a3a]'
            }`}
            title={notesCtx?.isChatOpen ? "Close Chat" : "Open Chat (⌘K)"}
          >
            <MessageSquare size={14} />
          </button>
        </div>
        </div>
      )}

      {/* Saving indicator */}
      {isSaving && (
        <div className="absolute top-4 left-4 md:left-6 z-10">
          <span className="text-gray-500 text-xs">Saving...</span>
        </div>
      )}



      {/* Editor container with independent scrolling */}
      <div className="flex-1 overflow-y-auto">
        {/* Breadcrumb Path - positioned closer to left sidebar */}
        {breadcrumbPath && (
          <div className="pt-6 pb-2 px-4 md:px-8">
            <div className="text-sm text-gray-400 select-none truncate font-normal">
              {breadcrumbPath}
            </div>
          </div>
        )}

        <div className={`mx-auto min-h-full transition-all duration-[25ms] ${
          notesCtx?.isChatOpen 
            ? 'max-w-2xl px-8 md:px-12' 
            : 'max-w-4xl px-4 md:px-16'
        }`}>
          {/* Title - Notion style */}
          <div className={`pb-2 ${breadcrumbPath ? 'pt-8 md:pt-12' : 'pt-8 md:pt-16'}`}>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={handleTitleKeyDown}
                className="w-full bg-transparent text-white font-bold placeholder-gray-600 border-none outline-none resize-none text-[16px] md:text-4xl"
                placeholder="Untitled"
              />
            ) : (
              <div className="flex items-center gap-3">
                <h1
                  onClick={startEditingTitle}
                  onKeyDown={(e) => {
                    // Start editing on any printable character or backspace/delete
                    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                      e.preventDefault()
                      startEditingTitle()
                      // If it's a printable character, we'll set it as the new title
                      if (e.key.length === 1) {
                        setTimeout(() => {
                          setTitle(e.key)
                          // Position cursor at the end
                          if (titleInputRef.current) {
                            titleInputRef.current.setSelectionRange(1, 1)
                          }
                        }, 0)
                      } else {
                        // For backspace/delete, clear the title
                        setTimeout(() => {
                          setTitle('')
                        }, 0)
                      }
                    }
                  }}
                  tabIndex={0} // Make it focusable
                  className="text-white text-2xl md:text-4xl font-bold cursor-text hover:bg-[#2a2a2a]/30 rounded px-1 py-1 -mx-1 transition-colors min-h-[2rem] md:min-h-[3rem] flex items-center focus:outline-none focus:bg-[#2a2a2a]/30"
                >
                  {title || (
                    <span className="text-gray-600">Untitled</span>
                  )}
                </h1>
                
                {/* Summary indicator */}
                {showSummary && (
                  <span className="text-blue-400 text-sm bg-blue-500/20 px-2 py-1 rounded-md flex items-center gap-1">
                    <Eye size={12} />
                    Summary
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Editor */}
          <EditorContent 
            editor={editor} 
            className="text-gray-200"
          />
        </div>
      </div>

      {/* Bubble Menu for Paragraph Metadata */}
      {editor && (
        <BubbleMenu 
          editor={editor} 
          tippyOptions={{ duration: 100 }}
          shouldShow={({ editor }) => {
            const { from, to } = editor.state.selection
            // Show when text is selected and we have metadata to display
            return from !== to && !!selectedParagraphMetadata
          }}
        >
          <div className="bg-[#2a2a2a] border border-gray-600 rounded-lg p-3 shadow-lg min-w-[300px] max-w-[500px] z-50">
            <div className="text-xs text-gray-300">
              {selectedParagraphMetadata ? (
                <div className="space-y-2">
                  <div className="text-gray-400 font-medium mb-2">
                    {selectedParagraphMetadata.nodeType ? 
                      `${selectedParagraphMetadata.nodeType.charAt(0).toUpperCase() + selectedParagraphMetadata.nodeType.slice(1)} Metadata` : 
                      'Node Metadata'
                    }
                  </div>
                  
                  {/* Node Type */}
                  {selectedParagraphMetadata.nodeType && (
                    <div className="p-2 bg-[#1a1a1a] rounded">
                      <div className="text-gray-400">
                        Type: <span className="text-blue-400 font-medium">{selectedParagraphMetadata.nodeType}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* ID */}
                  <div className="p-2 bg-[#1a1a1a] rounded">
                    <div className="text-gray-400">
                      ID: <span className="text-gray-200 font-mono text-xs break-all">{selectedParagraphMetadata.id || 'No ID'}</span>
                    </div>
                  </div>

                  {selectedParagraphMetadata.metadata && (
                    <>
                      {/* Organization Status */}
                      {selectedParagraphMetadata.metadata.isOrganized !== undefined && (
                        <div className="p-2 bg-[#1a1a1a] rounded">
                          <div className="text-gray-400 flex items-center justify-between">
                            <span>Organized:</span>
                            <select
                              value={selectedParagraphMetadata.metadata.isOrganized ? 'true' : 'false'}
                              onChange={(e) => {
                                const newMetadata = {
                                  ...selectedParagraphMetadata.metadata,
                                  isOrganized: e.target.value === 'true'
                                }
                                updateNodeMetadata(newMetadata)
                              }}
                              className="bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Last Updated - Now editable for debugging boundary issues */}
                      {selectedParagraphMetadata.metadata.lastUpdated && (
                      <div className="p-2 bg-[#1a1a1a] rounded">
                        <div className="text-gray-400 flex items-center justify-between">
                          <span>Last Updated:</span>
                          <input
                            type="datetime-local"
                            value={new Date(selectedParagraphMetadata.metadata.lastUpdated).toISOString().slice(0, 16)}
                            onChange={(e) => {
                              const newTimestamp = new Date(e.target.value).toISOString()
                              const newMetadata = {
                                ...selectedParagraphMetadata.metadata,
                                lastUpdated: newTimestamp
                              }
                              updateNodeMetadata(newMetadata)
                            }}
                            className="bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                              {new Date(selectedParagraphMetadata.metadata.lastUpdated).toLocaleString()}
                        </div>
                      </div>
                      )}

                      {/* Where Organized - Read only for now */}
                      {selectedParagraphMetadata.metadata.whereOrganized && 
                       selectedParagraphMetadata.metadata.whereOrganized.length > 0 && (
                        <div className="p-2 bg-[#1a1a1a] rounded">
                          <div className="text-gray-400 mb-1">Organized In:</div>
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {selectedParagraphMetadata.metadata.whereOrganized.map((location: any, index: number) => (
                              <div key={index} className="text-xs">
                                <div className="text-blue-400 break-all">{location.filePath}</div>
                                {location.paragraphId && (
                                  <div className="text-gray-500 font-mono ml-2">→ {location.paragraphId}</div>
                                )}
                                {location.summary_stored && (
                                  <div className="text-gray-500 ml-2 italic">"{location.summary_stored}"</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Other Metadata Fields - Inline Editable */}
                      {Object.entries(selectedParagraphMetadata.metadata).filter(([key]) => 
                        !['isOrganized', 'lastUpdated', 'whereOrganized', 'organizationStatus', 'id'].includes(key)
                      ).length > 0 && (
                        <div className="p-2 bg-[#1a1a1a] rounded">
                          <div className="text-gray-400 mb-2">Other Metadata:</div>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {Object.entries(selectedParagraphMetadata.metadata)
                              .filter(([key]) => !['isOrganized', 'lastUpdated', 'whereOrganized', 'organizationStatus', 'id'].includes(key))
                              .map(([key, value]) => (
                                <div key={key} className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={key}
                                    onChange={(e) => {
                                      if (e.target.value !== key) {
                                        const newMetadata = { ...selectedParagraphMetadata.metadata }
                                        delete newMetadata[key]
                                        newMetadata[e.target.value] = value
                                        updateNodeMetadata(newMetadata)
                                      }
                                    }}
                                    className="flex-1 bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                                    placeholder="Key"
                                  />
                                  <span className="text-gray-500 text-xs mt-1">:</span>
                                  <input
                                    type="text"
                                    value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    onChange={(e) => {
                                      let newValue: any = e.target.value
                                      // Try to parse as JSON if it looks like JSON
                                      if (newValue.startsWith('{') || newValue.startsWith('[') || newValue === 'true' || newValue === 'false' || !isNaN(Number(newValue))) {
                                        try {
                                          newValue = JSON.parse(newValue)
                                        } catch {
                                          // Keep as string if JSON parse fails
                                        }
                                      }
                                      const newMetadata = {
                                        ...selectedParagraphMetadata.metadata,
                                        [key]: newValue
                                      }
                                      updateNodeMetadata(newMetadata)
                                    }}
                                    className="flex-2 bg-[#2a2a2a] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                                    placeholder="Value"
                                  />
                                  <button
                                    onClick={() => {
                                      const newMetadata = { ...selectedParagraphMetadata.metadata }
                                      delete newMetadata[key]
                                      updateNodeMetadata(newMetadata)
                                    }}
                                    className="text-red-400 hover:text-red-300 text-xs px-1"
                                    title="Delete field"
                                  >
                                    ×
                                  </button>
                              </div>
                            ))}
                          </div>
                          
                          {/* Add new field button */}
                          <button
                            onClick={() => {
                              const newMetadata = {
                                ...selectedParagraphMetadata.metadata,
                                'newField': 'newValue'
                              }
                              updateNodeMetadata(newMetadata)
                            }}
                            className="w-full mt-2 px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded transition-colors"
                          >
                            + Add Field
                          </button>
                        </div>
                      )}

                      {/* Add Field button if no other metadata exists */}
                      {Object.entries(selectedParagraphMetadata.metadata).filter(([key]) => 
                        !['isOrganized', 'lastUpdated', 'whereOrganized', 'organizationStatus', 'id'].includes(key)
                      ).length === 0 && (
                        <div className="p-2 bg-[#1a1a1a] rounded">
                          <button
                            onClick={() => {
                              const newMetadata = {
                                ...selectedParagraphMetadata.metadata,
                                'newField': 'newValue'
                              }
                              updateNodeMetadata(newMetadata)
                            }}
                            className="w-full px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded transition-colors"
                          >
                            + Add Custom Field
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {!selectedParagraphMetadata.metadata && (
                    <div className="p-2 bg-[#1a1a1a] rounded">
                      <div className="text-gray-500 italic">No metadata available</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 italic">No node metadata found</div>
              )}
            </div>
          </div>
        </BubbleMenu>
      )}

      {/* Formatting toolbar bubble menu */}
      {editor && <FormattingBubbleMenu editor={editor} />}

      {/* Organization Rules Dialog */}
      {isOrganizationRulesOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2a2a2a] border border-gray-600 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Organization Rules</h3>
              <button
                onClick={() => setIsOrganizationRulesOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-3">
                Define how this page should be organized. These rules will guide the AI when organizing content from this page.
              </p>
              
              <textarea
                value={organizationRules}
                onChange={(e) => setOrganizationRules(e.target.value)}
                placeholder="e.g., 'Group similar ideas together', 'Keep urgent items at the top', 'Separate technical notes from personal thoughts'..."
                className="w-full h-40 bg-[#1a1a1a] border border-gray-600 rounded p-3 text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsOrganizationRulesOpen(false)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveOrganizationRules}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Save Rules
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
} 