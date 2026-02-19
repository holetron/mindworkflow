/**
 * Execution-related TypeScript types
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import type { StoredNode, StoredEdge } from '../../db';
import type { CreatedNodeSummary, CreatedNodeSnapshot } from '../transformerService';

// ============================================================
// Execution context
// ============================================================

export interface ExecutionContext {
  projectId: string;
  node: StoredNode;
  allNodes: Map<string, StoredNode>;
  edges: StoredEdge[];
  sortedNodeIds: string[];
}

// ============================================================
// Execution results
// ============================================================

export interface ExecutionResult {
  status: 'success' | 'failed';
  nodeId: string;
  content?: string | null;
  contentType?: string | null;
  logs: string[];
  runId: string;
  createdNodes?: CreatedNodeSummary[];
  createdNodeSnapshots?: CreatedNodeSnapshot[];
  isMultiNodeResult?: boolean;
  predictionUrl?: string;
  predictionId?: string;
  provider?: string;
  predictionPayload?: unknown;
}

export interface ExecutionStepResult {
  content: string;
  contentType: string;
  logs: string[];
  createdNodes?: CreatedNodeSummary[];
  createdNodeSnapshots?: CreatedNodeSnapshot[];
  isMultiNodeResult?: boolean;
  predictionUrl?: string;
  predictionId?: string;
  provider?: string;
  predictionPayload?: unknown;
}

// ============================================================
// Retry mechanism
// ============================================================

export interface RetryOutcome<T> {
  result: T;
  attempts: number;
  logs: string[];
}

// ============================================================
// Replicate artifacts
// ============================================================

export interface ReplicateArtifact {
  kind: 'text' | 'image' | 'video';
  value: string;
  title?: string;
}

export interface ReplicateAssetNodesResult {
  createdNodes: CreatedNodeSummary[];
  nodeSnapshots: CreatedNodeSnapshot[];
  logs: string[];
  aggregatedText: string | null;
}

// ============================================================
// Collected file from previous nodes
// ============================================================

export interface CollectedFile {
  name: string;
  type: string;
  content: string;
  source_node_id: string;
}

// ============================================================
// Next-node metadata entry
// ============================================================

export interface NextNodeMetadataEntry {
  node_id: string;
  type: string;
  title: string;
  short_description: string;
  connection_labels: string[];
}

// ============================================================
// Constants
// ============================================================

export const MAX_ATTEMPTS = 3;
export const BACKOFF = [0, 1_000, 2_000];

// ============================================================
// Default prompts for auto-filling when empty
// ============================================================

export const DEFAULT_MINDMAP_PROMPT = `You are an expert in information structuring. Your task:
1. Break information into logical blocks (nodes)
2. Establish hierarchical relationships between nodes (parent-children)
3. Each node must have: type, title, content
4. Create a tree structure for visualization

Example response format:
{
  "nodes": [
    {
      "type": "text",
      "title": "Node title",
      "content": "Description of node content",
      "children": [
        {
          "type": "text",
          "title": "Sub-node",
          "content": "Description of sub-node",
          "children": []
        }
      ]
    }
  ]
}`;

export const DEFAULT_MINDMAP_EXAMPLE = `Example: Project breakdown
{
  "nodes": [
    {
      "type": "text",
      "title": "Project: Mobile Application",
      "content": "Development of a mobile application for task management",
      "children": [
        {
          "type": "text",
          "title": "Requirements",
          "content": "List of functional and technical requirements",
          "children": []
        },
        {
          "type": "text",
          "title": "Architecture",
          "content": "Description of the application system architecture",
          "children": []
        }
      ]
    }
  ]
}`;
