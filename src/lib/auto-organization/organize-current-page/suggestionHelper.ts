import { createClient } from '@/lib/supabase/supabase-client'
import logger from '@/lib/logger'
import {
  ANTI_NEW_FILE_CREATION_RULES,
  MULTIPLE_DESTINATIONS_STRATEGY,
  PARA_WORKSPACE_EXAMPLE,
  ROUTING_TEXT_PRESERVATION_RULES,
  ROUTING_CONTEXT_INSTRUCTIONS,
  ULTRA_HIGH_PRIORITY_ROUTING_COMPLIANCE,
} from '@/lib/promptTemplates'
import { buildFileTree, serializeFileTree, OrganizedPageSlim } from '../organized-file-updates/helpers/fileTree'

interface Suggestion {
  targetFilePath: string
  relevance: number
}

/** Build a suggestion prompt re-using the same routing rules but requesting only TOP 5 paths */
function buildSuggestionPrompt(
  pageTitle: string,
  fullPageText: string,
  fileTreeContext: string,
) {
  const ORGANIZATION_RULES_SECTION = `\n${ANTI_NEW_FILE_CREATION_RULES}\n\n${MULTIPLE_DESTINATIONS_STRATEGY}\n\n${PARA_WORKSPACE_EXAMPLE}`

  const contextPrompt = ROUTING_CONTEXT_INSTRUCTIONS.replace('{NEW_CONTENT_LIST}', fullPageText.substring(0, 3000)) // if gigantic, truncate
    .replace('{FULL_PAGE_TEXT}', fullPageText.substring(0, 6000))
    .replace('{ORGANIZATION_RULES_SECTION}', ORGANIZATION_RULES_SECTION)

  return `You are an expert at organizing notes using the PARA method.
${ULTRA_HIGH_PRIORITY_ROUTING_COMPLIANCE}

FILE TREE CONTEXT (for reference – don't modify):\n${fileTreeContext}

PAGE TITLE: "${pageTitle}"
IMPORTANT: If the page title is not "Untitled", treat its meaning as the STRONGEST signal for routing – weigh it heavily when choosing destinations. Extemely fucking important. And if anything really matches this title, IT MUST be the first suggestiON!!!!!!!!
${contextPrompt}

TASK: Suggest the TOP 5 MOST RELEVANT *EXISTING* LOCATIONS where this page should live.
• Do NOT invent a new file by appending the current title.
• If a *folder* is the right destination, output the folder path and append " (folder)".
• If an actual *file* is best, output the file path and append " (file)".
• Under NO circumstances should you propose creating a brand-new file; choose from the existing tree only.
Rank by relevance (1 = best). If fewer than 5 valid options exist, return fewer.

OUTPUT: A JSON array ONLY in this shape (no markdown fences):
[
  { "targetFilePath": "/Projects/Corta (folder)", "relevance": 0.97 },
  { "targetFilePath": "/Resources/Books (folder)", "relevance": 0.85 }
]
`
}

async function callLLM(prompt: string): Promise<Suggestion[]> {
  const models = ['gpt-4o']
  for (const model of models) {
    try {
      const res = await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })
      if (!res.ok) {
        const text = await res.text()
        logger.warn(`LLM (${model}) HTTP ${res.status}`, { text })
        continue
      }
      const { response } = await res.json()
      const cleaned = (response as string)
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      return JSON.parse(cleaned) as Suggestion[]
    } catch (err) {
      logger.error('LLM parse error', err)
      continue
    }
  }
  return []
}

async function getFileTreeContext() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return ''

    const { data: pages } = await supabase
      .from('pages')
      .select('uuid,title,type,parent_uuid')
      .eq('user_id', user.id)
      .eq('organized', true)
      .eq('is_deleted', false)

    const all = (pages || []).map((p: any) => ({
      uuid: p.uuid,
      title: p.title,
      type: p.type,
      parent_uuid: p.parent_uuid,
    }))

    // Build map for quick lookup
    const byId: Record<string, OrganizedPageSlim> = {}
    all.forEach((p) => {
      byId[p.uuid] = p
    })

    // Helper to check ancestor chain exists in map
    const hasValidAncestors = (page: OrganizedPageSlim): boolean => {
      let current = page
      const visited = new Set<string>()
      while (current.parent_uuid) {
        if (visited.has(current.parent_uuid)) return false // circular ref guard
        visited.add(current.parent_uuid)
        const parent = byId[current.parent_uuid]
        if (!parent) return false
        current = parent
      }
      return true
    }

    const filtered = all.filter(hasValidAncestors)

    return serializeFileTree(buildFileTree(filtered))
  } catch (err) {
    logger.error('getFileTreeContext failed', err)
    return ''
  }
}

// LocalStorage helpers (client-side only)
const CACHE_PREFIX = 'para-suggestions::'
const MAX_CACHE_ITEMS = 5

function readCache(pageUuid: string): Suggestion[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + pageUuid)
    if (!raw) return null
    const { suggestions } = JSON.parse(raw)
    return Array.isArray(suggestions) ? suggestions : null
  } catch {
    return null
  }
}

function writeCache(pageUuid: string, suggestions: Suggestion[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      CACHE_PREFIX + pageUuid,
      JSON.stringify({ savedAt: Date.now(), suggestions }),
    )
    pruneCache()
  } catch {
    // ignore quota errors
  }
}

function pruneCache() {
  if (typeof window === 'undefined') return
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX))
  if (keys.length <= MAX_CACHE_ITEMS) return
  const entries = keys.map((k) => {
    try {
      const { savedAt } = JSON.parse(localStorage.getItem(k) || '{}')
      return { k, t: savedAt || 0 }
    } catch {
      return { k, t: 0 }
    }
  })
  entries.sort((a, b) => a.t - b.t)
  for (let i = 0; i < entries.length - MAX_CACHE_ITEMS; i++) {
    localStorage.removeItem(entries[i].k)
  }
}

/**
 * Returns up to 5 suggested destination paths (files/folders) for the given page text.
 */
export async function suggestDestinationsForPage(
  pageUuid: string,
  pageTitle: string,
  pageContentText: string,
): Promise<{ suggestions: Suggestion[]; fromCache: boolean }> {
  // 1. Try cache first
  const cached = readCache(pageUuid)
  if (cached) {
    // Fire LLM in background to refresh cache
    ;(async () => {
      try {
        const fileTreeContext = await getFileTreeContext()
        const prompt = buildSuggestionPrompt(pageTitle, pageContentText, fileTreeContext)
        const fresh = (await callLLM(prompt)).slice(0, 5)
        writeCache(pageUuid, fresh)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paraSuggestionsUpdated', { detail: { pageUuid } }))
        }
      } catch (err) {
        logger.error('Background suggestion refresh failed', err)
      }
    })()
    return { suggestions: cached, fromCache: true }
  }

  // No cache – call LLM synchronously
  const fileTreeContext = await getFileTreeContext()
  const prompt = buildSuggestionPrompt(pageTitle, pageContentText, fileTreeContext)
  logger.debug('Suggestion prompt built', { length: prompt.length })
  const suggestions = (await callLLM(prompt)).slice(0, 5)
  writeCache(pageUuid, suggestions)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('paraSuggestionsUpdated', { detail: { pageUuid } }))
  }
  return { suggestions, fromCache: false }
}

export { readCache }
export type { Suggestion } 