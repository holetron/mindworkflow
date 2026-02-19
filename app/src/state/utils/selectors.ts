import type { ProjectFlow, FlowNode } from '../api';

/**
 * Selects a node by its ID from a project.
 */
export function selectNodeById(
  project: ProjectFlow | null,
  nodeId?: string | null,
): FlowNode | null {
  if (!project || !nodeId) return null;
  return project.nodes.find((node) => node.node_id === nodeId) ?? null;
}

/**
 * Builds a lookup map of node_id -> FlowNode for fast access.
 */
export function buildNodeMap(project: ProjectFlow | null): Map<string, FlowNode> {
  const map = new Map<string, FlowNode>();
  if (!project) return map;
  for (const node of project.nodes) {
    map.set(node.node_id, node);
  }
  return map;
}

/**
 * Finds all ancestor (upstream) nodes reachable from the given node
 * by traversing edges in reverse.
 */
export function findPreviousNodes(
  project: ProjectFlow | null,
  nodeId: string,
): FlowNode[] {
  if (!project) return [];
  const adjacency = new Map<string, string[]>();
  for (const edge of project.edges) {
    const list = adjacency.get(edge.to) ?? [];
    list.push(edge.from);
    adjacency.set(edge.to, list);
  }
  const result: FlowNode[] = [];
  const visited = new Set<string>();
  const stack = [...(adjacency.get(nodeId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = project.nodes.find((item) => item.node_id === current);
    if (node) {
      result.push(node);
      stack.push(...(adjacency.get(current) ?? []));
    }
  }
  return result;
}

/**
 * Finds all direct downstream nodes connected from the given node.
 */
export function findNextNodes(
  project: ProjectFlow | null,
  nodeId: string,
): FlowNode[] {
  if (!project) return [];
  return project.edges
    .filter((edge) => edge.from === nodeId)
    .map((edge) => project.nodes.find((node) => node.node_id === edge.to))
    .filter((node): node is FlowNode => Boolean(node));
}
