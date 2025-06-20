import { FileTreeNode } from './types'

export interface OrganizedPageSlim {
  uuid: string
  title: string
  type: 'file' | 'folder'
  parent_uuid: string | null
  path?: string
}

export function buildFileTree(pages: OrganizedPageSlim[]): FileTreeNode[] {
  const buildHierarchy = (parentUuid: string | null = null, parentPath = ''): FileTreeNode[] => {
    return pages
      .filter((p) => p.parent_uuid === parentUuid)
      .map((p) => {
        const path = parentPath + '/' + p.title
        const node: FileTreeNode = {
          uuid: p.uuid,
          title: p.title,
          type: p.type,
          path,
          parent_uuid: p.parent_uuid,
        }
        if (p.type === 'folder') {
          node.children = buildHierarchy(p.uuid, path)
        }
        return node
      })
  }
  return buildHierarchy()
}

export function serializeFileTree(nodes: FileTreeNode[], level = 0): string {
  const indent = '  '.repeat(level)
  return nodes
    .map((n) => {
      const prefix = n.type === 'folder' ? '[DIR]' : '[FILE]'
      const line = `${indent}${prefix} ${n.title}`
      if (n.children && n.children.length) {
        return line + '\n' + serializeFileTree(n.children, level + 1)
      }
      return line
    })
    .join('\n')
} 