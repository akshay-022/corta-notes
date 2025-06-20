export interface FileTreeNode {
  uuid?: string
  title: string
  type: 'file' | 'folder'
  path: string
  parent_uuid?: string | null
  children?: FileTreeNode[]
  contentPreview?: string
} 