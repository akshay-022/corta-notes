import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

export async function PUT(req: Request) {
  try {
    const { model, prompt, messages } = await req.json();

    if (!prompt && !messages) {
      return NextResponse.json({ error: 'Prompt or messages is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Use messages array if provided, otherwise convert prompt to single message
    const finalMessages = messages || [{ role: "user", content: prompt }];

    const resp = await openai.createChatCompletion({
      model: model || "gpt-4o",
      messages: finalMessages
    });

    const result = await resp.json();
    
    return NextResponse.json({
      response: result.choices?.[0]?.message?.content || 'No response generated'
    });

  } catch (error) {
    console.error('LLM API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}