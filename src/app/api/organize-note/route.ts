import { createClient } from '@/lib/supabase/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge';

interface ParagraphEdit {
  id: string;
  lineId: string;
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
  updated_at?: string;
  created_at?: string;
  sourceParagraphs?: { pageId: string; paragraphId: string }[];
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
    
    // Create file history items
    const fileHistoryItems = [
      ...results.updatedPages.map(page => ({
        uuid: page.uuid,
        title: page.title,
        action: 'updated' as const,
        timestamp: Date.now()
      })),
      ...results.newPages.map(page => ({
        uuid: page.uuid,
        title: page.title,
        action: 'created' as const,
        timestamp: Date.now()
      }))
    ]
    // ------------------------------------------------------------------
    // Build sourceParagraphs for each destination page
    // ------------------------------------------------------------------
    const allDestPages: OrganizedPage[] = [...results.updatedPages, ...results.newPages]

    // Helper: quick lookup dest page by its full path
    const pathToPage = new Map<string, OrganizedPage>()
    allDestPages.forEach(p => {
      const path = getFullPath(p, organizedPages)
      pathToPage.set(path, p)
    })

    // Aggregate source paragraphs per destination page
    const pageSources: Record<string, { pageId: string; paragraphId: string }[]> = {}

    editMappings.forEach(mapping => {
      // Only consider mappings that actually insert content into a page
      if (mapping.action === 'update_existing' || mapping.action === 'create_file') {
        const destPage = pathToPage.get(mapping.path)
        if (!destPage) return

        const edit = edits.find(e => e.lineId === mapping.editId)
        if (!edit) return

        if (!pageSources[destPage.uuid]) pageSources[destPage.uuid] = []
        pageSources[destPage.uuid].push({ pageId: edit.pageId, paragraphId: edit.lineId })
      }
    })

    // Attach to pages
    allDestPages.forEach(p => {
      p.sourceParagraphs = pageSources[p.uuid] || []
    })
    
    // Create notification message
    const updatedCount = results.updatedPages.length
    const newCount = results.newPages.length
    const newFileNames = results.newPages.map(page => page.title)
    
    let notificationMessage = ''
    if (updatedCount > 0 && newCount > 0) {
      notificationMessage = `Updated ${updatedCount} file${updatedCount > 1 ? 's' : ''}, created ${newFileNames.join(', ')}`
    } else if (updatedCount > 0) {
      notificationMessage = `Updated ${updatedCount} file${updatedCount > 1 ? 's' : ''}`
    } else if (newCount > 0) {
      notificationMessage = `Created ${newFileNames.join(', ')}`
    } else {
      notificationMessage = 'No changes made'
    }
    
    return NextResponse.json({
      updatedPages: results.updatedPages,
      newPages: results.newPages,
      summary: `Successfully organized ${edits.length} edits into ${results.updatedPages.length + results.newPages.length} pages`,
      processedEditIds: edits.map(edit => edit.lineId),
      fileHistory: fileHistoryItems
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
  
  // Get existing files for reference
  const existingFiles = organizedPages.filter(page => page.type === 'file' && page.organized === true)
  
  // Prepare edits for AI analysis
  const editsContent = edits.map((edit, index) => 
    `${index + 1}. ID: ${edit.lineId}
   Content: "${edit.content}"
   Page: ${edit.pageId}
   Paragraph ID: ${edit.lineId}
   Type: ${edit.editType}
   Timestamp: ${new Date(edit.timestamp).toLocaleDateString()}`
  ).join('\n\n')
  
  // Prepare list of existing files for the AI
  const existingFilePaths = existingFiles.map(file => ({
    path: getFullPath(file, organizedPages),
    title: file.title,
    contentPreview: file.content_text.substring(0, 200) + (file.content_text.length > 200 ? '...' : '')
  }))
  
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
            content: `You are an intelligent content organizer. Your job is to efficiently group ${edits.length} edits into the optimal number of files.

CORE PRINCIPLE: Group N edits into M files where N >= M (multiple edits can go to the same file when they're related).

ORGANIZATION STRATEGY:
1. ANALYZE CONTENT SIMILARITY: Group similar/related edits together
2. USE EXISTING FILES: Prefer adding to existing relevant files when content fits
3. CREATE NEW FILES: Only when content represents a distinct new topic that doesn't fit existing files
4. BE EFFICIENT: Don't create unnecessary files - group related content together

DECISION PROCESS:
- If edits relate to existing file content: add to that file
- If multiple edits are similar to each other: group them into one file (existing or new)
- If edit is unique and substantial: consider new file
- If edit is short/minor: add to most relevant existing file

IMPORTANT: Respond with ONLY a valid JSON array in this exact format:
[
  {
    "content": "the edit content (keep original)",
    "path": "/full/path/to/file",
    "editId": "edit-id-from-input",
    "action": "update_existing|create_file",
    "parentPath": "/parent/path (for new files only)",
    "reasoning": "brief reason for this decision",
    "integrationStrategy": "append|integrate|new_section"
  }
]

RULES:
1. For "update_existing": Use exact paths from the existing files list
2. For "create_file": Suggest meaningful file names and appropriate parent folders
3. Group related edits efficiently - don't create separate files for similar content
4. Keep original edit content intact
5. Provide clear reasoning for each decision
6. Respond with ONLY the JSON array, no markdown or extra text`
          },
          {
            role: 'user',
            content: `Here are ${edits.length} edits to organize efficiently:

${editsContent}

EXISTING FILES you can use:
${existingFilePaths.map(file => `- ${file.path}
  Title: ${file.title}
  Content preview: ${file.contentPreview}`).join('\n\n')}

Current file tree structure:
${JSON.stringify(fileTree, null, 2)}

Please organize these ${edits.length} edits efficiently:
1. Group similar/related edits together when possible
2. Use existing files when content is relevant
3. Create new files only when content represents distinct new topics
4. Aim for efficient grouping (N edits → M files where N >= M)
5. Provide clear reasoning for each decision

Focus on content similarity and logical grouping rather than creating many separate files.`
          }
        ],
        temperature: 0.1,
        max_tokens: 3000
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

    // Validate and process mappings
    const validatedMappings = validateAndProcessMappings(mappings, existingFilePaths.map(f => f.path), edits, organizedPages)

    console.log('Processed edit mappings:', validatedMappings)
    return validatedMappings

  } catch (error) {
    console.error('Error calling GPT-4o for edit mapping:', error)
    
    // Fallback to intelligent grouping
    console.log('Falling back to intelligent grouping...')
    return createIntelligentFallbackMappings(edits, organizedPages)
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

function validateAndProcessMappings(mappings: EditMapping[], existingFilePaths: string[], edits: ParagraphEdit[], organizedPages: OrganizedPage[]): EditMapping[] {
  const validatedMappings: EditMapping[] = []
  const processedEditIds = new Set<string>()
  
  for (const mapping of mappings) {
    if (mapping.action === 'update_existing') {
      // Validate that the path exists
      if (existingFilePaths.includes(mapping.path)) {
        validatedMappings.push(mapping)
        processedEditIds.add(mapping.editId)
      } else {
        console.warn(`Invalid existing path: ${mapping.path}, will handle in fallback`)
      }
    } else if (mapping.action === 'create_file') {
      // Validate new file creation parameters
      if (mapping.path && mapping.path.trim()) {
        validatedMappings.push(mapping)
        processedEditIds.add(mapping.editId)
      } else {
        console.warn(`Invalid new file path: ${mapping.path}, will handle in fallback`)
      }
    }
  }
  
  // Handle any unmapped edits with fallback logic
  const unmappedEdits = edits.filter(edit => !processedEditIds.has(edit.lineId))
  if (unmappedEdits.length > 0) {
    console.log(`Handling ${unmappedEdits.length} unmapped edits with fallback logic`)
    const fallbackMappings = createIntelligentFallbackMappings(unmappedEdits, organizedPages)
    validatedMappings.push(...fallbackMappings)
  }
  
  return validatedMappings
}

function createIntelligentFallbackMappings(edits: ParagraphEdit[], organizedPages: OrganizedPage[]): EditMapping[] {
  const existingFiles = organizedPages.filter(page => page.type === 'file' && page.organized === true)
  const mappings: EditMapping[] = []
  
  // Group edits by content similarity
  const editGroups = groupEditsBySimilarity(edits)
  
  for (const group of editGroups) {
    if (group.length === 1) {
      // Single edit - try to find best existing file match
      const edit = group[0]
      const bestMatch = findBestMatchingFile(edit, existingFiles, organizedPages)
      
      if (bestMatch) {
        mappings.push({
          content: edit.content,
          path: getFullPath(bestMatch, organizedPages),
          editId: edit.lineId,
          action: 'update_existing',
          reasoning: 'Fallback: Added to most similar existing file',
          integrationStrategy: 'append'
        })
      } else {
        // No good match - create new file if content is substantial
        if (edit.content.length > 50) {
          const fileName = generateFileNameFromContent(edit.content)
          mappings.push({
            content: edit.content,
            path: `/${fileName}`,
            editId: edit.lineId,
            action: 'create_file',
            reasoning: 'Fallback: Created new file for substantial unique content',
            integrationStrategy: 'append'
          })
        } else {
          // Short content - add to most relevant existing file or create a "Quick Notes" file
          if (existingFiles.length > 0) {
            const mostRecentFile = existingFiles.sort((a, b) => 
              new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
            )[0]
            mappings.push({
              content: edit.content,
              path: getFullPath(mostRecentFile, organizedPages),
              editId: edit.lineId,
              action: 'update_existing',
              reasoning: 'Fallback: Short content added to most recent file',
              integrationStrategy: 'append'
            })
          } else {
            // No existing files - create a Quick Notes file
            mappings.push({
              content: edit.content,
              path: '/Quick Notes',
              editId: edit.lineId,
              action: 'create_file',
              reasoning: 'Fallback: Created Quick Notes file as no existing files found',
              integrationStrategy: 'append'
            })
          }
        }
      }
    } else {
      // Multiple similar edits - group them together
      const combinedContent = group.map(edit => edit.content).join('\n\n')
      const representativeEdit = group[0]
      
      // Try to find existing file that matches any of the edits
      let bestMatch: OrganizedPage | null = null
      let bestSimilarity = 0
      
      for (const edit of group) {
        const match = findBestMatchingFile(edit, existingFiles, organizedPages)
        if (match) {
          const similarity = calculateSimpleTextSimilarity(edit.content, match.content_text)
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity
            bestMatch = match
          }
        }
      }
      
      if (bestMatch && bestSimilarity > 0.3) {
        // Add grouped content to existing file
        group.forEach(edit => {
          mappings.push({
            content: edit.content,
            path: getFullPath(bestMatch!, organizedPages),
            editId: edit.lineId,
            action: 'update_existing',
            reasoning: 'Fallback: Grouped similar edits into existing file',
            integrationStrategy: 'append'
          })
        })
      } else {
        // Create new file for the group
        const fileName = generateFileNameFromContent(combinedContent)
        group.forEach(edit => {
          mappings.push({
            content: edit.content,
            path: `/${fileName}`,
            editId: edit.lineId,
            action: 'create_file',
            reasoning: 'Fallback: Created new file for grouped similar content',
            integrationStrategy: 'append'
          })
        })
      }
    }
  }
  
  return mappings
}

function groupEditsBySimilarity(edits: ParagraphEdit[]): ParagraphEdit[][] {
  if (edits.length <= 1) return [edits]
  
  const groups: ParagraphEdit[][] = []
  const processed = new Set<string>()
  
  for (const edit of edits) {
    if (processed.has(edit.lineId)) continue
    
    const group = [edit]
    processed.add(edit.lineId)
    
    // Find similar edits
    for (const otherEdit of edits) {
      if (processed.has(otherEdit.lineId)) continue
      
      const similarity = calculateSimpleTextSimilarity(edit.content, otherEdit.content)
      if (similarity > 0.4) { // 40% similarity threshold for grouping
        group.push(otherEdit)
        processed.add(otherEdit.lineId)
      }
    }
    
    groups.push(group)
  }
  
  return groups
}

function findBestMatchingFile(edit: ParagraphEdit, existingFiles: OrganizedPage[], organizedPages: OrganizedPage[]): OrganizedPage | null {
  if (existingFiles.length === 0) return null
  
  let bestMatch: OrganizedPage | null = null
  let bestSimilarity = 0
  
  for (const file of existingFiles) {
    const similarity = calculateSimpleTextSimilarity(edit.content, file.content_text)
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = file
    }
  }
  
  // Only return match if similarity is above a reasonable threshold
  return bestSimilarity > 0.2 ? bestMatch : null
}

function calculateSimpleTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0
  
  const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

function generateFileNameFromContent(content: string): string {
  // Extract potential title from first line or sentence
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine.length <= 50) {
      return firstLine.replace(/[^\w\s]/g, '').trim()
    }
  }
  
  // Extract first few words
  const words = content.split(/\s+/).filter(w => w.length > 0).slice(0, 5)
  let fileName = words.join(' ').replace(/[^\w\s]/g, '').trim()
  
  if (fileName.length === 0) {
    fileName = `Notes ${new Date().toLocaleDateString().replace(/\//g, '-')}`
  }
  
  return fileName.length > 50 ? fileName.substring(0, 50) : fileName
}

function createFallbackMappings(edits: ParagraphEdit[], organizedPages: OrganizedPage[]): EditMapping[] {
  // This function is now replaced by createIntelligentFallbackMappings
  return createIntelligentFallbackMappings(edits, organizedPages)
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
  
  // Separate mappings by action type
  const updateMappings = mappings.filter(m => m.action === 'update_existing')
  const createFileMappings = mappings.filter(m => m.action === 'create_file')
  
  // First, create any new files
  for (const fileMapping of createFileMappings) {
    const newPage = await createNewFile(supabase, userId, fileMapping, organizedPages)
    if (newPage) {
      newPages.push(newPage)
      organizedPages.push(newPage) // Add to the list for subsequent operations
    }
  }
  
  // Then handle updates to existing files
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
    const existingPage = organizedPages.find(page => getFullPath(page, organizedPages) === path)
    
    if (existingPage) {
      // Combine all content for this path
      const combinedContent = pathMappings.map(m => m.content).join('\n\n')
      
      // Determine integration strategy
      const integrationStrategy = pathMappings.some(m => m.integrationStrategy === 'integrate') 
        ? 'integrate' 
        : pathMappings.some(m => m.integrationStrategy === 'new_section') 
        ? 'new_section' 
        : 'append'
      
      let updatedContentText: string
      let updatedContent: any
      
      if (integrationStrategy === 'integrate') {
        updatedContentText = integrateContentIntelligently(existingPage.content_text, combinedContent)
        updatedContent = createIntegratedTipTapContent(existingPage.content, pathMappings)
      } else if (integrationStrategy === 'new_section') {
        updatedContentText = existingPage.content_text + '\n\n## New Updates\n\n' + combinedContent
        updatedContent = createNewSectionTipTapContent(existingPage.content, pathMappings)
      } else {
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
      console.error(`Could not find existing page for path: ${path}`)
    }
  }
  
  console.log(`Updated ${updatedPages.length} pages, created ${newPages.length} new pages`)
  return { updatedPages, newPages }
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