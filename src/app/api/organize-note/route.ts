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
    const { noteId, noteContent, organizationInstructions, fileTree, brainStateData } = await request.json()

    if (!noteId || !fileTree || !brainStateData) {
      return NextResponse.json({ error: 'Missing required fields (noteId, fileTree, brainStateData)' }, { status: 400 })
    }

    console.log('Organizing brain state for note:', noteId, 'with instructions:', organizationInstructions)

    // Filter unorganized thoughts from brain state
    const unorganizedThoughts = brainStateData?.pageThoughts?.filter((thought: any) => !thought.isOrganized) || []
    
    if (unorganizedThoughts.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No unorganized thoughts to process',
        organizedThoughts: 0
      })
    }

    console.log(`Found ${unorganizedThoughts.length} unorganized thoughts to process`)

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

    // Use AI to analyze and organize the brain state thoughts
    const organizationPlan = await analyzeAndOrganizeBrainState(
      unorganizedThoughts,
      organizationInstructions,
      fileTree,
      supabase,
      currentNote.title,
      noteId,
      brainStateData
    )

    // Execute the organization plan
    const organizationResults = await executeOrganizationPlan(supabase, user.id, currentNote, organizationPlan, fileTree, unorganizedThoughts)

    // Update the original note metadata to track organization
    const updatedMetadata = {
      ...currentNote.metadata,
      organizationInstructions: organizationInstructions,
      lastBrainStateOrganizedAt: new Date().toISOString(),
      organizedThoughtsCount: unorganizedThoughts.length
    }

    await supabase
      .from('pages')
      .update({ 
        metadata: updatedMetadata
      })
      .eq('uuid', noteId)
      .eq('user_id', user.id)

    // Log cache invalidation info for client-side handling
    console.log('📦 Cache invalidation needed for organized files')
    console.log('📦 User ID:', user.id)
    console.log('📦 Organized files paths:', organizationResults.changedPaths)
    console.log('📦 Created folders:', organizationResults.createdFolders)
    console.log('📦 Organized notes:', organizationResults.organizedNotes)

    return NextResponse.json({ 
      success: true, 
      message: `Successfully organized ${unorganizedThoughts.length} brain state thoughts! ${organizationResults.organizedNotes.filter(n => n.action === 'appended').length} notes were appended to, ${organizationResults.organizedNotes.filter(n => n.action === 'created').length} new notes were created.`,
      plan: organizationPlan,
      changedPaths: organizationResults.changedPaths,
      createdFolders: organizationResults.createdFolders,
      organizedNotes: organizationResults.organizedNotes,
<<<<<<< HEAD
      organizedThoughts: unorganizedThoughts.length
=======
      cacheInvalidation: {
        invalidateCache: true,
        userId: user.id, 
        affectedPaths: organizationResults.changedPaths,
        newFolders: organizationResults.createdFolders,
        newNotes: organizationResults.organizedNotes
      }
>>>>>>> 2c0e738 (Organise working)
    })

  } catch (error) {
    console.error('Error organizing brain state:', error)
    return NextResponse.json(
      { error: 'Failed to organize brain state' }, 
      { status: 500 }
    )
  }
}

async function analyzeAndOrganizeBrainState(unorganizedThoughts: any[], instructions: string, fileTree: any[], supabase?: any, currentTitle?: string, pageUuid?: string, brainStateData?: any) {
  console.log('Analyzing brain state thoughts for organization with GPT-4o...')
  
  // Create a clean file tree hierarchy for GPT - only show organized files
  const cleanFileTree = createCleanFileTree(fileTree.filter(item => item.organized === true))
  
<<<<<<< HEAD
  // Prepare brain state thoughts content for organization
  const thoughtsContent = unorganizedThoughts.map((thought: any, index: number) => 
    `${index + 1}. "${thought.content}"
   Last Updated: ${new Date(thought.lastUpdated).toLocaleDateString()}
   Category: ${thought.category || 'Uncategorized'}`
  ).join('\n\n')
=======
  // Create a clean file tree hierarchy for GPT - only include organized files
  const cleanFileTree = createCleanFileTree(fileTree)
>>>>>>> 2c0e738 (Organise working)
  
  // Build additional context from brain state
  let brainStateContext = ''
  if (brainStateData) {
    const { allCategories, brainStats } = brainStateData
    
    brainStateContext = `
BRAIN STATE CONTEXT:
You are organizing ${unorganizedThoughts.length} unorganized thoughts from the user's brain state system.

${allCategories && allCategories.length > 0 ? `Available Brain Categories (${allCategories.length} total):
${allCategories.map((cat: string) => `- ${cat}`).join('\n')}` : ''}

ORGANIZATION APPROACH:
- Simply copy-paste the thoughts into appropriate files
- Structure them cleanly but keep original content intact
- Group related thoughts together
- No long summaries or explanations needed
- Just well-organized, structured notes`
  }
  
  // Search memory service for relevant organized content patterns
  let memoryContext = ''
  
  if (memoryService.isConfigured()) {
    try {
      console.log('Searching memory service for organization patterns...')
      
      // Get current user for user-scoped search
      const { data: { user }, error: authError } = await supabase?.auth.getUser() || { data: { user: null }, error: null }
      
      if (user) {
        // Use a sample of thoughts to search for similar organized content
        const searchQuery = unorganizedThoughts.slice(0, 3).map(t => t.content).join(' ')
        const searchResults = await memoryService.search(searchQuery, user.id, 5);

        console.log('Memory search response for brain state organization:', searchResults)

        if (searchResults && searchResults.length > 0) {
          // Filter out low-confidence results (below 30%)
          const highConfidenceResults = searchResults.filter((doc: any) => {
            const confidence = doc.score || 0;
            return confidence >= 0.3;
          });
          
          console.log(`Brain state organization: Found ${searchResults.length} documents, ${highConfidenceResults.length} with confidence >= 30%`);
          
          // Get page data for high confidence results
          const pageUuids = highConfidenceResults
            .map((result: any) => result.metadata?.pageUuid)
            .filter(Boolean)
          
          if (pageUuids.length > 0 && supabase) {
            // Single database query for all pageUuids - only include organized files
            const { data: pagesData } = await supabase
              .from('pages')
<<<<<<< HEAD
              .select('uuid, title, folder_path, type, organized, visible')
              .in('uuid', pageUuids)
              .eq('organized', true) // Only get organized files for patterns
=======
              .select('uuid, title, folder_path, organized')
              .in('uuid', pageUuids)
              .eq('organized', true) // Only include organized files
>>>>>>> 2c0e738 (Organise working)
            
            const relevantDocuments = []
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

<<<<<<< HEAD
            console.log(`Found ${relevantDocuments.length} relevant organized documents`)
            
            if (relevantDocuments.length > 0) {
              memoryContext = `
SIMILAR ORGANIZED CONTENT FOUND:
These organized documents contain similar content to your brain state thoughts. Consider organizing your thoughts in similar locations:
=======
          console.log(`Found ${relevantDocuments.length} relevant organized documents with known locations`)
          
          // Create context summary for GPT with actual folder paths and content-based reasoning
          memoryContext = `
RELEVANT ORGANIZED DOCUMENTS FOUND IN YOUR KNOWLEDGE BASE:
These documents are similar to the content being organized. Consider their locations when deciding where to organize the new content:
>>>>>>> 2c0e738 (Organise working)

${relevantDocuments
  .map((doc, index) => 
    `${index + 1}. "${doc.title}"
   Location: ${doc.folderPath}
   Relevance: ${(doc.relevance * 100).toFixed(1)}% match`
  )
  .join('\n\n')}

Use these examples to guide where to organize similar brain state thoughts.`
            }
          }
        }
      }
    } catch (error) {
      console.error('Memory search failed during brain state organization:', error)
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
            content: `You are organizing brain state thoughts into files. Your job is simple: copy-paste the thoughts into appropriate organized files with clean structure.

IMPORTANT: You must respond with ONLY a valid JSON object in exactly this format:
{
  "contentSections": [
    {
      "content": "cleanly structured brain state thoughts (copy-paste style)",
      "targetFolder": "Work Notes/Projects/Q4 Planning Notes",
      "reasoning": "brief reason for this location",
      "thoughtIds": [1, 3, 5]
    }
  ]
}

Rules:
1. targetFolder must be the FULL PATH including filename using "/" separator
2. The LAST part of the path is the FILENAME for the organized note
<<<<<<< HEAD
3. STRONGLY PREFER EXISTING ORGANIZED FILES: Use existing files when thoughts are related
4. Only create NEW files when thoughts don't fit any existing organized file
5. COPY-PASTE approach: Keep the original thought content intact, just structure it cleanly
6. NO long summaries or explanations - just well-organized notes
7. Include thoughtIds array with the 1-based indices of thoughts being organized
8. The content will REPLACE the existing file content entirely
9. Group related thoughts together by theme/topic
10. Use simple, clean formatting (bullet points, short headers if needed)
11. Respond with ONLY the JSON, no markdown formatting or extra text
=======
3. Everything before the last "/" are folder names that will be created if they don't exist
4. If folders exist in the current file tree, use exact names in the path
5. PREFER EXISTING ORGANIZED FILES: Look at the current file tree and use existing file names when the content is related or similar - don't create new files unnecessarily
6. Only suggest NEW filenames when the content doesn't fit well with any existing organized file
7. If using an existing organized file, the content will be merged/appended to that file
8. You can split content across multiple folder paths (multiple contentSections)
9. For each unique targetFolder path, have only ONE contentSection with cumulative content
10. Content can be the same or different portions of the original note
11. Always provide clear reasoning for the folder path and filename choice (especially if choosing existing vs new file)
12. Respond with ONLY the JSON, no markdown formatting or extra text
13. CRITICAL: You can only organize to files that are marked as "organized" in the database. Do not suggest organizing to files that are not organized.
>>>>>>> 2c0e738 (Organise working)

FORMATTING STYLE:
- Use bullet points for thoughts
- Add simple headers to group related ideas
- Keep original wording but structure cleanly
- No long explanations or summaries
- Just clean, organized notes`
          },
          {
            role: 'user',
            content: `Page Title: ${currentTitle || 'Untitled'}

Unorganized Brain State Thoughts to Copy-Paste and Structure:
${thoughtsContent}

Organization Instructions: ${instructions || 'No specific instructions - organize these thoughts cleanly into appropriate files.'}

<<<<<<< HEAD
Current Organized File Tree:
=======
Current File Tree (ONLY ORGANIZED FILES):
>>>>>>> 2c0e738 (Organise working)
${JSON.stringify(cleanFileTree, null, 2)}

${brainStateContext}

${memoryContext}

<<<<<<< HEAD
Please copy-paste these brain state thoughts into appropriate organized files. Focus on:
1. Clean structure and formatting
2. Using existing organized files when thoughts are related
3. Keeping original thought content intact
4. Simple organization without long summaries
5. ${memoryContext ? 'Consider the similar organized content locations' : 'Use the existing file structure as guidance'}

${!instructions ? 'Since no specific instructions were provided, organize based on content themes and existing file structure.' : ''}`
=======
IMPORTANT: 
1. Look carefully at the existing ORGANIZED files in the file tree. If the new content is related to or would fit well with an existing organized file, use that existing file's name and path.
2. ${memoryContext ? 'Consider the similar organized documents found in your knowledge base - they show where similar content is typically organized.' : ''}
3. Only create new files when the content is truly different or unrelated to existing organized files.
4. If memory service found similar documents, strongly consider organizing this content in a similar folder structure unless user instructions explicitly say otherwise.
5. CRITICAL: You can only organize to files that are marked as "organized" in the database. All new files will be created with organized=true.

${!instructions ? 'Since no specific instructions were provided, analyze the content and suggest the most logical organization based on the content type, topic, existing organized file structure, and similar document patterns.' : ''}`
>>>>>>> 2c0e738 (Organise working)
          }
        ],
        temperature: 0.2,
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

    console.log('Parsed brain state organization plan:', organizationPlan)
    return organizationPlan

  } catch (error) {
    console.error('Error calling GPT-4o for brain state organization:', error)
    
    // Fallback to simple organization if GPT fails
    console.log('Falling back to simple brain state organization...')
    return createFallbackBrainStatePlan(unorganizedThoughts, instructions)
  }
}

function createCleanFileTree(fileTree: any[]) {
  function buildHierarchy(items: any[], parentId: string | null = null): any[] {
    return items
      .filter(item => item.parent_uuid === parentId)
      .filter(item => {
        // Only include organized files or folders
        const isFolder = (item.metadata as any)?.isFolder
        return isFolder || item.organized === true
      })
      .map(item => {
        const isFolder = item.type === 'folder'
        const node: any = {
          id: item.uuid,
          name: item.title,
          type: isFolder ? 'folder' : 'file',
<<<<<<< HEAD
          organized: item.organized
=======
          organized: item.organized || false
>>>>>>> 2c0e738 (Organise working)
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

function createFallbackBrainStatePlan(unorganizedThoughts: any[], instructions: string) {
  let targetPath = 'Organized Notes/Brain State Notes'
  let reasoning = 'Fallback organization - brain state thoughts organized cleanly'

  // Simple fallback logic based on instructions or thought content
  if (instructions && instructions.trim()) {
    if (instructions.toLowerCase().includes('work')) {
      targetPath = 'Work Notes/Brain State Notes'
    } else if (instructions.toLowerCase().includes('meeting')) {
      targetPath = 'Meeting Notes/Brain State Notes'
    } else if (instructions.toLowerCase().includes('personal')) {
      targetPath = 'Personal/Brain State Notes'
    }
    reasoning = `Fallback brain state organization based on instructions: "${instructions}"`
  } else {
    // Try to infer from thought content
    const allThoughtContent = unorganizedThoughts.map(t => t.content).join(' ').toLowerCase()
    if (allThoughtContent.includes('meeting') || allThoughtContent.includes('standup')) {
      targetPath = 'Meeting Notes/Brain State Notes'
      reasoning = 'Fallback organization - thoughts appear to be meeting-related'
    } else if (allThoughtContent.includes('work') || allThoughtContent.includes('project')) {
      targetPath = 'Work Notes/Brain State Notes' 
      reasoning = 'Fallback organization - thoughts appear to be work-related'
    } else if (allThoughtContent.includes('personal') || allThoughtContent.includes('idea')) {
      targetPath = 'Personal/Brain State Notes'
      reasoning = 'Fallback organization - thoughts appear to be personal'
    }
  }

  // Create simple structured content from thoughts (copy-paste style)
  const structuredContent = unorganizedThoughts.map((thought, index) => 
    `• ${thought.content}`
  ).join('\n')

  return {
    contentSections: [
      {
        content: structuredContent,
        targetFolder: targetPath,
        reasoning: reasoning,
        thoughtIds: unorganizedThoughts.map((_, index) => index + 1)
      }
    ]
  }
}

async function executeOrganizationPlan(
  supabase: any, 
  userId: string, 
  currentNote: any, 
  plan: any, 
  fileTree: any[],
  unorganizedThoughts: any[]
) {
  console.log('Executing brain state organization plan:', plan)

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

    // Convert content to TipTap format if it's a string
    let noteContent = section.content
    if (typeof section.content === 'string') {
      // Convert markdown-style content to TipTap format
      noteContent = convertMarkdownToTipTap(section.content)
    }

<<<<<<< HEAD
    // Check if the target file already exists in organized tree
=======
    // Check if the target file already exists and is organized
>>>>>>> 2c0e738 (Organise working)
    const existingNote = fileTree.find(item => 
      item.type === 'file' && 
      item.organized === true &&
      item.title === pathResult.fileName && 
      item.parent_uuid === pathResult.parentFolderId &&
      item.organized === true // Only merge with organized files
    )

    if (existingNote) {
<<<<<<< HEAD
      // APPEND content to existing organized note instead of replacing
      console.log(`Appending to existing organized note: ${pathResult.fileName}`)
=======
      // Merge content into existing organized note
      console.log(`Merging content into existing organized note: ${pathResult.fileName}`)
>>>>>>> 2c0e738 (Organise working)
      
      // Get the current content of the existing note
      const { data: currentNoteData, error: fetchError } = await supabase
        .from('pages')
        .select('content')
        .eq('uuid', existingNote.uuid)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch existing note content: ${fetchError.message}`)
      }

      // Merge the existing content with new content
      const mergedContent = mergeContentWithExisting(currentNoteData.content, noteContent)
      
      const { data: updatedNote, error: updateError } = await supabase
        .from('pages')
        .update({
          content: mergedContent, // Use merged content instead of replacing
          metadata: {
            ...existingNote.metadata,
            lastBrainStateOrganizedAt: new Date().toISOString(),
            organizationReasoning: section.reasoning,
            organizedThoughtIds: [
              ...(existingNote.metadata?.organizedThoughtIds || []),
              ...(section.thoughtIds || [])
            ],
            originalNoteId: currentNote.uuid,
            organizeStatus: 'yes' // Ensure organize status is set for cache refresh
          }
        })
        .eq('uuid', existingNote.uuid)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Failed to update existing organized note: ${updateError.message}`)
      }

      results.organizedNotes.push({
        noteId: existingNote.uuid,
        title: pathResult.fileName,
        folderPath: targetFolderPath,
        action: 'appended'
      })
    } else {
      // Create a new organized note with organized = true
      console.log(`Creating new organized note: ${pathResult.fileName}`)
      
      const { data: newNote, error: noteError } = await supabase
        .from('pages')
        .insert({
          title: pathResult.fileName,
          user_id: userId,
          content: noteContent,
          parent_uuid: pathResult.parentFolderId,
<<<<<<< HEAD
          type: 'file',
          organized: true,
          visible: true,
=======
          organized: true, // Set organized to true for new files
>>>>>>> 2c0e738 (Organise working)
          metadata: { 
            originalNoteId: currentNote.uuid,
            organizationReasoning: section.reasoning,
            organizedThoughtIds: section.thoughtIds || [],
            createdFromBrainState: true,
            brainStateOrganizedAt: new Date().toISOString(),
            organizeStatus: 'yes' // Set organize status so it appears in loadRelevantNotes
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

    // Mark the processed thoughts as organized
    if (section.thoughtIds && Array.isArray(section.thoughtIds)) {
      const organizedThoughtIds = section.thoughtIds
      console.log(`Marking ${organizedThoughtIds.length} thoughts as organized`)
      
      // Note: This would need to be handled by your brain state system
      // You might want to return this info to update the brain state
      results.organizedNotes[results.organizedNotes.length - 1].organizedThoughtIds = organizedThoughtIds
    }

    console.log('Created/updated organized note in folder path:', targetFolderPath)
  }

  console.log('Brain state organization plan executed successfully')
  
  return results
}

async function createNestedFolderPath(
  supabase: any, 
  userId: string, 
  fullPath: string, 
  fileTree: any[]
): Promise<{parentFolderId: string | null, fileName: string, isNewFolder: boolean} | null> {
  // Split the path - last part is filename, everything else are folders
  const pathParts = fullPath.split('/').map(name => name.trim())
  const fileName = pathParts[pathParts.length - 1] // Last part is the file name
  const folderNames = pathParts.slice(0, -1) // Everything except last part are folders
  
  let currentParentId: string | null = null
  let isNewFolder = false
  
  // Process each folder in the path (excluding the filename)
  for (let i = 0; i < folderNames.length; i++) {
    const folderName = folderNames[i]
    
    // Look for existing organized folder at this level
    let existingFolder = fileTree.find(item => 
      item.type === 'folder' && 
      item.organized === true &&
      item.title === folderName && 
      item.parent_uuid === currentParentId
    )
    
    if (!existingFolder) {
<<<<<<< HEAD
      // Create the organized folder
=======
      // Create the folder with organized = true
>>>>>>> 2c0e738 (Organise working)
      const { data: newFolder, error: folderError } = await supabase
        .from('pages')
        .insert({
          title: folderName,
          user_id: userId,
          content: { type: 'doc', content: [] },
          parent_uuid: currentParentId,
<<<<<<< HEAD
          type: 'folder',
          organized: true,
          visible: true,
          metadata: {
            organizeStatus: 'yes' // Set organize status so folders appear in loadRelevantNotes
          }
=======
          organized: true, // Set organized to true for new folders
          metadata: { isFolder: true }
>>>>>>> 2c0e738 (Organise working)
        })
        .select()
        .single()

      if (folderError) {
<<<<<<< HEAD
        console.error(`Failed to create organized folder "${folderName}":`, folderError)
        return { parentFolderId: null, fileName, isNewFolder: false }
=======
        console.error(`Failed to create folder "${folderName}":`, folderError)
        return null
>>>>>>> 2c0e738 (Organise working)
      }
      
      existingFolder = newFolder
      isNewFolder = true
      console.log(`Created new organized folder: ${folderName}`)
      
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

function convertMarkdownToTipTap(markdownContent: string): any {
  // Simple markdown to TipTap conversion
  // This is a basic implementation - you might want to use a proper markdown parser
  const lines = markdownContent.split('\n')
  const content: any[] = []
  
  for (const line of lines) {
    if (line.trim() === '') {
      // Empty line
      content.push({
        type: 'paragraph',
        content: []
      })
    } else if (line.startsWith('# ')) {
      // Heading 1
      content.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: line.substring(2) }]
      })
    } else if (line.startsWith('## ')) {
      // Heading 2
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.substring(3) }]
      })
    } else if (line.startsWith('### ')) {
      // Heading 3
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.substring(4) }]
      })
    } else if (line.trim() === '---') {
      // Horizontal rule
      content.push({
        type: 'horizontalRule'
      })
    } else {
      // Regular paragraph
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }]
      })
    }
  }
  
  return {
    type: 'doc',
    content: content
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

function mergeContentWithExisting(existingContent: any, newContent: any): any {
  // Handle case where existing content is empty or invalid
  if (!existingContent || !existingContent.content || !Array.isArray(existingContent.content)) {
    return newContent
  }
  
  // Handle case where new content is empty or invalid
  if (!newContent || !newContent.content || !Array.isArray(newContent.content)) {
    return existingContent
  }
  
  // Add a separator between existing and new content
  const separator = {
    type: 'horizontalRule'
  }
  
  // Add a timestamp header for the new content
  const timestampHeader = {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: `--- Added ${new Date().toLocaleDateString()} ---`,
        marks: [{ type: 'italic' }]
      }
    ]
  }
  
  // Merge the content arrays
  const mergedContent = {
    type: 'doc',
    content: [
      ...existingContent.content,
      separator,
      timestampHeader,
      ...newContent.content
    ]
  }
  
  return mergedContent
} 