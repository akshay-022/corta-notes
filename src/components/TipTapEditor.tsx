'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { useEffect, useState, useRef } from 'react'
import { Page, PageUpdate } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/supabase-client'
import { Calendar, Minus } from 'lucide-react'

interface TipTapEditorProps {
  page: Page
  onUpdate: (page: Page) => void
}

export default function TipTapEditor({ page, onUpdate }: TipTapEditorProps) {
  const [title, setTitle] = useState(page.title)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const currentPageRef = useRef(page.uuid)
  const supabase = createClient()

  const editor = useEditor({
    extensions: [
      StarterKit,
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
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-120px)] px-16 py-8',
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
    <div className="flex-1 bg-[#1a1a1a] overflow-hidden">
      {/* Minimal toolbar - appears on hover */}
      <div className="absolute top-4 right-6 z-10 opacity-0 hover:opacity-100 transition-opacity">
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
        <div className="absolute top-4 left-6 z-10">
          <span className="text-gray-500 text-xs">Saving...</span>
        </div>
      )}

      {/* Editor container */}
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Title - Notion style */}
          <div className="px-16 pt-16 pb-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={handleTitleKeyDown}
                className="w-full bg-transparent text-white text-4xl font-bold placeholder-gray-600 border-none outline-none resize-none"
                placeholder="Untitled"
              />
            ) : (
              <h1
                onClick={startEditingTitle}
                className="text-white text-4xl font-bold cursor-text hover:bg-[#2a2a2a]/30 rounded px-1 py-1 -mx-1 transition-colors min-h-[3rem] flex items-center"
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
    </div>
  )
} 