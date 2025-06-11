/**
 * Simple utility functions for thought tracking
 */

/**
 * Detect if text contains empty lines (\n\n) - our processing trigger
 */
export function detectEmptyLine(text: string): boolean {
  const hasEmptyLine = text.includes('\n\n')
  if (hasEmptyLine) {
    console.log('🔍 Empty line detected - processing trigger activated')
  }
  return hasEmptyLine
}

/**
 * Generate unique ID for thoughts
 */
export function generateId(): string {
  const id = `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  console.log('🆔 Generated new thought ID:', id)
  return id
}

/**
 * Update the recent buffer, keeping only last 600 characters
 */
export function updateRecentBuffer(currentBuffer: string, newText: string, maxSize: number = 600): string {
  const combined = currentBuffer + newText
  const result = combined.length <= maxSize ? combined : combined.slice(-maxSize)
  
  console.log(`📝 Buffer updated: ${result.length}/${maxSize} chars (added: "${newText.slice(-20)}")`)
  
  return result
}

/**
 * Extract the last paragraph before an empty line
 */
export function extractLastParagraph(text: string): string {
  const parts = text.split('\n\n')
  if (parts.length < 2) {
    console.log('📋 No paragraph to extract (need empty line)')
    return ''
  }
  
  // Get the paragraph before the last empty line
  const lastParagraph = parts[parts.length - 2]
  const trimmed = lastParagraph.trim()
  
  console.log(`📋 Extracted paragraph: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? '...' : ''}"`)
  
  return trimmed
} 