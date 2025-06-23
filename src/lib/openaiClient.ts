import OpenAI from 'openai'
import logger from '@/lib/logger'

// Lazy OpenAI client that only instantiates on server-side
let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (typeof window !== 'undefined') {
      throw new Error('OpenAI client should only be used on server-side')
    }
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string // for tool role messages
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required: string[]
    }
  }
}

export interface ToolCallResult {
  message: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

/**
 * Send a chat completion request with automatic model fallback.
 * This mirrors the logic currently used in the route but is extracted so all agents can share.
 *
 * 1. Tries the cheap/fast model first (`primaryModel`).
 * 2. If the request fails with 4xx or 429, retries with the `fallbackModel`.
 *
 * Returns the assistant message content as a string.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  primaryModel: string = 'o3-mini',
  fallbackModel: string = 'gpt-4o'
): Promise<string> {
  const openai = getOpenAIClient()
  
  const run = async (model: string) => {
    logger.info(`openai.chatCompletion → Using model: ${model}`)
    const completion = await openai.chat.completions.create({
      model,
      messages: messages.map(msg => ({
        role: msg.role as any,
        content: msg.content
      }))
    })
    
    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('openai_empty_response')
    }
    return content
  }

  try {
    return await run(primaryModel)
  } catch (err: any) {
    if (/(404|400|429)/.test(err.message)) {
      logger.warn(`Primary model ${primaryModel} failed, falling back to ${fallbackModel}`)
      return await run(fallbackModel)
    }
    throw err
  }
}

/**
 * Send a chat completion request with tool calling support using the official OpenAI library
 */
export async function chatCompletionWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  primaryModel: string = 'gpt-4-turbo-preview',
  fallbackModel: string = 'gpt-4o'
): Promise<ToolCallResult> {
  const openai = getOpenAIClient()
  
  const run = async (model: string) => {
    logger.info(`openai.chatCompletionWithTools → Using model: ${model}`)
    
    const completion = await openai.chat.completions.create({
      model,
      messages: messages.map(msg => ({
        role: msg.role as any,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id })
      })),
      tools,
      tool_choice: 'auto'
    })
    
    const choice = completion.choices[0]
    if (!choice) {
      throw new Error('openai_empty_response')
    }
    
    const message = choice.message
    return {
      message: message.content || '',
      tool_calls: message.tool_calls || undefined
    }
  }

  try {
    return await run(primaryModel)
  } catch (err: any) {
    if (/(404|400|429)/.test(err.message)) {
      logger.warn(`Primary model ${primaryModel} failed, falling back to ${fallbackModel}`)
      return await run(fallbackModel)
    }
    throw err
  }
}

export async function responsesAPI(
  instructions: string,
  input: string,
  model: string = 'o3-mini'
): Promise<string> {
  logger.info('responsesAPI → Making API call', {
    model,
    inputLength: input.length,
  })

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        input,
        instructions,
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('OpenAI API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    // Log the output structure for debugging
    logger.info('Response output structure:', {
      outputArray: data?.output
    })

    // Get the message content from the output array - it's in the second output item (index 1)
    const outputText = data?.output?.[1]?.content?.[0]?.text

    if (!outputText) {
      logger.error('Empty or invalid response from OpenAI API', { 
        responseData: JSON.stringify(data, null, 2),
        outputStructure: {
          outputLength: data?.output?.length,
          firstOutput: data?.output?.[0]?.type,
          secondOutput: data?.output?.[1]?.type,
          contentType: data?.output?.[1]?.content?.[0]?.type
        }
      })
      throw new Error('Empty or invalid response from OpenAI API')
    }

    logger.info('responsesAPI → Successfully received response', {
      contentLength: outputText.length
    })

    return outputText
  } catch (error) {
    logger.error('Error calling OpenAI API:', error)
    throw error
  }
} 