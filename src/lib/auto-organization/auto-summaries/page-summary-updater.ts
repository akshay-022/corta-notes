import logger from '@/lib/logger'

interface TipTapContent {
  type: string
  content?: any[]
  [key: string]: any
}

interface SummaryUpdateResult {
  success: boolean
  newSummary?: TipTapContent
  error?: string
}

/**
 * Updates a page summary based on content changes
 * @param oldContent - Previous TipTap content when summary was last made
 * @param newContent - Current TipTap content
 * @param currentSummary - Current summary in TipTap format
 * @returns Updated summary or error
 */
export async function updatePageSummary(
  oldContent: TipTapContent,
  newContent: TipTapContent,
  currentSummary?: TipTapContent
): Promise<SummaryUpdateResult> {
  try {
    logger.info('Starting page summary update', {
      hasOldContent: !!oldContent,
      hasNewContent: !!newContent,
      hasCurrentSummary: !!currentSummary
    })

    // Find the diff between old and new content
    const diff = findContentDiff(oldContent, newContent)
    
    if (!diff.hasChanges) {
      logger.info('No content changes detected, keeping existing summary')
      return {
        success: true,
        newSummary: currentSummary
      }
    }

    // Generate new summary via LLM
    const newSummary = await generateUpdatedSummary(diff, currentSummary)
    
    logger.info('Page summary updated successfully')
    return {
      success: true,
      newSummary
    }

  } catch (error) {
    logger.error('Error updating page summary:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Find differences between old and new TipTap content
 * Assumes new content is only added at the start
 */
function findContentDiff(oldContent: TipTapContent, newContent: TipTapContent) {
  const oldText = extractPlainText(oldContent)
  const newText = extractPlainText(newContent)
  
  const hasChanges = oldText !== newText
  
  if (!hasChanges) {
    return { hasChanges: false, oldText, newText }
  }

  // Since content is only added at the start, check if old text is at the end of new text
  if (newText.endsWith(oldText)) {
    // New content was added at the start
    const addedText = newText.slice(0, newText.length - oldText.length)
    
    return {
      hasChanges,
      oldText,
      newText,
      addedText,
      removedText: ''
    }
  }

  // No changes detected at the start, return no diff
  return {
    hasChanges: false,
    oldText,
    newText
  }
}

/**
 * Extract plain text from TipTap content for comparison
 */
function extractPlainText(content: TipTapContent): string {
  if (!content?.content) return ''
  
  let text = ''
  
  function traverse(node: any): void {
    if (node.type === 'text') {
      text += node.text || ''
    } else if (node.content) {
      node.content.forEach(traverse)
    }
  }
  
  content.content.forEach(traverse)
  return text.trim()
}

/**
 * Generate updated summary via LLM API
 */
async function generateUpdatedSummary(
  diff: any,
  currentSummary?: TipTapContent
): Promise<TipTapContent> {
  const prompt = createSummaryUpdatePrompt(diff, currentSummary)
  
  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      maxTokens: 500,
      temperature: 0.3
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`)
  }

  const result = await response.json()
  
  if (!result.content) {
    throw new Error('No content returned from LLM API')
  }

  // Parse the LLM response as TipTap JSON
  try {
    return JSON.parse(result.content)
  } catch (parseError) {
    logger.warn('Failed to parse LLM response as JSON, creating simple summary')
    // Fallback: create simple TipTap structure
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: result.content
            }
          ]
        }
      ]
    }
  }
}

/**
 * Create prompt for LLM to update summary
 */
function createSummaryUpdatePrompt(diff: any, currentSummary?: TipTapContent): string {
  const currentSummaryJson = currentSummary ? JSON.stringify(currentSummary, null, 2) : 'No existing summary'
  
  return `You are updating a page summary based on content changes.

CURRENT SUMMARY (TipTap JSON):
${currentSummaryJson}

CONTENT CHANGES:
Added at start: "${diff.addedText}"

INSTRUCTIONS:
1. Update the summary to reflect the new content that was added
2. Keep it concise and focused on the most important points
3. Use the same TipTap JSON structure as the current summary
4. Use bullet points for key insights
5. Bold important terms using TipTap marks
6. Return ONLY the updated TipTap JSON, no other text

Generate the updated summary as TipTap JSON:`
} 