import { Editor } from '@tiptap/react'
import logger from '@/lib/logger'
import { executeEditorFunction, EditorFunctionCall, EditorFunctionResult, EDITOR_FUNCTIONS } from './editorFunctions'
import { chatCompletionWithTools, ChatMessage, ToolDefinition } from '@/lib/openaiClient'
import { BRAINSTORMING_SYSTEM_PROMPT, SMART_APPLY_CONTENT_PRESERVATION_RULES } from '@/lib/promptTemplates'

/**
 * Proper function-calling editor agent that uses OpenAI's native function calling
 */
export class StreamingEditorAgent {
  private editor: Editor | null = null
  private pageUuid: string | null = null

  constructor(editor?: Editor | null, pageUuid?: string) {
    this.editor = editor || null
    this.pageUuid = pageUuid || null
    logger.info('StreamingEditorAgent initialized', { hasEditor: !!this.editor, hasPageUuid: !!this.pageUuid })
  }

  setEditor(editor: Editor | null) {
    this.editor = editor
    logger.info('Editor updated in streaming agent', { hasEditor: !!this.editor })
  }

  setPageUuid(pageUuid: string | null) {
    this.pageUuid = pageUuid
    logger.info('Page UUID updated in streaming agent', { hasPageUuid: !!this.pageUuid })
  }

  /**
   * Process a user message with proper function calling
   * This replaces the terrible markdown detection hack
   */
  async processUserMessage(
    userMessage: string,
    context?: {
      thoughtContext?: string
      selections?: string[]
      relevantDocuments?: Array<{ title: string; content: string }>
      conversationHistory?: any[]
      organizationInstructions?: string
    }
  ): Promise<{
    response: string
    functionCalls: EditorFunctionResult[]
    hasExecutedFunctions: boolean
  }> {
    logger.info('Processing user message with function calling', { 
      messageLength: userMessage.length,
      hasContext: !!context,
      hasOrganizationInstructions: !!context?.organizationInstructions
    })

    try {
      // Build messages for OpenAI
      const messages = this.buildMessages(userMessage, context)
      
      // Convert our function definitions to OpenAI format
      const tools: ToolDefinition[] = EDITOR_FUNCTIONS.map(func => ({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters
        }
      }))

      // Call OpenAI with tool calling
      const result = await chatCompletionWithTools(messages, tools)
      
      logger.info('OpenAI response received', { 
        hasMessage: !!result.message,
        hasToolCalls: !!result.tool_calls 
      })

      const functionCalls: EditorFunctionResult[] = []
      
      // If AI decided to call a tool, ask for permission and execute
      if (result.tool_calls && result.tool_calls.length > 0) {
        const toolCall = result.tool_calls[0] // Take the first tool call
        const functionCall: EditorFunctionCall = {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments)
        }
        
        logger.info('AI requested function call', { 
          functionName: functionCall.name,
          arguments: functionCall.arguments 
        })

        // Show confirmation dialog
        const shouldApply = await this.showConfirmationDialog(functionCall, result.message)
        
        if (shouldApply) {
          const executeResult = await executeEditorFunction(functionCall, this.editor, this.pageUuid || undefined)
          functionCalls.push(executeResult)
          
          logger.info('Function executed after user approval', { 
            functionName: functionCall.name, 
            success: executeResult.success 
          })
        } else {
          logger.info('User declined function call', { functionName: functionCall.name })
          functionCalls.push({
            success: false,
            message: `User declined to apply changes`
          })
        }
      }

      return {
        response: result.message,
        functionCalls,
        hasExecutedFunctions: functionCalls.some(call => call.success)
      }
    } catch (error) {
      logger.error('Error in processUserMessage', { error })
      return {
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        functionCalls: [],
        hasExecutedFunctions: false
      }
    }
  }

  /**
   * Build messages array for OpenAI
   */
  private buildMessages(
    userMessage: string,
    context?: {
      thoughtContext?: string
      selections?: string[]
      relevantDocuments?: Array<{ title: string; content: string }>
      conversationHistory?: any[]
      organizationInstructions?: string
    }
  ): ChatMessage[] {
    const messages: ChatMessage[] = []

    // System message with function calling instructions
    const currentContent = this.editor?.getText() || ''
    let systemMessage = `${BRAINSTORMING_SYSTEM_PROMPT}

You are an AI assistant that helps users with their notes and documents.

You have access to a rewrite_editor function that can replace the user's editor content with new markdown content.

${SMART_APPLY_CONTENT_PRESERVATION_RULES}

CRITICAL RULES:
- ONLY call rewrite_editor if the user explicitly asks you to modify/rewrite/organize their editor content
- DO NOT call functions for casual conversation or questions
- Use clean markdown formatting in the content parameter

CURRENT EDITOR CONTENT:
${currentContent}`;

    // Add organization instructions if available
    if (context?.organizationInstructions?.trim()) {
      systemMessage += `

ORGANIZATION INSTRUCTIONS FOR THIS PAGE:
The user has defined specific organization rules for this page. When rewriting or organizing content, follow these guidelines:

"${context.organizationInstructions.trim()}"

Apply these rules when structuring content, deciding on organization, or making editorial decisions.`;
    }

    systemMessage += `

If the user asks about their content or wants to discuss it, just respond normally without calling functions.
Only call rewrite_editor when they specifically want you to modify the editor content.`;

    messages.push({
      role: 'system',
      content: systemMessage
    })

    // Add conversation history if provided
    if (context?.conversationHistory) {
      const recentHistory = context.conversationHistory.slice(-5) // Last 5 messages
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          })
        }
      }
    }

    // Build enhanced user message with context
    let enhancedMessage = userMessage

    if (context?.thoughtContext) {
      enhancedMessage += `\n\nRecent editor activity: ${context.thoughtContext}`
    }

    if (context?.selections && context.selections.length > 0) {
      enhancedMessage += `\n\nSelected text: ${context.selections.join('\n\n')}`
    }

    if (context?.relevantDocuments && context.relevantDocuments.length > 0) {
      const docContext = context.relevantDocuments
        .map(doc => `${doc.title}: ${doc.content.substring(0, 300)}...`)
        .join('\n\n')
      enhancedMessage += `\n\nRelevant documents: ${docContext}`
    }

    messages.push({
      role: 'user',
      content: enhancedMessage
    })

    return messages
  }

  /**
   * Show confirmation dialog before applying editor changes
   */
  private async showConfirmationDialog(functionCall: EditorFunctionCall, aiResponse: string): Promise<boolean> {
    return new Promise((resolve) => {
      const currentContent = this.editor?.getText() || ''
      const newContent = functionCall.arguments.content || ''
      
      const dialogContent = `The AI wants to rewrite your editor content.

CURRENT CONTENT (${currentContent.length} chars):
${currentContent.substring(0, 200)}${currentContent.length > 200 ? '...' : ''}

NEW CONTENT (${newContent.length} chars):
${newContent.substring(0, 200)}${newContent.length > 200 ? '...' : ''}

AI's explanation: "${aiResponse.substring(0, 150)}${aiResponse.length > 150 ? '...' : ''}"

Do you want to apply these changes?`

      const userChoice = window.confirm(dialogContent)
      resolve(userChoice)
    })
  }

  /**
   * Legacy method - kept for backward compatibility but now just calls processUserMessage
   * @deprecated Use processUserMessage instead
   */
  async processAIResponse(aiResponse: string): Promise<{
    functionCalls: EditorFunctionResult[]
    hasExecutedFunctions: boolean
  }> {
    logger.warn('processAIResponse is deprecated - this was the old markdown detection hack')
    return {
      functionCalls: [],
      hasExecutedFunctions: false
    }
  }

  /**
   * Add editor context to system message (legacy method)
   * @deprecated Function calling now handles this automatically
   */
  async enhanceSystemMessage(baseSystemMessage: string): Promise<string> {
    logger.warn('enhanceSystemMessage is deprecated - function calling handles this automatically')
    return baseSystemMessage
  }
} 