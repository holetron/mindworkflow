/**
 * Execution context management: building context, collecting previous/next nodes,
 * topological sorting, and file collection from previous nodes.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import {
  StoredEdge,
  StoredNode,
  listProjectEdges,
  listProjectNodes,
} from '../../db';
import type { ExecutionContext, CollectedFile, NextNodeMetadataEntry } from './types';
import { buildShortDescription } from './helpers';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/contextManager' });
// ============================================================
// Build execution context
// ============================================================

export function buildExecutionContext(
  projectId: string,
  nodeId: string,
  topologicalSort: (allNodes: Map<string, StoredNode>, edges: StoredEdge[]) => { order: string[]; hasCycle: boolean },
): ExecutionContext {
  const allNodes = new Map<string, StoredNode>();
  for (const node of listProjectNodes(projectId)) {
    allNodes.set(node.node_id, node);
  }

  const node = allNodes.get(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  const edges = listProjectEdges(projectId);
  const sorted = topologicalSort(allNodes, edges);
  if (sorted.hasCycle) {
    throw new Error('Graph contains cycles. Execution aborted');
  }

  return { projectId, node, allNodes, edges, sortedNodeIds: sorted.order };
}

// ============================================================
// Topological sort
// ============================================================

export function topologicalSort(
  allNodes: Map<string, StoredNode>,
  edges: StoredEdge[],
): { order: string[]; hasCycle: boolean } {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const nodeId of allNodes.keys()) {
    indegree.set(nodeId, 0);
    adjacency.set(nodeId, []);
  }

  for (const edge of edges) {
    if (!indegree.has(edge.to_node)) {
      indegree.set(edge.to_node, 0);
    }
    indegree.set(edge.to_node, (indegree.get(edge.to_node) ?? 0) + 1);
    const list = adjacency.get(edge.from_node) ?? [];
    list.push(edge.to_node);
    adjacency.set(edge.from_node, list);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) queue.push(nodeId);
  }

  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const next = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, next);
      if (next === 0) queue.push(neighbor);
    }
  }

  const hasCycle = order.length !== allNodes.size;
  return { order, hasCycle };
}

// ============================================================
// Collect previous nodes (upstream traversal)
// ============================================================

export function collectPreviousNodes(
  nodeId: string,
  order: string[],
  allNodes: Map<string, StoredNode>,
  edges: StoredEdge[],
  options?: { maxDepth?: number },
): StoredNode[] {
  const maxDepthRaw = options?.maxDepth;
  if (maxDepthRaw !== undefined && maxDepthRaw <= 0) {
    return [];
  }
  const maxDepth = maxDepthRaw ?? Number.POSITIVE_INFINITY;

  const adjacency = new Map<string, string[]>();
  const debugEdges: Array<{ edge: StoredEdge; included: boolean; reason: string }> = [];

  for (const edge of edges) {
    debugEdges.push({ edge, included: true, reason: 'included' });

    const list = adjacency.get(edge.to_node) ?? [];
    list.push(edge.from_node);
    adjacency.set(edge.to_node, list);
  }

  if (nodeId === process.env.DEBUG_NODE_ID) {
    log.info('`[collectPreviousNodes] DEBUG for node ${nodeId}:` %s', debugEdges.map(d => ({
      from: d.edge.from_node,
      to: d.edge.to_node,
      target_handle: d.edge.target_handle,
      included: d.included,
      reason: d.reason,
    })));
    log.info('`[collectPreviousNodes] adjacency for ${nodeId}:` %s', adjacency.get(nodeId));
  }

  const stack: Array<{ id: string; depth: number }> = (adjacency.get(nodeId) ?? []).map((from) => ({
    id: from,
    depth: 1,
  }));

  const seen = new Set<string>();
  const collected: Array<{ node: StoredNode; depth: number }> = [];

  while (stack.length) {
    const { id: currentId, depth } = stack.pop()!;
    if (depth > maxDepth) {
      continue;
    }
    if (seen.has(currentId)) {
      continue;
    }
    seen.add(currentId);

    const candidate = allNodes.get(currentId);
    if (!candidate) {
      continue;
    }

    collected.push({ node: candidate, depth });
    const upstream = adjacency.get(currentId) ?? [];
    for (const upstreamId of upstream) {
      stack.push({ id: upstreamId, depth: depth + 1 });
    }
  }

  if (collected.length === 0) {
    return [];
  }

  const orderIndex = new Map<string, number>();
  order.forEach((id, index) => orderIndex.set(id, index));

  collected.sort((a, b) => {
    const indexA = orderIndex.get(a.node.node_id) ?? Number.MAX_SAFE_INTEGER;
    const indexB = orderIndex.get(b.node.node_id) ?? Number.MAX_SAFE_INTEGER;
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return a.depth - b.depth;
  });

  const resolvedIds = new Set<string>();
  const resolved: StoredNode[] = [];

  const limitFromMeta = (meta: Record<string, unknown>): number => {
    const raw = meta.folder_context_limit;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const normalized = Math.trunc(raw);
      if (normalized > 0 && normalized <= 24) {
        return normalized;
      }
    }
    return 6;
  };

  for (const { node: predecessor } of collected) {
    if (resolvedIds.has(predecessor.node_id)) {
      continue;
    }
    resolved.push(predecessor);
    resolvedIds.add(predecessor.node_id);

    if (predecessor.type === 'folder') {
      const folderMeta = (predecessor.meta ?? {}) as Record<string, unknown>;
      const children = Array.isArray(folderMeta.folder_children)
        ? (folderMeta.folder_children as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];
      if (children.length > 0) {
        const limit = limitFromMeta(folderMeta);
        const slice = children.slice(-limit);
        for (const childId of slice) {
          if (resolvedIds.has(childId)) {
            continue;
          }
          const childNode = allNodes.get(childId);
          if (childNode) {
            resolved.push(childNode);
            resolvedIds.add(childId);
          }
        }
      }
    }
  }

  return resolved;
}

// ============================================================
// Collect next node metadata (downstream traversal)
// ============================================================

export function collectNextNodeMetadata(
  nodeId: string,
  allNodes: Map<string, StoredNode>,
  edges: StoredEdge[],
  options?: { maxDepth?: number },
): NextNodeMetadataEntry[] {
  const maxDepthRaw = options?.maxDepth;
  if (maxDepthRaw !== undefined && maxDepthRaw <= 0) {
    return [];
  }
  const maxDepth = maxDepthRaw ?? Number.POSITIVE_INFINITY;

  const adjacency = new Map<string, StoredEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from_node) ?? [];
    list.push(edge);
    adjacency.set(edge.from_node, list);
  }

  const stack: Array<{ edge: StoredEdge; depth: number }> = (adjacency.get(nodeId) ?? []).map((edge) => ({
    edge,
    depth: 1,
  }));

  const seen = new Set<string>();
  const results: NextNodeMetadataEntry[] = [];

  while (stack.length) {
    const { edge, depth } = stack.pop()!;
    if (depth > maxDepth) {
      continue;
    }

    const targetId = edge.to_node;
    if (seen.has(targetId)) {
      continue;
    }
    seen.add(targetId);

    const target = allNodes.get(targetId);
    results.push({
      node_id: targetId,
      type: target?.type ?? 'text',
      title: target?.title ?? 'Следующий узел',
      short_description: buildShortDescription(target),
      connection_labels: depth === 1 && edge.label ? [edge.label] : [],
    });

    const downstreamEdges = adjacency.get(targetId) ?? [];
    downstreamEdges.forEach((nextEdge) => {
      stack.push({ edge: nextEdge, depth: depth + 1 });
    });
  }

  return results;
}

// ============================================================
// Collect files from previous nodes (media ports)
// ============================================================

export async function collectFilesFromPreviousNodes(
  previousNodes: StoredNode[],
  currentNodeId: string,
  edges?: StoredEdge[],
): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];

  const mediaPortNames = new Set([
    'reference_image',
    'image_prompt',
    'style_reference',
    'character_reference',
    'style_prompt',
    'clip_prompt',
    'image_input',
    'video_input',
    'audio_input',
    'file_input',
    'text_input',
  ]);

  log.info(`\n[collectFilesFromPreviousNodes] ========== НАЧАЛО ==========`);
  log.info(`[collectFilesFromPreviousNodes] currentNodeId: ${currentNodeId}`);
  log.info(`[collectFilesFromPreviousNodes] previousNodes: ${previousNodes.length} ноды`);
  log.info(`[collectFilesFromPreviousNodes] edges: ${edges ? edges.length : 0} всего`);

  // ========== STEP 2: FIND ALL INCOMING EDGES ==========
  const incomingEdgesMap = new Map<string, string[]>();

  if (edges && edges.length > 0) {
    log.info(`[collectFilesFromPreviousNodes]\n========== СКАНИРОВАНИЕ ВСЕХ EDGES ==========`);

    for (const edge of edges) {
      const isIncomingEdge = edge.to_node === currentNodeId;

      if (isIncomingEdge) {
        log.info(`[collectFilesFromPreviousNodes] ВХОДЯЩЕЕ EDGE: ${edge.from_node} -> ${currentNodeId}, port: '${edge.target_handle}'`);

        if (!edge.target_handle) {
          log.info(`[collectFilesFromPreviousNodes]    БЕЗ target_handle - ПРОПУСК`);
          continue;
        }

        if (!incomingEdgesMap.has(edge.from_node)) {
          incomingEdgesMap.set(edge.from_node, []);
        }
        incomingEdgesMap.get(edge.from_node)!.push(edge.target_handle);
      }
    }
  }

  log.info(`[collectFilesFromPreviousNodes] НАЙДЕНО входящих edges: ${incomingEdgesMap.size}`);
  log.info(`[collectFilesFromPreviousNodes] Ноды с входящими edges: ${Array.from(incomingEdgesMap.keys()).join(', ')}`);

  // ========== STEP 3: FILTER BY PORTS ==========
  const nodesConnectedToMediaPorts = new Set<string>();

  log.info(`[collectFilesFromPreviousNodes]\n========== ФИЛЬТРАЦИЯ ПО ПОРТАМ ==========`);

  for (const [fromNodeId, ports] of incomingEdgesMap.entries()) {
    const mediaPortsForThisNode = ports.filter(port => mediaPortNames.has(port));

    if (mediaPortsForThisNode.length > 0) {
      nodesConnectedToMediaPorts.add(fromNodeId);
      log.info(`[collectFilesFromPreviousNodes] ${fromNodeId}: ports [${ports.join(', ')}] -> media ports [${mediaPortsForThisNode.join(', ')}]`);
    } else {
      log.info(`[collectFilesFromPreviousNodes] ${fromNodeId}: ports [${ports.join(', ')}] -> НЕ media ports`);
    }
  }

  log.info(`[collectFilesFromPreviousNodes] ИТОГО: ${nodesConnectedToMediaPorts.size} нод подключены к media портам`);

  // ========== STEP 4: COLLECT FILES FROM MATCHING NODES ==========
  log.info(`[collectFilesFromPreviousNodes]\n========== ОБРАБОТКА НОД ==========`);

  for (const node of previousNodes) {
    const hasIncomingEdge = incomingEdgesMap.has(node.node_id);
    const isMediaNode = nodesConnectedToMediaPorts.has(node.node_id);

    if (!hasIncomingEdge) {
      log.info(`[collectFilesFromPreviousNodes] - ${node.node_id} (${node.type}): НЕТ входящих edges -> ПРОПУСК`);
      continue;
    }

    if (!isMediaNode) {
      log.info(`[collectFilesFromPreviousNodes] - ${node.node_id} (${node.type}): входящие edges НЕ к media портам -> ПРОПУСК`);
      continue;
    }

    const portsForThisNode = incomingEdgesMap.get(node.node_id) || [];
    const mediaPortsForThisNode = portsForThisNode.filter(port => mediaPortNames.has(port));
    const primaryPort = mediaPortsForThisNode[0] || 'reference_image';

    log.info(`[collectFilesFromPreviousNodes] - ${node.node_id} (${node.type}): ВКЛЮЧАЕМ (ports: [${mediaPortsForThisNode.join(', ')}])`);

    // Process file nodes
    if (node.type === 'file' && node.content) {
      files.push({
        name: primaryPort,
        type: node.content_type || 'text/plain',
        content: node.content,
        source_node_id: node.node_id,
      });
    }

    // Process image nodes
    if (node.type === 'image') {
      const meta = node.meta as Record<string, unknown> | undefined;

      let imageUrl = meta?.image_url as string | undefined;
      if (!imageUrl && meta?.image_path) {
        imageUrl = `/uploads/${node.project_id}/${meta.image_path}`.replace(/\\/g, '/');
      }
      if (!imageUrl) {
        imageUrl = (meta?.original_image || meta?.image_original || meta?.image_edited || meta?.edited_image) as string | undefined;
      }

      if (imageUrl) {
        let processedUrl = imageUrl;
        if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
          const urlObj = new URL(imageUrl);
          const pathname = urlObj.pathname;
          const uploadsMatch = pathname.match(/\/uploads\/(.+)/);
          if (uploadsMatch) {
            const relativePath = uploadsMatch[1];
            processedUrl = `https://mindworkflow.com/uploads/${relativePath}`;
            log.info(`[collectFilesFromPreviousNodes] Converted localhost URL to public: ${imageUrl} -> ${processedUrl}`);
          }
        }

        const fileType = processedUrl.startsWith('data:') ? 'image/base64' : 'image/url';

        files.push({
          name: primaryPort,
          type: fileType,
          content: processedUrl,
          source_node_id: node.node_id,
        });
      }
      if (meta?.image_data) {
        files.push({
          name: primaryPort,
          type: 'image/base64',
          content: meta.image_data as string,
          source_node_id: node.node_id,
        });
      }
    }

    // Process text nodes as documents
    if (node.type === 'text' && node.content) {
      const contentType = typeof node.content_type === 'string' ? node.content_type : 'text/plain';
      if (contentType === 'text/markdown') {
        files.push({
          name: primaryPort,
          type: 'text/markdown',
          content: node.content,
          source_node_id: node.node_id,
        });
      } else if (node.content.length > 100) {
        files.push({
          name: primaryPort,
          type: contentType,
          content: node.content,
          source_node_id: node.node_id,
        });
      }
    }

    // Process HTML nodes
    if (node.type === 'html' && node.content) {
      files.push({
        name: primaryPort,
        type: 'text/html',
        content: node.content,
        source_node_id: node.node_id,
      });
    }
  }

  log.info(`[collectFilesFromPreviousNodes]\n========== ИТОГ ==========`);
  log.info(`[collectFilesFromPreviousNodes] ВОЗВРАЩАЕМ: ${files.length} файлов`);
  if (files.length > 0) {
    log.info(`[collectFilesFromPreviousNodes] Файлы: ${files.map(f => `${f.name} (${f.type})`).join(', ')}`);
  }
  log.info(`[collectFilesFromPreviousNodes] ==========\n`);

  return files;
}
