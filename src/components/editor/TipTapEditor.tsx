'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Page, PageUpdate } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/supabase-client'
import { Calendar, Minus } from 'lucide-react'
import ChatPanel, { ChatPanelHandle } from '../right-sidebar/ChatPanel'
import { setupThoughtTracking } from '@/lib/thought-tracking/editor-integration'
import { ThoughtParagraph } from '@/lib/thought-tracking/paragraph-extension'

interface TipTapEditorProps {
  page: Page
  onUpdate: (page: Page) => void
  allPages?: Page[] // Add pages data for context
}

export default function TipTapEditor({ page, onUpdate, allPages = [] }: TipTapEditorProps) {
  const [title, setTitle] = useState(page.title)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selections, setSelections] = useState<Array<{id: string, text: string, startLine: number, endLine: number}>>([])
  
  const titleInputRef = useRef<HTMLInputElement>(null)
  const currentPageRef = useRef(page.uuid)
  const chatPanelRef = useRef<ChatPanelHandle>(null)
  const supabase = createClient()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false, // Disable default paragraph to use our custom one
      }),
      ThoughtParagraph, // Our custom paragraph with metadata
      HorizontalRule.configure({
        HTMLAttributes: {
          class: 'my-6 border-gray-700',
        },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands",
      }),
      Typography,
    ],
    content: page.content as any,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-180px)] md:min-h-[calc(100vh-120px)] px-4 py-4 md:px-16 md:py-8 prose-sm md:prose-base text-sm md:text-base leading-relaxed',
      },
    },
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
        updatePage(content, textContent)
        setIsUserTyping(false) // User stopped typing
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

    if (data && !isUserTyping) {
      // Only update parent state if user isn't actively typing
      onUpdate(data)
    }

    setIsSaving(false)
  }

  const updateTitle = async (newTitle: string) => {
    const { data, error } = await supabase
      .from('pages')
      .update({ title: newTitle })
      .eq('uuid', page.uuid)
      .select()
      .single()

    if (data) {
      onUpdate(data)
    }
  }

  const handleTitleSubmit = () => {
    setIsEditingTitle(false)
    if (title !== page.title && title.trim()) {
      updateTitle(title.trim())
    } else {
      setTitle(page.title) // Reset if unchanged
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
      editor?.commands.focus()
    }
  }

  const startEditingTitle = () => {
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  const insertHorizontalRule = () => {
    editor?.chain().focus().setHorizontalRule().run()
  }

  const insertDateDivider = () => {
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    
    editor?.chain()
      .focus()
      .setHorizontalRule()
      .insertContent(`<h2>${today}</h2>`)
      .run()
  }

  // Capture current selection when opening chat (only when Command+K is pressed)
  const captureCurrentSelection = useCallback(() => {
    if (!editor) {
      console.log('No editor available for capturing selection')
      return
    }
    
    const { from, to } = editor.state.selection
    console.log('Selection range:', { from, to })
    
    if (from === to) {
      // No selection, clear selections
      console.log('No text selected, clearing selections')
      setSelections([])
      return
    }

    const selectedText = editor.state.doc.textBetween(from, to)
    console.log('Selected text:', selectedText)
    
    if (selectedText.trim()) {
      const selectionId = `selection-${Date.now()}`
      const newSelection = {
        id: selectionId,
        text: selectedText.trim(),
        startLine: 1, // TipTap doesn't have line numbers, so we use 1
        endLine: 1
      }
      console.log('Adding selection to context:', newSelection)
      setSelections(prev => [...prev, newSelection]) // Append to existing selections
    } else {
      console.log('Selected text is empty after trimming')
      // Don't clear existing selections if current selection is empty
    }
  }, [editor])

  // Command+K keyboard shortcut to open chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        console.log('Command+K pressed, capturing selection...')
        
        // Capture current selection when opening chat
        captureCurrentSelection()
        
        setIsChatOpen(true)
        // Focus chat input after a short delay to allow panel to render
        setTimeout(() => {
          chatPanelRef.current?.focusInput()
        }, 100)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [captureCurrentSelection])


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
      setSelections([])
    } catch (error) {
      console.error('Error applying AI response to editor:', error)
      throw error
    }
  }

  // Setup thought tracking when editor is ready
  useEffect(() => {
    if (editor) {
      setupThoughtTracking(editor, page.uuid)
      console.log('🧠 Thought tracking initialized for editor with page:', page.uuid)
    }
  }, [editor, page.uuid])

  // Update editor content when page changes (but not when user is typing)
  useEffect(() => {
    // Only update content if we switched to a different page
    const pageChanged = currentPageRef.current !== page.uuid
    
    if (pageChanged) {
      currentPageRef.current = page.uuid
      if (editor) {
        editor.commands.setContent(page.content as any)
      }
      setTitle(page.title)
      setIsUserTyping(false)
    } else if (!isUserTyping) {
      // Only update title if user isn't typing
      setTitle(page.title)
    }
  }, [page, editor, isUserTyping])

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
      {/* Minimal toolbar - appears on hover */}
      <div className="absolute top-4 right-4 md:right-6 z-10 opacity-0 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg p-1 border border-gray-700">
          <button
            onClick={insertHorizontalRule}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
            title="Divider"
          >
            <Minus size={14} />
          </button>
          
          <button
            onClick={insertDateDivider}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded transition-colors"
            title="Date"
          >
            <Calendar size={14} />
          </button>
        </div>
      </div>

      {/* Saving indicator */}
      {isSaving && (
        <div className="absolute top-4 left-4 md:left-6 z-10">
          <span className="text-gray-500 text-xs">Saving...</span>
        </div>
      )}

      {/* Editor container with independent scrolling */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto min-h-full">
          {/* Title - Notion style */}
          <div className="px-4 pt-8 pb-2 md:px-16 md:pt-16">
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
            )}
          </div>

          {/* Editor */}
          <EditorContent 
            editor={editor} 
            className="text-gray-200"
          />
        </div>
      </div>

      {/* Chat Panel */}
      <ChatPanel
        ref={chatPanelRef}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentPage={page}
        allPages={allPages}
        selections={selections}
        setSelections={setSelections}
        onApplyAiResponseToEditor={handleApplyAiResponse}
        editor={editor}
      />
    </div>
  )
} 