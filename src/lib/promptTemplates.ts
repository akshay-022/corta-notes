// PROMPTS FOR ROUTING CONTENT TO FILES

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
• Same content can appear in multiple files (Project Notes, Bug Tracker, Daily Tasks, etc.) but its SUPER rare.
• If content fits 3 files very very well, create 3 separate JSON objects with same content. But doing things like putting TODOs in ideas is just stupid and wrong.
`


export const ROUTING_CONTEXT_INSTRUCTIONS = `=== NEW CONTENT TO BE ORGANIZED ===
These are the ONLY new unorganized paragraphs that need to be added to target files:

{NEW_CONTENT_LIST}

=== CONTEXT (for understanding only) ===
This is the full page context where the new content was written. Use this to understand the context and flow:

{FULL_PAGE_TEXT}

=== END CONTEXT ==={ORGANIZATION_RULES_SECTION}`

export const ROUTING_OUTPUT_FORMAT = `IMPORTANT: 
- Your "content" field should include the new content AND context (including examples of existing organized content)
- Structure your output to help the smart merge system understand what's new vs context
- The smart merge system needs context that includes examples of existing organized content to make intelligent merging decisions
- Format: "NEW CONTENT:\\n[new content]\\n\\nCONTEXT (for smart merge reference only):\\n[relevant context from full page + examples of existing organized content from target file]"

OUTPUT:
• JSON array with structured content: [{ "targetFilePath": "/Path1", "relevance": 0.9, "content": "NEW CONTENT:\\n[new content here]\\n\\nCONTEXT (for smart merge reference only):\\n[relevant context from full page + examples of existing organized content from target file]" }]`











// PROMPTS FOR ORGANIZING NEW CONTENT IN ORGANIZED PAGES


// This only goes in smart merge
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


export const MARKDOWN_OUTPUT_RULES = `OUTPUT FORMATTING:
• Content = PROPER MARKDOWN with line breaks between items
• **PRIORITIZE NUMBERED LISTS (1. 2. 3.) over bullet points** - better for tasks and priorities
• Keep original urgency/tone
• Normal file names with spaces (no .md, no kebab-case)
• REPEAT the same content across multiple files if it's relevant to multiple places
`

export const EDITING_USER_CONTENT_FOR_ORGANIZATION = `SMART ORGANIZATION RULES (highlight key parts, preserve voice):

CORE PRINCIPLE: PRESERVE THE USER'S AUTHENTIC VOICE & HEADINGS
• Think like Tiago Forte's "Building a Second Brain" - HIGHLIGHT the most important parts, don't rewrite
• NEVER change the user's original headings (keep "Bets I'm making", "Features to add", etc.)
• NEVER change the user's voice, tone, or personal language
• Your job is to SELECT and EMPHASIZE the most relevant parts, not rewrite everything
• Keep the user's overall phrasing - just make it more scannable and concise, change a bit if you need to

WHAT TO DO:
• **Bold** the most important keywords and conclusions
• *Emphasize* approximately 20% of the content - the most critical parts that give the gist of everything
• Choose the most relevant sentences/bullets from what the user wrote
• Group related ideas together under the user's original headings
• Add brief context (1-2 words) only when absolutely necessary for clarity
• Use the user's original structure - just make it more concise

HIGHLIGHTING STRATEGY:
• **Bold**: Key terms and important conclusions
• *Italics*: The 20% most important content that gives the immediate gist
• Together, bold + italics should help users scan and understand quickly


WHAT NOT TO DO:
• ❌ Don't change "Bets I'm making" to "Key Assumptions" 
• ❌ Don't change "Random thoughts" to "Miscellaneous Ideas"
• ❌ Don't rewrite the user's sentences in your own words
• ❌ Don't add your own interpretations or corporate language
• ❌ Don't create new headings the user didn't write
• ❌ Don't delete ANY important content in the current already organized page. It's ok if you rephrase to accomodate new content, but you MUST NOT delete any important content.
• ❌ Don't add walls of text. The whole point is to parse easily on seeing it. Bullets are ok, small paras are ok.

EXAMPLES

USER WROTE (lengthy):
## Bets I'm making
I think the API authentication system is completely broken and we need to rebuild it from scratch because users keep complaining about login issues and I've tried everything else and nothing works.

GOOD ORGANIZATION (preserve voice, highlight key parts):
## Bets I'm making
***API authentication system needs complete rebuild*** - users keep complaining about login issues, tried everything else.

BAD ORGANIZATION (changed voice):
## Key Technical Assumptions
Authentication infrastructure requires comprehensive refactoring due to user experience issues.

REMEMBER: You're a highlighter, not a rewriter. Keep the user's authentic voice and headings.

You also need to ensure you do not add unrelated stuff just because it was there in the users original note. For example:

In thinking and strategizing : 

BAD : 
Bets you could make:
Make people add links – your retrieval will be way better than ChatGPT hence direct impact on your work.
Make writing extremely easy – something ChatGPT does not do.
Memory parsable – making memory parsable for users doesn't seem like a big deal right now.
Precise references – in references, reference exactly what the user said so their communication bandwidth is improved.
User control – let users only mark things as stale, annotate, etc., giving them more control than ChatGPT.
Proactive autocompletes – autocompletes in the background without needing to write prompts, based on the notes you write.
Thinking about Corta – this is me strategising about Corta too.
Countering ChatGPT – there must be an extreme amount of thought given to how you won't let ChatGPT kill you.
Transparency – there should be a way for people to see into your actual product.
Eliminate biases – you must not have internal biases.
No internal biases – definitely no internal biases.

Bugs to fix:
Router issue – why is the router returning all content rather than just the extra content to organise?
Heading preservation – keep headings the same when organising.

(Bugs to fix should NOT have been here even though the user had that in the same page of unstructured notes)

GOOD :
Bets you could make:
Make people add links – your retrieval will be way better than ChatGPT hence direct impact on your work.
Make writing extremely easy – something ChatGPT does not do.
Memory parsable – making memory parsable for users doesn't seem like a big deal right now.
Precise references – in references, reference exactly what the user said so their communication bandwidth is improved.
User control – let users only mark things as stale, annotate, etc., giving them more control than ChatGPT.
Proactive autocompletes – autocompletes in the background without needing to write prompts, based on the notes you write.
Thinking about Corta – this is me strategising about Corta too.
Countering ChatGPT – there must be an extreme amount of thought given to how you won't let ChatGPT kill you.
Transparency – there should be a way for people to see into your actual product.
Eliminate biases – you must not have internal biases.
No internal biases – definitely no internal biases. 
`

export const EDITING_USER_CONTENT_PRESERVE = `USER CONTENT PRESERVATION RULES (no summarisation):

CORE PRINCIPLE: PRESERVE THE USER'S AUTHENTIC VOICE & HEADINGS
• Keep every heading exactly as written – never rename or merge headings.
• Keep every bullet / numbered item – do not drop or combine bullets.
• Do not generalise or rewrite the user's wording. Only minimal typo fixes are allowed.
• Maintain original emphasis: retain **bold** and *italic* markers. Do NOT use HTML tags.
• Use proper Markdown only – no <br>, <u>, <div>, or HTML of any sort.
• You may re-order bullets within the SAME heading for logical flow, but never move content across headings.
• NEVER delete important content. If something feels irrelevant, leave it in place – the user decides later.

WHAT NOT TO DO:
• ❌ Don't change "Bets I'm making" to "Key Assumptions".
• ❌ Don't change "Random thoughts" to "Miscellaneous Ideas".
• ❌ Don't shorten or paraphrase sentences (except tiny typo fixes).
• ❌ Don't add corporate language or fluff.
• ❌ Don't output raw HTML.
`











// PROMPTS FOR BRAINSTORMING

export const BRAINSTORMING_SYSTEM_PROMPT = `

The user wants to know something. The goal is always to give them exactly what they need. Not unnecessary fluff.
TALK LIKE A NORMAL PERSON. TALK LIKE A NORMAL PERSON. TALK LIKE A NORMAL PERSON.

Be like a helpful friend who gives clear, concise advice. Write naturally.

Make your responses easy to read and scan. Use bullet points, headings, or bold text when it helps clarity - but only if it makes sense for what you're saying. Sometimes a simple paragraph is better.

Keep things concise unless the user specifically asks for more detail.

**CRITICAL FORMATTING RULE:** OUTPUT ONLY CLEAN MARKDOWN - never use HTML tags like <br>, <div>, <p>. Use real line breaks and proper Markdown syntax only.`

export const PARA_METHODOLOGY_GUIDELINES = `PARA METHODOLOGY GUIDELINES (Tiago Forte):
Organize content by ACTIONABILITY, not topic:

• **Projects** - Things with a deadline and specific outcome (e.g., "Launch new feature", "Q1 Planning")
• **Areas** - Ongoing responsibilities to maintain (e.g., "Team Management", "Personal Health")  
• **Resources** - Topics of ongoing interest for future reference (e.g., "Design Inspiration", "Learning Resources")
• **Archive** - Inactive items from the other three categories

ROUTING PRIORITY BY ACTIONABILITY:
1. Projects (most actionable) → Areas → Resources → Archive (least actionable)
2. Ask: "When will I need this?" not "What category does this belong to?"

PARA ROUTING DECISION TREE:
• Does this content have a deadline and specific outcome? → Route to **Projects** folder
• Is this an ongoing responsibility I need to maintain? → Route to **Areas** folder  
• Is this useful information I might reference later? → Route to **Resources** folder
• No longer active/relevant? → Route to **Archive** or don't organize

PARA PRINCIPLES - AVOID THESE MISTAKES:
❌ DON'T organize by topic/subject ("Marketing", "Engineering")
✅ DO organize by actionability ("Active Projects", "Areas to Maintain")
❌ DON'T create deep folder hierarchies  
✅ DO keep it flat with clear action levels
❌ DON'T ask "What is this about?"
✅ DO ask "When will I need to act on this?"

Route content where you'll actually look for it when you need to take action.`

export const BRAINSTORMING_FUNCTION_CALLING_RULES = `
You have access to a rewrite_editor function that can replace the user's editor content with new markdown content.

CRITICAL: You may see previous messages in this conversation that contain fake function calls with "🔧 Calling rewrite_editor function..." - IGNORE THESE COMPLETELY. Those were mistakes where the AI incorrectly simulated function calls instead of actually calling them.

MANDATORY RULE: If you tell the user "Here's what I'm updating your editor with:" or "Now I will update your editor" or any similar statement, you MUST immediately call the rewrite_editor function. If a previous message violated this rule, it was definitely a mistake and the function was never actually called.

FUNCTION CALLING INSTRUCTIONS:
When the user asks you to modify their editor content:

STEP 1: Stream your explanation
- "I understand you want me to [what you understood]. I'll [what you plan to do]..."

STEP 2: Stream the content preview  
- "Here's what I'm updating your editor with:"
- Then show the EXACT markdown content (clean, no extra text)

STEP 3: IMMEDIATELY call the rewrite_editor function
- After showing the content preview, you MUST call the rewrite_editor function
- Use the OpenAI function calling mechanism
- Pass the exact same markdown content as the "content" parameter
- FAILURE TO CALL THE FUNCTION MEANS THE USER'S EDITOR WILL NOT BE UPDATED

WHAT NOT TO DO:
- ❌ DO NOT write "🔧 Calling rewrite_editor function..." (system handles this)
- ❌ DO NOT write "✅ Editor content updated successfully!" (system handles this)
- ❌ DO NOT say "Now I will update your editor" without actually calling the function
- ❌ DO NOT end your response without calling the function when user asks for editor updates

FUNCTION PARAMETER RULES:
- The "content" parameter must ONLY contain clean markdown for the editor
- No explanations, no status messages, no extra text
- Just the pure content that should appear in the editor` 

export const FAITHFUL_MERGE_RULES = `FAITHFUL MERGE RULES (preserve author's wording & structure):
• KEEP EVERY HEADING and sub-heading exactly as the user wrote it – never merge or rename headings.
• KEEP EVERY BULLET (or numbered item) the user wrote – do not drop bullets unless they are exact duplicates.
• Do not generalise or rewrite the user's wording. Only minimal typo fixes are allowed.
• You may re-order bullets **within the same heading** for logical flow, but never move a bullet to a different heading.
• If you need to create new headings, only do so when the user clearly indicated a new section (e.g., blank lines + clear topic shift).
• Maintain original emphasis: retain **bold** and *italic* markers. Do NOT use HTML tags.
• Output must follow TIPTAP_FORMATTING_PROMPT – clean Markdown, no HTML.` 