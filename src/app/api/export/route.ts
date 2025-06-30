export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/supabase-server'
import logger from '@/lib/logger'
import JSZip from 'jszip'

// Server-safe TipTap JSON to Markdown conversion
function tipTapToMarkdown(content: any): string {
  if (!content?.content) return ''
  
  // Server-side: TipTap Editor requires DOM, so we need manual conversion
  return convertTipTapToMarkdown(content)
}

// Manual TipTap JSON to Markdown conversion for server-side use
function convertTipTapToMarkdown(content: any): string {
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

// Filter out hierarchies that contain any deleted pages
function filterCleanHierarchies(allPages: any[]): any[] {
  // Create a map for quick parent-child lookups
  const pageMap = new Map<string, any>()
  allPages.forEach(page => {
    pageMap.set(page.uuid, page)
  })
  
  // Function to check if any ancestor in the chain is deleted
  const hasDeletedAncestor = (pageId: string, visited = new Set<string>()): boolean => {
    // Prevent infinite loops
    if (visited.has(pageId)) return false
    visited.add(pageId)
    
    const page = pageMap.get(pageId)
    // If parent doesn't exist in our dataset, consider it deleted
    if (!page) return true
    
    // If this page is explicitly deleted, return true
    if (page.is_deleted) return true
    
    // Check parent
    if (page.parent_uuid && page.parent_uuid !== 'root') {
      return hasDeletedAncestor(page.parent_uuid, visited)
    }
    
    return false
  }
  
  // Filter out pages that:
  // 1. Are deleted themselves
  // 2. Have any deleted or missing ancestors
  // Descendants are NOT considered – a child being deleted will not exclude its parent hierarchy.
  return allPages.filter(page =>
    !page.is_deleted &&
    !hasDeletedAncestor(page.uuid)
  )
}

// Build file tree from flat pages array
function buildFileTree(pages: any[]): any[] {
  const rootPages: any[] = []
  const pageMap = new Map<string, any>()
  
  // Create map and add children arrays
  pages.forEach(page => {
    pageMap.set(page.uuid, { ...page, children: [] })
  })
  
  // Build tree structure
  pages.forEach(page => {
    const pageWithChildren = pageMap.get(page.uuid)!
    
    if (page.parent_uuid) {
      const parent = pageMap.get(page.parent_uuid)
      if (parent) {
        parent.children.push(pageWithChildren)
      } else {
        // Parent not found, treat as root
        rootPages.push(pageWithChildren)
      }
    } else {
      rootPages.push(pageWithChildren)
    }
  })
  
  return rootPages
}

// Recursively add pages to ZIP with proper folder structure
function addToZip(zip: JSZip, pages: any[], currentPath: string = '') {
  pages.forEach(page => {
    if (page.type === 'folder') {
      // Create the full path for this folder
      const folderPath = currentPath ? `${currentPath}/${page.title}` : page.title
      
      // Create the folder in the ZIP
      const folder = zip.folder(folderPath)!
      
      // Process children - they should be added relative to the main zip, not the subfolder
      if (page.children && page.children.length > 0) {
        addToZip(zip, page.children, folderPath)
      }
    } else {
      // Convert content to markdown and add as file
      const markdownContent = tipTapToMarkdown(page.content)
      const filePath = currentPath ? `${currentPath}/${page.title}.md` : `${page.title}.md`
      zip.file(filePath, markdownContent)
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    logger.info('🗂️ Export request received')
    
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      logger.error('❌ Export: Authentication failed', { userError })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    logger.info('📋 Fetching user pages for export', { userId: user.id })
    
    // Fetch ALL organized pages for the user (including deleted ones to check hierarchy)
    const { data: allPages, error: pagesError } = await supabase
      .from('pages')
      .select('uuid, title, content, type, parent_uuid, organized, created_at, updated_at, is_deleted')
      .eq('user_id', user.id)
      .eq('organized', true)
      .order('created_at', { ascending: true })
    
    if (pagesError) {
      logger.error('❌ Export: Failed to fetch pages', { pagesError })
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
    }
    
    if (!allPages || allPages.length === 0) {
      logger.info('📭 Export: No organized pages found')
      return NextResponse.json({ error: 'No organized pages found' }, { status: 404 })
    }
    
    // Filter out hierarchies that contain any deleted pages
    const pages = filterCleanHierarchies(allPages)
    
    if (pages.length === 0) {
      logger.info('📭 Export: No clean hierarchies found (all contain deleted pages)')
      return NextResponse.json({ error: 'No exportable pages found' }, { status: 404 })
    }
    
    logger.info('🌳 Building file tree for export', { 
      totalPages: allPages.length, 
      cleanPages: pages.length,
      filteredOut: allPages.length - pages.length
    })
    
    // Debug: Log the raw pages data
    logger.info('📋 Raw pages data', { 
      pages: pages.map((p: any) => ({ 
        title: p.title, 
        type: p.type, 
        parent_uuid: p.parent_uuid?.substring(0, 8) || 'root'
      }))
    })
    
    // Build the file tree structure
    const fileTree = buildFileTree(pages)
    
    // Debug: Log the built file tree structure
    logger.info('🌳 Built file tree structure', { 
      rootLevelCount: fileTree.length,
      structure: JSON.stringify(fileTree.map(item => ({
        title: item.title,
        type: item.type,
        childrenCount: item.children?.length || 0,
        children: item.children?.map((child: any) => ({
          title: child.title,
          type: child.type,
          childrenCount: child.children?.length || 0
        })) || []
      })), null, 2)
    })
    
    // Create ZIP file
    const zip = new JSZip()
    
    // Add README with export info
    const readme = `# Corta Export
    
Exported on: ${new Date().toISOString()}
Total files: ${pages.filter((p: any) => p.type === 'file').length}
Total folders: ${pages.filter((p: any) => p.type === 'folder').length}

This export contains all your organized pages from Corta in Markdown format.
The folder structure has been preserved as it was in your Corta workspace.
Only clean hierarchies (without deleted pages) are included.
`
    
    zip.file('README.md', readme)
    
    // Add all pages to ZIP with proper folder structure
    addToZip(zip, fileTree)
    
    logger.info('📦 Generating ZIP file')
    
    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    
    logger.info('✅ Export completed successfully', { 
      zipSizeKB: Math.round(zipBuffer.length / 1024)
    })
    
    // Return ZIP file with proper headers
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="corta-export-${new Date().toISOString().split('T')[0]}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })
    
  } catch (error) {
    logger.error('❌ Export: Unexpected error', { error })
    return NextResponse.json({ 
      error: 'Export failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 