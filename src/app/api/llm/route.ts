import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';
// import supermemory from 'supermemory'; // SuperMemory - commented out for mem0 migration
// import MemoryClient from 'mem0ai'; // New mem0 client - moved to service
import { memoryService, MemoryDocument } from '@/lib/memory';
import { createClient } from '@/lib/supabase/supabase-server';

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
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
       return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    let enhancedPrompt = prompt;
    let relevantDocuments: MemoryDocument[] = [];

    // Search memory service for relevant context if available
    if (memoryService.isConfigured()) {
      try {
        console.log('Searching memory service for relevant context...');
        
        // Get authenticated user for user-scoped search
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (!authError && user) {
          // Extract the user's actual question/instruction from the prompt
          const userInstruction = prompt.split('Instruction:\n').pop() || prompt;
          
          const searchResults = await memoryService.search(userInstruction, user.id, 5);

          if (searchResults && searchResults.length > 0) {
            console.log(`Found ${searchResults.length} relevant documents from memory service`);
            
            // Use the already-standardized results from memory service
            relevantDocuments = searchResults;

            // Add memory context to the prompt
            const memoryContext = relevantDocuments
              .map((doc, index) => `DOCUMENT ${index + 1} (${doc.title}):\n${doc.content}`)
              .join('\n\n---\n\n');

            enhancedPrompt = `${prompt}\n\nADDITIONAL RELEVANT CONTEXT FROM YOUR KNOWLEDGE BASE:\n${memoryContext}\n\nPlease use this additional context to provide a more comprehensive and accurate answer.`;
          }
        }
      } catch (memError) {
        console.error('Memory service search failed:', memError);
        // Continue without memory context if it fails
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
        pageUuid: doc.metadata?.pageUuid
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