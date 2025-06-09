import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';

// Ensure you have OPENAI_API_KEY set in your environment variables
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

export async function POST(req: Request) {
  console.log('OPENAI key present?', { hasKey: !!process.env.OPENAI_API_KEY, keyStart: process.env.OPENAI_API_KEY?.slice(0,5) });
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Make the call to OpenAI
    // You can customize the model, max_tokens, temperature, etc.
    const resp = await openai.createChatCompletion({
      model: "gpt-4o", // Or your preferred model
      messages: [{ role: "user", content: prompt }],
      // max_tokens: 150,
      // temperature: 0.7,
    });

    if (!resp.ok) {
      console.error('OpenAI request failed', { status: resp.status, statusText: resp.statusText });
      return NextResponse.json({ error: 'Failed to contact OpenAI' }, { status: 502 });
    }

    const completion = await resp.json();

    const responseText = completion.choices?.[0]?.message?.content?.trim();

    if (!responseText) {
      return NextResponse.json({ error: 'Failed to get response from LLM' }, { status: 500 });
    }

    return NextResponse.json({ response: responseText });

  } catch (error) {
    console.error('LLM API Error:', error);
    // Don't expose detailed errors to the client in production
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
} 