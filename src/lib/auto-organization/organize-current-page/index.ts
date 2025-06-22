import { Editor } from '@tiptap/react'
import { createClient } from '@/lib/supabase/supabase-client'
import { ContentProcessor } from '@/lib/auto-organization/organized-file-updates/helpers/contentProcessor'
import { ensureMetadataMarkedOrganized } from '@/lib/auto-organization/organized-file-updates/helpers/organized-file-metadata'
import logger from '@/lib/logger'

export interface OrganizeCurrentPageOptions {
  editor: Editor
  pageUuid: string
  pageTitle: string
}

interface ParagraphInfo {
  id: string
  content: string
}

/**
 * Organizes ALL content in the current page (not just unorganized paragraphs):
 * 1. Extracts ALL paragraphs from the current page
 * 2. Routes them through the organization system
 * 3. Marks ALL remaining content as organized
 */
export async function organizeCurrentPage({ editor, pageUuid, pageTitle }: OrganizeCurrentPageOptions): Promise<void> {
  const supabase = createClient()
  const contentProcessor = new ContentProcessor()
  
  try {
    logger.info('🚀 Starting FULL page rewrite organization', { pageUuid, pageTitle })

    // 1️⃣  Load page metadata so we can fetch the page-specific organization rules
    const { data: page, error: pageErr } = await supabase
      .from('pages')
      .select('metadata')
      .eq('uuid', pageUuid)
      .single()

    if (pageErr) throw new Error(`Failed to load page metadata: ${pageErr.message}`)

    const organizationRules: string = (page?.metadata as any)?.organizationRules || ''

    // 2️⃣  Extract the ENTIRE plain-text content from the editor
    const fullText = editor.getText().trim()
    if (!fullText) {
      logger.info('Nothing to organize – page is empty', { pageUuid })
      return
    }

    // 3️⃣  Build the prompt for the LLM
    const rulesSection = organizationRules
      ? `\n\nORGANIZATION RULES (follow strictly, do NOT drop any important information):\n${organizationRules}`
      : ''

    const prompt = `You are rewriting ONE personal note. Keep EVERY key detail, but remove redundancy and fluff.\n\nPAGE TITLE (for context, do NOT repeat it in your output): \"${pageTitle}\"${rulesSection}\n\nORIGINAL NOTE:\n"""\n${fullText}\n"""\n\nTASK:\nRewrite the note to be clear, concise personal notes. Keep the author's authentic voice. Do NOT omit any important facts, dates, ideas, or action items. Use simple markdown formatting (headings, bullets) if helpful.\n\nIMPORTANT: Do NOT output the page title again; start directly with the content.\n\nRespond ONLY with the rewritten note (plain text, no JSON, no markdown fences).`

    logger.info('🛰️  Sending rewrite prompt to LLM', { pageUuid, tokens: prompt.length })

    const rewrittenText = await callRewriteLLM(prompt)

    logger.info('✅ LLM returned rewritten text', { pageUuid, chars: rewrittenText.length })

    // 4️⃣  Convert rewritten text → TipTap JSON & add metadata
    const newContentJSON = contentProcessor.createTipTapContent(rewrittenText)
    if (newContentJSON?.content) {
      newContentJSON.content = ensureMetadataMarkedOrganized(newContentJSON.content, pageUuid)
    }

    // 5️⃣  Overwrite editor & DB
    editor.commands.setContent(newContentJSON)

    await supabase
      .from('pages')
      .update({
        content: newContentJSON,
        content_text: rewrittenText,
        organized: true,
        updated_at: new Date().toISOString(),
      })
      .eq('uuid', pageUuid)

    logger.info('🏁 Page rewrite organization complete', { pageUuid })
  } catch (err) {
    logger.error('❌ Error during page rewrite organization', { err })
    throw err
  }
}

/**
 * Extract ALL paragraphs from content (both organized and unorganized)
 */
function extractAllParagraphs(content: any[], pageUuid: string): ParagraphInfo[] {
  const allParagraphs: ParagraphInfo[] = []
  
  for (const node of content) {
    // Only process paragraph nodes
    if (node.type !== 'paragraph') continue
    
    // Extract text content
    const textContent = (node.content || [])
      .map((textNode: any) => textNode.text || '')
      .join('')
      .trim()
    
    // Skip empty paragraphs
    if (!textContent) continue
    
    // Get or generate paragraph ID
    const paragraphId = node.attrs?.id || node.attrs?.metadata?.id || `${pageUuid}-paragraph-${Date.now()}-${Math.random().toString(16).slice(2)}`
    
    allParagraphs.push({
      id: paragraphId,
      content: textContent
    })
  }
  
  return allParagraphs
}

/**
 * Call LLM to organize paragraphs into file structure
 */
async function callOrganizationLLM(pageTitle: string, paragraphs: ParagraphInfo[], organizationRules: string) {
  const list = paragraphs.map((p, i) => `${i + 1}. ${p.content}`).join('\n')
  
  const organizationRulesSection = organizationRules?.trim() ? 
    `\n\nORGANIZATION RULES FOR THIS PAGE:
${organizationRules}

Follow these rules when organizing content.\n` : ''

  const prompt = `You are organizing personal notes. You MUST route to existing [FILE]s or create new [FILE]s inside directories. NEVER route to [DIR]s.

PAGE TITLE: "${pageTitle}"

ALL PARAGRAPHS TO ORGANIZE:
${list}${organizationRulesSection}

TASK:
1. Route each paragraph to the best file location based on content and context
2. Group related paragraphs together in the same destination  
3. For each destination return:
   { "targetFilePath": "/Path/To/Location", "content": "(organized content)" }
4. Respond ONLY with JSON array (no markdown, no extra text)

CRITICAL CONTENT REQUIREMENTS:
• Write like PERSONAL NOTES - conversational, direct, authentic
• Keep the user's original voice and urgency - don't sanitize their tone
• NO corporate speak, NO "Overview/Summary" sections, NO repetitive content
• BE CONCISE - eliminate fluff and redundancy 
• Focus on actionable insights, not descriptions
• Preserve strong emotions, caps, urgency from original text
• Use simple formatting - basic bullets or lists, not complex structures
• Add clear, concise titles when organizing new sections
• Use \\n\\n for proper line breaks between topics

BAD: "Overview: This section provides a comprehensive analysis of..."
GOOD: "Need annotation feature - users want control over routing"

Remember: These are PERSONAL NOTES, not business documents. Keep them authentic and useful.

Also, do NOT repeat page title in your content. That is already the heading of the page, it will not change.`

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
        logger.warn(`${model} model failed (${res.status}), trying fallback: ${text}`)
        continue
      }

      const data = await res.json()
      const raw = data.response || ''

      // Clean up possible markdown code fences
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      const result = JSON.parse(cleaned)
      logger.info(`Organization completed successfully with model: ${model}`)
      return result
      
    } catch (err) {
      logger.warn(`${model} model failed, trying fallback:`, err)
      continue
    }
  }
  
  throw new Error('All LLM models failed for organization')
}

// --- Helper: call the LLM and return plain-text rewrite --------------------
async function callRewriteLLM(prompt: string): Promise<string> {
  const models = ['o3-mini', 'gpt-4o']
  for (const model of models) {
    try {
      const res = await fetch('/api/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })
      if (!res.ok) {
        const txt = await res.text()
        logger.warn(`${model} failed (${res.status}) – ${txt}`)
        continue
      }
      const data = await res.json()
      // Some models wrap the response in code-fences – strip them
      return (data.response || '')
        .replace(/^```(\w+)?/i, '')
        .replace(/```$/i, '')
        .trim()
    } catch (e) {
      logger.warn(`${model} threw, trying fallback`, { e })
      continue
    }
  }
  throw new Error('All LLM models failed for rewrite')
} 