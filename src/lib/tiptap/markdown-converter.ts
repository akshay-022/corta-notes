/**
 * TipTap JSON to Markdown conversion utility
 * Used for syncing documents to SuperMemory and other export operations
 */

export function tipTapToMarkdown(content: any): string {
  if (!content?.content) return ''
  
  const convertNode = (node: any): string => {
    switch (node.type) {
      case 'paragraph':
        if (!node.content) return '\n'
        const paragraphText = node.content.map((item: any) => convertInlineNode(item)).join('')
        return paragraphText.trim() ? paragraphText + '\n\n' : '\n'
      
      case 'heading':
        const level = '#'.repeat(node.attrs?.level || 1)
        const headingText = node.content?.map((item: any) => convertInlineNode(item)).join('') || ''
        return `${level} ${headingText}\n\n`
      
      case 'bulletList':
        return node.content?.map((item: any) => {
          if (item.type === 'listItem') {
            const listText = item.content?.map((p: any) => {
              if (p.type === 'paragraph' && p.content) {
                return p.content.map((t: any) => convertInlineNode(t)).join('')
              }
              return convertNode(p)
            }).join('') || ''
            return `- ${listText}\n`
          }
          return ''
        }).join('') + '\n'
      
      case 'orderedList':
        return node.content?.map((item: any, index: number) => {
          if (item.type === 'listItem') {
            const listText = item.content?.map((p: any) => {
              if (p.type === 'paragraph' && p.content) {
                return p.content.map((t: any) => convertInlineNode(t)).join('')
              }
              return convertNode(p)
            }).join('') || ''
            return `${index + 1}. ${listText}\n`
          }
          return ''
        }).join('') + '\n'
      
      case 'blockquote':
        const quoteText = node.content?.map((item: any) => convertNode(item)).join('') || ''
        return quoteText.split('\n').filter(Boolean).map((line: string) => `> ${line}`).join('\n') + '\n\n'
      
      case 'codeBlock':
        const code = node.content?.map((item: any) => item.text || '').join('') || ''
        const language = node.attrs?.language || ''
        return `\`\`\`${language}\n${code}\n\`\`\`\n\n`
      
      case 'horizontalRule':
        return '---\n\n'
      
      case 'hardBreak':
        return '\n'
        
      default:
        // Handle unknown node types by extracting text content
        if (node.content) {
          return node.content.map(convertNode).join('')
        }
        return ''
    }
  }
  
  const convertInlineNode = (node: any): string => {
    if (node.type === 'text') {
      let text = node.text || ''
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold':
              text = `**${text}**`
              break
            case 'italic':
              text = `*${text}*`
              break
            case 'underline':
              // Markdown doesn't have native underline, use HTML
              text = `<u>${text}</u>`
              break
            case 'code':
              text = `\`${text}\``
              break
            case 'strike':
              text = `~~${text}~~`
              break
          }
        }
      }
      return text
    }
    return ''
  }
  
  return content.content?.map((node: any) => convertNode(node)).join('') || ''
} 