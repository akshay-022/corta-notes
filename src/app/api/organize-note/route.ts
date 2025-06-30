import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/supabase-server'
import logger from '@/lib/logger'
import { buildFileTree, serializeFileTree, OrganizedPageSlim } from '@/lib/auto-organization/organized-file-updates/helpers/fileTree'
import { applyOrganizationChunks, OrganizedChunk } from '@/lib/auto-organization/organized-file-updates/pageUpdater'
import { ANTI_NEW_FILE_CREATION_RULES, MULTIPLE_DESTINATIONS_STRATEGY, PARA_WORKSPACE_EXAMPLE, ROUTING_TEXT_PRESERVATION_RULES, ULTRA_HIGH_PRIORITY_ROUTING_COMPLIANCE, ROUTING_OUTPUT_FORMAT } from '@/lib/promptTemplates'
import { createFileHistoryItem } from '@/components/left-sidebar/fileHistoryUtils'
import { callLLM } from '@/lib/llm/callLLM'

export const runtime = 'edge'

interface RequestBody {
  pageUuid: string
  pageTitle: string
  contentText: string
  routingInstructions?: string
  organizationRules?: string
}

/* ------------------------------------------------------------------ */

function buildRoutingPrompt(
  pageTitle: string,
  unorganizedText: string,
  fileTreeContext: string,
  organizationRules?: string,
  routingInstructions?: string,
): string {
  const NEW_CONTENT_LIST = unorganizedText
    .split(/\n+/)
    .filter((p) => p.trim().length)
    .map((p, idx) => `${idx + 1}. ${p.trim()}`)
    .join('\n')

  const ORGANIZATION_RULES_SECTION = `\n${ANTI_NEW_FILE_CREATION_RULES}\n\n${MULTIPLE_DESTINATIONS_STRATEGY}\n\n${PARA_WORKSPACE_EXAMPLE}`

  const prompt = `You are an expert at organising notes into an existing PARA workspace.\n${ULTRA_HIGH_PRIORITY_ROUTING_COMPLIANCE}\n\nFILE TREE CONTEXT (read-only):\n${fileTreeContext}\n\nPAGE TITLE: "${pageTitle}"\nIMPORTANT: If the page title is not "Untitled", treat its meaning as the STRONGEST signal for routing – weigh it heavily when choosing destinations. And if anything really matches this title, IT MUST be the first suggestion.\n\n=== NEW CONTENT TO BE ORGANIZED ===\n${NEW_CONTENT_LIST}\n=== END NEW CONTENT ===\n\n${organizationRules ? `PAGE-SPECIFIC RULES:\n${organizationRules}` : ''}\n${routingInstructions ? `USER ROUTING INSTRUCTIONS:\n${routingInstructions}` : ''}\n${ORGANIZATION_RULES_SECTION}\n\nTASK: Route the content to existing files/folders only. NEVER create a new file. Output must follow ${ROUTING_OUTPUT_FORMAT}`

  return prompt
}

async function getFileTreeContext(userId: string, supabase: any) {
  const { data: pages } = await supabase
    .from('pages')
    .select('uuid,title,type,parent_uuid')
    .eq('user_id', userId)
    .eq('organized', true)
    .eq('is_deleted', false)

  const slim: OrganizedPageSlim[] = (pages || []).map((p: any) => ({
    uuid: p.uuid,
    title: p.title,
    type: p.type,
    parent_uuid: p.parent_uuid,
  }))

  return serializeFileTree(buildFileTree(slim))
}

/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody
    const { pageUuid, pageTitle, contentText, routingInstructions, organizationRules } = body
    if (!pageUuid || !contentText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const fileTreeContext = await getFileTreeContext(user.id, supabase)
    const prompt = buildRoutingPrompt(pageTitle, contentText, fileTreeContext, organizationRules, routingInstructions)

    let rawResponse: string
    try {
      try {
        rawResponse = await callLLM({ model: 'o3-mini', prompt })
      } catch {
        rawResponse = await callLLM({ model: 'gpt-4o', prompt })
      }
    } catch (err) {
      logger.error('Routing LLM failed', err)
      return NextResponse.json({ error: 'LLM failed' }, { status: 500 })
    }

    const cleaned = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let routingResponse: any[] = []
    try {
      routingResponse = JSON.parse(cleaned)
    } catch (err) {
      logger.error('Failed to parse LLM JSON', { cleanedSnippet: cleaned.slice(0,200) })
    }

    if (!Array.isArray(routingResponse) || routingResponse.length === 0) {
      routingResponse = [{ targetFilePath: '/Inbox', relevance: 1, content: contentText }]
    }

    const chunks: OrganizedChunk[] = routingResponse.filter((c: any) => c.targetFilePath && c.content)
    const { created, updated } = await applyOrganizationChunks(chunks, supabase, user.id)

    // update profile fileHistory
    const { data: profile } = await supabase
      .from('profiles')
      .select('metadata')
      .eq('user_id', user.id)
      .single()

    const currentHistory: any[] = profile?.metadata?.fileHistory || []

    // Fetch titles for affected pages
    const { data: affectedPages } = await supabase
      .from('pages')
      .select('uuid,title')
      .in('uuid', [...created, ...updated])

    const titleMap: Record<string,string> = {}
    affectedPages?.forEach(p=>{titleMap[p.uuid]=p.title})

    const historyItems = [
      ...created.map(uuid => createFileHistoryItem(uuid, titleMap[uuid]||'Untitled', 'created')),
      ...updated.map(uuid => createFileHistoryItem(uuid, titleMap[uuid]||'Untitled', 'updated'))
    ]

    // Merge new items with existing history, ensuring only one entry per uuid (keep latest)
    const combined = [...historyItems, ...currentHistory]
    const uniqMap = new Map<string, any>()
    for (const item of combined) {
      if (!uniqMap.has(item.uuid)) {
        uniqMap.set(item.uuid, item) // first occurrence is newest because combined is ordered
      }
    }
    const newHistory = Array.from(uniqMap.values()).slice(0, 20)

    console.log('🔍 organize-note: About to update profile metadata', {
      userId: user.id,
      currentHistoryLength: currentHistory.length,
      newHistoryLength: newHistory.length,
      newHistoryItems: historyItems.map(h => ({ uuid: h.uuid, title: h.title, action: h.action }))
    })

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ metadata: { ...profile?.metadata, fileHistory: newHistory } })
      .eq('user_id', user.id)
      .select()

    if (updateError) {
      console.error('🔍 organize-note: Failed to update profile metadata:', updateError)
    } else {
      console.log('🔍 organize-note: Profile metadata updated successfully', {
        userId: user.id,
        updatedProfileCount: updatedProfile?.length || 0
      })
    }

    logger.info('🎉 Organization complete - returning response with file history', {
      created: created.length,
      updated: updated.length,
      fileHistoryCount: newHistory.length
    })

    return NextResponse.json({ 
      created, 
      updated, 
      fileHistory: newHistory 
    }, { status: 202 })
  } catch (err: any) {
    logger.error('organize-note API error', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
} 