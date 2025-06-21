import { OrganizationInput, LLMOrganizationResponse } from './types';
import { InputProcessor } from './inputProcessor';

export class LLMInterface {
  private inputProcessor: InputProcessor;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.inputProcessor = new InputProcessor();
  }

  /**
   * Get organization recommendations from LLM
   */
  async getOrganizationRecommendations(input: OrganizationInput): Promise<LLMOrganizationResponse> {
    const context = this.inputProcessor.prepareLLMContext(input);
    
    const prompt = this.buildPrompt(context);
    
    try {
      const response = await this.callOpenAI(prompt);
      return this.parseResponse(response);
    } catch (error) {
      console.error('LLM API error:', error);
      throw new Error(`Failed to get LLM recommendations: ${error}`);
    }
  }
  private buildPrompt(context: {
    editsContext: string;
    fileTreeContext: string;
    pageContext: string;
  }): string {
    return `You are organizing personal notes and thoughts into a coherent file structure.

CONTEXT:
${`\`\`\`\n${context.pageContext}\n\`\`\``}

EXISTING FILE TREE:
${`\`\`\`\n${context.fileTreeContext}\n\`\`\``}

PARAGRAPH EDITS TO ORGANIZE:
${`\`\`\`\n${context.editsContext}\n\`\`\``}

INSTRUCTIONS:
1. Analyze each paragraph edit and determine the best file location
2. Group related edits into the same file when logical
3. Refine content while preserving the user's authentic voice and meaning
4. Ensure file paths follow the existing structure

CONTENT REFINEMENT RULES:
• Write like PERSONAL NOTES - keep it conversational and authentic
• Preserve the user's original voice, tone, and urgency - don't sanitize
• NO corporate speak, NO "Overview/Summary" sections, NO repetitive content
• BE CONCISE - eliminate fluff and redundancy
• Focus on actionable insights, not descriptions  
• Keep strong emotions, caps, urgency from original text
• Use simple formatting - basic bullets or lists, not complex structures
• Combine similar ideas into single, clear statements

FILE ORGANIZATION RULES:
- Use existing files when content is related
- Create new files only for distinct topics that don't fit elsewhere
- File paths must start with "/" and follow existing structure
- For new files: ensure parent folder exists in file tree
- Use descriptive, kebab-case file names
- Only create folders when absolutely necessary

BAD REFINEMENT: "Overview: This section provides a comprehensive analysis of the user's annotation requirements..."
GOOD REFINEMENT: "Need annotation feature - users want control over where content goes. Critical for user lock-in."

RESPONSE FORMAT:
Respond with ONLY a valid JSON object:
{
  "targetFilePath": "/path/to/target/file",
  "shouldCreateNewFile": false,
  "shouldCreateNewFolder": false,
  "parentFolderPath": "/path/to/parent/folder",
  "refinements": [
    {
      "paragraphId": "paragraph-id",
      "originalContent": "original text",
      "refinedContent": "improved text preserving authentic voice"
    }
  ],
  "reasoning": "brief explanation of organization decision"
}

Remember: These are PERSONAL NOTES. Keep them authentic, direct, and useful.`;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'o3',
        messages: [
          {
            role: 'system',
            content: 'You are a professional content organizer and editor. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    console.log(`🤖 Thought-tracking LLM: Successfully used o3 model`);
    return content;
  }

  private parseResponse(response: string): LLMOrganizationResponse {
    try {
      // Clean the response to extract JSON
      const cleanedResponse = this.cleanJsonResponse(response);
      const parsed = JSON.parse(cleanedResponse);

      // Validate the response structure
      this.validateLLMResponse(parsed);

      return parsed as LLMOrganizationResponse;
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      console.error('Raw response:', response);
      throw new Error(`Invalid LLM response format: ${error}`);
    }
  }

  private cleanJsonResponse(response: string): string {
    // Remove markdown code blocks
    let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Find the start and end of JSON
    const jsonStart = Math.min(
      cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity,
      cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity
    );
    
    if (jsonStart !== Infinity) {
      cleaned = cleaned.substring(jsonStart);
    }
    
    const jsonEnd = Math.max(
      cleaned.lastIndexOf('}'),
      cleaned.lastIndexOf(']')
    );
    
    if (jsonEnd !== -1) {
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }
    
    return cleaned.trim();
  }

  private validateLLMResponse(response: any): void {
    const required = ['targetFilePath', 'shouldCreateNewFile', 'refinements'];
    
    for (const field of required) {
      if (!(field in response)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(response.refinements)) {
      throw new Error('refinements must be an array');
    }

    for (const refinement of response.refinements) {
      if (!refinement.paragraphId || 
          refinement.originalContent === undefined || 
          refinement.refinedContent === undefined) {
        throw new Error('Invalid refinement object structure');
      }
    }
  }
} 