import OpenAI from 'openai'
import logger from '@/lib/logger'

// Lazy-load OpenAI client
let openaiClient: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

async function callResponsesAPI(
  instructions: string,
  input: string,
  model: string
): Promise<string> {
  logger.info('callResponsesAPI – Making API call', { model, inputLength: input.length })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model, input, instructions })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    logger.error('OpenAI Responses API error', { status: response.status, error: errorData })
    throw new Error(`OpenAI Responses API error ${response.status}`)
  }

  const data = await response.json()
  const outputText = data?.output?.[1]?.content?.[0]?.text
  if (!outputText) {
    logger.error('Invalid response from Responses API', { data })
    throw new Error('Empty response from Responses API')
  }
  return outputText as string
}

async function callChatCompletionsAPI(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
  const openai = getOpenAIClient()
  const res = await openai.chat.completions.create({ model, messages })
  if (!res.choices?.[0]) {
    logger.error('Chat completions empty response', { res })
    throw new Error('No response generated')
  }
  return res.choices[0].message?.content || ''
}

export interface LlmRequest {
  model?: string
  prompt?: string
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export async function callLLM({ model = 'chatgpt-4o-latest', prompt, messages }: LlmRequest): Promise<string> {
  if (!prompt && !messages) throw new Error('Prompt or messages is required')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')

  let response: string
  if (model === 'o3' || model === 'o3-mini') {
    // Use Responses API
    let instructions = 'You are a helpful AI assistant.'
    let input = ''
    if (messages) {
      const systemMsg = messages.find(m => m.role === 'system')
      const userMsgs = messages.filter(m => m.role !== 'system')
      if (systemMsg) instructions = systemMsg.content
      input = userMsgs.map(m => `${m.role}: ${m.content}`).join('\n\n')
    } else {
      input = prompt || ''
    }
    response = await callResponsesAPI(instructions, input, model)
  } else {
    const finalMessages = messages || [{ role: 'user', content: prompt! }]
    response = await callChatCompletionsAPI(model, finalMessages)
  }
  logger.info('LLM call successful', { model })
  return response
} 