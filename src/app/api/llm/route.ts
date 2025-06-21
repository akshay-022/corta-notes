import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

export const runtime = 'edge';

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

/**
 * Use OpenAI Responses API for o3 models (optimized for o3)
 */
async function callResponsesAPI(
  instructions: string,
  input: string,
  model: string
): Promise<string> {
  logger.info('callResponsesAPI → Making API call', {
    model,
    inputLength: input.length,
  });

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
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('OpenAI Responses API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`OpenAI Responses API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Log the output structure for debugging
    logger.info('Response output structure:', {
      outputArray: data?.output
    });

    // Get the message content from the output array - it's in the second output item (index 1)
    const outputText = data?.output?.[1]?.content?.[0]?.text;

    if (!outputText) {
      logger.error('Empty or invalid response from OpenAI Responses API', { 
        responseData: JSON.stringify(data, null, 2),
        outputStructure: {
          outputLength: data?.output?.length,
          firstOutput: data?.output?.[0]?.type,
          secondOutput: data?.output?.[1]?.type,
          contentType: data?.output?.[1]?.content?.[0]?.type
        }
      });
      throw new Error('Empty or invalid response from OpenAI Responses API');
    }

    logger.info('callResponsesAPI → Successfully received response', {
      contentLength: outputText.length
    });

    return outputText;
  } catch (error) {
    logger.error('Error calling OpenAI Responses API:', error);
    throw error;
  }
}

/**
 * Use OpenAI Chat Completions API for non-o3 models
 */
async function callChatCompletionsAPI(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
): Promise<string> {
  logger.info('callChatCompletionsAPI → Making API call', { model });

  const resp = await openai.createChatCompletion({
    model,
    messages
  });

  const result = await resp.json();
  
  if (!result.choices || !result.choices[0]) {
    logger.error('Chat Completions API response:', { status: resp.status, result });
    throw new Error('No response generated from Chat Completions API');
  }
  
  return result.choices[0].message?.content || 'No response generated';
}

export async function PUT(req: Request) {
  try {
    const { model = 'chatgpt-4o-latest', prompt, messages } = await req.json();

    if (!prompt && !messages) {
      return NextResponse.json({ error: 'Prompt or messages is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    let response: string;

    // Check if we're using o3 models - use Responses API
    if (model === 'o3' || model === 'o3-mini') {
      logger.info(`Using Responses API for model: ${model}`);
      
      // For Responses API, we need instructions and input
      let instructions = 'You are a helpful AI assistant.';
      let input = '';

      if (messages) {
        // Extract system message as instructions, combine user messages as input
        const systemMessage = messages.find((m: any) => m.role === 'system');
        const userMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');
        
        if (systemMessage) {
          instructions = systemMessage.content;
        }
        
        input = userMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n');
      } else {
        input = prompt;
      }

      response = await callResponsesAPI(instructions, input, model);
      
    } else {
      // Use Chat Completions API for other models
      logger.info(`Using Chat Completions API for model: ${model}`);
      
      const finalMessages = messages || [{ role: "user", content: prompt }];
      response = await callChatCompletionsAPI(model, finalMessages);
    }
    
    logger.info(`LLM API call successful with model: ${model}`);
    console.log(`🤖 LLM API: Successfully used ${model} model`);
    
    return NextResponse.json({ response });

  } catch (error) {
    logger.error('LLM API Error:', error);
    console.error('LLM API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}