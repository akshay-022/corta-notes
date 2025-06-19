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
    return `You are an intelligent content organizer. Your task is to organize paragraph edits into a coherent file structure.

CONTEXT:
${`\`\`\`\n${context.pageContext}\n\`\`\``}

EXISTING FILE TREE:
${`\`\`\`\n${context.fileTreeContext}\n\`\`\``}

PARAGRAPH EDITS TO ORGANIZE:
${`\`\`\`\n${context.editsContext}\n\`\`\``}

INSTRUCTIONS:
1. Analyze the content of each paragraph edit
2. Determine the best file location for each edit (existing file or new file/folder)
3. Provide refined versions of the content (improve clarity, fix grammar, but preserve meaning)
4. Ensure file paths are logical and follow the existing structure
5. Group related edits into the same file when it makes sense

RULES:
- Use existing files when content is related
- Create new files only when content represents a distinct topic
- Create folders only when organizing multiple related files
- File paths must be logical and follow the existing structure
- Preserve all original information while improving clarity
- Group similar edits together to avoid file fragmentation

FILE PATH REQUIREMENTS:
- All paths must start with "/" (root)
- For existing files: Use the exact path shown in the file tree (e.g., "/Documents/Notes/meeting-notes.md")
- For new files: Ensure the parent folder exists in the file tree or is "/" (root)
- Parent folders must be marked as [DIR] in the file tree or be "/" for root level
- File names should be descriptive and use kebab-case (e.g., "project-notes.md", "meeting-summary.md")
- Only create new folders when absolutely necessary for organization

VALIDATION CHECKLIST:
- Does the targetFilePath exist in the file tree? If not, does its parent folder exist?
- Is the parent folder actually a [DIR] type in the file tree?
- If creating a new file, is the parent path valid and accessible?
- Are you using the correct file path format from the existing tree?

RESPONSE FORMAT:
Respond with ONLY a valid JSON object in this exact format:
{
  "targetFilePath": "/path/to/target/file",
  "shouldCreateNewFile": false,
  "shouldCreateNewFolder": false,
  "parentFolderPath": "/path/to/parent/folder",
  "refinements": [
    {
      "paragraphId": "paragraph-id",
      "originalContent": "original text",
      "refinedContent": "improved text with better clarity"
    }
  ],
}

Focus on logical organization and content improvement while preserving all information and ensuring valid file paths.`;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
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