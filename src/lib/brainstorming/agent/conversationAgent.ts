import { Editor } from '@tiptap/react'
import logger from '@/lib/logger'
import { 
  EDITOR_FUNCTIONS, 
  EditorFunctionCall, 
  EditorFunctionResult, 
  executeEditorFunction 
} from '../apply-to-editor/editorFunctions'
import { BRAINSTORMING_SYSTEM_PROMPT } from '@/lib/promptTemplates'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'function'
  content: string
  function_call?: EditorFunctionCall
  function_result?: EditorFunctionResult
  timestamp?: number
}

export interface AgentResponse {
  success: boolean
  message: string
  functionCalls?: EditorFunctionResult[]
  conversationHistory?: AgentMessage[]
}

/**
 * General conversation agent that can work with any function set
 * This is a full-featured agent for future function calling experiments
 */
export class ConversationAgent {
  private editor: Editor | null = null
  private conversationHistory: AgentMessage[] = []
  private pageUuid: string | null = null

  constructor(editor?: Editor | null, pageUuid?: string) {
    this.editor = editor || null
    this.pageUuid = pageUuid || null
    logger.info('ConversationAgent initialized', { hasEditor: !!this.editor, hasPageUuid: !!this.pageUuid })
  }

  /**
   * Set the editor instance
   */
  setEditor(editor: Editor | null) {
    this.editor = editor
    logger.info('Editor updated in conversation agent', { hasEditor: !!this.editor })
  }

  /**
   * Set the page UUID
   */
  setPageUuid(pageUuid: string | null) {
    this.pageUuid = pageUuid
    logger.info('Page UUID updated in conversation agent', { hasPageUuid: !!this.pageUuid })
  }

  /**
   * Process a user message and potentially execute function calls
   */
  async processMessage(
    userMessage: string,
    context?: {
      thoughtContext?: string
      selections?: string[]
      relevantDocuments?: Array<{ title: string; content: string }>
      conversationHistory?: any[]
      organizationInstructions?: string
    }
  ): Promise<AgentResponse> {
    logger.info('Processing user message', { 
      messageLength: userMessage.length,
      hasContext: !!context,
      hasOrganizationInstructions: !!context?.organizationInstructions
    })

    try {
      // Add user message to conversation
      const userMsg: AgentMessage = {
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      }
      this.conversationHistory.push(userMsg)

      // Create the API request for the LLM
      const response = await this.callLLMWithFunctions(userMessage, context)
      
      return response
    } catch (error) {
      logger.error('Error processing message', { error })
      return {
        success: false,
        message: `Error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /**
   * Call the LLM API with function calling support
   */
  private async callLLMWithFunctions(
    userMessage: string,
    context?: {
      thoughtContext?: string
      selections?: string[]
      relevantDocuments?: Array<{ title: string; content: string }>
      conversationHistory?: any[]
      organizationInstructions?: string
    }
  ): Promise<AgentResponse> {
    // Build the system message with function calling instructions
    const systemMessage = this.buildSystemMessage(context?.organizationInstructions)
    
    // Build the enhanced user message with context
    const enhancedMessage = this.buildEnhancedMessage(userMessage, context)

    // Prepare the messages for the LLM
    const messages = [
      { role: 'system', content: systemMessage },
      ...this.conversationHistory.slice(-10), // Last 10 messages for context
      { role: 'user', content: enhancedMessage }
    ]

    // Call OpenAI using helper (no native function-calling yet)
    const { chatCompletion } = await import('@/lib/openaiClient')

    // Get assistant response text
    const aiContent = await chatCompletion(messages as any, 'gpt-4-turbo-preview')

    const aiMessage: { content: string } & Partial<{ function_call: any }> = {
      content: aiContent
    }

    // Handle function calls if present
    const functionResults: EditorFunctionResult[] = []
    
    if (aiMessage.function_call) {
      logger.info('AI requested function call', { 
        functionName: aiMessage.function_call.name 
      })

      const functionCall: EditorFunctionCall = {
        name: aiMessage.function_call.name,
        arguments: JSON.parse(aiMessage.function_call.arguments || '{}')
      }

      const result = await executeEditorFunction(functionCall, this.editor, this.pageUuid || undefined)
      functionResults.push(result)

      // Add function call and result to conversation history
      this.conversationHistory.push({
        role: 'assistant',
        content: aiMessage.content || '',
        function_call: functionCall,
        timestamp: Date.now()
      })

      this.conversationHistory.push({
        role: 'function',
        content: JSON.stringify(result),
        function_result: result,
        timestamp: Date.now()
      })
    } else {
      // Regular message without function call
      this.conversationHistory.push({
        role: 'assistant',
        content: aiMessage.content || '',
        timestamp: Date.now()
      })
    }

    return {
      success: true,
      message: aiMessage.content || '',
      functionCalls: functionResults,
      conversationHistory: this.conversationHistory
    }
  }

  /**
   * Build the system message with function calling instructions
   */
  private buildSystemMessage(organizationInstructions?: string): string {
    let systemMessage = `${BRAINSTORMING_SYSTEM_PROMPT}

You are an AI assistant that can help users with their notes and documents. You have access to functions that allow you to:

1. Rewrite the entire editor content with new markdown content

IMPORTANT GUIDELINES:
- Be thoughtful about when to modify content
- Always provide clear explanations for your changes
- Use markdown formatting in your content
- Be conversational and explain what you're doing
- Preserve the user's authentic voice and tone
- Only modify content when specifically requested`;

    // Add organization instructions if available
    if (organizationInstructions?.trim()) {
      systemMessage += `

ORGANIZATION INSTRUCTIONS FOR THIS PAGE:
The user has defined specific organization rules for this page. When helping them organize or rewrite content, follow these guidelines:

"${organizationInstructions.trim()}"

Apply these rules when structuring content, making editorial decisions, or organizing information.`;
    }

    systemMessage += `

When the user asks you to modify their content, use the appropriate functions to make the changes.`;

    return systemMessage;
  }

  /**
   * Build enhanced message with context (similar to existing chat panel)
   */
  private buildEnhancedMessage(
    userMessage: string,
    context?: {
      thoughtContext?: string
      selections?: string[]
      relevantDocuments?: Array<{ title: string; content: string }>
      conversationHistory?: any[]
    }
  ): string {
    let enhancedMessage = `USER MESSAGE: ${userMessage}`

    if (context?.thoughtContext) {
      enhancedMessage += `\n\nTHOUGHT CONTEXT (recent editor activity): ${context.thoughtContext}`
    }

    if (context?.selections && context.selections.length > 0) {
      enhancedMessage += `\n\nSELECTED TEXT: ${context.selections.join('\n\n')}`
    }

    if (context?.relevantDocuments && context.relevantDocuments.length > 0) {
      const docContext = context.relevantDocuments
        .map(doc => `${doc.title}: ${doc.content.substring(0, 300)}...`)
        .join('\n\n')
      enhancedMessage += `\n\nRELEVANT DOCUMENTS: ${docContext}`
    }

    return enhancedMessage
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): AgentMessage[] {
    return [...this.conversationHistory]
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = []
    logger.info('Conversation history cleared')
  }
} 