import { Configuration, OpenAIApi } from 'openai-edge';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

interface SummaryRequest {
  type: 'brain_state_summary' | 'context_summary';
  context: any;
  previousSummary?: string;
  maxLength?: number;
}

export async function POST(req: Request) {
  try {
    const { type, context, previousSummary, maxLength }: SummaryRequest = await req.json();

    if (!context) {
      return NextResponse.json({ error: 'Context is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    let prompt: string;
    let maxTokens: number;

    if (type === 'brain_state_summary') {
      prompt = createBrainStateSummaryPrompt(context, previousSummary, maxLength);
      maxTokens = Math.min(Math.floor((maxLength || 500) / 2), 300);
    } else if (type === 'context_summary') {
      prompt = createContextSummaryPrompt(context);
      maxTokens = 150;
    } else {
      return NextResponse.json({ error: 'Invalid summary type' }, { status: 400 });
    }

    const resp = await openai.createChatCompletion({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing writing patterns and thought processes. Generate concise, insightful summaries that capture the essence of what someone is thinking based on their editing behavior."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature: 0.3
    });

    const result = await resp.json();
    const summary = result.choices?.[0]?.message?.content || '';

    if (!summary) {
      throw new Error('No summary generated');
    }

    return NextResponse.json({ summary });

  } catch (error) {
    console.error('Brain State Summary API Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

function createBrainStateSummaryPrompt(context: any, previousSummary?: string, maxLength?: number): string {
  const {
    editCount,
    timeSpan,
    editGroups,
    recentEdits,
    keywords,
  } = context;

  let prompt = `Analyze this user's thought process and writing behavior to create an insightful summary of what they're thinking about and working on.

## Edit Activity Analysis
- Total edits: ${editCount}
- Time period: ${timeSpan?.start ? new Date(timeSpan.start).toLocaleString() : 'Unknown'} to ${timeSpan?.end ? new Date(timeSpan.end).toLocaleString() : 'Unknown'}
- Key topics: ${keywords?.slice(0, 5).join(', ') || 'None identified'}

## Recent Activity
${recentEdits?.map((edit: any, index: number) => 
  `${index + 1}. ${edit.type} - "${edit.content.substring(0, 100)}${edit.content.length > 100 ? '...' : ''}" (${new Date(edit.timestamp).toLocaleString()})`
).join('\n') || 'No recent edits'}

## Edit Pattern Groups
${editGroups?.map((group: any, index: number) => 
  `Group ${index + 1}: ${group.count} edits from ${new Date(group.timeWindow.start).toLocaleString()} to ${new Date(group.timeWindow.end).toLocaleString()}
  - Main topics: ${group.mainTopics?.join(', ') || 'None'}
  - Edit types: ${Object.entries(group.editTypes || {}).map(([type, count]) => `${count} ${type}`).join(', ')}`
).join('\n\n') || 'No pattern groups identified'}`;

  if (previousSummary) {
    prompt += `\n\n## Previous Context
${previousSummary}`;
  }

  prompt += `\n\nGenerate a thoughtful summary (max ${maxLength || 500} characters) that captures:
1. What the user is primarily thinking about or working on
2. Their current mental state or focus areas
3. How their thinking has evolved (if previous context exists)
4. Key insights about their thought patterns

Focus on understanding their cognitive state and work patterns rather than just listing facts.`;

  return prompt;
}

function createContextSummaryPrompt(context: any): string {
  const {
    editCount,
    timeSpan,
    mainTopics,
    editTypes,
    affectedPages,
    keywords
  } = context;

  return `Create a concise context summary for this editing session:

## Session Overview
- ${editCount} edits across ${affectedPages?.length || 0} pages
- Time: ${timeSpan?.start ? new Date(timeSpan.start).toLocaleString() : 'Unknown'} to ${timeSpan?.end ? new Date(timeSpan.end).toLocaleString() : 'Unknown'}
- Topics: ${keywords?.slice(0, 3).join(', ') || 'Various'}
- Edit types: ${Object.entries(editTypes || {}).map(([type, count]) => `${count} ${type}`).join(', ')}

Generate a 2-3 sentence summary (max 300 characters) that captures the essence of this editing session and what the user was focused on.`;
} 