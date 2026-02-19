// nodeRepository.ts — Node read operations + simple content update
import {
  db,
  safeParse,
  integerToBoolean,
  toNodeUI,
  parseConnectionsJson,
} from '../connection';
import type { StoredNode } from '../types';

// Re-export write operations so existing imports from nodeRepository still work
export {
  updateNode,
  updateNodeMetaSystem,
  createProjectNode,
  deleteProjectNode,
  cloneNode,
} from './nodeWriteRepository';

// ---- Node read operations ----------------------------------------------------

export function getNode(projectId: string, nodeId: string): StoredNode | undefined {
  const row = db
    .prepare(
      `SELECT project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json,
              ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json,
              created_at, updated_at
       FROM nodes WHERE project_id = ? AND node_id = ?`,
    )
    .get(projectId, nodeId) as
    | {
        project_id: string;
        node_id: string;
        type: string;
        title: string;
        content_type: string | null;
        content: string | null;
        meta_json: string;
        config_json: string;
        visibility_json: string;
        ui_color: string;
        bbox_x1: number;
        bbox_y1: number;
        bbox_x2: number;
        bbox_y2: number;
        ai_visible: number;
        connections_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return undefined;
  return {
    project_id: row.project_id,
    node_id: row.node_id,
    type: row.type,
    title: row.title,
    content_type: row.content_type,
    content: row.content,
    meta: safeParse(row.meta_json),
    config: safeParse(row.config_json),
    visibility: safeParse(row.visibility_json),
    ui: toNodeUI(row),
    ai_visible: integerToBoolean(row.ai_visible),
    connections: parseConnectionsJson(row.connections_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listProjectNodes(projectId: string): StoredNode[] {
  const rows = db
    .prepare(
      `SELECT project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json,
              ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json,
              created_at, updated_at
       FROM nodes WHERE project_id = ?`,
    )
    .all(projectId) as Array<{
      project_id: string;
      node_id: string;
      type: string;
      title: string;
      content_type: string | null;
      content: string | null;
      meta_json: string;
      config_json: string;
      visibility_json: string;
      ui_color: string;
      bbox_x1: number;
      bbox_y1: number;
      bbox_x2: number;
      bbox_y2: number;
      ai_visible: number;
      connections_json: string;
      created_at: string;
      updated_at: string;
    }>;

  return rows.map((row) => ({
    project_id: row.project_id,
    node_id: row.node_id,
    type: row.type,
    title: row.title,
    content_type: row.content_type,
    content: row.content,
    meta: safeParse(row.meta_json),
    config: safeParse(row.config_json),
    visibility: safeParse(row.visibility_json),
    ui: toNodeUI(row),
    ai_visible: integerToBoolean(row.ai_visible),
    connections: parseConnectionsJson(row.connections_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

// ---- Simple node content update ----------------------------------------------

export function updateNodeContent(
  projectId: string,
  nodeId: string,
  data: {
    content?: string | null;
    content_type?: string | null;
    meta?: Record<string, unknown>;
  },
): void {
  const updated_at = new Date().toISOString();
  db.prepare(
    `UPDATE nodes
     SET content = COALESCE(@content, content),
         content_type = COALESCE(@content_type, content_type),
         meta_json = COALESCE(@meta_json, meta_json),
         updated_at = @updated_at
     WHERE project_id = @project_id AND node_id = @node_id`,
  ).run({
    project_id: projectId,
    node_id: nodeId,
    content: data.content ?? null,
    content_type: data.content_type ?? null,
    meta_json: data.meta ? JSON.stringify(data.meta) : null,
    updated_at,
  });
}
