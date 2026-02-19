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

export const DEFAULT_MINDMAP_PROMPT = `Ты - эксперт по структурированию информации. Твоя задача:
1. Разбить информацию на логические блоки (узлы)
2. Установить иерархические связи между узлами (родитель-дети)
3. Каждый узел должен иметь: type, title, content
4. Создать tree структуру для визуализации

Пример формата ответа:
{
  "nodes": [
    {
      "type": "text",
      "title": "Название узла",
      "content": "Описание содержания узла",
      "children": [
        {
          "type": "text",
          "title": "Подузел",
          "content": "Описание подузла",
          "children": []
        }
      ]
    }
  ]
}`;

export const DEFAULT_MINDMAP_EXAMPLE = `Пример: Разбор проекта
{
  "nodes": [
    {
      "type": "text",
      "title": "Проект: Мобильное приложение",
      "content": "Разработка мобильного приложения для управления задачами",
      "children": [
        {
          "type": "text",
          "title": "Требования",
          "content": "Список функциональных и технических требований",
          "children": []
        },
        {
          "type": "text",
          "title": "Архитектура",
          "content": "Описание системной архитектуры приложения",
          "children": []
        }
      ]
    }
  ]
}`;
