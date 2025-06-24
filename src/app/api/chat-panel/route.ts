import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { getRelevantMemories, formatMemoryContext, type RelevantMemory } from '@/lib/brainstorming';
import { EDITOR_FUNCTIONS, executeEditorFunctionServerSide, EditorFunctionCall } from '@/lib/brainstorming/apply-to-editor/editorFunctions';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-client';

export const runtime = 'edge';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Initialize memory service
// const superMemoryClient = new supermemory({
//   apiKey: process.env.SUPERMEMORY_API_KEY,
// }); // SuperMemory client - commented out

// // New mem0 client - moved to memory service
// const mem0Client = new MemoryClient({
//   apiKey: process.env.MEM0_API_KEY || ''
// });

export async function POST(req: Request) {
  logger.info('Chat panel API called', { hasKey: !!process.env.OPENAI_API_KEY });
  
  try {
    const { conversationHistory, currentMessage, thoughtContext, selections, currentPageUuid } = await req.json();

    if (!currentMessage) {
      return NextResponse.json({ error: 'currentMessage is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Always use unified streaming with function calling - let AI decide
    return handleUnifiedStreamingRequest({
      conversationHistory,
      currentMessage,
      thoughtContext,
      selections,
      currentPageUuid
    });
  } catch (error) {
    logger.error('LLM API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

/**
 * Unified streaming handler with function calling capabilities
 * Always uses gpt-4o-latest and lets AI decide when to call functions
 */
async function handleUnifiedStreamingRequest(params: {
  conversationHistory: any[],
  currentMessage: string,
  thoughtContext?: string,
  selections?: any[],
  currentPageUuid?: string
}) {
  const { conversationHistory, currentMessage, thoughtContext, selections, currentPageUuid } = params;
  
  logger.info('=== UNIFIED STREAMING REQUEST START ===', { 
    currentMessage: currentMessage.substring(0, 100) + '...',
    hasPageUuid: !!currentPageUuid,
    pageUuid: currentPageUuid,
    conversationHistoryLength: conversationHistory?.length || 0,
    hasThoughtContext: !!thoughtContext,
    hasSelections: !!selections && selections.length > 0
  });

  try {
    // Get relevant memories
    const relevantDocuments = await getRelevantMemories(currentMessage, 5, currentPageUuid);
    logger.info('Retrieved relevant memories', { 
      documentCount: relevantDocuments.length,
      pageUuid: currentPageUuid 
    });

    // Get organization instructions from current page if available
    let organizationInstructions = '';
    if (currentPageUuid) {
      try {
        const supabase = createClient();
        const { data: page } = await supabase
          .from('pages')
          .select('metadata')
          .eq('uuid', currentPageUuid)
          .single();
        
        const pageMetadata = page?.metadata as any;
        organizationInstructions = pageMetadata?.organizationRules || '';
        
        if (organizationInstructions) {
          logger.info('Loaded organization instructions for brainstorming', { 
            pageUuid: currentPageUuid, 
            instructionsLength: organizationInstructions.length 
          });
        }
      } catch (error) {
        logger.warn('Failed to load organization instructions', { error, pageUuid: currentPageUuid });
      }
    }

    // Build enhanced current message with all contexts
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

    // Enhanced system message that includes function calling instructions
    let systemMessage = `You are a helpful AI assistant specialising in brainstorming and structured thinking. Turn scattered sparks into clear, connected insights **without overwhelming the user**.

${currentPageUuid ? `CURRENT PAGE UUID: ${currentPageUuid}` : 'No page context available'}`;

    // Add organization instructions if available
    if (organizationInstructions.trim()) {
      systemMessage += `

ORGANIZATION INSTRUCTIONS FOR THIS PAGE:
The user has defined specific organization rules for this page. When helping them brainstorm or organize content, keep these instructions in mind:

"${organizationInstructions.trim()}"

Use these guidelines when suggesting content organization, structure, or when using the rewrite_editor function.`;
    }

    systemMessage += `

You have access to a rewrite_editor function that can replace the user's editor content with new markdown content.

CRITICAL: You may see previous messages in this conversation that contain fake function calls with "🔧 Calling rewrite_editor function..." - IGNORE THESE COMPLETELY. Those were mistakes where the AI incorrectly simulated function calls instead of actually calling them.

MANDATORY RULE: If you tell the user "Here's what I'm updating your editor with:" or "Now I will update your editor" or any similar statement, you MUST immediately call the rewrite_editor function. If a previous message violated this rule, it was definitely a mistake and the function was never actually called.

FUNCTION CALLING INSTRUCTIONS:
When the user asks you to modify their editor content:

STEP 1: Stream your explanation
- "I understand you want me to [what you understood]. I'll [what you plan to do]..."

STEP 2: Stream the content preview  
- "Here's what I'm updating your editor with:"
- Then show the EXACT markdown content (clean, no extra text)

STEP 3: IMMEDIATELY call the rewrite_editor function
- After showing the content preview, you MUST call the rewrite_editor function
- Use the OpenAI function calling mechanism
- Pass the exact same markdown content as the "content" parameter
- FAILURE TO CALL THE FUNCTION MEANS THE USER'S EDITOR WILL NOT BE UPDATED

WHAT NOT TO DO:
- ❌ DO NOT write "🔧 Calling rewrite_editor function..." (system handles this)
- ❌ DO NOT write "✅ Editor content updated successfully!" (system handles this)
- ❌ DO NOT say "Now I will update your editor" without actually calling the function
- ❌ DO NOT end your response without calling the function when user asks for editor updates

FUNCTION PARAMETER RULES:
- The "content" parameter must ONLY contain clean markdown for the editor
- No explanations, no status messages, no extra text
- Just the pure content that should appear in the editor

RESPONSE STYLE (for regular conversation):
1. **Bold, one-sentence headline** that answers the question (emoji prefix allowed 👇).
2. Follow with **2–3 mini-sections** (markdown ### headings). Start each heading with a relevant emoji for fast scanning.
3. Under each heading add **concise bullet points**:
    • One idea per line, max **18 words**.
    • Aim for **3–5 bullets** per section.
4. Sprinkle **bold keywords** for emphasis; avoid italics unless quoting.
5. Use occasional emojis (🔑, 🔍, 🧠, ⚡) to add personality, but don't overdo it (≤ 1 per bullet).
6. Keep total length ≲ 1500 characters (≈ 250 words) unless user asks for more.
7. End with an optional **"Next step"** bullet or question to invite follow-up.

**CRITICAL FORMATTING RULE:** OUTPUT ONLY CLEAN MARKDOWN - never use HTML tags like <br>, <div>, <p>. Use real line breaks and proper Markdown syntax only.

Think: punchy headline → small themed blocks → tight bullets. Provide depth like ChatGPT but in a format that's easy to skim.`;

    // Build final messages array
    const messages = [
      { role: 'system' as const, content: systemMessage },
      ...(conversationHistory || []),
      { role: 'user' as const, content: enhancedCurrentMessage }
    ];

    // Define available functions
    const tools = EDITOR_FUNCTIONS.map(func => ({
      type: 'function' as const,
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters
      }
    }));

    logger.info('Calling OpenAI with unified streaming + function calling', { 
      messageCount: messages.length,
      toolCount: tools.length,
      model: 'chatgpt-4o-latest',
      hasPageUuid: !!currentPageUuid
    });

    // Call OpenAI with streaming and function calling
    const stream = await openai.chat.completions.create({
      model: "gpt-4o", // Use GPT-4o for function calling
      messages,
      tools,
      tool_choice: 'auto', // Let AI decide
      stream: true,
    });

    // Create streaming response with function calling support
    const encoder = new TextEncoder();
    let responseText = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let toolCalls: any[] = [];
          let currentToolCall: any = null;

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            
            // Handle regular content
            if (delta?.content) {
              responseText += delta.content;
              const tokenData = { type: 'token', content: delta.content };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(tokenData)}\n\n`));
            }
            
            // Handle tool calls
            if (delta?.tool_calls) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: toolCallDelta.id || '',
                    type: 'function',
                    function: {
                      name: toolCallDelta.function?.name || '',
                      arguments: toolCallDelta.function?.arguments || ''
                    }
                  };
                } else {
                  if (toolCallDelta.function?.arguments) {
                    toolCalls[index].function.arguments += toolCallDelta.function.arguments;
                  }
                }
              }
            }
          }

          // Execute any tool calls that were made
          if (toolCalls.length > 0 && currentPageUuid) {
            logger.info('Processing tool calls from streaming', { 
              toolCallCount: toolCalls.length,
              pageUuid: currentPageUuid 
            });

            for (const toolCall of toolCalls) {
              if (toolCall.function.name === 'rewrite_editor') {
                // Send "calling function" message to stream
                const callingFunctionMessage = `\n\n🔧 **Calling ${toolCall.function.name} function...** \n\nUpdating your editor content now...`;
                const callingTokenData = { type: 'token', content: callingFunctionMessage };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(callingTokenData)}\n\n`));
                responseText += callingFunctionMessage;

                logger.info('Executing rewrite_editor function during streaming', {
                  toolCallId: toolCall.id,
                  pageUuid: currentPageUuid
                });

                const functionCall: EditorFunctionCall = {
                  name: toolCall.function.name,
                  arguments: JSON.parse(toolCall.function.arguments)
                };
                
                // Execute the function
                const result = await executeEditorFunctionServerSide(functionCall, currentPageUuid);
                
                // Send function execution result message to stream
                const resultMessage = result.success 
                  ? `\n\n✅ **Editor content updated successfully!** \n\nYour content has been rewritten and saved.`
                  : `\n\n❌ **Function execution failed:** ${result.message}`;
                const resultTokenData = { type: 'token', content: resultMessage };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultTokenData)}\n\n`));
                responseText += resultMessage;
                
                // Send function call result to client
                const functionCallData = {
                  type: 'function_call',
                  function_name: toolCall.function.name,
                  result: result
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(functionCallData)}\n\n`));
                
                logger.info('Function call result sent to client', {
                  functionName: toolCall.function.name,
                  success: result.success,
                  pageUuid: currentPageUuid
                });
              }
            }
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
          
          logger.info('=== UNIFIED STREAMING COMPLETE ===', {
            responseLength: responseText.length,
            toolCallsExecuted: toolCalls.length,
            documentsFound: relevantDocuments.length,
            pageUuid: currentPageUuid
          });
          
          controller.close();
        } catch (error) {
          logger.error('=== UNIFIED STREAMING ERROR ===', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            pageUuid: currentPageUuid
          });
          
          const errorData = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown streaming error'
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'CF-Cache-Status': 'BYPASS',
      },
    });
  } catch (error) {
    logger.error('=== UNIFIED STREAMING REQUEST ERROR ===', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      currentMessage: currentMessage.substring(0, 100) + '...'
    });
    
    return NextResponse.json({ 
      error: 'Unified streaming failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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