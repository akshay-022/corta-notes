// Main exports for the editor agent system
export { EDITOR_FUNCTIONS, executeEditorFunction } from './editorFunctions'
export type { 
  EditorFunction, 
  EditorFunctionCall, 
  EditorFunctionResult 
} from './editorFunctions'

export { StreamingEditorAgent } from './streamingAgent'

// Simple helper to detect if a message contains editor commands
export function detectEditorCommands(message: string): {
  hasEditorCommand: boolean
  commands: string[]
} {
  const editorKeywords = [
    'rewrite', 'replace', 'update', 'change', 'modify', 'edit',
    'append', 'add', 'insert', 'delete', 'remove',
    'organize', 'restructure', 'format', 'clean up'
  ]
  
  const lowerMessage = message.toLowerCase()
  const foundCommands = editorKeywords.filter(keyword => 
    lowerMessage.includes(keyword)
  )
  
  return {
    hasEditorCommand: foundCommands.length > 0,
    commands: foundCommands
  }
} 