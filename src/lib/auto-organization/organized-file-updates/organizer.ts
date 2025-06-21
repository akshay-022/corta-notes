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
    const routingPrompt = buildRoutingPrompt(pageTitle, paragraphs, fileTreeContext, fullPageText)

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

  return `You are an intelligent knowledge organizer. You MUST MUST MUST only route things into a file and NOT a folder. If there is no file, then create a new file. \n\nPAGE TITLE: "${pageTitle}"\n\nUNORGANIZED PARAGRAPHS:\n${list}\n\nINSTRUCTIONS:\n– Group the ideas logically and rewrite them so each target file/folder receives one coherent \"content\" block.\n– For each destination, output a JSON object with:\n  {\n    \"targetFilePath\": \"/Path/To/Location\",\n    \"content\": \"(merged and refined text)\"\n  }\n– Files have NO extension.\n– A paragraph may appear in multiple content blocks if it fits multiple places.\n– Preserve all information; order does not matter.\n– Respond with a JSON ARRAY ONLY, no markdown fences, no extra text.`
}

async function callLLM(prompt: string): Promise<LLMOrganizationChunk[]> {
  const res = await fetch('/api/llm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM API error: ${res.status} – ${text}`)
  }

  const data = await res.json()
  const raw = data.response || ''

  // Clean up possible markdown code fences
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as LLMOrganizationChunk[]
  } catch (err) {
    logger.error('Failed to parse LLM JSON', { cleaned })
    throw err
  }
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
) {
  const list = paragraphs.map((p, i) => `${i + 1}. ${p.content}`).join('\n')
  return `You are an intelligent content router. You MUST MUST MUST either route to a [FILE] or create a [FILE] inside dir and route to that. You MUST NOT route to DIRs. \n\nPAGE TITLE: "${pageTitle}"\n\nFULL PAGE CONTENT (for topical context):\n"""\n${fullPageText.slice(0, 1200)}\n"""\n(Note: content truncated to 1200 chars to keep prompt short.)\n\nCURRENT FILE TREE:\n${fileTreeContext}\n\nUNORGANIZED PARAGRAPHS (to route):\n${list}\n\nTASK:\n1. Decide which file each paragraph should live in given the current tree and page context.\n2. For each paragraph, merge/refine as needed and group paragraphs that belong together in the same destination.\n3. For each destination return an object with:\n   { \"targetFilePath\": \"/Path/To/Location\", \"relevance\": 0.0-1.0, \"content\": \"(refined text to put in there (DO NOT miss any key information the user wrote!!!))\" }\n4. Respond ONLY with a JSON array (no markdown fences, no extra prose).`
}

// Simple wrapper when we need raw text back
async function callLLMText(prompt: string): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    throw new Error(`LLM api err ${res.status}`)
  }
  const data = await res.json()
  return (data.response || '').toString()
} 