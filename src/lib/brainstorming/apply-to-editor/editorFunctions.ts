import { Editor } from '@tiptap/react'
import logger from '@/lib/logger'

export interface EditorFunction {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required: string[]
  }
}

export interface EditorFunctionCall {
  name: string
  arguments: Record<string, any>
}

export interface EditorFunctionResult {
  success: boolean
  message: string
  data?: any
}

/**
 * Available functions that the AI can call to modify the editor
 */
export const EDITOR_FUNCTIONS: EditorFunction[] = [
  {
    name: 'rewrite_editor',
    description: 'Rewrite the entire editor content with new markdown content.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The new markdown content to replace the entire editor with.'
        }
      },
      required: ['content']
    }
  }
]

/**
 * Execute an editor function call (client-side with editor instance)
 */
export async function executeEditorFunction(
  functionCall: EditorFunctionCall,
  editor: Editor | null,
  pageUuid?: string
): Promise<EditorFunctionResult> {
  if (!editor) {
    return {
      success: false,
      message: 'No editor available'
    }
  }

  logger.info('Executing editor function', { 
    functionName: functionCall.name, 
    arguments: functionCall.arguments 
  })

  try {
    switch (functionCall.name) {
      case 'rewrite_editor':
        return await rewriteEditor(editor, functionCall.arguments, pageUuid)
      
      default:
        return {
          success: false,
          message: `Unknown function: ${functionCall.name}`
        }
    }
  } catch (error) {
    logger.error('Error executing editor function', { error, functionCall })
    return {
      success: false,
      message: `Error executing ${functionCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Execute an editor function call (server-side with page UUID)
 */
export async function executeEditorFunctionServerSide(
  functionCall: EditorFunctionCall,
  pageUuid: string
): Promise<EditorFunctionResult> {
  if (!pageUuid) {
    return {
      success: false,
      message: 'Page UUID is required'
    }
  }

  logger.info('Executing server-side editor function', { 
    functionName: functionCall.name, 
    arguments: functionCall.arguments,
    pageUuid 
  })

  try {
    switch (functionCall.name) {
      case 'rewrite_editor':
        return await rewritePageContent(pageUuid, functionCall.arguments)
      
      default:
        return {
          success: false,
          message: `Unknown function: ${functionCall.name}`
        }
    }
  } catch (error) {
    logger.error('Error executing server-side editor function', { error, functionCall, pageUuid })
    return {
      success: false,
      message: `Error executing ${functionCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

async function rewriteEditor(editor: Editor, args: any, pageUuid?: string): Promise<EditorFunctionResult> {
  const { content } = args
  
  if (!content || typeof content !== 'string') {
    return { success: false, message: 'Content is required and must be a string' }
  }

  // Import the ContentProcessor class and create TipTap JSON from markdown
  const { ContentProcessor } = await import('@/lib/auto-organization/organized-file-updates/helpers/contentProcessor')
  const contentProcessor = new ContentProcessor()
  
  // Convert markdown to TipTap JSON format
  const tiptapJson = contentProcessor.createTipTapContent(content)
  
  // Save version history if pageUuid is provided
  if (pageUuid) {
    try {
      logger.info('Saving version history for client-side rewrite', { pageUuid })
      
      // Import Supabase client
      const { createClient } = await import('@/lib/supabase/supabase-client')
      const supabase = createClient()
      
      // Get current page content and metadata
      const { data: existingPage, error: fetchError } = await supabase
        .from('pages')
        .select('content, metadata')
        .eq('uuid', pageUuid)
        .single()
      
      if (!fetchError && existingPage) {
        // Create version history entries - both before and after
        const currentMetadata = (existingPage.metadata as any) || {}
        const existingVersionHistory = currentMetadata.versionHistory || []
        
        const oldContentText = contentProcessor.extractTextFromTipTap(existingPage.content)
        const newContentText = contentProcessor.extractTextFromTipTap(tiptapJson)
        
        // Check if we need to save the before snapshot (avoid duplicates)
        // Don't save "before" if it matches the "after" of the previous entry
        const shouldSaveBeforeSnapshot = existingVersionHistory.length === 0 || 
          (existingVersionHistory[0].action === 'after_change' && existingVersionHistory[0].oldContentText !== oldContentText) ||
          (existingVersionHistory[0].action !== 'after_change')
        
        const newVersionItems = []
        
        if (shouldSaveBeforeSnapshot) {
          // Save "before" snapshot
          const beforeVersionItem = {
            timestamp: Date.now(),
            trigger: 'smart_apply_client',
            oldContent: existingPage.content,
            oldContentText: oldContentText,
            action: 'before_change',
            reason: 'Content before AI smart apply (client-side)'
          }
          newVersionItems.push(beforeVersionItem)
          
          logger.info('Saving before snapshot for client-side rewrite', { 
            pageUuid, 
            oldContentLength: oldContentText.length 
          })
        } else {
          logger.info('Skipping before snapshot - duplicate content', { 
            pageUuid, 
            oldContentLength: oldContentText.length 
          })
        }
        
        // Save "after" snapshot (always save this to show the result)
        const afterVersionItem = {
          timestamp: Date.now() + 1, // Ensure after comes after before
          trigger: 'smart_apply_client',
          oldContent: tiptapJson,
          oldContentText: newContentText,
          action: 'after_change',
          reason: 'Content after AI smart apply (client-side)'
        }
        newVersionItems.push(afterVersionItem)
        
        // Add to version history (keep last 3 versions)
        const updatedVersionHistory = [...newVersionItems, ...existingVersionHistory].slice(0, 3)
        
        // Update metadata with new version history
        const updatedMetadata = {
          ...currentMetadata,
          versionHistory: updatedVersionHistory
        }
        
        // Update page content and metadata in database
        const { error: updateError } = await supabase
          .from('pages')
          .update({ 
            content: tiptapJson,
            metadata: updatedMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('uuid', pageUuid)
        
        if (updateError) {
          logger.error('Failed to save version history for client-side rewrite', { 
            pageUuid, 
            error: updateError 
          })
          // Continue with editor update even if version history fails
        } else {
          logger.info('Version history saved for client-side rewrite', { 
            pageUuid, 
            versionHistoryCount: updatedVersionHistory.length,
            savedBeforeSnapshot: shouldSaveBeforeSnapshot,
            savedAfterSnapshot: true
          })
        }
      } else {
        logger.error('Failed to fetch existing page for version history', { 
          pageUuid, 
          error: fetchError 
        })
      }
    } catch (error) {
      logger.error('Error saving version history for client-side rewrite', { 
        pageUuid, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      // Continue with editor update even if version history fails
    }
  }
  
  // Clear editor and set new content using TipTap JSON
  editor.commands.clearContent()
  editor.commands.setContent(tiptapJson)
  
  logger.info('Editor content rewritten', { 
    contentLength: content.length, 
    hasVersionHistory: !!pageUuid 
  })
  
  return {
    success: true,
    message: `Editor rewritten with new content`,
    data: { contentLength: content.length }
  }
}

async function rewritePageContent(pageUuid: string, args: any): Promise<EditorFunctionResult> {
  const { content } = args
  
  logger.info('=== REWRITE PAGE CONTENT START ===', {
    pageUuid,
    hasContent: !!content,
    contentType: typeof content,
    contentLength: content?.length || 0,
    contentPreview: content?.substring(0, 150) + '...'
  });
  
  if (!content || typeof content !== 'string') {
    logger.error('Content validation failed', {
      pageUuid,
      content,
      contentType: typeof content
    });
    return { success: false, message: 'Content is required and must be a string' }
  }

  try {
    // Import Supabase client
    logger.info('Importing Supabase client', { pageUuid });
    const { createClient } = await import('@/lib/supabase/supabase-server')
    const supabase = await createClient()

    // Import ContentProcessor to convert markdown to TipTap JSON
    logger.info('Importing ContentProcessor', { pageUuid });
    const { ContentProcessor } = await import('@/lib/auto-organization/organized-file-updates/helpers/contentProcessor')
    const contentProcessor = new ContentProcessor()
    
    // Convert markdown to TipTap JSON format
    logger.info('Converting markdown to TipTap JSON', { 
      pageUuid,
      markdownLength: content.length 
    });
    const tiptapJson = contentProcessor.createTipTapContent(content)
    
    logger.info('TipTap JSON conversion completed', {
      pageUuid,
      tiptapJsonType: typeof tiptapJson,
      tiptapJsonKeys: tiptapJson ? Object.keys(tiptapJson) : [],
      tiptapJsonPreview: JSON.stringify(tiptapJson).substring(0, 200) + '...'
    });
    
    // Check if page exists first
    logger.info('Checking if page exists', { pageUuid });
    const { data: existingPage, error: fetchError } = await supabase
      .from('pages')
      .select('uuid, title, content, metadata')
      .eq('uuid', pageUuid)
      .single()

    if (fetchError) {
      logger.error('Error fetching existing page', { 
        pageUuid, 
        error: fetchError,
        errorMessage: fetchError.message,
        errorCode: fetchError.code
      });
      return {
        success: false,
        message: `Failed to fetch page: ${fetchError.message}`
      }
    }

    if (!existingPage) {
      logger.error('Page not found', { pageUuid });
      return {
        success: false,
        message: `Page with UUID ${pageUuid} not found`
      }
    }

    logger.info('Existing page found', {
      pageUuid,
      pageTitle: existingPage.title,
      hasExistingContent: !!existingPage.content,
      existingContentType: typeof existingPage.content,
      existingContentPreview: JSON.stringify(existingPage.content).substring(0, 300) + '...'
    });
    
    // Log the exact data we're about to save
    // Create version history entries - both before and after
    const currentMetadata = (existingPage.metadata as any) || {}
    const existingVersionHistory = currentMetadata.versionHistory || []
    
    const oldContentText = contentProcessor.extractTextFromTipTap(existingPage.content)
    const newContentText = contentProcessor.extractTextFromTipTap(tiptapJson)
    
    // Check if we need to save the before snapshot (avoid duplicates)
    // Don't save "before" if it matches the "after" of the previous entry
    const shouldSaveBeforeSnapshot = existingVersionHistory.length === 0 || 
      (existingVersionHistory[0].action === 'after_change' && existingVersionHistory[0].oldContentText !== oldContentText) ||
      (existingVersionHistory[0].action !== 'after_change')
    
    const newVersionItems = []
    
    if (shouldSaveBeforeSnapshot) {
      // Save "before" snapshot
      const beforeVersionItem = {
        timestamp: Date.now(),
        trigger: 'smart_apply',
        oldContent: existingPage.content,
        oldContentText: oldContentText,
        action: 'before_change',
        reason: 'Content before AI smart apply'
      }
      newVersionItems.push(beforeVersionItem)
      
      logger.info('Saving before snapshot for server-side rewrite', { 
        pageUuid, 
        oldContentLength: oldContentText.length 
      })
    } else {
      logger.info('Skipping before snapshot - matches previous after content', { 
        pageUuid, 
        oldContentLength: oldContentText.length 
      })
    }
    
    // Save "after" snapshot (always save this to show the result)
    const afterVersionItem = {
      timestamp: Date.now() + 1, // Ensure after comes after before
      trigger: 'smart_apply',
      oldContent: tiptapJson,
      oldContentText: newContentText,
      action: 'after_change',
      reason: 'Content after AI smart apply'
    }
    newVersionItems.push(afterVersionItem)
    
    // Add to version history (keep last 3 versions)
    const updatedVersionHistory = [...newVersionItems, ...existingVersionHistory].slice(0, 3)
    
    // Update metadata with new version history
    const updatedMetadata = {
      ...currentMetadata,
      versionHistory: updatedVersionHistory
    }
    
    logger.info('=== ABOUT TO UPDATE DATABASE ===', {
      pageUuid,
      newContentType: typeof tiptapJson,
      newContentStructure: {
        type: tiptapJson?.type,
        contentArrayLength: tiptapJson?.content?.length || 0,
        firstNodeType: tiptapJson?.content?.[0]?.type,
        hasHeadings: tiptapJson?.content?.some((node: any) => node.type === 'heading'),
        hasBulletLists: tiptapJson?.content?.some((node: any) => node.type === 'bulletList'),
        hasParagraphs: tiptapJson?.content?.some((node: any) => node.type === 'paragraph')
      },
      newContentPreview: JSON.stringify(tiptapJson).substring(0, 500) + '...',
      versionHistoryCount: updatedVersionHistory.length
    });
    
    // Update the page content and metadata in database
    logger.info('Executing Supabase update query', { 
      pageUuid,
      updateFields: ['content', 'metadata', 'updated_at'],
      timestamp: new Date().toISOString()
    });
    
    const { data: updateData, error: updateError } = await supabase
      .from('pages')
      .update({ 
        content: tiptapJson,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('uuid', pageUuid)
      .select()

    if (updateError) {
      logger.error('Database error updating page content', { 
        pageUuid,
        error: updateError,
        errorMessage: updateError.message,
        errorCode: updateError.code,
        errorDetails: updateError.details,
        errorHint: updateError.hint
      });
      return {
        success: false,
        message: `Failed to update page: ${updateError.message}`
      }
    }

    logger.info('=== SUPABASE UPDATE RESPONSE ===', { 
      pageUuid, 
      contentLength: content.length,
      updateData: updateData,
      updatedRowCount: updateData?.length || 0,
      returnedContent: updateData?.[0]?.content ? {
        type: updateData[0].content.type,
        contentLength: updateData[0].content.content?.length || 0,
        preview: JSON.stringify(updateData[0].content).substring(0, 300) + '...'
      } : 'No content returned',
      versionHistoryCount: updatedVersionHistory.length,
      savedBeforeSnapshot: shouldSaveBeforeSnapshot,
      savedAfterSnapshot: true
    });
    
    
    
    return {
      success: true,
      message: `Page content updated successfully`,
      data: { 
        pageUuid,
        contentLength: content.length,
        updatedAt: new Date().toISOString(),
      }
    }
  } catch (error) {
    logger.error('=== REWRITE PAGE CONTENT ERROR ===', { 
      pageUuid,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });
    return {
      success: false,
      message: `Error updating page: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
} 