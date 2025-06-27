'use client'

import React, { memo, useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { XIcon, SendIcon, Edit2, MessageSquare, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/supabase-client'
import { Conversation, ChatMessage, Page } from '@/lib/supabase/types'
import conversationsService from '@/lib/conversations/conversations'
import ReactMarkdown from 'react-markdown'
import { Editor } from '@tiptap/react'
import { 
  createThoughtContext 
} from '@/lib/brainstorming'
import logger from '@/lib/logger'
import ChatPagination from './pagination/ChatPagination'
import { useRouter } from 'next/navigation'
import { QuickOpenProvider } from './folder-tagging-for-ai/QuickOpenContext'
import QuickOpenPalette from './folder-tagging-for-ai/QuickOpenPalette'
import { ChatInputWrapper } from './folder-tagging-for-ai/ChatInputWrapper'

// Simple selection object type
type SelectionObject = {
  id: string
  text: string
  startLine: number
  endLine: number
}

type Props = {
  isOpen: boolean
  onClose: () => void
  currentPage?: Page
  allPages?: Page[]
  selections: SelectionObject[]
  setSelections: (selections: SelectionObject[]) => void
  onApplyAiResponseToEditor?: (responseText: string, selections?: SelectionObject[]) => void
  onPageUpdate?: (updatedPage: Page) => void
  editor?: Editor | null
  isMobile?: boolean
}

// Export ChatPanelHandle interface for typing the ref
export interface ChatPanelHandle {
  focusInput: () => void
}

type RelevantDocument = {
  id: string
  title: string
  content: string
  score?: number
  pageUuid?: string | null
  metadata?: any
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  selections?: SelectionObject[]
  timestamp?: string | null
  relevantDocuments?: RelevantDocument[]
}

const ChatPanel = memo(forwardRef<ChatPanelHandle, Props>(function ChatPanel({ 
  isOpen,
  onClose,
  currentPage,
  allPages = [],
  selections,
  setSelections,
  onApplyAiResponseToEditor,
  onPageUpdate,
  editor,
  isMobile = false
}: Props, ref) {
  return (
    <ChatPanelInner {...{ isOpen, onClose, currentPage, allPages, selections, setSelections, onApplyAiResponseToEditor, onPageUpdate, editor, isMobile }} ref={ref} />
  )
}))

const ChatPanelInner = memo(forwardRef<ChatPanelHandle, Props>(function ChatPanelInner({ 
  isOpen,
  onClose,
  currentPage,
  allPages = [],
  selections,
  setSelections,
  onApplyAiResponseToEditor,
  onPageUpdate,
  editor,
  isMobile = false
}: Props, ref) {
  const supabase = createClient()
  const router = useRouter()
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [currentOffset, setCurrentOffset] = useState(0)
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null)
  const [showConversations, setShowConversations] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInputValue, setTitleInputValue] = useState('')
  
  // Model selection state
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o')
  
  // Available models
  const availableModels = [
    { id: 'gpt-4o', name: 'GPT-4o', description: '' },
    { id: 'o3-mini', name: 'o3-mini', description: '' },
    { id: 'o3', name: 'o3', description: '' },
    { id: 'chatgpt-4o-latest', name: 'ChatGPT (chat only, no actions)', description: '' }
  ]
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const MESSAGES_PER_PAGE = 20

  // MentionInput will be created inside the QuickOpenProvider

  // Simple scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      logger.info('Scrolled to bottom of chat')
    }
  }, [])

  // Enhanced scroll function that forces immediate scroll
  const scrollToBottomImmediate = useCallback(() => {
    if (messagesContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
          logger.info('Immediately scrolled to bottom of chat')
        }
      })
    }
  }, [])

  // Load conversations when component mounts
  useEffect(() => {
    logger.info('ChatPanel mounted, loading conversations in background...')
    loadConversations()
  }, []) // Keep empty dependency array to run only once
  
  // Load saved model from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem('corta-selected-model')
    if (savedModel && availableModels.some(m => m.id === savedModel)) {
      setSelectedModel(savedModel)
      logger.info('Loaded saved model from localStorage', { model: savedModel })
    }
  }, [])
  
  // Save model to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('corta-selected-model', selectedModel)
    logger.info('Saved model to localStorage', { model: selectedModel })
  }, [selectedModel])

  // Scroll to bottom when panel opens
  useEffect(() => {
    if (isOpen) {
      logger.info('ChatPanel became visible', { 
        hasActiveConversation: !!activeConversation,
        conversationCount: conversations.length,
        isMobile: isMobile,
        messageCount: messages.length
      })
      // If there are already messages loaded, scroll to bottom immediately
      if (messages.length > 0) {
        scrollToBottomImmediate()
      }
    }
  }, [isOpen]) // Remove scrollToBottom and messages.length dependencies to prevent multiple calls

  // Note: Function calling now happens on server-side via API

  // ------------------- LOAD MESSAGES FUNCTION -------------------
  const loadMessages = useCallback(async (conversationId: string, offset = 0, append = false): Promise<void> => {
    if (offset === 0) {
      setIsLoadingHistory(true)
    } else {
      setIsLoadingOlder(true)
    }

    try {
      logger.info('Loading messages for conversation', { conversationId, offset, append })
      
      // Get all messages first to determine total count and pagination
      const allMessages = await conversationsService.getMessages(conversationId)
      const totalMessages = allMessages.length
      
      // Calculate which messages to show based on offset and page size
      // We want to show the most recent messages first, so we reverse the logic
      const startIndex = Math.max(0, totalMessages - offset - MESSAGES_PER_PAGE)
      const endIndex = totalMessages - offset
      const messagesToShow = allMessages.slice(startIndex, endIndex)
      
      // Transform to our Message format
      const formattedMessages: Message[] = messagesToShow.map(msg => ({
        role: msg.is_user_message ? 'user' : 'assistant',
        content: msg.content,
        selections: msg.metadata && 
                   typeof msg.metadata === 'object' && 
                   'selections' in msg.metadata && 
                   Array.isArray(msg.metadata.selections) ? 
                   (msg.metadata.selections as unknown as SelectionObject[]) : 
                   undefined,
        relevantDocuments: msg.metadata && 
                          typeof msg.metadata === 'object' && 
                          'relevantDocuments' in msg.metadata ? 
                          (msg.metadata.relevantDocuments as RelevantDocument[]) : 
                   undefined,
        timestamp: msg.created_at
      }))
      
      if (append) {
        setMessages(prev => [...formattedMessages, ...prev])
      } else {
        setMessages(formattedMessages)
      }

      // Check if there are more messages to load
      setHasOlderMessages(startIndex > 0)
      
      logger.info('Messages loaded successfully', { 
        conversationId,
        messageCount: formattedMessages.length,
        totalMessages,
        hasOlderMessages: startIndex > 0
      })
    } catch (error) {
      logger.error('Error loading messages:', error)
    } finally {
      if (offset === 0) {
        setIsLoadingHistory(false)
      } else {
        setIsLoadingOlder(false)
      }
    }
  }, [MESSAGES_PER_PAGE])

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      logger.info('Active conversation changed, loading messages...', { conversationId: activeConversation.id })
      setCurrentOffset(0)
      loadMessages(activeConversation.id, 0, false).then(() => {
        // Always scroll to bottom after messages load
        scrollToBottomImmediate()
      })
    } else {
      setMessages([])
    }
  }, [activeConversation]) // Remove loadMessages and scrollToBottom dependencies to prevent multiple calls

  // Scroll to bottom whenever messages change (especially important for initial load)
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        scrollToBottomImmediate()
        logger.info('Auto-scrolled to bottom after messages updated', { 
          messageCount: messages.length,
          isOpen,
          hasActiveConversation: !!activeConversation 
        })
      }, 100)
    }
  }, [messages.length, isOpen, scrollToBottomImmediate])

  // Load older messages function
  const handleLoadOlder = useCallback(() => {
    if (!activeConversation || isLoadingOlder) return
    
    // Store current scroll position before loading older messages
    const currentScrollTop = messagesContainerRef.current?.scrollTop || 0
    const currentScrollHeight = messagesContainerRef.current?.scrollHeight || 0
    
    const newOffset = currentOffset + MESSAGES_PER_PAGE
    setCurrentOffset(newOffset)
    
    // Load older messages and maintain scroll position
    loadMessages(activeConversation.id, newOffset, true).then(() => {
      // After loading, adjust scroll position to maintain user's view
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight
          const heightDifference = newScrollHeight - currentScrollHeight
          messagesContainerRef.current.scrollTop = currentScrollTop + heightDifference
          logger.info('Maintained scroll position after loading older messages', {
            oldScrollTop: currentScrollTop,
            newScrollTop: messagesContainerRef.current.scrollTop,
            heightDifference
          })
        }
      }, 100)
    })
  }, [activeConversation?.id, currentOffset, isLoadingOlder]) // Remove loadMessages and MESSAGES_PER_PAGE dependencies

  const loadConversations = async () => {
    try {
      logger.info('Loading conversations...')
      const userConversations = await conversationsService.getConversations()
      logger.info('Conversations loaded', { count: userConversations.length })
      setConversations(userConversations)
      
      // If there's a current page, try to find or create a conversation for it
      if (currentPage && userConversations.length === 0) {
        logger.info('Creating new conversation for current page', { pageTitle: currentPage.title })
        const newConversation = await conversationsService.createConversation(
          `Chat about ${currentPage.title}`,
          [currentPage.uuid]
        )
        if (newConversation) {
          logger.info('New conversation created', { conversationId: newConversation.id })
          setConversations([newConversation])
          setActiveConversation(newConversation)
        }
      } else if (userConversations.length > 0 && !activeConversation) {
        // Set the most recent conversation as active
        logger.info('Setting most recent conversation as active', { conversationId: userConversations[0].id })
        setActiveConversation(userConversations[0])
      }
    } catch (error) {
      logger.error('Error loading conversations:', error)
    }
  }

  const createNewConversation = async () => {
    try {
      const title = currentPage ? `Chat about ${currentPage.title}` : 'New Chat'
      const relatedPages = currentPage ? [currentPage.uuid] : []
      
      const newConversation = await conversationsService.createConversation(title, relatedPages)
      if (newConversation) {
        setConversations(prev => [newConversation, ...prev])
        setActiveConversation(newConversation)
        console.log('Created new conversation:', newConversation.title)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  const handleTitleDoubleClick = () => {
    if (activeConversation) {
      setIsEditingTitle(true)
      setTitleInputValue(activeConversation.title)
    }
  }

  const handleTitleSave = async () => {
    if (!activeConversation || !titleInputValue.trim()) {
      setIsEditingTitle(false)
      return
    }

    try {
      await conversationsService.updateConversation(activeConversation.id, {
        title: titleInputValue.trim()
      })
      
      // Update local state
      setActiveConversation(prev => prev ? { ...prev, title: titleInputValue.trim() } : null)
      setConversations(prev => 
        prev.map(conv => 
          conv.id === activeConversation.id 
            ? { ...conv, title: titleInputValue.trim() }
            : conv
        )
      )
      console.log('Updated conversation title:', titleInputValue.trim())
    } catch (error) {
      console.error('Error updating conversation title:', error)
    } finally {
      setIsEditingTitle(false)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
    }
  }

  const removeSelection = (idToRemove: string) => {
    setSelections(selections.filter(sel => sel.id !== idToRemove))
  }

  // Expose focusInput method via ref
  useImperativeHandle(ref, () => ({
    focusInput: () => {
      console.log('Focusing chat input programmatically')
      
      const attemptFocus = () => {
        if (!textareaRef.current) {
          console.warn('Cannot focus chat input - textareaRef is null')
          return false
        }
        
        try {
          textareaRef.current.focus()
          console.log('Chat input focused successfully')
          return true
        } catch (error) {
          console.error('Error focusing chat input:', error)
          return false
        }
      }
      
      if (!attemptFocus()) {
        setTimeout(() => {
          if (!attemptFocus()) {
            setTimeout(attemptFocus, 150)
          }
        }, 50)
      }
    }
  }))

  // Extract file references from input and add them as selections
  const extractFileReferencesAsSelections = useCallback((messageText: string): string => {
    console.log('🔍 Extracting file references as selections from message:', messageText)
    
    // Find all @filename references (not folders ending with /)
    const fileReferenceRegex = /@([^@\s]+(?:\/[^@\s\/]+)*)\s/g
    const matches = Array.from(messageText.matchAll(fileReferenceRegex))
    
    console.log('📄 Found file references:', matches.map(m => m[1]))
    
    let cleanedMessage = messageText
    const newSelections: SelectionObject[] = []
    
    for (const match of matches) {
      const fullPath = match[1] // e.g., "Resources/Books/SomeFile"
      const pathSegments = fullPath.split('/')
      const filename = pathSegments[pathSegments.length - 1] // Last segment is the filename
      
      console.log('🔍 Looking for file:', { fullPath, filename, pathSegments })
      
      // Find the file in allPages by traversing the path
      let currentParentUuid: string | null = null
      let targetFile: Page | null = null
      
      // Navigate through folders to find the target file
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i]
        const isLastSegment = i === pathSegments.length - 1
        
        const page = allPages.find(p => 
          p.title === segment && 
          p.parent_uuid === currentParentUuid && 
          !p.is_deleted &&
          (isLastSegment ? p.type !== 'folder' : p.type === 'folder') // Last segment should be a file, others should be folders
        )
        
        if (!page) {
          console.log('❌ Could not find segment:', segment, 'with parent:', currentParentUuid)
          break
        }
        
        if (isLastSegment) {
          targetFile = page
          console.log('✅ Found target file:', { title: page.title, uuid: page.uuid.slice(0, 8) })
        } else {
          currentParentUuid = page.uuid
          console.log('📁 Found folder:', { title: page.title, uuid: page.uuid.slice(0, 8) })
        }
      }
      
      if (targetFile && targetFile.content_text) {
        // Create a selection object for this file
        const fileSelection: SelectionObject = {
          id: targetFile.uuid,
          text: targetFile.content_text,
          startLine: 1,
          endLine: targetFile.content_text.split('\n').length
        }
        
        newSelections.push(fileSelection)
        console.log('📄 Added file as selection:', { filename: fullPath, contentLength: targetFile.content_text.length })
        
        // Replace the @filename reference with just the filename for cleaner message
        cleanedMessage = cleanedMessage.replace(match[0], `${filename} `)
      } else {
        console.log('❌ Could not find file content for:', fullPath)
      }
    }
    
    // Add the new file selections to existing selections
    if (newSelections.length > 0) {
      const updatedSelections = [...selections, ...newSelections]
      setSelections(updatedSelections)
      console.log('📋 Added file selections to context:', { 
        newFileSelections: newSelections.length,
        totalSelections: updatedSelections.length 
      })
    }
    
    console.log('🔄 File extraction complete:', { 
      originalMessage: messageText,
      cleanedMessage,
      fileSelectionsAdded: newSelections.length 
    })
    
    return cleanedMessage
  }, [allPages, selections, setSelections])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    if (!input.trim() || isLoading || !activeConversation) return

    // Extract file references and add them as selections
    const userMessageContent = extractFileReferencesAsSelections(input)
    
    setInput('')
    setIsLoading(true)
    
    // Add user message to UI
    const userMessage: Message = { 
      role: 'user' as const, 
      content: userMessageContent,
      selections: selections.length > 0 ? [...selections] : undefined 
    }
    
    // Add empty assistant message that will be filled during streaming
    const assistantMessage: Message = { 
      role: 'assistant' as const, 
      content: '',
      relevantDocuments: undefined
    }
    
    // Add both messages at once to prevent scroll jumping
    setMessages(prev => [...prev, userMessage, assistantMessage])
    
    // Clear selections after sending
    setSelections([])
    
    // Scroll to bottom immediately after adding both messages, BEFORE streaming starts
    scrollToBottomImmediate()
    logger.info('Scrolled to bottom before streaming starts', { 
      userMessageLength: userMessageContent.length,
      hasSelections: selections.length > 0,
      isMobile 
    })

    try {
      // Save user message to database
      await conversationsService.addMessage(
        activeConversation.id,
        userMessageContent,
        true,
        userMessage.selections ? { selections: userMessage.selections } : {}
      )

      // Add current page to conversation if not already there
      if (currentPage) {
        await conversationsService.addRelatedPage(activeConversation.id, currentPage.uuid)
      }

      // Get recent conversation messages (last 6 messages to keep context manageable)
      const conversationHistory = messages.slice(-6).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }))

      // Find the timestamps of the last messages for context awareness
      const lastAiMessage = messages
        .filter(msg => msg.role === 'assistant')
        .sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return timeB - timeA
        })[0]

      const lastUserMessage = messages
        .filter(msg => msg.role === 'user')
        .sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return timeB - timeA
        })[0]
      
      const lastAiMessageTimestamp = lastAiMessage?.timestamp || undefined
      const lastUserMessageTimestamp = lastUserMessage?.timestamp || undefined

      // Use simplified brainstorming to get thought context with timing information
      const thoughtContext = createThoughtContext(allPages, currentPage, editor, lastAiMessageTimestamp, lastUserMessageTimestamp)

      logger.info('Brainstorming context analysis', {
        hasSelections: selections.length > 0,
        hasPageContent: !!currentPage,
        conversationHistoryCount: conversationHistory.length,
        thoughtContextLength: thoughtContext.length,
        lastAiMessageTimestamp,
        lastUserMessageTimestamp,
        hasEditor: !!editor,
        selectedModel: selectedModel
      })

      console.log('Sending messages to LLM API', { 
        hasSelections: selections.length > 0,
        hasPageContent: !!currentPage,
        conversationHistoryCount: conversationHistory.length,
        thoughtContextLength: thoughtContext.length,
      })

      // Call the unified streaming API (with function calling capabilities)
      const apiResponse = await fetch('/api/chat-panel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          conversationHistory,
          currentMessage: userMessageContent,
          thoughtContext, // Separate thought context
          selections: selections.length > 0 ? selections : undefined,
          currentPageUuid: currentPage?.uuid,
          model: selectedModel, // Add selected model

          // No useFunction flag - let AI decide always
        }),
      })

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json()
        throw new Error(errorData.error || `API Error: ${apiResponse.statusText}`)
      }

      // Handle streaming response (now includes function calling)
      let assistantMessageContent = ''
      let relevantDocuments: RelevantDocument[] = []
      
      // Assistant message is the last one we just added
      const assistantMessageIndex = messages.length + 1

      const textDecoder = new TextDecoder()

      if (apiResponse.body) {
        const reader = apiResponse.body.getReader()
        try {
          let buffer = ''

          const processEvent = (raw: string) => {
            if (!raw.startsWith('data: ')) return
                try {
              const data = JSON.parse(raw.slice(6))
                  
                  if (data.type === 'token' && data.content) {
                    assistantMessageContent += data.content
                    
                    // Hide "Thinking..." as soon as first token arrives
                    if (assistantMessageContent === data.content) {
                      setIsLoading(false)
                    }
                    
                    // Update the assistant message in real-time
                    setMessages(prev => {
                      const updated = [...prev]
                      updated[assistantMessageIndex] = {
                        ...updated[assistantMessageIndex],
                        content: assistantMessageContent
                      }
                      return updated
                    })
                  } else if (data.type === 'metadata') {
                    relevantDocuments = data.relevantDocuments || []
                    
                    setMessages(prev => {
                      const updated = [...prev]
                      updated[assistantMessageIndex] = {
                        ...updated[assistantMessageIndex],
                        relevantDocuments: relevantDocuments.length > 0 ? relevantDocuments : undefined
                      }
                      return updated
                    })
                    
                    console.log('LLM API streaming complete:', { 
                      responseLength: assistantMessageContent?.length,
                      documentsFound: relevantDocuments.length 
                    })
                  } else if (data.type === 'function_call') {
                    // Handle function calls during streaming
                    logger.info('=== FUNCTION CALL DURING STREAMING ===', {
                      functionName: data.function_name,
                      hasResult: !!data.result,
                      success: data.result?.success
                    });

                    if (data.result?.success) {
                      logger.info('=== STREAMING FUNCTION SUCCESS ===', {
                        result: data.result,
                        currentPageUuid: currentPage?.uuid
                      });
                      
                      // Auto-refresh after successful function call
                      setTimeout(async () => {
                        logger.info('Refreshing page content after successful function call');
                        
                        if (currentPage?.uuid) {
                          try {
                            // Fetch fresh content from Supabase
                            const supabase = createClient()
                            const { data: updatedPage, error } = await supabase
                              .from('pages')
                              .select('*')
                              .eq('uuid', currentPage.uuid)
                              .single()

                            if (error) {
                              logger.error('Error fetching updated page content:', error)
                              return
                            }

                            if (updatedPage) {
                              // Emit custom event with updated page content
                              window.dispatchEvent(new CustomEvent('updatePageContent', {
                                detail: { updatedPage }
                              }))
                              logger.info('Emitted updatePageContent event with fresh data')
                            }
                          } catch (error) {
                            logger.error('Error refreshing page:', error)
                          }
                        }
                      }, 1000); // Give user 1 second to see the success message
                      
                    } else {
                      logger.error('=== STREAMING FUNCTION FAILED ===', {
                        result: data.result,
                        currentPageUuid: currentPage?.uuid
                      });
                      
                      // Error is already shown in the chat stream, no dialog needed
                    }
                  } else if (data.type === 'error') {
                    throw new Error(data.error || 'Streaming error')
                  }
            } catch (_) {
              // JSON parse failed – ignore, buffer logic should avoid this
            }
          }

          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              // Flush any remaining buffered content
              if (buffer.length > 0) {
                buffer += textDecoder.decode()
                const trailing = buffer.split('\n\n')
                trailing.forEach(processEvent)
              }
              break
            }

            buffer += textDecoder.decode(value, { stream: true })

            let boundaryIndex: number
            while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, boundaryIndex).trim()
              buffer = buffer.slice(boundaryIndex + 2)
              if (rawEvent) processEvent(rawEvent)
            }
          }
        } finally {
          reader.releaseLock()
        }
      }

      // Save assistant message to database with relevant documents metadata
      const assistantMetadata = relevantDocuments.length > 0 ? {
        relevantDocuments: relevantDocuments.map((doc: RelevantDocument) => ({
          title: doc.title,
          pageUuid: doc.pageUuid
        }))
      } : {}

      await conversationsService.addMessage(
        activeConversation.id,
        assistantMessageContent,
        false,
        assistantMetadata
      )

    } catch (error) {
      console.error("Error calling LLM API:", error)
      const errorMessage: Message = { 
        role: 'assistant' as const, 
        content: `Error: ${(error as Error).message}` 
      }
      setMessages(prev => [...prev, errorMessage])
      
      // Save error message to database
      if (activeConversation) {
        await conversationsService.addMessage(
          activeConversation.id,
          errorMessage.content,
          false
        )
      }
    } finally {
      setIsLoading(false)
    }
  }, [input, selections, isLoading, activeConversation, currentPage, allPages, editor, extractFileReferencesAsSelections, selectedModel])

  // handleKeyDown will be created inside ChatInputWrapper

  // Don't unmount when closed - just hide to preserve state
  // if (!isOpen) return null

  // Build full path by traversing parent relationships
  const buildFullPath = React.useCallback((page: Page): string => {
    console.log('🏗️ ChatPanel buildFullPath called for:', { title: page.title, uuid: page.uuid.slice(0, 8), parent_uuid: page.parent_uuid?.slice(0, 8) })
    
    const pathSegments: string[] = []
    let currentPage: Page | null = page
    
    // Traverse up the parent chain
    while (currentPage) {
      console.log('🔍 Processing page:', { title: currentPage.title, uuid: currentPage.uuid.slice(0, 8), parent_uuid: currentPage.parent_uuid?.slice(0, 8) })
      pathSegments.unshift(currentPage.title)
      
      // Find parent
      if (currentPage.parent_uuid) {
        const parent = allPages.find(p => p.uuid === currentPage.parent_uuid)
        console.log('🔍 Found parent:', parent ? { title: parent.title, uuid: parent.uuid.slice(0, 8) } : 'NOT FOUND')
        currentPage = parent || null
      } else {
        console.log('🔍 No parent_uuid, stopping')
        currentPage = null
      }
    }
    
    const fullPath = pathSegments.join('/')
    console.log('🏗️ ChatPanel buildFullPath result:', { pathSegments, fullPath })
    return fullPath
  }, [allPages])

  // Create the file select handler
  const handleFileSelect = React.useCallback((page: Page) => {
    console.log('🎯 ChatPanel handleFileSelect ENTRY:', { title: page.title, type: page.type, uuid: page.uuid.slice(0, 8) })
    
    const textarea = textareaRef.current
    if (!textarea) return

    // Find the last @ in the input
    const lastAtIndex = input.lastIndexOf('@')
    if (lastAtIndex === -1) return
    
    const isFolder = page.type === 'folder'
    let newText
    
    if (isFolder) {
      // For folders: build full path + /
      const fullPath = buildFullPath(page)
      const replacement = `@${fullPath}/`
      console.log('📁 ChatPanel Folder logic:', { fullPath, replacement })
      newText = input.slice(0, lastAtIndex) + replacement
    } else {
      // For files: remove the @ text completely
      newText = input.slice(0, lastAtIndex)
      console.log('📄 ChatPanel File logic: removing @ text, newText:', newText)
    }
    
    console.log('🔄 ChatPanel Updating text:', { 
      oldInput: input, 
      newText, 
      lastAtIndex,
      isFolder
    })
    
    // Update both textarea and React state
    textarea.value = newText
    setInput(newText)
    
    // If this was a file (not folder), add it directly as a selection
    if (!isFolder) {
      console.log('📋 File selected, adding as selection immediately')
      // We already have the file object, so add it directly as a selection
      const fileSelection: SelectionObject = {
        id: page.uuid,
        text: page.title || '',
        startLine: 1,
        endLine: (page.content_text || '').split('\n').length
      }
      
      const updatedSelections = [...selections, fileSelection]
      setSelections(updatedSelections)
      console.log('📋 Added file selection directly:', { 
        filename: buildFullPath(page),
        contentLength: page.content_text?.length || 0,
        totalSelections: updatedSelections.length 
      })
    }
    
    // Put cursor at the end
    const newCursorPos = newText.length
    textarea.setSelectionRange(newCursorPos, newCursorPos)
    textarea.focus()
  }, [input, buildFullPath, textareaRef, setInput, selections, setSelections])

  return (
    <QuickOpenProvider 
      pages={allPages} 
      onSelectFile={handleFileSelect}
    >
      <ChatInputWrapper
        input={input}
        setInput={setInput}
        textareaRef={textareaRef}
        allPages={allPages}
      >
        {({ handleKeyDown: mentionHandleKeyDown }) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Backspace' && !input && selections.length > 0) {
      e.preventDefault()
      removeSelection(selections[selections.length - 1].id)
    }
            // @ mention handling
            mentionHandleKeyDown(e)
          }, [handleSubmit, input, selections, mentionHandleKeyDown])

  return (
    <div 
      className={`${
        isMobile 
          ? "w-full bg-[#1e1e1e]" 
          : "h-full w-full bg-[#1e1e1e]"
      } transition-all ease-out overflow-hidden ${!isOpen ? 'pointer-events-none opacity-0' : ''}`}
      style={{ 
        touchAction: 'manipulation',
        height: isMobile ? '100vh' : '100vh',
        minHeight: isMobile ? '100vh' : '100vh',
        maxHeight: isMobile ? '100vh' : '100vh',
        // Use dynamic viewport height on mobile for Safari
        ...(isMobile && {
          height: '100dvh',
          minHeight: '100dvh',
          maxHeight: '100dvh'
        })
      }}
    >
      {/* Top bar with title and close button */}
      <div className="flex justify-between items-center p-3 border-b border-[#333333] h-12">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#cccccc]" />
          {showConversations ? (
            <span className="text-base text-[#cccccc] font-medium">Past Conversations</span>
          ) : isEditingTitle ? (
            <input
              type="text"
              value={titleInputValue}
              onChange={(e) => setTitleInputValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-[16px] md:text-base text-[#cccccc] font-medium bg-transparent border-none outline-none focus:bg-[#2a2a2a] px-1 rounded"
              style={{ fontSize: '16px' }}
              autoFocus
            />
          ) : (
            <span 
              className="text-base text-[#cccccc] font-medium cursor-pointer hover:text-white transition-colors"
              onDoubleClick={handleTitleDoubleClick}
              title="Double-click to rename"
            >
              {activeConversation?.title || (currentPage ? currentPage.title : 'Untitled')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!showConversations && (
            <button
              onClick={() => setShowConversations(true)}
              className="text-sm text-[#969696] hover:text-[#cccccc] transition-colors"
            >
              Past Conversations
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[#969696] hover:text-[#cccccc] p-1 rounded transition-colors"
          >
            <XIcon size={16} />
          </button>
        </div>
      </div>

      {showConversations ? (
        /* Conversations View */
        <div 
          className="flex flex-col"
          style={{ 
            height: isMobile ? 'calc(100vh - 48px)' : 'calc(100vh - 48px)',
            // Use dynamic viewport height on mobile for Safari
            ...(isMobile && {
              height: 'calc(100dvh - 48px)'
            })
          }}
        >
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowConversations(false)}
                className="text-sm text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                ← Back to Chat
              </button>
              <button
                onClick={createNewConversation}
                className="text-sm text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                New Chat
              </button>
            </div>
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <div className="text-sm text-[#969696] italic">No conversations yet</div>
              ) : (
                conversations.map(conversation => (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setActiveConversation(conversation)
                      setShowConversations(false)
                    }}
                    className={`w-full text-left p-3 rounded text-sm transition-colors ${
                      activeConversation?.id === conversation.id
                        ? 'bg-[#2a2a2a] text-[#cccccc] border border-[#333333]'
                        : 'text-[#969696] hover:bg-[#2a2a2a] hover:text-[#cccccc]'
                    }`}
                  >
                    <div className="font-medium">{conversation.title}</div>
                    <div className="text-xs text-[#969696] mt-1">
                      {conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Chat View */
        <div 
          className="relative flex flex-col h-full max-h-[calc(100dvh-48px)] overflow-hidden"
        >
          {/* Chat Messages */}
          <div 
            ref={messagesContainerRef}
            className={`flex-1 overflow-y-auto min-h-full ${isMobile ? 'pb-64' : 'pb-96'}`}
          >
            <div className="flex flex-col gap-3 p-4">
              {isLoadingHistory ? (
                <div className="text-sm text-[#969696]">Loading chat history...</div>
              ) : !activeConversation ? (
                <div className="text-sm text-[#969696]">Select or create a conversation to start chatting</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-[#969696]">No messages yet. Start a conversation!</div>
              ) : (
                <>
                  <ChatPagination
                    hasOlderMessages={hasOlderMessages}
                    isLoadingOlder={isLoadingOlder}
                    onLoadOlder={handleLoadOlder}
                  />
                  {messages.map((message, i) => {
                    return (
                      <div key={i} className="space-y-1">
                        {/* Show selections above the message */}
                        {message.selections && message.selections.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-1 text-xs text-[#969696] justify-start">
                            {message.selections.map(sel => (
                              <span
                                key={sel.id}
                                className="inline-flex items-center rounded bg-[#2a2a2a] px-1.5 py-0.5"
                              >
                                {(() => {
                                  const words = sel.text.split(/[\s\n]+/).filter(w => w.trim())
                                  if (words.length === 0) return ""
                                  if (words.length === 1) return words[0]
                                  return `${words[0]}...${words[words.length - 1]}`
                                })()}
                              </span>
                            ))}
                          </div>
                        )}

                        {message.role === "assistant" ? (
                          <div className="text-sm text-[#cccccc] leading-relaxed">
                            <div className="prose prose-invert prose-sm max-w-none">
                              <ReactMarkdown 
                                components={{
                                p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1.5">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1.5">{children}</ol>,
                                li: ({ children }) => <li className="text-[#cccccc] leading-relaxed">{children}</li>,
                                code: ({ children }) => <code className="bg-[#2a2a2a] px-1 py-0.5 rounded text-[#60a5fa] text-xs">{children}</code>,
                                pre: ({ children }) => <pre className="bg-[#2a2a2a] p-2 rounded overflow-x-auto text-xs mb-3">{children}</pre>,
                                blockquote: ({ children }) => <blockquote className="border-l-2 border-[#60a5fa] pl-3 mb-3 italic text-[#969696]">{children}</blockquote>,
                                h1: ({ children }) => <h1 className="text-base font-bold mb-3 mt-4 first:mt-0 text-white">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-white">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-white">{children}</h3>,
                                hr: () => <hr className="my-6 border-t border-[#404040]" />,
                              }}
                                                        >
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            
                            {/* Display relevant documents as simple links */}
                            {message.relevantDocuments && message.relevantDocuments.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-[#333333]">
                                <div className="flex flex-wrap gap-2">
                                  {message.relevantDocuments.map((doc, docIndex) => (
                                    <button
                                      key={doc.id || docIndex}
                                      className="text-xs text-[#60a5fa] hover:text-[#4a9fff] underline transition-colors"
                                      onClick={() => {
                                        if (doc.pageUuid) {
                                          logger.info('Opening page in new tab:', { title: doc.title, pageUuid: doc.pageUuid })
                                          // Open the page in a new tab
                                          window.open(`/dashboard/page/${doc.pageUuid}`, '_blank', 'noopener,noreferrer')
                                        } else {
                                          logger.warn('No page UUID available for document:', doc.title)
                                        }
                                      }}
                                    >
                                      {doc.title}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Apply to Editor button - COMMENTED OUT but functionality preserved */}
                            {/* {onApplyAiResponseToEditor && (
                              <button
                                className="mt-2 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#cccccc] px-2 py-1 rounded transition-colors"
                                disabled={applyingMessageId === (message.timestamp || `msg-${i}`)}
                                onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.preventDefault()
                                  const currentMessageId = message.timestamp || `msg-${i}`
                                  setApplyingMessageId(currentMessageId)
                                  
                                  // Find the preceding user message with selections
                                  let precedingUserMessageSelections: SelectionObject[] | undefined = undefined
                                  if (i > 0) {
                                    for (let j = i - 1; j >= 0; j--) {
                                      if (messages[j].role === 'user') {
                                        precedingUserMessageSelections = messages[j].selections
                                        break
                                      }
                                    }
                                  }
                                  
                                  console.log("Apply to Editor button clicked", { 
                                    messageId: currentMessageId,
                                    contentLength: message.content.length,
                                    hasCallback: !!onApplyAiResponseToEditor,
                                    hasPrecedingSelections: !!precedingUserMessageSelections,
                                    selectionCount: precedingUserMessageSelections?.length || 0
                                  })
                                  
                                  try {
                                    if (onApplyAiResponseToEditor) {
                                      await onApplyAiResponseToEditor(message.content, precedingUserMessageSelections)
                                    }
                                  } catch (err) {
                                    console.error("Error applying AI response:", err)
                                  } finally {
                                    setApplyingMessageId(null)
                                  }
                                }}
                              >
                                {applyingMessageId === (message.timestamp || `msg-${i}`) ? (
                                  <>
                                    <span className="inline-block w-3 h-3 mr-1.5 animate-spin rounded-full border-2 border-[#969696] border-t-transparent" />
                                    Applying...
                                  </>
                                ) : (
                                  'Apply to Editor'
                                )}
                              </button>
                            )} */}
                            
                            {/* Copy to Clipboard button */}
                            {message.content && (
                              <button
                                className="mt-2 text-sm bg-[#2a2a2a] hover:bg-[#3a3a3a] text-[#cccccc] px-2 py-1 rounded transition-colors"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(message.content)
                                    console.log('Copied to clipboard:', message.content.substring(0, 50) + '...')
                                    const messageId = message.timestamp || `msg-${i}`
                                    setCopiedMessageId(messageId)
                                    setTimeout(() => setCopiedMessageId(null), 2000)
                                  } catch (err) {
                                    console.error("Failed to copy:", err)
                                  }
                                }}
                              >
                                {copiedMessageId === (message.timestamp || `msg-${i}`) ? 'Copied!' : 'Copy to Clipboard'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="w-full rounded bg-[#2a2a2a] px-3 py-2 text-sm leading-relaxed text-[#cccccc]">
                            {message.content}
                          </div>
                        )}
                        
                        {/* Optional timestamp display */}
                        {message.timestamp && (
                          <div className="text-xs text-[#969696] text-right">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {/* Loading indicator */} 
              {isLoading && (
                <div className="mb-3 rounded py-2 px-3 text-sm text-[#969696]">
                  Thinking...
                </div>
              )}
            </div>
          </div>
          {/* Input Area */}
          <div
            className={`${isMobile ? 'fixed bottom-4 left-0 right-0 z-40' : 'sticky bottom-0 left-0 right-0 z-10'} border-t border-[#333333] bg-[#1e1e1e] px-4 pt-4 pb-6 md:pb-4 pb-[env(safe-area-inset-bottom)]`}
            style={isMobile ? {
              boxShadow: '0 16px 0 0 #1e1e1e'
            } : undefined}
          >
            {/* Display multiple selections */} 
            {selections.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1 justify-start">
                {selections.map((sel) => (
                  <span key={sel.id} className="inline-flex items-center rounded bg-[#2a2a2a] px-1.5 py-0.5 text-xs text-[#969696]">
                    {(() => {
                      const words = sel.text.split(/[\s\n]+/).filter(word => word.trim())
                      if (words.length === 0) return ''
                      if (words.length === 1) return words[0]
                      return `${words[0]}...${words[words.length - 1]}`
                    })()}
                    <button 
                      type="button"
                      onClick={() => removeSelection(sel.id)}
                      className="ml-1 text-[#969696] hover:text-[#cccccc]"
                      aria-label="Remove selection"
                    >
                      <XIcon size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Chat Input */} 
            <div className="flex items-center gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeConversation ? "Type a message..." : "Create a conversation first"}
                className="min-h-[36px] resize-none rounded bg-[#2a2a2a] border border-[#404040] text-sm px-3 py-2 text-[#cccccc] placeholder-[#969696] focus:outline-none focus:border-[#007acc] transition-colors flex-1"
                rows={1}
                disabled={isLoading || !activeConversation}
              />
              <button
                onClick={(e) => handleSubmit(e)}
                type="button"
                className="shrink-0 h-8 w-8 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:bg-[#2a2a2a] disabled:opacity-50 flex items-center justify-center transition-colors"
                disabled={isLoading || !activeConversation || !input.trim()}
              >
                {isLoading ? (
                  <span className="inline-block w-3 h-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <ArrowUp size={14} style={{ color: '#60a5fa' }} />
                )}
              </button>
            </div>
            {/* Model Selector */}
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-[#969696]">Model:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-[#2a2a2a] border border-[#404040] rounded px-2 py-1 text-[#cccccc] text-xs focus:outline-none focus:border-[#007acc] transition-colors"
              >
                {availableModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
            <QuickOpenPalette anchorRef={textareaRef} />
          </div>
        </div>
      )}
    </div>
          )
        }}
      </ChatInputWrapper>
    </QuickOpenProvider>
  )
}))

export default ChatPanel 