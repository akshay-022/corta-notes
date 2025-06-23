import { Editor } from '@tiptap/react'
import {
  getAllUnorganizedParagraphs,
  updateMetadataByParagraphId,
  ParagraphMetadata,
  setNewParagraphIds,
} from '@/components/editor/paragraph-metadata'
import logger from '@/lib/logger'
import {
  applyOrganizationChunks,
  OrganizedChunk,
} from '@/lib/auto-organization/organized-file-updates/pageUpdater'
import { createClient } from '@/lib/supabase/supabase-client'
import {
  buildFileTree,
  serializeFileTree,
  OrganizedPageSlim,
} from '@/lib/auto-organization/organized-file-updates/helpers/fileTree'

interface ParagraphInfo {
  id: string
  content: string
}

export interface LLMOrganizationChunk {
  targetFilePath: string
  content: string
}

interface OrganizePageOptions {
  editor: Editor
  pageUuid: string
  pageTitle: string
}

let isOrganizing = false

/**
 * Main entry – send all un-organized paragraphs to the LLM and then mark them as organized.
 */
export async function organizePage({ editor, pageUuid, pageTitle }: OrganizePageOptions) {
  if (isOrganizing) {
    logger.info('Auto-organization already running – skipping', { pageUuid })
    return
  }

  // Ensure every paragraph has metadata.id before we proceed
  setNewParagraphIds(editor, pageUuid)

  const unorganized = getAllUnorganizedParagraphs(editor)
  if (unorganized.length === 0) {
    return // Nothing to do
  }

  // Extract paragraph IDs + content
  const paragraphs: ParagraphInfo[] = unorganized
    .filter((p) => !!p.content.trim())
    .map((p) => ({
      id: p.metadata?.id || '',
      content: p.content.trim(),
    }))
    .filter((p) => p.id)

  if (paragraphs.length === 0) {
    return
  }

  logger.info('Sending paragraphs to LLM for organization', {
    pageUuid,
    pageTitle,
    count: paragraphs.length,
  })

  isOrganizing = true

  try {
    // ---- Step A: routing prompt including file tree ----

    const { fileTreeContext } = await getFileTreeContext()
    const fullPageText = editor.getText()
    
    // Get organization rules from page metadata
    const supabase = createClient()
    const { data: page } = await supabase
      .from('pages')
      .select('metadata')
      .eq('uuid', pageUuid)
      .single()
    
    const pageMetadata = page?.metadata as any
    const organizationRules = pageMetadata?.organizationRules || ''
    
    if (organizationRules) {
      logger.info('Using page organization rules', { pageUuid, rules: organizationRules })
    }
    
    const routingPrompt = buildRoutingPrompt(pageTitle, paragraphs, fileTreeContext, fullPageText, organizationRules)

    let routingResponse: any[] = []
    try {
      routingResponse = await callLLM(routingPrompt)
    } catch (e) {
      logger.error('Routing LLM call failed', { e })
      routingResponse = []
    }

    if (!Array.isArray(routingResponse) || routingResponse.length === 0) {
      logger.warn('Routing LLM returned no paths; defaulting to /Inbox')
      routingResponse = [{ targetFilePath: '/Inbox', relevance: 1 }]
    }

    // Treat routing response as chunks directly (expects content field)
    const chunks: OrganizedChunk[] = routingResponse.filter(
      (c: any) => c.targetFilePath && c.content,
    )

    logger.info('Routing returned chunks', { count: chunks.length })

    const { created, updated } = await applyOrganizationChunks(chunks)
    logger.info('applyOrganizationChunks result', {
      createdCount: created.length,
      updatedCount: updated.length,
    })

    // Mark all paragraphs as organized
    paragraphs.forEach((p) => {
      updateMetadataByParagraphId(editor, p.id, {
        isOrganized: true,
        organizationStatus: 'yes',
      } as Partial<ParagraphMetadata>)
    })

    logger.info('Marked paragraphs as organized', {
      pageUuid,
      count: paragraphs.length,
    })
  } catch (error) {
    logger.error('Auto-organization error', { error })
  } finally {
    isOrganizing = false
  }
}

/* ------------------------------------------------------------------ */

function buildPrompt(pageTitle: string, paragraphs: ParagraphInfo[]): string {
  const list = paragraphs
    .map((p, idx) => `${idx + 1}. ${p.content}`)
    .join('\n')

  return `You are an intelligent knowledge organizer. You MUST MUST MUST only route things into a file and NOT a folder. If there is no file, then create a new file. \n\nPAGE TITLE: "${pageTitle}"\n\nUNORGANIZED PARAGRAPHS:\n${list}\n\nINSTRUCTIONS:\n– Group the ideas logically and rewrite them so each target file/folder receives one coherent \"content\" block.\n– For each destination, output a JSON object with:\n  {\n    \"targetFilePath\": \"/Path/To/Location\",\n    \"content\": \"(merged and refined text)\"\n  }\n– Use normal titles with spaces for file paths (e.g., \"AI Journal\", \"Project Notes\")\n– NEVER use kebab-case, underscores, or .md extensions in file names\n– Files have NO extension.\n– A paragraph may appear in multiple content blocks if it fits multiple places.\n– Preserve all information; order does not matter.\n– Respond with a JSON ARRAY ONLY, no markdown fences, no extra text.`
}

async function callLLM(prompt: string): Promise<LLMOrganizationChunk[]> {
  // Try o3 variants first, fallback to gpt-4o if they fail
  const models = ['o3-mini', 'gpt-4o']
  
  for (const model of models) {
    try {
      const res = await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt,
          model
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        if (model === 'o3') {
          logger.warn(`o3 model failed (${res.status}), trying fallback: ${text}`)
          console.log(`⚠️ Organization LLM: o3 failed (${res.status}), trying gpt-4o fallback`)
          continue // Try next model
        }
        throw new Error(`LLM API error: ${res.status} – ${text}`)
      }

      const data = await res.json()
      const raw = data.response || ''

      // Log the raw response for debugging
      if (model === 'o3-mini') {
        console.log(`🔍 o3-mini raw response:`, { raw: raw.substring(0, 200), fullLength: raw.length })
      }

      // Clean up possible markdown code fences
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      const result = JSON.parse(cleaned) as LLMOrganizationChunk[]
      logger.info(`Organization completed successfully with model: ${model}`)
      console.log(`🤖 Organization LLM: Successfully used ${model} model`)
      return result
      
    } catch (err) {
      if (model === 'o3') {
        logger.warn(`o3 model failed, trying fallback:`, err)
        console.log(`⚠️ Organization LLM: o3 parsing failed, trying gpt-4o fallback`)
        continue // Try next model
      }
      logger.error('Failed to parse LLM JSON', { cleaned: err })
      throw err
    }
  }
  
  throw new Error('All LLM models failed')
}

async function getFileTreeContext() {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { fileTreeContext: '' }

    const { data: pages } = await supabase
      .from('pages')
      .select('uuid,title,type,parent_uuid')
      .eq('user_id', user.id)
      .eq('organized', true)
      .eq('is_deleted', false)

    const slim: OrganizedPageSlim[] = (pages || []).map((p: any) => ({
      uuid: p.uuid,
      title: p.title,
      type: p.type,
      parent_uuid: p.parent_uuid,
    }))

    const tree = buildFileTree(slim)
    return { fileTreeContext: serializeFileTree(tree) }
  } catch (e) {
    logger.error('Failed building file tree context', { e })
    return { fileTreeContext: '' }
  }
}

function buildRoutingPrompt(
  pageTitle: string,
  paragraphs: ParagraphInfo[],
  fileTreeContext: string,
  fullPageText: string,
  organizationRules?: string,
) {
  const list = paragraphs.map((p, i) => `${i + 1}. ${p.content}`).join('\n')
  
  const organizationRulesSection = organizationRules?.trim() ? 
    `\n\nORGANIZATION RULES FOR THIS PAGE:
${organizationRules}

Follow these rules when organizing content.\n` : ''

  return `You are organizing personal notes. You MUST route to existing [FILE]s or create new [FILE]s inside directories. NEVER route to [DIR]s.

PAGE TITLE: "${pageTitle}"

FULL PAGE CONTENT (for context):
"""
${fullPageText.slice(0, 1200)}
"""

CURRENT FILE TREE:
${fileTreeContext}

UNORGANIZED PARAGRAPHS:
${list}${organizationRulesSection}

TASK:
1. Route each paragraph to the best file location based on content and context
2. Group related paragraphs together in the same destination  
3. For each destination return:
   { "targetFilePath": "/Path/To/Location", "relevance": 0.0-1.0, "content": "(organized content)" }
4. Use normal titles with spaces for file paths (e.g., "AI Journal", "Project Notes")
5. NEVER use kebab-case, underscores, or .md extensions in file names
6. Respond ONLY with JSON array (no markdown, no extra text)

CRITICAL CONTENT REQUIREMENTS:
• Write like PERSONAL NOTES - conversational, direct, authentic
• Keep the user's original voice and urgency - don't sanitize their tone
• NO corporate speak, NO "Overview/Summary" sections, NO repetitive content
• BE CONCISE - eliminate fluff and redundancy 
• Focus on actionable insights, not descriptions
• Preserve strong emotions, caps, urgency from original text
• Use simple formatting - basic bullets or lists, not complex structures
• Add clear, concise titles when organizing new sections
• Use \n\n for proper line breaks between topics

BAD: "Overview: This section provides a comprehensive analysis of..."
GOOD: "Need annotation feature - users want control over routing"

Remember: These are PERSONAL NOTES, not business documents. Keep them authentic and useful.

`

}

// Simple wrapper when we need raw text back
async function callLLMText(prompt: string): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: 'o3-mini' }),
  })
  if (!res.ok) {
    throw new Error(`LLM api err ${res.status}`)
  }
  const data = await res.json()
  return (data.response || '').toString()
} 