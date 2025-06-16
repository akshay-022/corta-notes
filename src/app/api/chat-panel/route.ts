import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';
import { getRelevantMemories, formatMemoryContext, type RelevantMemory } from '@/lib/brainstorming';

export const runtime = 'edge';

// Ensure you have OPENAI_API_KEY set in your environment variables
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Initialize memory service
// const superMemoryClient = new supermemory({
//   apiKey: process.env.SUPERMEMORY_API_KEY,
// }); // SuperMemory client - commented out

// // New mem0 client - moved to memory service
// const mem0Client = new MemoryClient({
//   apiKey: process.env.MEM0_API_KEY || ''
// });

export async function POST(req: Request) {
  console.log('OPENAI key present?', { hasKey: !!process.env.OPENAI_API_KEY, keyStart: process.env.OPENAI_API_KEY?.slice(0,5) });
  try {
    const { conversationHistory, currentMessage, thoughtContext, selections } = await req.json();

    if (!currentMessage) {
      return NextResponse.json({ error: 'currentMessage is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    let relevantDocuments: RelevantMemory[] = [];
    let finalMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];

    // Use currentMessage as the user's instruction
    let userInstruction = currentMessage;

    // Search memory for relevant context using new brainstorming function
    if (userInstruction) {
      relevantDocuments = await getRelevantMemories(userInstruction, 5);
    }

    // Build the final messages array
    if (conversationHistory && currentMessage) {
      // New simplified format with separate contexts
      let enhancedCurrentMessage = 'User Instruction (This is literally what you must answer, SUPER IMPORTANT):\n\n' + currentMessage + '\n\n\n\n\n\n\n\n';
      // Add thought context if available (highest priority)
      if (thoughtContext) {
        enhancedCurrentMessage += `\n\n\n\n\n\n\n\n\n\n${thoughtContext}\n\n\n\n\n\n\n\n\n\n\n`;
      }
      // Add user selections if available
      if (selections && selections.length > 0) {
        enhancedCurrentMessage += `\n\nUSER SELECTIONS (This is VERY IMPORTANT. The user's query is probably about this idea/text. Use this as primary context if relevant):\n${JSON.stringify(selections, null, 2)}\n\n`;
      }
      // Add memory context from SuperMemory if available  
      if (relevantDocuments.length > 0) {
        const memoryContext = formatMemoryContext(relevantDocuments);
        enhancedCurrentMessage += `\n\nADDITIONAL KNOWLEDGE BASE CONTEXT:\n${memoryContext}`;
      }
      // Simple system message focused on note coherence
      const systemMsg = `You are a helpful AI assistant helping someone manage their thoughts and notes. The user's notes are often incoherent and bounce between many thoughts - this is normal. Focus on what seems most relevant to their current question. If they have current page content, prioritize that above all else as it represents their active thought process.`;
      finalMessages = [
        { role: "system", content: systemMsg },
        ...conversationHistory,  // Clean conversation history 
        { role: "user", content: enhancedCurrentMessage }  // Current message with all contexts
      ];
    } else {
      // Fallback: just send the current message
      finalMessages = [{ role: "user", content: currentMessage }];
    }

    // Make the call to OpenAI with streaming enabled
    const resp = await openai.createChatCompletion({
      model: "chatgpt-4o-latest",
      messages: finalMessages,
      stream: true,
      // max_tokens: 150,
      // temperature: 0.7,
    });

    // Create a streaming response
    const encoder = new TextEncoder();
    let responseText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = resp.body?.getReader();
          if (!reader) {
            throw new Error('No reader available');
          }

          // Robust SSE parsing: accumulate into a buffer until we see a double new-line (\n\n)
          const textDecoder = new TextDecoder();
          let buffer = '';

          const emitEvent = (rawLine: string) => {
            // Ignore non-data lines and the special [DONE] message
            if (!rawLine.startsWith('data: ') || rawLine === 'data: [DONE]') return;

            try {
              const data = JSON.parse(rawLine.slice(6)); // remove the leading "data: "
              const delta = data.choices?.[0]?.delta?.content;

              if (delta) {
                responseText += delta;
                const tokenData = { type: 'token', content: delta };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(tokenData)}\n\n`));
              }
            } catch (_) {
              // Invalid JSON – should not happen with the buffer strategy, but swallow just in case
            }
          };

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Flush whatever is left in the buffer before closing
              if (buffer.length > 0) {
                // There might be multiple events still queued without trailing delimiter
                buffer += textDecoder.decode();
                const trailingEvents = buffer.split('\n\n');
                trailingEvents.forEach(emitEvent);
              }

              // Send final metadata when stream is complete
              const finalData = {
                type: 'metadata',
                contextUsed: relevantDocuments.length > 0,
                documentsFound: relevantDocuments.length,
                relevantDocuments: relevantDocuments.map(doc => ({
                  title: doc.title,
                  pageUuid: doc.pageUuid,
                })),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
              controller.close();
              break;
            }

            // Append the latest chunk to our buffer, keeping the stream flag so we don't lose partial UTF-8 sequences
            buffer += textDecoder.decode(value, { stream: true });

            // Process any complete SSE events in the buffer
            let boundaryIndex;
            while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, boundaryIndex).trim();
              buffer = buffer.slice(boundaryIndex + 2); // skip past the delimiter

              if (rawEvent) emitEvent(rawEvent);
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          const errorData = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown streaming error'
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'CF-Cache-Status': 'BYPASS', // Tell Cloudflare not to cache
      },
    });
  } catch (error) {
    console.error('LLM API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

// OLD IMPLEMENTATIONS REMOVED FOR BREVITY - See backup files
/*
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

    let enhancedPrompt = prompt;
    let relevantDocuments: any[] = [];

    // Search SuperMemory for relevant context if available
    if (process.env.SUPERMEMORY_API_KEY) {
      try {
        console.log('Searching SuperMemory for relevant context...');
        
        // Extract the user's actual question/instruction from the prompt
        const userInstruction = prompt.split('Instruction:\n').pop() || prompt;
        
        const searchResponse = await superMemoryClient.search.execute({ 
          q: userInstruction,
          limit: 5
        });

        if (searchResponse.results && searchResponse.results.length > 0) {
          console.log(`Found ${searchResponse.results.length} relevant documents from SuperMemory`);
          
          relevantDocuments = searchResponse.results.map((result: any) => ({
            id: result.id || result._id || '',
            title: result.title || result.metadata?.title || 'Untitled Document',
            content: result.content || result.text || '',
            score: result.score || result._score,
            pageUuid: result.metadata?.pageUuid || null,
            metadata: result.metadata || {}
          }));

          // Add SuperMemory context to the prompt
          const memoryContext = relevantDocuments
            .map((doc, index) => `DOCUMENT ${index + 1} (${doc.title}):\n${doc.content}`)
            .join('\n\n---\n\n');

          enhancedPrompt = `${prompt}\n\nADDITIONAL RELEVANT CONTEXT FROM YOUR KNOWLEDGE BASE:\n${memoryContext}\n\nPlease use this additional context to provide a more comprehensive and accurate answer.`;
        }
      } catch (memError) {
        console.error('SuperMemory search failed:', memError);
        // Continue without SuperMemory context if it fails
      }
    }

    // Make the call to OpenAI with enhanced prompt
    const resp = await openai.createChatCompletion({
      model: "gpt-4o", // Or your preferred model
      messages: [{ role: "user", content: enhancedPrompt }],
      // max_tokens: 150,
      // temperature: 0.7,
    });

    const result = await resp.json();
    
    // Return the response with context info
    const response = {
      content: result.choices?.[0]?.message?.content || 'No response generated',
      contextUsed: relevantDocuments.length > 0,
      documentsFound: relevantDocuments.length,
      relevantDocs: relevantDocuments.map(doc => ({
        title: doc.title,
        pageUuid: doc.pageUuid
      }))
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('LLM API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
*/ 