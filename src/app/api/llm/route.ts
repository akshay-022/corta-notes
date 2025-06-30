import { callLLM } from '@/lib/llm/callLLM'
import logger from '@/lib/logger'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function PUT(req: Request) {
  try {
    const { model = 'chatgpt-4o-latest', prompt, messages } = await req.json()
    const response = await callLLM({ model, prompt, messages })
    return NextResponse.json({ response })
  } catch (err: any) {
    logger.error('LLM API Error', err)
    return NextResponse.json({ error: err.message || 'Failed to process request' }, { status: 500 })
  }
}