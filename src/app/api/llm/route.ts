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
    const { prompt, systemMessage, conversationHistory, currentMessage, thoughtContext, selections } = await req.json();

    // Support both old prompt format and new optimized format
    if (!prompt && !currentMessage) {
      return NextResponse.json({ error: 'Prompt or currentMessage is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    let relevantDocuments: RelevantMemory[] = [];
    let finalMessages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];

    // Extract the user's actual question from either format  
    let userInstruction = '';
    if (currentMessage) {
      userInstruction = currentMessage;
    } else if (prompt) {
      userInstruction = prompt.split('Instruction:\n').pop() || prompt;
    }

    // Search memory for relevant context using new brainstorming function
    if (userInstruction) {
      relevantDocuments = await getRelevantMemories(userInstruction, 5);
    }

    // Build the final messages array
    if (conversationHistory && currentMessage) {
      // New simplified format with separate contexts
      let enhancedCurrentMessage = currentMessage;
      
      // Add thought context if available (highest priority)
      if (thoughtContext) {
        enhancedCurrentMessage += `\n\nCURRENT THOUGHT CONTEXT:\n${thoughtContext}`;
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
      // Old prompt format (fallback)
      let enhancedPrompt = prompt || currentMessage || '';
      
      if (thoughtContext) {
        enhancedPrompt += `\n\nCURRENT THOUGHT CONTEXT:\n${thoughtContext}`;
      }
      
      if (relevantDocuments.length > 0) {
        const memoryContext = formatMemoryContext(relevantDocuments);
        enhancedPrompt += `\n\nADDITIONAL KNOWLEDGE BASE CONTEXT:\n${memoryContext}`;
      }

      finalMessages = [{ role: "user", content: enhancedPrompt }];
    }

    // Make the call to OpenAI with final messages
    const resp = await openai.createChatCompletion({
      model: "gpt-4o",
      messages: finalMessages,
      // max_tokens: 150,
      // temperature: 0.7,
    });

    const result = await resp.json();
    
    // Return the response with context info
    const response = {
      response: result.choices?.[0]?.message?.content || 'No response generated', 
      contextUsed: relevantDocuments.length > 0,
      documentsFound: relevantDocuments.length,
      relevantDocuments: relevantDocuments.map(doc => ({ 
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