'use client'

import { memo, useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { XIcon, SendIcon, Edit2, MessageSquare, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/supabase-client'
import { Conversation, ChatMessage, Page } from '@/lib/supabase/types'
import conversationsService from '@/lib/conversations/conversations'
import ReactMarkdown from 'react-markdown'
import { Editor } from '@tiptap/react'
import { 
  detectLastThought, 
  createThoughtContext 
} from '@/lib/brainstorming'
import logger from '@/lib/logger'

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
  editor?: Editor | null
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
  editor
}: Props, ref) {
  const supabase = createClient()
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null)
  const [showConversations, setShowConversations] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInputValue, setTitleInputValue] = useState('')
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Load conversations when component mounts
  useEffect(() => {
    logger.info('ChatPanel mounted, loading conversations in background...')
    loadConversations()
  }, [])

  // Log when panel becomes visible
  useEffect(() => {
    if (isOpen) {
      logger.info('ChatPanel became visible', { 
        hasActiveConversation: !!activeConversation,
        conversationCount: conversations.length 
      })
    }
  }, [isOpen, activeConversation, conversations.length])

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      logger.info('Active conversation changed, loading messages...', { conversationId: activeConversation.id })
      loadMessages(activeConversation.id)
    } else {
      setMessages([])
    }
  }, [activeConversation])

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

  const loadMessages = async (conversationId: string) => {
    setIsLoadingHistory(true)
    try {
      logger.info('Loading messages for conversation', { conversationId })
      const conversationMessages = await conversationsService.getMessages(conversationId)
      
      // Transform to our Message format
      const formattedMessages: Message[] = conversationMessages.map(msg => ({
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
      
      setMessages(formattedMessages)
      logger.info('Messages loaded successfully', { 
        conversationId,
        messageCount: formattedMessages.length 
      })
    } catch (error) {
      logger.error('Error loading messages:', error)
    } finally {
      setIsLoadingHistory(false)
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

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    
    if (!input.trim() || isLoading || !activeConversation) return

    const userMessageContent = input
    setInput('')
    setIsLoading(true)
    
    // Add user message to UI
    const userMessage: Message = { 
      role: 'user' as const, 
      content: userMessageContent,
      selections: selections.length > 0 ? [...selections] : undefined 
    }
    
    setMessages(prev => [...prev, userMessage])
    
    // Scroll to bottom after adding user message
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }, 100)
    
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

      // Use simplified brainstorming to get thought context
      const thoughtContext = createThoughtContext(allPages, currentPage, editor)

      console.log('Sending messages to LLM API', { 
        hasSelections: selections.length > 0,
        hasPageContent: !!currentPage,
        conversationHistoryCount: conversationHistory.length,
        thoughtContextLength: thoughtContext.length,
      })

      // Call the LLM API with thought context and supermemory context separate
      const apiResponse = await fetch('/api/chat-panel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          conversationHistory,
          currentMessage: userMessageContent,
          thoughtContext, // Separate thought context
          selections: selections.length > 0 ? selections : undefined
        }),
      })

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json()
        throw new Error(errorData.error || `API Error: ${apiResponse.statusText}`)
      }

      const data = await apiResponse.json()
      const assistantMessageContent = data.response
      const relevantDocuments = data.relevantDocuments || []

      console.log('LLM API response:', { 
        responseLength: assistantMessageContent?.length,
        documentsFound: relevantDocuments.length 
      })

      // Add assistant response to messages
      const assistantMessage: Message = { 
        role: 'assistant' as const, 
        content: assistantMessageContent,
        relevantDocuments: relevantDocuments.length > 0 ? relevantDocuments : undefined
      }
      setMessages(prev => [...prev, assistantMessage])
      
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

      // Scroll to bottom after assistant response
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }, 100)

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
  }, [input, selections, isLoading, activeConversation, currentPage, allPages, editor])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Backspace' && !input && selections.length > 0) {
      e.preventDefault()
      removeSelection(selections[selections.length - 1].id)
    }
  }, [handleSubmit, input, selections])

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-0 z-40 h-full w-[400px] border-l border-[#333333] bg-[#1e1e1e] shadow-lg transition-all ease-out overflow-hidden">
      {/* Top bar with title and close button */}
      <div className="flex justify-between items-center p-3 border-b border-[#333333] h-12">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#cccccc]" />
          {showConversations ? (
            <span className="text-sm text-[#cccccc] font-medium">Past Conversations</span>
          ) : isEditingTitle ? (
            <input
              type="text"
              value={titleInputValue}
              onChange={(e) => setTitleInputValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-sm text-[#cccccc] font-medium bg-transparent border-none outline-none focus:bg-[#2a2a2a] px-1 rounded"
              autoFocus
            />
          ) : (
            <span 
              className="text-sm text-[#cccccc] font-medium cursor-pointer hover:text-white transition-colors"
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
              className="text-xs text-[#969696] hover:text-[#cccccc] transition-colors"
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
        <div className="flex flex-col h-[calc(100vh-48px)]">
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowConversations(false)}
                className="text-xs text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                ← Back to Chat
              </button>
              <button
                onClick={createNewConversation}
                className="text-xs text-[#969696] hover:text-[#cccccc] transition-colors"
              >
                New Chat
              </button>
            </div>
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <div className="text-xs text-[#969696] italic">No conversations yet</div>
              ) : (
                conversations.map(conversation => (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setActiveConversation(conversation)
                      setShowConversations(false)
                    }}
                    className={`w-full text-left p-3 rounded text-xs transition-colors ${
                      activeConversation?.id === conversation.id
                        ? 'bg-[#2a2a2a] text-[#cccccc] border border-[#333333]'
                        : 'text-[#969696] hover:bg-[#2a2a2a] hover:text-[#cccccc]'
                    }`}
                  >
                    <div className="font-medium">{conversation.title}</div>
                    <div className="text-[10px] text-[#969696] mt-1">
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
        <>
          {/* Chat Messages */}
          <div 
            ref={messagesContainerRef}
            className="h-[calc(100vh-168px)] overflow-y-auto"
          >
            <div ref={scrollAreaRef} className="flex flex-col gap-3 p-4">
              {isLoadingHistory ? (
                <div className="text-xs text-[#969696]">Loading chat history...</div>
              ) : !activeConversation ? (
                <div className="text-xs text-[#969696]">Select or create a conversation to start chatting</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-[#969696]">No messages yet. Start a conversation!</div>
              ) : (
                messages.map((message, i) => (
                  <div key={i} className="space-y-1">
                    {/* Show selections above the message */}
                    {message.selections && message.selections.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-1 text-[10px] text-[#969696] justify-start">
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
                      <div className="text-xs text-[#cccccc] leading-relaxed">
                        <div className="prose prose-invert prose-xs max-w-none">
                          <ReactMarkdown 
                            components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="text-[#cccccc]">{children}</li>,
                            code: ({ children }) => <code className="bg-[#2a2a2a] px-1 py-0.5 rounded text-[#60a5fa] text-[10px]">{children}</code>,
                            pre: ({ children }) => <pre className="bg-[#2a2a2a] p-2 rounded overflow-x-auto text-[10px] mb-2">{children}</pre>,
                            blockquote: ({ children }) => <blockquote className="border-l-2 border-[#60a5fa] pl-3 mb-2 italic text-[#969696]">{children}</blockquote>,
                            h1: ({ children }) => <h1 className="text-sm font-bold mb-2 text-white">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-sm font-semibold mb-2 text-white">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-xs font-semibold mb-1 text-white">{children}</h3>,
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
                                  className="text-[10px] text-[#60a5fa] hover:text-[#4a9fff] underline transition-colors"
                                  onClick={() => {
                                    if (doc.pageUuid) {
                                      console.log('Navigating to page:', doc.title, doc.pageUuid)
                                      // Navigate to the page
                                      window.location.href = `/page/${doc.pageUuid}`
                                    } else {
                                      console.log('No page UUID available for document:', doc.title)
                                    }
                                  }}
                                >
                                  {doc.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Add Apply button for AI responses */}
                        {onApplyAiResponseToEditor && (
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
                        )}
                      </div>
                    ) : (
                      <div className="w-full rounded bg-[#2a2a2a] px-3 py-2 text-xs leading-relaxed text-[#cccccc]">
                        {message.content}
                      </div>
                    )}
                    
                    {/* Optional timestamp display */}
                    {message.timestamp && (
                      <div className="text-[10px] text-[#969696] text-right">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                ))
              )}
              {/* Loading indicator */} 
              {isLoading && (
                <div className="mb-3 rounded py-2 px-3 text-xs text-[#969696]">
                  Thinking...
                </div>
              )}
            </div>
          </div>
          {/* Input Area */}
          <div className="absolute bottom-0 left-0 right-0 border-t border-[#333333] bg-[#1e1e1e] p-4">
        {/* Display multiple selections */} 
        {selections.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 justify-start">
            {selections.map((sel) => (
              <span key={sel.id} className="inline-flex items-center rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#969696]">
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
            className="min-h-[36px] resize-none rounded bg-[#2a2a2a] border border-[#404040] text-xs px-3 py-2 text-[#cccccc] placeholder-[#969696] focus:outline-none focus:border-[#007acc] transition-colors flex-1"
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
      </div>
        </>
      )}
    </div>
  )
}))

export default ChatPanel 