import { createClient } from '@/lib/supabase/supabase-client'
import logger from '@/lib/logger'
import { Page } from '@/lib/supabase/types'

/**
 * Definition for a root-level entity that should exist when a brand-new user signs up.
 */
interface ParaItemDefinition {
  title: string
  type: 'folder' | 'file'
  /**
   * Optional initial document JSON (ProseMirror) if this is a file.
   */
  content?: any
  /**
   * Plain-text representation of the document for full-text search.
   */
  contentText?: string
}

const README_TEXT = `# Welcome to PARA 📓

PARA is a simple, opinionated framework for keeping **everything** in its place.

- **Projects** — short-term efforts with a clear outcome.
- **Areas** — long-term responsibilities you want to maintain.
- **Resources** — reference material you might reuse later.
- **Archives** — completed or inactive items you want out of the way.
- **Me** — personal notes and the central "TODOs" list.

Tips for getting started:
1. Create a new folder inside **Projects** for each initiative you are actively working on.
2. Move anything inactive to **Archives** — don't delete, just archive.
3. Keep reference docs in **Resources** so you can find them again.
4. Review **TODOs** every morning and drag tasks into the correct Projects/Areas.

Happy organising!`

const README_DOC = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Welcome to PARA \\u{1F4D3}' }]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'PARA is a simple, opinionated framework for keeping everything in its place.'
        }
      ]
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Projects – short-term efforts with a clear outcome.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Areas – long-term responsibilities you want to maintain.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Resources – reference material you might reuse later.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Archives – completed or inactive items you want out of the way.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Me – personal notes and the central "TODOs" list.' }] }] }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Tips for getting started:' }
      ]
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create a new folder inside Projects for each initiative you\'re actively working on.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Move anything inactive to Archives – don\'t delete, just archive.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep reference docs in Resources so you can find them again.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review TODOs every morning and drag tasks into the correct Projects/Areas.' }] }] }
      ]
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Happy organising!' }]
    }
  ]
}

/**
 * Top-level PARA items that should always exist for a new user.
 * Order matters only for logging readability.
 */
const PARA_ITEMS: ParaItemDefinition[] = [
  { title: 'Projects', type: 'folder' },
  { title: 'Areas', type: 'folder' },
  { title: 'Resources', type: 'folder' },
  { title: 'Archives', type: 'folder' },
  { title: 'Me', type: 'folder' },
  { title: 'TODOs', type: 'file', content: { type: 'doc', content: [] }, contentText: '' },
  { title: 'README', type: 'file', content: README_DOC, contentText: README_TEXT }
]

interface InitResult {
  created: string[] // page UUIDs created during this run
  alreadyExisted: string[] // page UUIDs found to exist already
}

/**
 * Creates the PARA root structure (Projects, Areas, Resources, Archives, Me, TODOs, README)
 * for the currently authenticated user. It is safe to call multiple times; existing items will
 * be left untouched.
 */
export async function initializeParaStructure(
  /** Optionally inject your own Supabase client (e.g. from server-side). */
  maybeClient?: ReturnType<typeof createClient>
): Promise<InitResult> {
  logger.info('🏗️  PARA initialisation started')

  const supabase = maybeClient ?? createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user?.id) {
    logger.error('initializeParaStructure: No authenticated user found')
    return { created: [], alreadyExisted: [] }
  }

  const created: string[] = []
  const alreadyExisted: string[] = []

  for (const item of PARA_ITEMS) {
    // 1. Does it already exist?
    const { data: rows, error } = await supabase
      .from('pages')
      .select('uuid')
      .eq('user_id', user.id)
      .eq('title', item.title)
      .eq('type', item.type)
      .is('parent_uuid', null)
      .eq('is_deleted', false)
      .limit(1)

    if (error) {
      logger.error(`Error querying for existing page "${item.title}"`, error)
      continue
    }

    if (rows && rows.length) {
      alreadyExisted.push(rows[0].uuid)
      logger.info(`✓ "${item.title}" already exists`, { uuid: rows[0].uuid.substring(0, 8) })
      continue
    }

    // 2. Create new entry
    const newPage: Partial<Page> = {
      user_id: user.id,
      title: item.title,
      type: item.type,
      parent_uuid: null,
      organized: true,
      content: item.type === 'file' ? item.content ?? { type: 'doc', content: [] } : null,
      content_text: item.type === 'file' ? item.contentText ?? '' : null
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('pages')
      .insert(newPage)
      .select()
      .single()

    if (insertErr) {
      logger.error(`Failed to create "${item.title}"`, insertErr)
      continue
    }

    created.push(inserted.uuid)
    logger.info(`🆕 Created ${item.type} "${item.title}"`, {
      uuid: inserted.uuid.substring(0, 8)
    })
  }

  logger.info('🏁 PARA initialisation finished', { createdCount: created.length })
  return { created, alreadyExisted }
}

export default initializeParaStructure 