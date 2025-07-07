import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { formatMemoryContext, type RelevantMemory } from '@/lib/brainstorming';
import { EDITOR_FUNCTIONS, executeEditorFunctionServerSide, EditorFunctionCall } from '@/lib/brainstorming/apply-to-editor/editorFunctions';
import logger from '@/lib/logger';
import { createClient } from '@/lib/supabase/supabase-server';
import { BRAINSTORMING_SYSTEM_PROMPT, BRAINSTORMING_FUNCTION_CALLING_RULES, AGGRESSIVE_PAGE_LINKING_PROMPT } from '@/lib/promptTemplates';
import { createSupermemoryClient, isSupermemoryConfigured, injectRelevantMemories, getConversationSummary } from '@/lib/memory/infinite-chat';
import { updateConversationSummary } from '@/lib/memory/chat-summaries/utils';
import { getRelevantDocMemories, getRelevantChatMemories } from '@/lib/brainstorming/memory-context';
import { getConversationMetadata } from '@/lib/memory/infinite-chat/relevant-chat-memories';

export const runtime = 'edge';

// Initialize OpenAI client - use supermemory if configured, otherwise fallback to regular OpenAI
function getOpenAIClient(userId?: string): OpenAI {
  if (isSupermemoryConfigured()) {
    logger.info('Using supermemory infinite chat client');
    return createSupermemoryClient(userId);
  } else {
    logger.info('Using regular OpenAI client (supermemory not configured)');
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
}

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
    const { conversationHistory, currentMessage, thoughtContext, selections, currentPageUuid, conversationId, model } = await req.json();

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
      currentPageUuid,
      conversationId,
      model: model || 'gpt-4o' // Default to gpt-4o if no model specified
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
  currentPageUuid?: string,
  conversationId?: string,
  model?: string
}) {
  const { conversationHistory, currentMessage, thoughtContext, selections, currentPageUuid, conversationId, model } = params;
  
  logger.info('=== UNIFIED STREAMING REQUEST START ===', { 
    currentMessage: currentMessage.substring(0, 100) + '...',
    hasPageUuid: !!currentPageUuid,
    pageUuid: currentPageUuid,
    conversationHistoryLength: conversationHistory?.length || 0,
    conversationHistoryWithSelections: conversationHistory?.filter((msg: any) => 
      msg.content && msg.content.includes('[CONTEXT/SELECTIONS]')).length || 0,
    hasThoughtContext: !!thoughtContext,
    hasSelections: !!selections && selections.length > 0
  });

  try {
    // Create Supabase client once and reuse
    const supabase = await createClient();

    // Get authenticated user for supermemory user ID (do this early)
    let userId: string | undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
      logger.info('Retrieved user ID for supermemory', { userId: !!userId });
    } catch (error) {
      logger.warn('Could not get user ID for supermemory', { error });
    }

    // Get relevant memories - COMMENTED OUT
    // const relevantDocuments = await getRelevantMemories(currentMessage, 5, currentPageUuid);
    // logger.info('Retrieved relevant memories', { 
    //   documentCount: relevantDocuments.length,
    //   pageUuid: currentPageUuid 
    // });
    const relevantDocuments: any[] = []; // Empty array to replace the memory retrieval

    // Get organization instructions and content from current page if available
    let organizationInstructions = '';
    let currentPageContent = '';
    if (currentPageUuid) {
      try {
        const { data: page } = await supabase
          .from('pages')
          .select('metadata, content_text, title')
          .eq('uuid', currentPageUuid)
          .single();
        
        const pageMetadata = page?.metadata as any;
        organizationInstructions = pageMetadata?.organizationRules || '';
        currentPageContent = page?.content_text || '';
        
        if (organizationInstructions) {
          logger.info('Loaded organization instructions for brainstorming', { 
            pageUuid: currentPageUuid, 
            instructionsLength: organizationInstructions.length 
          });
        }
        
        if (currentPageContent) {
          logger.info('Loaded current page content for context', { 
            pageUuid: currentPageUuid, 
            contentLength: currentPageContent.length,
            title: page?.title
          });
        }
      } catch (error) {
        logger.warn('Failed to load current page data', { error, pageUuid: currentPageUuid });
      }
    }




    // Build enhanced current message with all contexts
    // LIVING BREATHING MEMORY RETRIEVAL!!!!!!



      let enhancedCurrentMessage = 'User Instruction (This is literally what you must answer, SUPER IMPORTANT):\n\n' + currentMessage + '\n\n\n\n\n\n\n\n' + `Also
      Also very important : The user is almost always brainstorming. Unless they really want you to rewrite something don't ask to rewrite wording concisely etc. They don't case about the draft. They care about the thinking. So help them brainstorm!!!!
      `;
    
      // Add thought context if available (highest priority)
      if (thoughtContext) {
        enhancedCurrentMessage += `\n\n\n\n\n\n\n\n\n\n${thoughtContext}\n\n\n\n\n\n\n\n\n\n\n`;
      }
    
          // Add user selections if available
    if (selections && selections.length > 0) {
      enhancedCurrentMessage += `\n\nUSER SELECTIONS (This is VERY IMPORTANT. The user's query is probably about this idea/text. Use this as primary context if relevant, THIS TAKES PRECEDENCE OVER EVERYTHING if the user's question is about this). 
      If the user every says what do you think of this, or this etc, this refers to the selections below:\n${JSON.stringify(selections, null, 2)}\n\n`;
    }

    // Inject relevant memories from previous conversations before sending to supermemory
    try {
      const {summary, relevantFolders} = await getConversationMetadata(conversationId);

      // Convert relevantFolders to just paths - clean up slashes and file suffixes
      const relevantPaths = relevantFolders?.map((folder: any) => {
        let path = folder.targetFilePath;
        // Remove leading slash
        // Remove "(file)" suffix
        path = path.replace(/\s*\(file\)$/, '');
        path = path.replace(/\s*\(folder\)$/, '');

        if (path.startsWith('/')) {
          path = path.slice(1);
        }
        // Remove trailing slash
        if (path.endsWith('/')) {
          path = path.slice(0, -1);
        }
        return path;
      }) || [];

      // await both responses
      const [relevantChatMemories, relevantDocMemories] = await Promise.all([
        getRelevantChatMemories(currentMessage, summary, 5),
        getRelevantDocMemories(currentMessage, summary, 5, relevantPaths)
      ]);
      // Format the memories into strings
      const chatMemoriesString = relevantChatMemories.map((memory: any) => `- ${memory.title}: ${memory.content}`).join('\n');
      const docMemoriesString = relevantDocMemories.map((memory: any) => `- ${memory.title} - UUID : ${memory.uuid}: \n${memory.content}`).join('\n');  
       enhancedCurrentMessage = enhancedCurrentMessage + 'CHAT MEMORIES:\n' + chatMemoriesString + 'DOCUMENT MEMORIES:\n' + docMemoriesString;
    } catch (error) {
      logger.error('Failed to inject cross-conversation memories', { error });
      // Continue with original message if memory injection fails
    }

    // Enhanced system message that includes function calling instructions
    let systemMessage = `${BRAINSTORMING_SYSTEM_PROMPT}

You are a helpful AI assistant specialising in brainstorming and structured thinking. Turn scattered sparks into clear, connected insights **without overwhelming the user**.

${AGGRESSIVE_PAGE_LINKING_PROMPT}

${currentPageUuid ? `CURRENT PAGE UUID: ${currentPageUuid}` : 'No page context available'}`;

    // Add organization instructions if available
    if (organizationInstructions.trim()) {
      systemMessage += `

ORGANIZATION INSTRUCTIONS FOR THIS PAGE:
The user has defined specific organization rules for this page. When helping them brainstorm or organize content, keep these instructions in mind:

"${organizationInstructions.trim()}"

Use these guidelines when suggesting content organization, structure, or when using the rewrite_editor function.`;
    }

    systemMessage += BRAINSTORMING_FUNCTION_CALLING_RULES;

    // Build final messages array
    const messages = [
      { role: 'system' as const, content: systemMessage },
      ...(conversationHistory || []),
      { role: 'user' as const, content: enhancedCurrentMessage }
    ];

    // Call OpenAI with streaming and function calling
    const selectedModel = model || 'gpt-4o'; // Default to gpt-4o if no model specified
    
    // Get OpenAI client (with supermemory if configured)
    const openai = getOpenAIClient(userId);
    
    // Only add tools for models that support function calling
    const supportsTools = selectedModel !== 'chatgpt-4o-latest';
    const tools = supportsTools ? EDITOR_FUNCTIONS.map(func => ({
      type: 'function' as const,
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters
      }
    })) : undefined;
    
    logger.info('Calling OpenAI with unified streaming + function calling', { 
      messageCount: messages.length,
      toolCount: tools?.length || 0,
      model: selectedModel,
      supportsTools,
      hasPageUuid: !!currentPageUuid,
      hasUserId: !!userId,
      usingSupermemory: isSupermemoryConfigured()
    });

    // Create the API call with conditional tools
    const stream = supportsTools && tools 
      ? await openai.chat.completions.create({
          model: selectedModel,
          messages,
          tools,
          tool_choice: 'auto', // Let AI decide
          stream: true,
        })
      : await openai.chat.completions.create({
          model: selectedModel,
          messages,
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
          
          // Update conversation summary asynchronously (don't block the response)
          if (conversationId && userId) {
            try {
              const updatedMessages = [
                ...(conversationHistory || []),
                { role: 'user' as const, content: currentMessage },
                { role: 'assistant' as const, content: responseText }
              ];
              
              // Fire and forget - don't await
              updateConversationSummary(conversationId, userId, updatedMessages, currentPageContent)
                .catch(error => logger.error('Failed to update conversation summary', { error }));
              
              logger.info('Started async conversation summary update', { conversationId, userId });
            } catch (error) {
              logger.error('Failed to start conversation summary update', { error });
            }
          }
          
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