import React from 'react'
import { MentionInput } from './MentionInput'
import { Page } from '@/lib/supabase/types'
import { useQuickOpen } from './QuickOpenContext'

interface ChatInputWrapperProps {
  input: string
  setInput: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  allPages: Page[]
  children: (mentionHandlers: { handleKeyDown: (e: React.KeyboardEvent) => void }) => React.ReactNode
}

/**
 * Wrapper that provides MentionInput functionality to child components
 * Must be used inside QuickOpenProvider
 */
export function ChatInputWrapper({ input, setInput, textareaRef, allPages, children }: ChatInputWrapperProps) {
  // Call MentionInput to ensure its useEffect runs (for @ detection and context updates)
  const mentionInput = MentionInput({ input, setInput, textareaRef, allPages })
  
  return (
    <>
      {children({ handleKeyDown: mentionInput.handleKeyDown })}
    </>
  )
} 