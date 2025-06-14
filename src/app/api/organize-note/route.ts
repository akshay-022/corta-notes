import { createClient } from '@/lib/supabase/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
// import supermemory from 'supermemory' // SuperMemory - commented out for mem0 migration
// import MemoryClient from 'mem0ai' // New mem0 client - moved to service
import { memoryService } from '@/lib/memory/memory-service-supermemory'

export const runtime = 'edge';

// Helper function to get the actual folder path by looking up page hierarchy
async function getFolderPathFromPageUuid(supabase: any, pageUuid: string, allPages: any[]): Promise<string> {
  if (!pageUuid) return 'Unknown Location'
  
  try {
    // Find the page in the provided file tree first (for performance)
    const page = allPages.find(p => p.uuid === pageUuid)
    if (!page) return 'Unknown Location'
    
    // Build the folder path by following parent relationships
    const path: string[] = []
    let currentPage = page
    
    // Traverse up the parent chain
    while (currentPage && currentPage.parent_uuid) {
      const parentPage = allPages.find(p => p.uuid === currentPage.parent_uuid)
      if (parentPage) {
        path.unshift(parentPage.title) // Add to beginning of array
        currentPage = parentPage
      } else {
        break
      }
    }
    
    // Add the current page's title at the end
    path.push(page.title)
    
    return path.length > 1 ? path.join('/') : page.title
  } catch (error) {
    console.error('Error building folder path:', error)
    return 'Unknown Location'
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body
    const { noteId, noteContent, organizationInstructions, fileTree } = await request.json()

    if (!noteId || !noteContent || !fileTree) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log('Organizing note:', noteId, 'with instructions:', organizationInstructions)

    // Get the current note from database
    const { data: currentNote, error: noteError } = await supabase
      .from('pages')
      .select('*')
      .eq('uuid', noteId)
      .eq('user_id', user.id)
      .single()

    if (noteError || !currentNote) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Use AI to analyze and organize the content (with Mem0 context)
    const organizationPlan = await analyzeAndOrganize(
      noteContent,
      organizationInstructions,
      fileTree,
      supabase,
      currentNote.title
    )

    // Execute the organization plan
    const organizationResults = await executeOrganizationPlan(supabase, user.id, currentNote, organizationPlan, fileTree)

    // Update the original note's organize status - keep it as 'soon' so it remains in recent notes
    await supabase
      .from('pages')
      .update({ 
        metadata: { 
          ...currentNote.metadata,
          organizeStatus: 'soon',
          organizationInstructions: organizationInstructions,
          organizedAt: new Date().toISOString(),
          hasBeenOrganized: true // Flag to indicate this note has been organized before
        }
      })
      .eq('uuid', noteId)
      .eq('user_id', user.id)

    return NextResponse.json({ 
      success: true, 
      message: 'Note organized successfully!',
      plan: organizationPlan,
      changedPaths: organizationResults.changedPaths,
      createdFolders: organizationResults.createdFolders,
      organizedNotes: organizationResults.organizedNotes
    })

  } catch (error) {
    console.error('Error organizing note:', error)
    return NextResponse.json(
      { error: 'Failed to organize note' }, 
      { status: 500 }
    )
  }
}

async function analyzeAndOrganize(noteContent: any, instructions: string, fileTree: any[], supabase?: any, currentTitle?: string) {
  console.log('Analyzing content for organization with GPT-4o and Mem0...')
  
  // Extract text content from TipTap JSON
  const textContent = extractTextFromTipTap(noteContent)
  
  // Create a clean file tree hierarchy for GPT
  const cleanFileTree = createCleanFileTree(fileTree)
  
  // Search memory service for relevant documents to help with organization
  let memoryContext = ''
  
  if (memoryService.isConfigured()) {
    try {
      console.log('Searching memory service for relevant organization context...')
      
      // Get current user for user-scoped search
      const { data: { user }, error: authError } = await supabase?.auth.getUser() || { data: { user: null }, error: null }
      
      if (user) {
        // Search for relevant content to understand organization patterns
        const searchQuery = instructions || textContent.substring(0, 200) // Use instructions or content preview
        const searchResults = await memoryService.search(searchQuery, user.id, 5);

        console.log('Memory search response for organization:', searchResults)

        if (searchResults && searchResults.length > 0) {
          // Filter out low-confidence results (below 30%)
          const highConfidenceResults = searchResults.filter(doc => {
            const confidence = doc.score || 0;
            return confidence >= 0.3; // Only include results with 30%+ confidence
          });
          
          console.log(`Organization: Found ${searchResults.length} documents, ${highConfidenceResults.length} with confidence >= 30%`);
          // Process the search results to find documents with known locations
          const relevantDocuments = []
          
          // ⚡ BATCH DATABASE QUERY - Get all pageUuids in one query instead of sequential queries
          const pageUuids = highConfidenceResults
            .map(result => result.metadata?.pageUuid)
            .filter(Boolean)
          
          if (pageUuids.length > 0 && supabase) {
            // Single database query for all pageUuids
            const { data: pagesData } = await supabase
              .from('pages')
              .select('uuid, title, folder_path')
              .in('uuid', pageUuids)
            
            // Map results to the high confidence search results
            for (const result of highConfidenceResults) {
              const pageUuid = result.metadata?.pageUuid
              if (pageUuid) {
                const pageData = pagesData?.find((p: any) => p.uuid === pageUuid)
                if (pageData) {
                  relevantDocuments.push({
                    title: pageData.title,
                    folderPath: pageData.folder_path || 'Root',
                    pageUuid: pageUuid,
                    content: result.content || '',
                    relevance: result.score || 0,
                    summary: (result.content || '').substring(0, 150) + '...'
                  })
                }
              }
            }
          }

          console.log(`Found ${relevantDocuments.length} relevant documents with known locations`)
          
          // Create context summary for GPT with actual folder paths and content-based reasoning
          memoryContext = `
RELEVANT DOCUMENTS FOUND IN YOUR KNOWLEDGE BASE:
These documents are similar to the content being organized. Consider their locations when deciding where to organize the new content:

${relevantDocuments
  .map((doc, index) => 
    `${index + 1}. "${doc.title}"
   Current Location: ${doc.folderPath}
   Page UUID: ${doc.pageUuid}
   Relevance: ${(doc.relevance * 100).toFixed(1)}% match
   What it contains: ${doc.summary}
   Content Preview: ${doc.content.substring(0, 100)}...`
  )
  .join('\n\n')}

Use these examples to understand your typical organization patterns and place similar content in appropriate folders.`
        }
      }
    } catch (error) {
      console.error('Memory search failed during organization:', error)
      // Continue without memory context if it fails
    }
  }
  
  try {
    // Call GPT-4o API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert note organizer. Analyze the given note content and organization instructions to determine the best folder structure.

IMPORTANT: You must respond with ONLY a valid JSON object in exactly this format:
{
  "contentSections": [
    {
      "content": "cumulative content for this folder path",
      "targetFolder": "Work Notes/Projects/Q4 Planning Notes",
      "reasoning": "explanation for why this content goes in this path"
    }
  ]
}

Rules:
1. targetFolder must be the FULL PATH including filename using "/" separator (e.g., "Work Notes/Projects/Q4 Planning Notes")
2. The LAST part of the path is the FILENAME for the organized note
3. Everything before the last "/" are folder names that will be created if they don't exist
4. If folders exist in the current file tree, use exact names in the path
5. PREFER EXISTING FILES: Look at the current file tree and use existing file names when the content is related or similar - don't create new files unnecessarily
6. Only suggest NEW filenames when the content doesn't fit well with any existing file
7. If using an existing file, the content will be merged/appended to that file
8. You can split content across multiple folder paths (multiple contentSections)
9. For each unique targetFolder path, have only ONE contentSection with cumulative content
10. Content can be the same or different portions of the original note
11. Always provide clear reasoning for the folder path and filename choice (especially if choosing existing vs new file)
12. Respond with ONLY the JSON, no markdown formatting or extra text

Now EXTREMELY EXTREMELY IMPORTANT : 
You may think of splitting the content of the current note a lot. However, EVERY RELATED IDEA IN THE CURRENT NOTE MUST STAY TOGETHER. 
In some notes subsequent lines or different paragraphs may be unrelated, there you can split. But typically each note will be in groups of coherence. That coherence must NOT get separated. 
`
          },
          {
            role: 'user',
            content: `Note Title: ${currentTitle || 'Untitled'}

Note Content: ${textContent}

Organization Instructions: ${instructions || 'No specific instructions - use your best judgment to organize this content appropriately.'}

Current File Tree:
${JSON.stringify(cleanFileTree, null, 2)}

${memoryContext ? memoryContext : ''}

Please organize this note according to ${instructions ? 'the instructions and' : ''} the current file structure, content analysis${memoryContext ? ', and the relevant documents context' : ''}. 

IMPORTANT: 
1. Look carefully at the existing files in the file tree. If the new content is related to or would fit well with an existing file, use that existing file's name and path.
2. ${memoryContext ? 'Consider the similar documents found in your knowledge base - they show where similar content is typically organized.' : ''}
3. Only create new files when the content is truly different or unrelated to existing files.
4. If memory service found similar documents, strongly consider organizing this content in a similar folder structure unless user instructions explicitly say otherwise.

${!instructions ? 'Since no specific instructions were provided, analyze the content and suggest the most logical organization based on the content type, topic, existing file structure, and similar document patterns.' : ''}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const gptResponse = data.choices[0]?.message?.content?.trim()

    if (!gptResponse) {
      throw new Error('No response from GPT-4o')
    }

    console.log('GPT-4o raw response:', gptResponse)

    // Clean and parse the JSON response
    const cleanedJson = cleanGPTJsonResponse(gptResponse)
    const organizationPlan = JSON.parse(cleanedJson)

    console.log('Parsed organization plan:', organizationPlan)
    return organizationPlan

  } catch (error) {
    console.error('Error calling GPT-4o:', error)
    
    // Fallback to simple organization if GPT fails
    console.log('Falling back to simple organization...')
    return createFallbackPlan(noteContent, instructions)
  }
}

function createCleanFileTree(fileTree: any[]) {
  function buildHierarchy(items: any[], parentId: string | null = null): any[] {
    return items
      .filter(item => item.parent_uuid === parentId)
      .map(item => {
        const isFolder = (item.metadata as any)?.isFolder
        const node: any = {
          id: item.uuid,
          name: item.title,
          type: isFolder ? 'folder' : 'file'
        }
        
        if (isFolder) {
          const children = buildHierarchy(items, item.uuid)
          if (children.length > 0) {
            node.children = children
          }
        }
        
        return node
      })
  }
  
  return buildHierarchy(fileTree)
}

function cleanGPTJsonResponse(response: string): string {
  // Remove markdown code blocks
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim()
  
  // Find the first { and last } to extract just the JSON
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }
  
  return cleaned
}

function createFallbackPlan(noteContent: any, instructions: string) {
  let targetPath = 'Organized Notes'
  let reasoning = 'Fallback organization - placed in general organized folder'

  // Simple fallback logic to determine folder path
  if (instructions && instructions.trim()) {
    if (instructions.toLowerCase().includes('work')) {
      targetPath = 'Work Notes'
    } else if (instructions.toLowerCase().includes('meeting')) {
      targetPath = 'Meeting Notes'
    } else if (instructions.toLowerCase().includes('personal')) {
      targetPath = 'Personal'
    } else {
      const folderMatch = instructions.match(/(?:put|move|place).*?(?:in|into|to)\s*(?:the\s*)?["']?([^"']+)["']?\s*(?:folder|directory)?/i)
      if (folderMatch) {
        targetPath = folderMatch[1].trim()
      }
    }
    reasoning = `Fallback organization based on instructions: "${instructions}"`
  } else {
    // No instructions provided - try to infer from content
    const content = extractTextFromTipTap(noteContent).toLowerCase()
    if (content.includes('meeting') || content.includes('standup') || content.includes('discussion')) {
      targetPath = 'Meeting Notes'
      reasoning = 'Fallback organization - content appears to be meeting-related'
    } else if (content.includes('work') || content.includes('project') || content.includes('task')) {
      targetPath = 'Work Notes' 
      reasoning = 'Fallback organization - content appears to be work-related'
    } else if (content.includes('personal') || content.includes('idea') || content.includes('thought')) {
      targetPath = 'Personal Notes'
      reasoning = 'Fallback organization - content appears to be personal'
    }
  }

  return {
    contentSections: [
      {
        content: extractTextFromTipTap(noteContent),
        targetFolder: targetPath,
        reasoning: reasoning
      }
    ]
  }
}

async function executeOrganizationPlan(
  supabase: any, 
  userId: string, 
  currentNote: any, 
  plan: any, 
  fileTree: any[]
) {
  console.log('Executing organization plan:', plan)

  const results = {
    changedPaths: [] as string[],
    createdFolders: [] as string[],
    organizedNotes: [] as any[]
  }

  for (const section of plan.contentSections) {
    const targetFolderPath = section.targetFolder
    
    if (!targetFolderPath) {
      console.warn('No target folder path specified for section, skipping...')
      continue
    }
    
    // Create the nested folder structure and get the parent folder + filename
    const pathResult = await createNestedFolderPath(supabase, userId, targetFolderPath, fileTree)
    
    if (!pathResult) {
      console.error('Failed to create folder path:', targetFolderPath)
      continue
    }

    // Add the full path to changed paths
    results.changedPaths.push(targetFolderPath)
    
    // Track if we created new folders
    if (pathResult.isNewFolder) {
      results.createdFolders.push(targetFolderPath)
    }

    // Convert content back to TipTap format if it's a string
    let noteContent = section.content
    if (typeof section.content === 'string') {
      // Convert plain text to TipTap format
      noteContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: section.content
              }
            ]
          }
        ]
      }
    }

    // Check if the target file already exists
    const existingNote = fileTree.find(item => 
      !item.metadata?.isFolder && 
      item.title === pathResult.fileName && 
      item.parent_uuid === pathResult.parentFolderId
    )

    if (existingNote) {
      // Merge content into existing note
      console.log(`Merging content into existing note: ${pathResult.fileName}`)
      
      // Append new content to existing content
      const existingContent = existingNote.content || { type: 'doc', content: [] }
      const mergedContent = mergeNoteContents(existingContent, noteContent)
      
      const { data: updatedNote, error: updateError } = await supabase
        .from('pages')
        .update({
          content: mergedContent,
          metadata: {
            ...existingNote.metadata,
            organizeStatus: 'yes',
            lastOrganizedAt: new Date().toISOString(),
            organizationReasoning: section.reasoning
          }
        })
        .eq('uuid', existingNote.uuid)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Failed to update existing note: ${updateError.message}`)
      }

      results.organizedNotes.push({
        noteId: existingNote.uuid,
        title: pathResult.fileName,
        folderPath: targetFolderPath,
        action: 'merged'
      })
    } else {
      // Create a new organized note
      console.log(`Creating new organized note: ${pathResult.fileName}`)
      
      const { data: newNote, error: noteError } = await supabase
        .from('pages')
        .insert({
          title: pathResult.fileName,
          user_id: userId,
          content: noteContent,
          parent_uuid: pathResult.parentFolderId,
          metadata: { 
            organizeStatus: 'yes',
            originalNoteId: currentNote.uuid,
            organizationReasoning: section.reasoning
          }
        })
        .select()
        .single()

      if (noteError) {
        throw new Error(`Failed to create organized note: ${noteError.message}`)
      }

      results.organizedNotes.push({
        noteId: newNote.uuid,
        title: newNote.title,
        folderPath: targetFolderPath,
        action: 'created'
      })
    }

    console.log('Created organized note in folder path:', targetFolderPath)
  }

  // Mark the original note as organized (don't delete it, just change status)
  console.log('Organization plan executed successfully')
  
  return results
}

async function createNestedFolderPath(
  supabase: any, 
  userId: string, 
  fullPath: string, 
  fileTree: any[]
): Promise<{parentFolderId: string | null, fileName: string, isNewFolder: boolean}> {
  // Split the path - last part is filename, everything else are folders
  const pathParts = fullPath.split('/').map(name => name.trim())
  const fileName = pathParts[pathParts.length - 1] // Last part is the file name
  const folderNames = pathParts.slice(0, -1) // Everything except last part are folders
  
  let currentParentId: string | null = null
  let isNewFolder = false
  
  // Process each folder in the path (excluding the filename)
  for (let i = 0; i < folderNames.length; i++) {
    const folderName = folderNames[i]
    
    // Look for existing folder at this level
    let existingFolder = fileTree.find(item => 
      item.metadata?.isFolder && 
      item.title === folderName && 
      item.parent_uuid === currentParentId
    )
    
    if (!existingFolder) {
      // Create the folder
      const { data: newFolder, error: folderError } = await supabase
        .from('pages')
        .insert({
          title: folderName,
          user_id: userId,
          content: { type: 'doc', content: [] },
          parent_uuid: currentParentId,
          metadata: { isFolder: true }
        })
        .select()
        .single()

      if (folderError) {
        console.error(`Failed to create folder "${folderName}":`, folderError)
        return { parentFolderId: null, fileName, isNewFolder: false }
      }
      
      existingFolder = newFolder
      isNewFolder = true
      console.log(`Created new folder: ${folderName}`)
      
      // Add to file tree for future lookups in this request
      fileTree.push(existingFolder)
    }
    
    // Update parent for next iteration
    currentParentId = existingFolder.uuid
  }
  
  return {
    parentFolderId: currentParentId,
    fileName: fileName,
    isNewFolder: isNewFolder
  }
}

function mergeNoteContents(existingContent: any, newContent: any): any {
  // If either content is empty, return the other
  if (!existingContent || !existingContent.content) return newContent
  if (!newContent || !newContent.content) return existingContent
  
  // Create a horizontal line separator
  const separator = {
    type: 'horizontalRule'
  }
  
  // Merge the content arrays - new content at top, separator, then existing content
  return {
    type: 'doc',
    content: [
      ...newContent.content,
      separator,
      ...existingContent.content
    ]
  }
}

function extractTextFromTipTap(content: any): string {
  if (!content || !content.content) return ''
  
  let text = ''
  
  function extractText(node: any): void {
    if (node.text) {
      text += node.text + ' '
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(extractText)
    }
  }
  
  content.content.forEach(extractText)
  return text.trim()
} 