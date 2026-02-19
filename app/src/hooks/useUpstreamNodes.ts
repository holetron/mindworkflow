/**
 * Hook to get upstream nodes connected to a specific node
 */

import { useMemo } from 'react';
import { useProjectStore } from '../state/store';
import type { FlowNode } from '../state/api';

export interface UpstreamNode {
  id: string;
  label: string;
  type: string;
  content: string;
}

/**
 * Get all nodes that connect to the specified node
 */
export function useUpstreamNodes(nodeId: string): UpstreamNode[] {
  const project = useProjectStore((state) => state.project);

  return useMemo(() => {
    if (!project) return [];
    
    const nodes = project.nodes || [];
    const edges = project.edges || [];
    
    // Find all edges that target this node
    const incomingEdges = edges.filter((edge) => edge.to === nodeId);

    // Get source nodes
    const upstreamNodes: UpstreamNode[] = [];
    
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.node_id === edge.from);
      if (sourceNode) {
        upstreamNodes.push({
          id: sourceNode.node_id,
          label: sourceNode.title || sourceNode.node_id,
          type: sourceNode.type || 'unknown',
          content: extractNodeContent(sourceNode)
        });
      }
    }

    return upstreamNodes;
  }, [nodeId, project]);
}

/**
 * Extract content from a node for context calculation
 */
function extractNodeContent(node: FlowNode): string {
  // Try to get content from the node
  if (node.content) return String(node.content);
  if (node.title) return String(node.title);
  
  // For AI nodes, check meta.response
  const meta = node.meta || {};
  if (meta.response) return String(meta.response);
  if (meta.result) return String(meta.result);
  
  // Fallback to node id
  return node.node_id;
}
