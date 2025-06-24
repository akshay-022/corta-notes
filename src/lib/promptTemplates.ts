export const TIPTAP_FORMATTING_PROMPT = `Markdown Formatting Rules (apply strictly):
• OUTPUT CLEAN MARKDOWN - not plain text, not HTML, not JSON
• Prefer numbered lists (1. 2. 3.) or bullet lists (- item) for easy scanning
• Break complex ideas into concise bullets (one idea per line, ≤ 18 words)
• Bold **keywords** or short phrases to highlight important concepts
• Use ## headings for major sections, ### for subsections (but avoid excessive nesting)
• No walls of text – keep paragraphs ≤ 2-3 sentences or use bullets instead
• Never output raw HTML tags like <br> – use real line breaks or Markdown only
• Use simple Markdown: **bold**, *italic*, - bullets, 1. numbers, ## headings
• Keep the user's authentic voice and urgency – but prioritise readability
• Double line breaks for paragraph separation, single line breaks within lists
`

export const ULTRA_CONDENSED_ORGANIZATION_TEMPLATE = `CONDENSED CONTENT RULES:
• NO explanations, introductions, or overviews
• NO "This section covers..." or "Overview:" text
• NO repetitive content or fluff
• DIRECT content with brief context - each item on its own line with proper line breaks
• **PRIORITIZE NUMBERED LISTS (1. 2. 3.) over bullet points** - better for tasks and priorities
• Keep original voice and urgency
• 5-10 words per bullet point (brief but clear)
• NO corporate speak - write like personal notes
• Focus on WHAT needs to be done with minimal context
• CRITICAL: Use proper line breaks between items, not all on one line

PREFERRED FORMAT (numbered):
1. Fix login bug in auth system
2. Call client about project timeline  
3. Update API documentation
4. Deploy bug fixes to production

ALTERNATIVE FORMAT (bullets):
- Fix login bug in auth system
- Call client about project timeline

BAD FORMAT:
TODO: 1. Fix bug 2. Call client 3. Update docs (all on one line - NO!)
`

export const ANTI_NEW_FILE_CREATION_RULES = `🚨 CRITICAL: AVOID CREATING NEW FILES AT ALL COSTS!
• If content has already been routed to existing files, it's EXTREMELY UNLIKELY you need to create a new file
• ALWAYS use existing files first - they exist for a reason
• Only create new files if content is 100% unique and fits nowhere else
• When in doubt, USE AN EXISTING FILE rather than create new one
• Write FULL FILE PATHS (like "/Project Notes/Sprint Planning") to avoid creating accidental new notes
• Partial paths create unwanted new files - ALWAYS use complete paths from file tree

ROUTING PRIORITY:
1. FIRST: Try existing files (even if not perfect match)
2. SECOND: Use broader existing categories  
3. LAST RESORT: Create new file (almost never needed)
`

export const MULTIPLE_DESTINATIONS_STRATEGY = `MULTIPLE DESTINATIONS STRATEGY:
• DUPLICATE content to ALL relevant files - don't pick just one "best" match
• Same content can appear in multiple files (Project Notes, Bug Tracker, Daily Tasks, etc.)
• Better to have content in multiple relevant places than miss it somewhere
• Each relevant file gets its own JSON object with the SAME content
• If content fits 3 files, create 3 separate JSON objects with same content
`

export const MARKDOWN_OUTPUT_RULES = `OUTPUT FORMATTING:
• Content = PROPER MARKDOWN with line breaks between items
• **PRIORITIZE NUMBERED LISTS (1. 2. 3.) over bullet points** - better for tasks and priorities
• NO explanations, overviews, or fluff
• 5-10 words per bullet (brief but clear)
• Keep original urgency/tone
• Normal file names with spaces (no .md, no kebab-case)
• REPEAT the same content across multiple files if it's relevant to multiple places
` 