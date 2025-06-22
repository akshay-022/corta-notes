function randomHex(len = 8): string {
  return Math.random().toString(16).slice(2, 2 + len)
}

/**
 * Ensure all paragraph (and other block) nodes have attrs.id and attrs.metadata.id etc
 * Returns a NEW array of nodes (does not mutate originals)
 */
export function ensureParagraphMetadata(nodes: any[], pageUuid: string): any[] {
  const nowIso = new Date().toISOString()

  return nodes.map((node) => {

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
  const nowIso = new Date().toISOString()

  console.log('🔍 DEBUG ensureMetadataMarkedOrganized received:', {
    pageUuid,
    nodesType: typeof nodes,
    isArray: Array.isArray(nodes),
    nodesKeys: nodes ? Object.keys(nodes) : 'null',
    nodesLength: nodes?.length,
    firstNode: nodes?.[0],
    fullNodes: nodes
  })

  return nodes.map((node) => {
    console.log('🔍 DEBUG inside map, processing node:', { node, nodeType: typeof node, nodeKeys: Object.keys(node || {}) })

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