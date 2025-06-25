function randomHex(len = 8): string {
  return Math.random().toString(16).slice(2, 2 + len)
}

/**
 * Ensure all paragraph (and other block) nodes have attrs.id and attrs.metadata.id etc
 * Returns a NEW array of nodes (does not mutate originals)
 */
export function ensureParagraphMetadata(nodes: any[], pageUuid: string): any[] {
  console.log('🔧 === ENSURE PARAGRAPH METADATA START ===')
  console.log('🔧 Input parameters:', {
    nodesType: typeof nodes,
    nodesIsArray: Array.isArray(nodes),
    nodesLength: nodes?.length,
    pageUuid: pageUuid.substring(0, 8)
  })

  const nowIso = new Date().toISOString()
  console.log('🔧 Generated timestamp:', nowIso)

  const result = nodes.map((node, index) => {
    console.log(`🔧 --- Processing node ${index} ---`)
    console.log(`🔧 Node ${index} input:`, {
      nodeType: node?.type,
      hasAttrs: !!node?.attrs,
      existingId: node?.attrs?.id,
      existingMetadata: node?.attrs?.metadata,
      existingLastUpdated: node?.attrs?.metadata?.lastUpdated
    })

    const existingId = node?.attrs?.id || node?.attrs?.metadata?.id
    const id = existingId || `${pageUuid}-${node.type}-${Date.now()}-${randomHex()}`

    console.log(`🔧 Node ${index} ID resolution:`, {
      existingId,
      generatedId: id,
      usingExisting: !!existingId
    })

    const processedNode = {
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

    console.log(`🔧 Node ${index} output:`, {
      nodeType: processedNode.type,
      finalId: processedNode.attrs.id,
      finalLastUpdated: processedNode.attrs.metadata.lastUpdated,
      finalIsOrganized: processedNode.attrs.metadata.isOrganized,
      finalOrgStatus: processedNode.attrs.metadata.organizationStatus,
      metadataKeys: Object.keys(processedNode.attrs.metadata)
    })

    return processedNode
  })

  console.log('🔧 === ENSURE PARAGRAPH METADATA END ===')
  console.log('🔧 Final result:', {
    resultType: typeof result,
    resultIsArray: Array.isArray(result),
    resultLength: result.length,
    allNodesHaveMetadata: result.every(n => !!n.attrs?.metadata),
    allNodesHaveLastUpdated: result.every(n => !!n.attrs?.metadata?.lastUpdated)
  })

  return result
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
          // Preserve existing lastUpdated timestamp - don't overwrite it!
          lastUpdated: node.attrs?.metadata?.lastUpdated || nowIso, // Only set if missing
          organizationStatus: 'yes',       // Always mark as organized
        },
      },
    }
  })
} 