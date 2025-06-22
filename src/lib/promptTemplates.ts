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