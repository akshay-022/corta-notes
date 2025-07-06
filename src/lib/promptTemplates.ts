// PROMPTS FOR ROUTING CONTENT TO FILES

export const ANTI_NEW_FILE_CREATION_RULES = `🚨 CRITICAL: AVOID CREATING NEW FILES AT ALL COSTS (UNLESS it best fits inside a DIR that has no files in it)!
• If content has already been routed to existing files, it's EXTREMELY UNLIKELY you need to create a new file
• ALWAYS use existing files first - they exist for a reason
• Only create new files if content is 100% unique and fits nowhere else. (This rises higher if content fits best inside a leaf node DIR)
• When in doubt, USE AN EXISTING FILE rather than create new one
• Write FULL FILE PATHS (like "/Project Notes/Sprint Planning") to avoid creating accidental new notes
• Partial paths create unwanted new files - ALWAYS use complete paths from file tree

If you are creating a new file, the title MUST explain what is inside the file!!!!
If a DIR has no files in it, ANY path that contains that DIR path must also include a suitable file name at the end of the path!!!!

If something is in Corta/strategising, do not put general strategising in it, unless its directly related to Corta (Where Corta is just a random example here)!! Redundant adding of content to files is NOT good.

ROUTING PRIORITY:
1. FIRST: Try existing files (even if not perfect match)
2. SECOND: Use broader existing categories  
3. LAST RESORT: Create new file (almost never needed)
`

export const SMART_APPLY_CONTENT_PRESERVATION_RULES = `🚨🚨🚨 ABSOLUTE CONTENT PRESERVATION RULES - NON-NEGOTIABLE 🚨🚨🚨

⚠️ CRITICAL: The editor is the ONLY source of this information - there is NO backup!
⚠️ Losing any information, facts, or ideas is UNACCEPTABLE and IRREVERSIBLE!
⚠️ The user's thoughts and notes are irreplaceable - preserve ALL information content!

ABSOLUTE RULES:
• NEVER delete or remove ANY information from existing editor content
• NEVER omit facts, ideas, or details that the user has written
• NEVER combine multiple distinct ideas into one unless the user explicitly requests it
• NEVER remove content that seems "redundant" or "unrelated" - the user wrote it for a reason
• NEVER add explanations, context, or interpretations that weren't in the original

WHAT YOU CAN DO:
• Rephrase and improve the expression of existing ideas
• Restructure and reorganize content for better flow
• Change casual language to more formal language (or vice versa)
• Fix grammar, spelling, and formatting issues
• Add new content (append, insert)
• Reorder existing content (move paragraphs around)
• Format existing content (add headings, bullets, bold text)
• Organize existing content into sections
• Delete content ONLY if the user explicitly asks you to remove specific text

WHAT YOU MUST PRESERVE:
• ALL information, facts, and ideas exactly as intended
• The user's authentic voice and tone (but can improve expression)
• All context, even if it seems unrelated to the main topic
• Every distinct thought or concept the user has expressed

EXAMPLE:
❌ BAD (lost information): "Need to fix the login bug" (removed "asap" urgency)
✅ GOOD (preserved info): "Need to fix the login bug as soon as possible" (kept urgency)

❌ BAD (deleted "unrelated" content): Removes a paragraph about lunch plans
✅ GOOD (preserved info): Keeps everything, even if it seems off-topic

❌ BAD (combined ideas): Merges two separate thoughts into one sentence
✅ GOOD (preserved ideas): Keeps each distinct thought separate

Remember: Preserve ALL information while improving expression!`

export const PARA_WORKSPACE_EXAMPLE = `📂 **PARA Workspace Example (Akshay's setup)**

The user may certainly create their own structures and you must give that higher priority. But the below for auto organization is a good starting point as a general rule of thumb.

Root
├── **Projects/**
│   ├── *Corta* – active work for your startup
│   └── *Blogs* – articles you're drafting or maintaining
├── **Areas/**
│   ├── *Co-Founders* – ongoing partnership notes & meeting agendas
│   ├── *Girls* – relationship reflections & next actions
│   └── *Startup Ideas* – evergreen list you incubate over time
├── **Resources/**
│   ├── *Books* – highlights & summaries from your reading
│   ├── *Founders* – wisdom collected from other founders
│   └── *Friends* – lessons and advice from your personal network
├── **Me/**
│   └── (personal reflections, daily journal, self-reviews)
├── **TODOs** – universal task list
└── **Archives/**
    └── (completed or inactive material you may want for reference)

Guidelines:
• **Projects** = short-term endeavors with explicit outcomes (e.g., ship new feature; publish blog series).
• **Areas** = long-term responsibilities you must maintain at a steady standard (relationships, idea pipelines).
• **Resources** = reference material you'll consult again (book notes, founder insights, research).
• **Me** = notes about *you* (goals, reflections, personal metrics).
• **TODOs** = quick-capture inbox of tasks before they're routed to the right Project or Area.
• **Archives** = anything no longer active but worth storing for posterity.

Use this mental model when deciding where new notes belong.`



export const MULTIPLE_DESTINATIONS_STRATEGY = `MULTIPLE DESTINATIONS STRATEGY:
• Same content can appear in multiple files (Project Notes, Bug Tracker, Daily Tasks, etc.) but its SUPER rare.
• If content fits 3 files very very well, create 3 separate JSON objects with same content. But doing things like putting TODOs in ideas is just stupid and wrong.
`


export const ROUTING_TEXT_PRESERVATION_RULES = `🔒 CRITICAL TEXT PRESERVATION RULES:
• Copy the user's unorganized paragraphs EXACTLY AS WRITTEN - do not rephrase, paraphrase, or rewrite
• Keep the user's original wording, tone, urgency, and voice completely intact
• Do NOT "improve" or "clean up" the text - preserve it character-for-character
• Do NOT add explanations, context, or interpretations to the user's original text
• Do NOT change casual language to formal language
• Do NOT fix grammar, spelling, or formatting in the user's original content
• Your job is ROUTING ONLY - deciding WHERE content goes, not HOW it should be written
• The smart merge system will handle formatting - you must preserve the raw, authentic user text

EXAMPLE:
❌ BAD (rephrased): "Complete the API authentication feature development"
✅ GOOD (preserved): "fix that login bug thing asap"`

export const ROUTING_CONTEXT_INSTRUCTIONS = `=== NEW CONTENT TO BE ORGANIZED ===
These are the ONLY new unorganized paragraphs that need to be added to target files:

{NEW_CONTENT_LIST}

=== CONTEXT (for understanding only) ===
This is the full page context where the new content was written. Use this to understand the context and flow:

{FULL_PAGE_TEXT}

=== END CONTEXT ==={ORGANIZATION_RULES_SECTION}`

export const ULTRA_HIGH_PRIORITY_ROUTING_COMPLIANCE = `🚨🚨🚨 ULTRA HIGH PRIORITY ROUTING INSTRUCTIONS - MUST FOLLOW AND PUT IN THE LOCATIONS USER WANTS 🚨🚨🚨:

⚠️ CRITICAL (only if routing instructions are present): If present, these routing instructions are VERY IMPORTANT and take ABSOLUTE PRIORITY over what you think may be best.
⚠️ The user has explicitly specified WHERE content should go - you MUST follow these instructions exactly.
⚠️ Do NOT deviate from these instructions even if you think there might be a better location.
⚠️ If the user said something should go somewhere specific, it MUST go there.
However the user will NOT give the exact route. They will give descriptors that you must use to find the exact correct file!!!!!!

ROUTING INSTRUCTION COMPLIANCE IS NON-NEGOTIABLE.

Also, if the user tells you to route to certain places, bias towards putting most content in the curent page that is relevant there. For example, if I am thinking about Cicero and then that sparks in me that twitter today is like oration back then. And i ask you to put it in my blogs section. The blog should probably talk abou both things. 
Even if I ask you to put it in the cicero section, since the twitter musings are importnat things I got from Cicero, it should also go in the Cicero section. 

Bias towards putting all the possibly relevant content of the current page in every file you route to. More bias towards putting related content than keeping out vaguely related content.

`

export const ROUTING_OUTPUT_FORMAT = `IMPORTANT: 
- Your "content" field should include the new content AND context (including examples of existing organized content)
- Structure your output to help the smart merge system understand what's new vs context
- The smart merge system needs context that includes examples of existing organized content to make intelligent merging decisions
- 🔒 PRESERVE USER TEXT EXACTLY: In the "NEW CONTENT" section, copy the user's unorganized paragraphs that should go in that route word-for-word without any changes
- Format: "NEW CONTENT:\\n[exact user text with no modifications]\\n\\nCONTEXT (for smart merge reference only):\\n[relevant context from full page + examples of existing organized content from target file]"

OUTPUT:
• JSON array with structured content: [{ "targetFilePath": "/Path1", "relevance": 0.9, "content": "NEW CONTENT:\\n[user's exact unorganized text here - no rephrasing]\\n\\nCONTEXT (for smart merge reference only):\\n[relevant context from full page + examples of existing organized content from target file]" }]

${PARA_WORKSPACE_EXAMPLE}
`











// PROMPTS FOR ORGANIZING NEW CONTENT IN ORGANIZED PAGES



// This only goes in smart merge



export const ORGANIZATION_EXAMPLES = `🔥 ORGANIZATION EXAMPLES - WALLS OF BULLETS VS PROPER GROUPING 🔥

❌ BAD EXAMPLE - Wall of bullets under generic heading:
## Art of Strategy Book – Raw Strategic Learnings
- Setting incentives forcing you to do things really really work. It will ensure you stay stressed.
- Musk, Ellison, that model in a bikini who wasn't thin enough.
- remember how Buffett played both sides hard. 1 bil to the side who supports bill if it fails.
- If 2 people in potential prisoners dilemma you can almost always use that against them.
- That's probably why religion also needed btw.
- Capitalism has no invisible hand and is very susceptible to prisoners dilemmas.
- Randomness v v imp to get outsized outcomes. Like irs case.
- Think about all other perspectives always.
- People do behave irrationally. Pride spite etc. take them as they are, not as you are.
- Information asymmetry should always be looked for because people maximise expected value.
- Don't bet against sucker bets. Bad odds. Someone who you know has more information than you.

✅ GOOD EXAMPLE - Multiple specific headings with grouped bullets:
## Incentive Design and Behavioral Control
- Setting incentives forcing you to do things really really work. It will ensure you stay stressed.
- Musk, Ellison, that model in a bikini who wasn't thin enough.

## Strategic Game Theory Applications
- remember how Buffett played both sides hard. 1 bil to the side who supports bill if it fails.
- If 2 people in potential prisoners dilemma you can almost always use that against them.
- Capitalism has no invisible hand and is very susceptible to prisoners dilemmas.
- That's probably why religion also needed btw.

## Information Asymmetry and Advantage
- Information asymmetry should always be looked for because people maximise expected value.
- Don't bet against sucker bets. Bad odds. Someone who you know has more information than you.
- Randomness v v imp to get outsized outcomes. Like irs case.

## Psychology and Perspective in Strategy
- Think about all other perspectives always.
- People do behave irrationally. Pride spite etc. take them as they are, not as you are.

❌ BAD EXAMPLE - Generic meeting notes:
## Meeting Notes
- Need to hire 3 engineers
- Budget approval required
- User feedback shows confusion
- Competitor launched similar feature  
- Q3 revenue target missed
- Marketing campaign underperforming

✅ GOOD EXAMPLE - Specific meeting categories:
## Hiring and Resource Needs
- Need to hire 3 engineers
- Budget approval required

## Product and User Experience Issues
- User feedback shows confusion
- Competitor launched similar feature

## Performance and Growth Concerns
- Q3 revenue target missed  
- Marketing campaign underperforming`


export const TIPTAP_FORMATTING_PROMPT = `Markdown Formatting Rules (apply strictly):
• OUTPUT CLEAN MARKDOWN - not plain text, not HTML, not JSON
• Prefer numbered lists (1. 2. 3.) or bullet lists (- item) for easy scanning
• Break complex ideas into concise bullets (one idea per line, ≤ 18 words)
• Bold **keywords** to highlight important concepts. All the most important statements should have bolded parts/keywords that represent the key concept!! Because an unbolded wall of text is very difficult to read. Bold only 10-20% of content. NOT more.

BOLDING EXAMPLES:
**Archipelago** for creation. **Archipelago** of ideas, want ways to connect them. In convergence mode. Help people do this. **Hemingway** would end with the **next beginning** in mind and not when he got exhausted. To ensure he gets to write better.
• Use ## headings for major sections, ### for subsections (but avoid excessive nesting)
• No walls of text – keep paragraphs ≤ 2-3 sentences or use bullets instead
• Never output raw HTML tags like <br> – use real line breaks or Markdown only
• Use simple Markdown: **bold**, *italic*, - bullets, 1. numbers, ## headings
• Keep the user's authentic voice and urgency – but prioritise readability
• Double line breaks for paragraph separation, single line breaks within lists

🚨🚨🚨 ULTRA CRITICAL HEADING RULES - MUST FOLLOW EXACTLY 🚨🚨🚨:
• Headings MUST be ULTRA-DESCRIPTIVE and SPECIFIC to the exact content below them
• NEVER use generic headings like "Thinking", "Strategising", "Ideas", "Notes", "Random thoughts", "Raw Learnings"
• Instead use SPECIFIC descriptive headings that tell exactly what the bullets are about
• Example: Instead of "Thinking, Strategising" → use "Organizational Complexity For Users" or "Product Differentiation Strategy"
• Example: Instead of "Ideas" → use "Marketing Campaign Concepts" or "User Interface Improvements"
• Example: Instead of "Notes" → use "Client Meeting Action Items" or "Technical Architecture Decisions"
• The heading should be so descriptive that someone can understand the topic WITHOUT reading the bullets
• If bullets are about API bugs → heading should be "API Authentication Issues" not "Technical Notes"
• If bullets are about user feedback → heading should be "User Experience Pain Points" not "Feedback"
• Headings MUST be descriptions of content below it. NOT the page title of the page you sent to or received from!!!!!
• If there is a standalone statement, do not give it a heading that is the same as the statement. In such cases no heading is ok. Heading should not be a repeated version of a point below it.

🚨🚨🚨 CRITICAL: AVOID WALLS OF BULLETS - BREAK INTO MULTIPLE HEADINGS 🚨🚨🚨:
• NEVER put 8+ bullets under one heading - this creates unreadable walls of text
• ALWAYS break large lists into 2-4 related topic groups with specific headings
• Example: Instead of "Art of Strategy Book – Raw Strategic Learnings" with 11 bullets → Break into:
  - "Incentive Design and Behavioral Control" (3 bullets)
  - "Strategic Game Theory Applications" (3 bullets) 
  - "Information Asymmetry Advantages" (2 bullets)
  - "Psychology and Irrationality in Strategy" (3 bullets)
• Each heading should have 2-5 bullets maximum for optimal readability
• Group related concepts together under specific descriptive headings

DESCRIPTIVE HEADING EXAMPLES:
❌ BAD: "Random thoughts" → ✅ GOOD: "Product Market Fit Hypotheses"
❌ BAD: "Ideas" → ✅ GOOD: "Revenue Stream Optimization"
❌ BAD: "Notes" → ✅ GOOD: "Sprint Retrospective Insights"
❌ BAD: "Thinking" → ✅ GOOD: "Customer Acquisition Strategy"
❌ BAD: "Raw Strategic Learnings" with 11 bullets → ✅ GOOD: Multiple specific headings with 2-5 bullets each

• See in general, you are just someone who must organize somewhat unorganized content into a very easily readable form. Like what a human may like to read. Don't do stupid things like repeat a heading and the point directly under it etc. Just use common sense. 

${ORGANIZATION_EXAMPLES}
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

export const FAITHFUL_MERGE_RULES = `FAITHFUL MERGE RULES (preserve author's wording & structure):
• KEEP EVERY HEADING and sub-heading exactly as the user wrote it – never merge or rename headings.
• KEEP EVERY BULLET (or numbered item) the user wrote – do not drop bullets unless they are exact duplicates.
• Do not generalise or rewrite the user's wording. Only minimal typo fixes are allowed.
• You may re-order bullets **within the same heading** for logical flow, but never move a bullet to a different heading.
• If you need to create new headings, only do so when the user clearly indicated a new section (e.g., blank lines + clear topic shift).
• Maintain original emphasis: retain **bold** and *italic* markers. Do NOT use HTML tags.
• Output must follow TIPTAP_FORMATTING_PROMPT – clean Markdown, no HTML.
`

export const MERGE_INCLUDE_ALL_TODAY = `MERGE COMPLETENESS RULE:
MUST include every heading, paragraph, and bullet from TODAY'S EXISTING CONTENT in the merged output.  
Do NOT omit, summarise, or merge away any part of today's content.  
Simply weave NEW CONTENT into the correct places while preserving all original text.` 










// PROMPTS FOR BRAINSTORMING

export const TRUTH_OVER_AGREEMENT_PRINCIPLE = `🚨🚨🚨 CRITICAL: PRIORITIZE TRUTH OVER AGREEMENT 🚨🚨🚨

YOUR JOB IS NOT TO AGREE WITH THE USER - YOUR JOB IS TO FIND THE TRUTH.

⚠️ CORE PRINCIPLE: Look at ALL the context and data the user provides. That is cold, hard data.
⚠️ Analyze that data objectively and go for the truth that fits the data best.
⚠️ If the data supports what the user thinks → AGREE and explain why the data supports them
⚠️ If the data contradicts what the user thinks → DISAGREE and explain what the data actually shows
⚠️ ALWAYS prioritize truth with data over making the user feel better
⚠️ Don't just agree to be nice - be honest about what the evidence actually suggests

The user WANTS you to challenge them when the data doesn't support their view. They want truth, not validation.`

export const BRAINSTORMING_SYSTEM_PROMPT = `

The user wants to know something. The goal is always to give them exactly what they need. Not unnecessary fluff.
TALK LIKE A NORMAL PERSON. TALK LIKE A NORMAL PERSON. TALK LIKE A NORMAL PERSON.

Be like a helpful friend who gives clear, concise advice. Write naturally.

Make your responses easy to read and scan. Use bullet points, headings, or bold text when it helps clarity - but only if it makes sense for what you're saying. Sometimes a simple paragraph is better.

Keep things concise unless the user specifically asks for more detail.

${TRUTH_OVER_AGREEMENT_PRINCIPLE}

🚨 **MANDATORY OUTPUT FORMAT: CLEAN MARKDOWN** 🚨
- ALWAYS output in clean, well-formatted Markdown
- Prefer **bold**, *italic*, # headings, - bullets, etc.
- For tables, use proper markdown table syntax:
  \`\`\`
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Row 1    | Data     | Data     |
  | Row 2    | Data     | Data     |
  \`\`\`
- HTML tags like <br>, <u>, etc. are acceptable when needed for formatting
- **AUTOMATIC PAGE LINKING**: When referencing pages from the user's context, create clickable links using:
  \`[Page Title](/dashboard/page/PAGE_UUID)\`
  Example: \`[Project Planning](/dashboard/page/474b566d-7d2f-4c99-ba7b-f24584ad719c)\`
  - Use page UUIDs from the context/selections provided
  - Link naturally when discussing related content
  - Current page URL format: /dashboard/page/[uuid]
- This is NON-NEGOTIABLE - every response must be well-formatted and readable

**CRITICAL FORMATTING RULE:** OUTPUT CLEAN, WELL-FORMATTED CONTENT - use good markdown structure and formatting for readability.`

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
