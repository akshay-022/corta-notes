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
  reasoning?: string;
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
  
  // Prepare edits for AI analysis
  const editsContent = edits.map((edit, index) => 
    `${index + 1}. ID: ${edit.id}
   Content: "${edit.content}"
   Page: ${edit.pageId}
   Type: ${edit.editType}
   Timestamp: ${new Date(edit.timestamp).toLocaleDateString()}`
  ).join('\n\n')
  
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
            content: `You are an intelligent content organizer. Your job is to map each edit to the most appropriate file path based on the organized file tree.

IMPORTANT: Respond with ONLY a valid JSON array in this exact format:
[
  {
    "content": "the edit content (keep original)",
    "path": "/full/path/to/file.md",
    "editId": "edit-id-from-input",
    "reasoning": "brief reason for this location"
  }
]

Rules:
1. Each edit gets mapped to exactly ONE file path
2. Use EXISTING organized files when the content is related
3. Create NEW file paths only when content doesn't fit existing files
4. Path format: "/folder/subfolder/filename" (use "/" separator)
5. Keep original edit content intact - just map to location
6. Consider content similarity, topic, and existing file structure
7. Group related edits into the same file when appropriate
8. Use descriptive filenames for new files
9. Respond with ONLY the JSON array, no markdown or extra text`
          },
          {
            role: 'user',
            content: `Here are the edits to organize:

${editsContent}

Current organized file tree:
${JSON.stringify(fileTree, null, 2)}

Please map each edit to the most appropriate file path. Focus on:
1. Content relevance and similarity
2. Using existing organized files when possible
3. Creating logical new paths when needed
4. Keeping edits grouped by topic/theme`
          }
        ],
        temperature: 0.2,
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

    console.log('Parsed edit mappings:', mappings)
    return mappings

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
  // Simple fallback: group edits by content similarity and create basic mappings
  return edits.map(edit => {
    // Try to find an existing file that might be related
    const relatedFile = organizedPages.find(page => 
      page.type === 'file' && 
      (page.content_text?.toLowerCase().includes(edit.content.toLowerCase().split(' ')[0]) ||
       page.title.toLowerCase().includes(edit.content.toLowerCase().split(' ')[0]))
    )
    
    if (relatedFile) {
      return {
        content: edit.content,
        path: getFullPath(relatedFile, organizedPages),
        editId: edit.id,
        reasoning: 'Fallback: Content similarity detected'
      }
    } else {
      // Create a new file path based on content
      const firstWords = edit.content.split(' ').slice(0, 3).join(' ')
      const filename = firstWords.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-')
      
      return {
        content: edit.content,
        path: `/Organized Notes/${filename || 'New Note'}`,
        editId: edit.id,
        reasoning: 'Fallback: New file created'
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
  
  // Group mappings by path to batch updates
  const mappingsByPath = mappings.reduce((acc, mapping) => {
    if (!acc[mapping.path]) {
      acc[mapping.path] = []
    }
    acc[mapping.path].push(mapping)
    return acc
  }, {} as Record<string, EditMapping[]>)
  
  for (const [path, pathMappings] of Object.entries(mappingsByPath)) {
    // Find existing page with this path
    const existingPage = organizedPages.find(page => getFullPath(page, organizedPages) === path)
    
    // Combine all content for this path
    const combinedContent = pathMappings.map(m => m.content).join('\n\n')
    
    if (existingPage) {
      // Update existing page by appending content
      const updatedContentText = existingPage.content_text + '\n\n' + combinedContent
      
      // Create new TipTap content with appended paragraphs
      const newParagraphs = pathMappings.map(mapping => ({
        type: "paragraph",
        content: [{ type: "text", text: mapping.content }]
      }))
      
      const updatedContent = {
        ...existingPage.content,
        content: [...(existingPage.content?.content || []), ...newParagraphs]
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
      // Create new page
      const pathParts = path.split('/').filter(Boolean)
      const filename = pathParts[pathParts.length - 1]
      const folderPath = pathParts.slice(0, -1)
      
      // Find or create parent folder
      let parentUuid: string | null = null
      if (folderPath.length > 0) {
        parentUuid = await findOrCreateFolderPath(supabase, userId, folderPath, organizedPages)
      }
      
      // Create TipTap content
      const content = {
        type: "doc",
        content: pathMappings.map(mapping => ({
          type: "paragraph",
          content: [{ type: "text", text: mapping.content }]
        }))
      }
      
      const { data: newPage, error } = await supabase
        .from('pages')
        .insert({
          title: filename,
          user_id: userId,
          content: content,
          content_text: combinedContent,
          parent_uuid: parentUuid,
          type: 'file',
          organized: true,
          visible: true,
          metadata: {
            createdFromThoughtTracking: true,
            organizedAt: new Date().toISOString(),
            editMappings: pathMappings.map(m => ({ editId: m.editId, reasoning: m.reasoning }))
          }
        })
        .select()
        .single()
      
      if (error) {
        console.error('Error creating page:', error)
      } else {
        newPages.push({
          uuid: newPage.uuid,
          title: newPage.title,
          content: newPage.content,
          content_text: newPage.content_text,
          organized: true,
          type: 'file',
          parent_uuid: newPage.parent_uuid
        })
      }
    }
  }
  
  console.log(`Updated ${updatedPages.length} pages, created ${newPages.length} new pages`)
  return { updatedPages, newPages }
}

async function findOrCreateFolderPath(
  supabase: any, 
  userId: string, 
  folderPath: string[], 
  organizedPages: OrganizedPage[]
): Promise<string | null> {
  let currentParentId: string | null = null
  
  for (const folderName of folderPath) {
    // Look for existing folder
    let existingFolder = organizedPages.find(page => 
      page.type === 'folder' && 
      page.title === folderName && 
      page.parent_uuid === currentParentId &&
      page.organized === true
    )
    
    if (!existingFolder) {
      // Create new folder
      const { data: newFolder, error }: { data: any, error: any } = await supabase
        .from('pages')
        .insert({
          title: folderName,
          user_id: userId,
          content: { type: 'doc', content: [] },
          content_text: '',
          parent_uuid: currentParentId,
          type: 'folder',
          organized: true,
          visible: true,
          metadata: {
            createdFromThoughtTracking: true,
            isFolder: true
          }
        })
        .select()
        .single()
      
      if (error) {
        console.error('Error creating folder:', error)
        return null
      }
      
      existingFolder = {
        uuid: newFolder.uuid,
        title: newFolder.title,
        content: newFolder.content,
        content_text: newFolder.content_text,
        organized: true,
        type: 'folder',
        parent_uuid: newFolder.parent_uuid
      }
      
      // Add to organizedPages for subsequent lookups
      organizedPages.push(existingFolder)
    }
    
    currentParentId = existingFolder.uuid
  }
  
  return currentParentId
} 