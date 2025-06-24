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
import { 
  TIPTAP_FORMATTING_PROMPT,
  ANTI_NEW_FILE_CREATION_RULES,
  MULTIPLE_DESTINATIONS_STRATEGY,
  MARKDOWN_OUTPUT_RULES
} from '@/lib/promptTemplates'

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

    logger.info('🤖 LLM routing returned chunks', { 
      count: chunks.length,
      targetPaths: chunks.map(c => c.targetFilePath),
      chunks: chunks.map(c => ({ 
        path: c.targetFilePath, 
        contentPreview: c.content.substring(0, 100) + (c.content.length > 100 ? '...' : '') 
      }))
    })

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

  return `Route to ALL RELEVANT existing files. Never route to folders. AVOID CREATING NEW FILES.
${ANTI_NEW_FILE_CREATION_RULES}

PAGE: "${pageTitle}"

PARAGRAPHS:
${list}

${MULTIPLE_DESTINATIONS_STRATEGY}

OUTPUT: JSON array - duplicate content to multiple existing files
[{ "targetFilePath": "/Full/Path1", "content": "proper markdown bullets" }, { "targetFilePath": "/Full/Path2", "content": "same proper markdown bullets" }]

${MARKDOWN_OUTPUT_RULES}
• Normal file names (no .md extensions)
• Keep all important info, just condensed`
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

    logger.info('🌳 Raw pages data from database', { 
      count: pages?.length || 0,
      pages: pages?.map(p => ({ title: p.title, type: p.type, uuid: p.uuid.substring(0, 8) })) || []
    })

    const slim: OrganizedPageSlim[] = (pages || []).map((p: any) => ({
      uuid: p.uuid,
      title: p.title,
      type: p.type,
      parent_uuid: p.parent_uuid,
    }))

    const tree = buildFileTree(slim)
    const serializedTree = serializeFileTree(tree)
    
    logger.info('🌳 Serialized file tree context for LLM', { 
      treeLength: serializedTree.length,
      tree: serializedTree.substring(0, 500) + (serializedTree.length > 500 ? '...' : '')
    })
    
    return { fileTreeContext: serializedTree }
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

  return `Route to ALL RELEVANT existing [FILE]s from the file tree. NEVER route to [DIR]s.
${TIPTAP_FORMATTING_PROMPT}
${ANTI_NEW_FILE_CREATION_RULES}

PAGE: "${pageTitle}"

EXISTING FILE TREE:
${fileTreeContext}

PARAGRAPHS:
${list}${organizationRulesSection}

${MULTIPLE_DESTINATIONS_STRATEGY}

OUTPUT:
• JSON array: [{ "targetFilePath": "/Path1", "relevance": 0.9, "content": "same content" }, { "targetFilePath": "/Path2", "relevance": 0.8, "content": "same content" }]
${MARKDOWN_OUTPUT_RULES}

EXAMPLE:
If "Fix API bug" is relevant to both "/Bug Tracker" and "/Current Sprint" from the file tree:
[
  { "targetFilePath": "/Bug Tracker", "relevance": 0.9, "content": "TODO:\n1. Fix API authentication bug\n2. Test login endpoints\n3. Update security headers" },
  { "targetFilePath": "/Current Sprint", "relevance": 0.8, "content": "TODO:\n1. Fix API authentication bug\n2. Test login endpoints\n3. Update security headers" }
]

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