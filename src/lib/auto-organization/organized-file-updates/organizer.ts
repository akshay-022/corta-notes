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

  return `Route to ALL RELEVANT FILES. Content can go to MULTIPLE files if relevant. Never route to folders. Create new file if needed.

MULTIPLE DESTINATIONS STRATEGY:
• Send content to ALL relevant files - don't pick just one
• Same content can appear in multiple files if it fits
• Better to duplicate than miss important places

PAGE: "${pageTitle}"

PARAGRAPHS:
${list}

OUTPUT: JSON array - duplicate content to multiple files if relevant
[{ "targetFilePath": "/Path1", "content": "condensed bullets" }, { "targetFilePath": "/Path2", "content": "same condensed bullets" }]

• Content = direct like "TODO: 1. Fix login bug 2. Test payment flow"
• NO explanations or overviews
• 5-10 words per bullet (brief but clear)
• Normal file names (no .md extensions)
• Keep all important info, just condensed
• REPEAT same content for each relevant destination`
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

  return `Route to ALL RELEVANT existing [FILE]s. Content can go to MULTIPLE files if relevant. Only create new [FILE] if nothing fits. NEVER route to [DIR]s.

MULTIPLE DESTINATIONS STRATEGY:
• DUPLICATE content to ALL relevant files - don't pick just one "best" match
• Same content can appear in multiple files (Project Notes, Bug Tracker, Daily Tasks, etc.)
• Better to have content in multiple relevant places than miss it somewhere
• Each relevant file gets its own JSON object with the SAME content

PAGE: "${pageTitle}"

FILE TREE:
${fileTreeContext}

PARAGRAPHS:
${list}${organizationRulesSection}

OUTPUT:
• JSON array: [{ "targetFilePath": "/Path1", "relevance": 0.9, "content": "same content" }, { "targetFilePath": "/Path2", "relevance": 0.8, "content": "same content" }]
• Content = direct bullets like "TODO: 1. Fix login bug in auth system 2. Test payment flow 3. Deploy to staging"
• NO explanations or overviews
• 5-10 words per bullet (brief but clear)
• Keep original tone/urgency
• Normal file names (no .md, no kebab-case)
• REPEAT the same content for each relevant destination

EXAMPLE:
If "Fix API bug" is relevant to both "Bug Tracker" and "Current Sprint":
[
  { "targetFilePath": "/Bug Tracker", "relevance": 0.9, "content": "TODO: 1. Fix API authentication bug" },
  { "targetFilePath": "/Current Sprint", "relevance": 0.8, "content": "TODO: 1. Fix API authentication bug" }
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