function randomHex(len = 8): string {
  return Math.random().toString(16).slice(2, 2 + len)
}

/**
 * Ensure all paragraph (and other block) nodes have attrs.id and attrs.metadata.id etc
 * Returns a NEW array of nodes (does not mutate originals)
 */
export function ensureParagraphMetadata(nodes: any[], pageUuid: string): any[] {
  const blockNodeTypes = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock']
  const nowIso = new Date().toISOString()

  return nodes.map((node) => {
    if (!blockNodeTypes.includes(node.type)) return node

    const existingId = node?.attrs?.id || node?.attrs?.metadata?.id
    const id = existingId || `${pageUuid}-${node.type}-${Date.now()}-${randomHex()}`

    return {
      ...node,
      attrs: {
        ...(node.attrs || {}),
        id,
        metadata: {
          id,
          isOrganized: false,
          lastUpdated: nowIso,
          organizationStatus: 'no',
          ...(node.attrs?.metadata || {}),
        },
      },
    }
  })
}

/**
 * Ensure all paragraph (and other block) nodes have attrs.id and attrs.metadata.id etc
 * and mark them as organized content
 * Returns a NEW array of nodes (does not mutate originals)
 */
export function ensureMetadataMarkedOrganized(nodes: any[], pageUuid: string): any[] {
  const blockNodeTypes = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock']
  const nowIso = new Date().toISOString()

  return nodes.map((node) => {
    if (!blockNodeTypes.includes(node.type)) return node

    const existingId = node?.attrs?.id || node?.attrs?.metadata?.id
    const id = existingId || `${pageUuid}-${node.type}-${Date.now()}-${randomHex()}`

    return {
      ...node,
      attrs: {
        ...(node.attrs || {}),
        id,
        metadata: {
          ...(node.attrs?.metadata || {}), // Preserve existing metadata first
          id,
          isOrganized: true,               // Always mark as organized
          lastUpdated: nowIso,             // Always update timestamp
          organizationStatus: 'yes',       // Always mark as organized
        },
      },
    }
  })
} 