import { createClient } from '@/lib/supabase/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge';

interface ParagraphEdit {
  id: string;
  paragraphId: string;
  pageId: string;
  content: string;
  timestamp: number;
  editType: 'create' | 'update' | 'delete';
  organized?: boolean;
  metadata?: {
    wordCount: number;
    charCount: number;
  };
}

interface OrganizedPage {
  uuid: string;
  title: string;
  content: any;
  content_text: string;
  organized: boolean;
  type: 'file' | 'folder';
  parent_uuid?: string;
  tags?: string[];
  category?: string;
}

interface OrganizationRequest {
  edits: ParagraphEdit[];
  currentSummary: string;
  existingPages: OrganizedPage[];
  config: {
    preserveAllInformation: boolean;
    createNewPagesThreshold: number;
    maxSimilarityForMerge: number;
    contextWindowSize: number;
  };
}

interface EditMapping {
  content: string;
  path: string;
  editId: string;
  action: 'update_existing' | 'create_file' | 'create_folder';
  parentPath?: string; // For new files/folders
  reasoning?: string;
  integrationStrategy?: 'append' | 'integrate' | 'new_section';
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body - expecting the new thought-tracking format
    const body = await request.json()
    
    // Handle both old and new formats for backward compatibility
    let edits: ParagraphEdit[] = []
    let existingPages: OrganizedPage[] = []
    
    if (body.type === 'organize_content' && body.request) {
      // New thought-tracking format
      const { request: orgRequest } = body
      edits = orgRequest.edits || []
      existingPages = orgRequest.existingPages || []
    } else {
      // Legacy format - convert to new format
      return NextResponse.json({ error: 'Legacy format not supported. Please use the new thought-tracking format.' }, { status: 400 })
    }

    if (!edits || edits.length === 0) {
      return NextResponse.json({
        updatedPages: [],
        newPages: [],
        summary: 'No edits to organize',
        processedEditIds: []
      })
    }

    console.log(`Organizing ${edits.length} edits using AI...`)

    // Get organized file tree from existing pages
    const organizedPages = existingPages.filter(page => page.organized === true)
    
    // Use AI to map each edit to a file path
    const editMappings = await mapEditsToFilePaths(edits, organizedPages)
    
    // Execute the mappings - append content to the specified files
    const results = await executeEditMappings(supabase, user.id, editMappings, organizedPages)
    
    return NextResponse.json({
      updatedPages: results.updatedPages,
      newPages: results.newPages,
      summary: `Successfully organized ${edits.length} edits into ${results.updatedPages.length + results.newPages.length} pages`,
      processedEditIds: edits.map(edit => edit.id)
    })

  } catch (error) {
    console.error('Error organizing edits:', error)
    return NextResponse.json(
      { error: 'Failed to organize edits' }, 
      { status: 500 }
    )
  }
}

async function mapEditsToFilePaths(edits: ParagraphEdit[], organizedPages: OrganizedPage[]): Promise<EditMapping[]> {
  console.log('Mapping edits to file paths using GPT-4o...')
  
  // Create a clean file tree structure for the AI
  const fileTree = createFileTreeStructure(organizedPages)
  
  // Get only existing files (not folders) for mapping
  const existingFiles = organizedPages.filter(page => page.type === 'file' && page.organized === true)
  
  // Note: General file will be created during execution if needed
  
  // Prepare edits for AI analysis
  const editsContent = edits.map((edit, index) => 
    `${index + 1}. ID: ${edit.id}
   Content: "${edit.content}"
   Page: ${edit.pageId}
   Type: ${edit.editType}
   Timestamp: ${new Date(edit.timestamp).toLocaleDateString()}`
  ).join('\n\n')
  
  // Prepare list of existing files for the AI
  const existingFilePaths = existingFiles.map(file => getFullPath(file, organizedPages))
  
  try {
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
            content: `You are an intelligent content organizer. Your job is to organize edits into the most appropriate locations, preferring existing files but creating new ones when necessary.

ORGANIZATION STRATEGY:
- PREFER EXISTING FILES: Try to fit content into existing relevant files first
- CREATE SPARINGLY: Only create new files/folders when content doesn't fit well
- MAINTAIN COHERENCE: Keep related content together

IMPORTANT: Respond with ONLY a valid JSON array in this exact format:
[
  {
    "content": "the edit content (keep original)",
    "path": "/full/path/to/file",
    "editId": "edit-id-from-input",
    "action": "update_existing|create_file|create_folder",
    "parentPath": "/parent/path (for new files/folders)",
    "reasoning": "brief reason for this decision",
    "integrationStrategy": "append|integrate|new_section"
  }
]

ACTION TYPES:
- "update_existing": Add to an existing file from the provided list
- "create_file": Create a new file (use sparingly)
- "create_folder": Create a new folder (very rare, only for major new topics)

RULES:
1. For update_existing: Use paths from EXISTING FILES list
2. For create_file: Suggest appropriate new file name and parent folder
3. For create_folder: Only when content represents major new topic area
4. Prioritize content relevance and similarity
5. Use "/General" as fallback for update_existing only
6. Keep original edit content intact
7. Respond with ONLY the JSON array, no markdown or extra text`
          },
          {
            role: 'user',
            content: `Here are the edits to organize:

${editsContent}

EXISTING FILES (you can ONLY use these paths):
${existingFilePaths.map(path => `- ${path}`).join('\n')}

Current organized file tree structure:
${JSON.stringify(fileTree, null, 2)}

Please organize each edit optimally. Focus on:
1. Content relevance and similarity to existing files
2. Prefer updating existing files when content fits well
3. Create new files only when content represents distinct topics
4. Create folders very rarely, only for major new topic areas
5. Use "/General" as fallback for update_existing only
6. Provide clear reasoning for each decision

Consider the existing file structure and content when making decisions.`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
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

    console.log('GPT-4o mapping response:', gptResponse)

    // Clean and parse the JSON response
    const cleanedJson = cleanGPTJsonResponse(gptResponse)
    const mappings = JSON.parse(cleanedJson) as EditMapping[]

    // Validate that all mappings use existing files only
    const validatedMappings = validateMappings(mappings, existingFilePaths, edits)

    console.log('Validated edit mappings:', validatedMappings)
    return validatedMappings

  } catch (error) {
    console.error('Error calling GPT-4o for edit mapping:', error)
    
    // Fallback to simple mapping if AI fails
    console.log('Falling back to simple edit mapping...')
    return createFallbackMappings(edits, organizedPages)
  }
}

function createFileTreeStructure(organizedPages: OrganizedPage[]): any {
  // Build a hierarchical structure showing the organized file tree
  const buildHierarchy = (items: OrganizedPage[], parentId: string | null = null): any[] => {
    return items
      .filter(item => item.parent_uuid === parentId)
      .map(item => {
        const node: any = {
          id: item.uuid,
          name: item.title,
          type: item.type,
          path: getFullPath(item, organizedPages)
        }
        
        if (item.type === 'folder') {
          const children = buildHierarchy(items, item.uuid)
          if (children.length > 0) {
            node.children = children
          }
        }
        
        return node
      })
  }
  
  return buildHierarchy(organizedPages)
}

function getFullPath(page: OrganizedPage, allPages: OrganizedPage[]): string {
  const path: string[] = []
  let currentPage: OrganizedPage | null = page
  
  // Build path by traversing up the parent chain
  while (currentPage) {
    path.unshift(currentPage.title)
    
    if (currentPage.parent_uuid) {
      currentPage = allPages.find(p => p.uuid === currentPage!.parent_uuid) || null
    } else {
      currentPage = null
    }
  }
  
  return '/' + path.join('/')
}

function cleanGPTJsonResponse(response: string): string {
  // Remove markdown code blocks
  let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  
  // Remove any text before the first [ or {
  const jsonStart = Math.min(
    cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity,
    cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity
  )
  
  if (jsonStart !== Infinity) {
    cleaned = cleaned.substring(jsonStart)
  }
  
  // Remove any text after the last ] or }
  const jsonEnd = Math.max(
    cleaned.lastIndexOf(']'),
    cleaned.lastIndexOf('}')
  )
  
  if (jsonEnd !== -1) {
    cleaned = cleaned.substring(0, jsonEnd + 1)
  }
  
  return cleaned.trim()
}

function createFallbackMappings(edits: ParagraphEdit[], organizedPages: OrganizedPage[]): EditMapping[] {
  // Get existing files only
  const existingFiles = organizedPages.filter(page => page.type === 'file' && page.organized === true)
  
  // Find or use General file as default
  const generalFile = existingFiles.find(page => page.title.toLowerCase() === 'general')
  const generalPath = generalFile ? getFullPath(generalFile, organizedPages) : '/General'
  
  return edits.map(edit => {
    // Try to find an existing file that might be related
    const relatedFile = existingFiles.find(page => {
      const contentWords = edit.content.toLowerCase().split(' ')
      const titleWords = page.title.toLowerCase().split(' ')
      const contentText = page.content_text?.toLowerCase() || ''
      
      // Check for keyword matches in title or content
      return contentWords.some(word => 
        word.length > 3 && (
          titleWords.some(titleWord => titleWord.includes(word)) ||
          contentText.includes(word)
        )
      )
    })
    
    if (relatedFile) {
      return {
        content: edit.content,
        path: getFullPath(relatedFile, organizedPages),
        editId: edit.id,
        action: 'update_existing' as const,
        reasoning: 'Fallback: Content similarity detected',
        integrationStrategy: 'append' as const
      }
    } else {
      // Default to General file
      return {
        content: edit.content,
        path: generalPath,
        editId: edit.id,
        action: 'update_existing' as const,
        reasoning: 'Fallback: Added to General file',
        integrationStrategy: 'append' as const
      }
    }
  })
}

async function executeEditMappings(
  supabase: any, 
  userId: string, 
  mappings: EditMapping[], 
  organizedPages: OrganizedPage[]
): Promise<{ updatedPages: OrganizedPage[], newPages: OrganizedPage[] }> {
  console.log('Executing edit mappings...')
  
  const updatedPages: OrganizedPage[] = []
  const newPages: OrganizedPage[] = []
  
  // Ensure General file exists if any mappings use it
  const needsGeneralFile = mappings.some(mapping => mapping.path === '/General')
  if (needsGeneralFile) {
    await ensureGeneralFileExistsInDB(supabase, userId, organizedPages)
  }
  
  // Separate mappings by action type
  const updateMappings = mappings.filter(m => m.action === 'update_existing')
  const createFileMappings = mappings.filter(m => m.action === 'create_file')
  const createFolderMappings = mappings.filter(m => m.action === 'create_folder')
  
  // First, create any new folders
  for (const folderMapping of createFolderMappings) {
    await createNewFolder(supabase, userId, folderMapping, organizedPages)
  }
  
  // Then, create any new files
  for (const fileMapping of createFileMappings) {
    const newPage = await createNewFile(supabase, userId, fileMapping, organizedPages)
    if (newPage) {
      newPages.push(newPage)
      organizedPages.push(newPage) // Add to the list for subsequent operations
    }
  }
  
  // Finally, handle updates to existing files
  // Group update mappings by path to batch updates
  const updateMappingsByPath = updateMappings.reduce((acc, mapping) => {
    if (!acc[mapping.path]) {
      acc[mapping.path] = []
    }
    acc[mapping.path].push(mapping)
    return acc
  }, {} as Record<string, EditMapping[]>)
  
  for (const [path, pathMappings] of Object.entries(updateMappingsByPath)) {
    // Find existing page with this path
    let existingPage = organizedPages.find(page => getFullPath(page, organizedPages) === path)
    
    // If it's the General file and doesn't exist, find it by title
    if (!existingPage && path === '/General') {
      existingPage = organizedPages.find(page => 
        page.type === 'file' && 
        page.title.toLowerCase() === 'general' &&
        page.organized === true
      )
    }
    
    // Combine all content for this path
    const combinedContent = pathMappings.map(m => m.content).join('\n\n')
    
    if (existingPage) {
      // Determine integration strategy - use the most sophisticated strategy from the mappings
      const integrationStrategy = pathMappings.some(m => m.integrationStrategy === 'integrate') 
        ? 'integrate' 
        : pathMappings.some(m => m.integrationStrategy === 'new_section') 
        ? 'new_section' 
        : 'append'
      
      let updatedContentText: string
      let updatedContent: any
      
      if (integrationStrategy === 'integrate') {
        // Smart integration - try to merge content intelligently
        updatedContentText = integrateContentIntelligently(existingPage.content_text, combinedContent)
        updatedContent = createIntegratedTipTapContent(existingPage.content, pathMappings)
      } else if (integrationStrategy === 'new_section') {
        // Add as new section with heading
        updatedContentText = existingPage.content_text + '\n\n## New Updates\n\n' + combinedContent
        updatedContent = createNewSectionTipTapContent(existingPage.content, pathMappings)
      } else {
        // Simple append (default)
        updatedContentText = existingPage.content_text + '\n\n' + combinedContent
        updatedContent = createAppendedTipTapContent(existingPage.content, pathMappings)
      }
      
      const { data: updated, error } = await supabase
        .from('pages')
        .update({
          content: updatedContent,
          content_text: updatedContentText,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', existingPage.uuid)
        .eq('user_id', userId)
        .select()
        .single()
      
      if (error) {
        console.error('Error updating page:', error)
      } else {
        updatedPages.push({
          ...existingPage,
          content: updatedContent,
          content_text: updatedContentText
        })
      }
    } else {
      // This should not happen since we only map to existing files
      // But if it does, skip this mapping and log an error
      console.error(`Attempted to create new file: ${path}. This should not happen with the new constraints.`)
      console.error(`Skipping ${pathMappings.length} edits that were mapped to non-existent file.`)
    }
  }
  
  console.log(`Updated ${updatedPages.length} pages, created ${newPages.length} new pages`)
  return { updatedPages, newPages }
}

async function ensureGeneralFileExistsInDB(
  supabase: any, 
  userId: string, 
  organizedPages: OrganizedPage[]
): Promise<void> {
  // Check if General file already exists
  const generalFile = organizedPages.find(page => 
    page.type === 'file' && 
    page.title.toLowerCase() === 'general' && 
    page.organized === true
  )
  
  if (!generalFile) {
    console.log('Creating General file as it does not exist...')
    
    // Create the General file
    const { data: newGeneralFile, error } = await supabase
      .from('pages')
      .insert({
        title: 'General',
        user_id: userId,
        content: { type: 'doc', content: [] },
        content_text: '',
        parent_uuid: null,
        type: 'file',
        organized: true,
        visible: true,
        metadata: {
          createdFromThoughtTracking: true,
          isDefaultGeneralFile: true,
          createdAt: new Date().toISOString()
        }
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating General file:', error)
    } else {
      // Add to organizedPages for subsequent lookups
      organizedPages.push({
        uuid: newGeneralFile.uuid,
        title: newGeneralFile.title,
        content: newGeneralFile.content,
        content_text: newGeneralFile.content_text,
        organized: true,
        type: 'file',
        parent_uuid: newGeneralFile.parent_uuid
      })
      console.log('General file created successfully')
    }
  }
}

function validateMappings(mappings: EditMapping[], existingFilePaths: string[], edits: ParagraphEdit[]): EditMapping[] {
  const validatedMappings: EditMapping[] = []
  
  for (const mapping of mappings) {
    if (mapping.action === 'update_existing') {
      // Check if the path exists in our existing files list
      if (existingFilePaths.includes(mapping.path) || mapping.path === '/General') {
        validatedMappings.push(mapping)
      } else {
        // Invalid path - redirect to General file
        console.warn(`Invalid path detected: ${mapping.path}, redirecting to General`)
        validatedMappings.push({
          ...mapping,
          path: '/General',
          action: 'update_existing' as const,
          reasoning: 'Redirected to General: Invalid path suggested by AI',
          integrationStrategy: mapping.integrationStrategy || 'append' as const
        })
      }
    } else if (mapping.action === 'create_file' || mapping.action === 'create_folder') {
      // Validate new file/folder creation
      if (mapping.path && mapping.path.trim()) {
        validatedMappings.push(mapping)
      } else {
        // Invalid new path - redirect to General file
        console.warn(`Invalid new path detected: ${mapping.path}, redirecting to General`)
        validatedMappings.push({
          ...mapping,
          path: '/General',
          action: 'update_existing' as const,
          reasoning: 'Redirected to General: Invalid new path suggested by AI',
          integrationStrategy: mapping.integrationStrategy || 'append' as const
        })
      }
    } else {
      // Unknown action - redirect to General file
      console.warn(`Unknown action detected: ${mapping.action}, redirecting to General`)
      validatedMappings.push({
        ...mapping,
        path: '/General',
        action: 'update_existing' as const,
        reasoning: 'Redirected to General: Unknown action type',
        integrationStrategy: mapping.integrationStrategy || 'append' as const
      })
    }
  }
  
  // Ensure all edits are mapped
  const mappedEditIds = new Set(validatedMappings.map(m => m.editId))
  for (const edit of edits) {
    if (!mappedEditIds.has(edit.id)) {
      // Add missing edit to General file
      validatedMappings.push({
        content: edit.content,
        path: '/General',
        editId: edit.id,
        action: 'update_existing' as const,
        reasoning: 'Added to General: Missing from AI response',
        integrationStrategy: 'append' as const
      })
    }
  }
  
  return validatedMappings
}

async function createNewFolder(
  supabase: any,
  userId: string,
  folderMapping: EditMapping,
  organizedPages: OrganizedPage[]
): Promise<OrganizedPage | null> {
  console.log(`Creating new folder: ${folderMapping.path}`)
  
  // Extract folder name from path
  const pathParts = folderMapping.path.split('/').filter(p => p)
  const folderName = pathParts[pathParts.length - 1]
  
  // Find parent folder if specified
  let parentUuid = null
  if (folderMapping.parentPath && folderMapping.parentPath !== '/') {
    const parentPage = organizedPages.find(page => 
      getFullPath(page, organizedPages) === folderMapping.parentPath
    )
    parentUuid = parentPage?.uuid || null
  }
  
  try {
    const { data: newFolder, error } = await supabase
      .from('pages')
      .insert({
        title: folderName,
        user_id: userId,
        content: { type: 'doc', content: [] },
        content_text: folderMapping.content,
        parent_uuid: parentUuid,
        type: 'folder',
        organized: true,
        visible: true,
        metadata: {
          createdFromThoughtTracking: true,
          createdFromEdit: folderMapping.editId,
          createdAt: new Date().toISOString()
        }
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating folder:', error)
      return null
    }
    
    const newPage: OrganizedPage = {
      uuid: newFolder.uuid,
      title: newFolder.title,
      content: newFolder.content,
      content_text: newFolder.content_text,
      organized: true,
      type: 'folder',
      parent_uuid: newFolder.parent_uuid
    }
    
    organizedPages.push(newPage)
    return newPage
  } catch (error) {
    console.error('Error creating new folder:', error)
    return null
  }
}

async function createNewFile(
  supabase: any,
  userId: string,
  fileMapping: EditMapping,
  organizedPages: OrganizedPage[]
): Promise<OrganizedPage | null> {
  console.log(`Creating new file: ${fileMapping.path}`)
  
  // Extract file name from path
  const pathParts = fileMapping.path.split('/').filter(p => p)
  const fileName = pathParts[pathParts.length - 1]
  
  // Find parent folder if specified
  let parentUuid = null
  if (fileMapping.parentPath && fileMapping.parentPath !== '/') {
    const parentPage = organizedPages.find(page => 
      getFullPath(page, organizedPages) === fileMapping.parentPath
    )
    parentUuid = parentPage?.uuid || null
  }
  
  // Create TipTap-compatible content structure
  const content = {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        {
          type: "text",
          text: fileMapping.content
        }
      ]
    }]
  }
  
  try {
    const { data: newFile, error } = await supabase
      .from('pages')
      .insert({
        title: fileName,
        user_id: userId,
        content: content,
        content_text: fileMapping.content,
        parent_uuid: parentUuid,
        type: 'file',
        organized: true,
        visible: true,
        metadata: {
          createdFromThoughtTracking: true,
          createdFromEdit: fileMapping.editId,
          integrationStrategy: fileMapping.integrationStrategy,
          createdAt: new Date().toISOString()
        }
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating file:', error)
      return null
    }
    
    return {
      uuid: newFile.uuid,
      title: newFile.title,
      content: newFile.content,
      content_text: newFile.content_text,
      organized: true,
      type: 'file',
      parent_uuid: newFile.parent_uuid
    }
  } catch (error) {
    console.error('Error creating new file:', error)
    return null
  }
}

function integrateContentIntelligently(existingContent: string, newContent: string): string {
  // Simple intelligent integration - could be enhanced with more sophisticated logic
  // For now, we'll append but with better formatting
  return existingContent + '\n\n' + newContent
}

function createIntegratedTipTapContent(existingContent: any, mappings: EditMapping[]): any {
  // For now, use the same logic as append but could be enhanced for true integration
  return createAppendedTipTapContent(existingContent, mappings)
}

function createNewSectionTipTapContent(existingContent: any, mappings: EditMapping[]): any {
  const newParagraphs = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "New Updates" }]
    },
    ...mappings.map(mapping => ({
      type: "paragraph",
      content: [{ type: "text", text: mapping.content }]
    }))
  ]
  
  return {
    ...existingContent,
    content: [...(existingContent?.content || []), ...newParagraphs]
  }
}

function createAppendedTipTapContent(existingContent: any, mappings: EditMapping[]): any {
  const newParagraphs = mappings.map(mapping => ({
    type: "paragraph",
    content: [{ type: "text", text: mapping.content }]
  }))
  
  return {
    ...existingContent,
    content: [...(existingContent?.content || []), ...newParagraphs]
  }
} 