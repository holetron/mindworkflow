// nodeWriteRepository.ts — Complex node write operations (update, create, delete, clone)
import {
  NodeUI,
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from '../../types';
import {
  normalizeNodeConnections,
  normalizeNodeUI,
  normalizeAiVisible,
  mergeNodeUI,
  mergeNodeConnections,
} from '../../validation';
import { applyTextOperations } from '../../utils/textOperations';
import {
  db,
  withTransaction,
  createHttpError,
  booleanToInteger,
  serializeConnectionsJson,
} from '../connection';
import type {
  StoredNode,
  ProjectNode,
  ProjectFlow,
  NodeUpdatePatch,
  NodeCreateInput,
} from '../types';
import { getNode, listProjectNodes } from './nodeRepository';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'db/nodeWriteRepository' });
// ---- Internal helpers --------------------------------------------------------

function nodeExists(projectId: string, nodeId: string): boolean {
  const row = db.prepare(`SELECT 1 FROM nodes WHERE project_id = ? AND node_id = ? LIMIT 1`)
    .get(projectId, nodeId) as unknown;
  return Boolean(row);
}

function assertNodeExists(projectId: string, nodeId: string): void {
  if (!nodeExists(projectId, nodeId)) {
    throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);
  }
}

function projectExists(projectId: string): boolean {
  const row = db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(projectId) as unknown;
  return row !== undefined;
}

function sanitizeNodeSlug(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]+/g, '');
  return normalized || 'node';
}

function generateSequentialNodeId(projectId: string, slug: string): string {
  const normalizedSlug = sanitizeNodeSlug(slug);
  const rows = db.prepare(`SELECT node_id FROM nodes WHERE project_id = ?`)
    .all(projectId) as Array<{ node_id: string }>;
  const existing = new Set(rows.map((r) => r.node_id));
  let maxNumber = 0;
  for (const nodeId of existing) {
    const match = /^n(\d+)_/.exec(nodeId);
    if (match) { const v = Number.parseInt(match[1], 10); if (!Number.isNaN(v)) maxNumber = Math.max(maxNumber, v); }
  }
  let attempt = maxNumber + 1;
  let candidate = `n${attempt}_${normalizedSlug}`;
  while (existing.has(candidate)) { attempt += 1; candidate = `n${attempt}_${normalizedSlug}`; }
  return candidate;
}

function listChildren(projectId: string, nodeId: string): string[] {
  return (db.prepare(`SELECT to_node FROM edges WHERE project_id = ? AND from_node = ?`)
    .all(projectId, nodeId) as Array<{ to_node: string }>).map((r) => r.to_node);
}

function nextCloneId(projectId: string, baseId: string): string {
  const existingIds = (db.prepare(`SELECT node_id FROM nodes WHERE project_id = ? AND node_id LIKE ?`)
    .all(projectId, `${baseId}_clone_%`) as Array<{ node_id: string }>).map((r) => r.node_id);
  let counter = 1;
  while (true) {
    const candidate = `${baseId}_clone_${counter.toString().padStart(3, '0')}`;
    if (!existingIds.includes(candidate)) return candidate;
    counter += 1;
  }
}

// ---- Update node -------------------------------------------------------------

export function updateNode(
  projectId: string, nodeId: string, rawPatch: NodeUpdatePatch, userId?: string,
): ProjectNode {
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');
  assertNodeExists(projectId, nodeId);
  const updated_at = new Date().toISOString();
  const patch: NodeUpdatePatch = { ...rawPatch };

  withTransaction(() => {
    const stored = getNode(projectId, nodeId);
    if (!stored) throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);

    if (Array.isArray(patch.content_ops) && patch.content_ops.length > 0) {
      try {
        patch.content = applyTextOperations(typeof stored.content === 'string' ? stored.content : '', patch.content_ops);
      } catch (error) {
        throw createHttpError(400, `Invalid content operations: ${error instanceof Error ? error.message : 'Invalid operations'}`);
      }
    }
    delete patch.content_ops;

    const config = { ...(stored.config ?? {}) } as Record<string, unknown>;
    let configChanged = false;
    for (const key of ['ai', 'parser', 'python'] as const) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        if (patch[key]) { config[key] = patch[key]; } else { delete config[key]; }
        configChanged = true;
      }
    }

    let nextUi = stored.ui, uiChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'ui')) {
      nextUi = patch.ui === null ? createDefaultNodeUI() : mergeNodeUI(stored.ui, patch.ui); uiChanged = true;
    }
    let nextAiVisible = stored.ai_visible, aiVisibleChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'ai_visible')) {
      nextAiVisible = normalizeAiVisible(patch.ai_visible); aiVisibleChanged = true;
    }
    let nextConnections = stored.connections, connectionsChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'connections')) {
      nextConnections = patch.connections === null
        ? createDefaultNodeConnections() : mergeNodeConnections(stored.connections, patch.connections);
      connectionsChanged = true;
    }

    // BUG-009 FIX: Cleanup orphan edges when AI config changes
    if (Object.prototype.hasOwnProperty.call(patch, 'ai') && patch.ai) {
      const oldAiConfig = stored.config?.ai as any;
      const newAiConfig = patch.ai as any;
      const oldPortIds = (oldAiConfig?.auto_ports || []).map((p: any) => p.id || p).filter(Boolean);
      const newPortIds = (newAiConfig?.auto_ports || []).map((p: any) => p.id || p).filter(Boolean);
      const orphanPorts = oldPortIds.filter((port: string) => !newPortIds.includes(port));
      if (orphanPorts.length > 0) {
        log.info('`[DB-FIX-009] Cleaning up orphan edges for node ${nodeId}. Orphan ports:` %s', orphanPorts);
        for (const port of orphanPorts) {
          db.prepare(`DELETE FROM edges WHERE project_id = ? AND from_node = ? AND source_handle = ?`).run(projectId, nodeId, port);
          db.prepare(`DELETE FROM edges WHERE project_id = ? AND to_node = ? AND target_handle = ?`).run(projectId, nodeId, port);
        }
        log.info(`[DB-FIX-009] Deleted edges for orphan ports: ${orphanPorts.join(', ')}`);
      }
    }

    db.prepare(
      `UPDATE nodes SET title = COALESCE(@title, title), content = COALESCE(@content, content),
           content_type = COALESCE(@content_type, content_type), meta_json = COALESCE(@meta_json, meta_json),
           config_json = COALESCE(@config_json, config_json), ui_color = COALESCE(@ui_color, ui_color),
           bbox_x1 = COALESCE(@bbox_x1, bbox_x1), bbox_y1 = COALESCE(@bbox_y1, bbox_y1),
           bbox_x2 = COALESCE(@bbox_x2, bbox_x2), bbox_y2 = COALESCE(@bbox_y2, bbox_y2),
           ai_visible = COALESCE(@ai_visible, ai_visible), connections_json = COALESCE(@connections_json, connections_json),
           updated_at = @updated_at WHERE project_id = @project_id AND node_id = @node_id`,
    ).run({
      project_id: projectId, node_id: nodeId,
      title: patch.title ?? null,
      content: Object.prototype.hasOwnProperty.call(patch, 'content') ? patch.content ?? null : null,
      content_type: Object.prototype.hasOwnProperty.call(patch, 'content_type') ? patch.content_type ?? null : null,
      meta_json: Object.prototype.hasOwnProperty.call(patch, 'meta') ? JSON.stringify(patch.meta ?? {}) : null,
      config_json: configChanged ? JSON.stringify(config) : null,
      ui_color: uiChanged ? nextUi.color : null,
      bbox_x1: uiChanged ? nextUi.bbox.x1 : null, bbox_y1: uiChanged ? nextUi.bbox.y1 : null,
      bbox_x2: uiChanged ? nextUi.bbox.x2 : null, bbox_y2: uiChanged ? nextUi.bbox.y2 : null,
      ai_visible: aiVisibleChanged ? booleanToInteger(nextAiVisible) : null,
      connections_json: connectionsChanged ? serializeConnectionsJson(nextConnections) : null,
      updated_at,
    });
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(updated_at, projectId);
  });

  const project = getProject(projectId, userId);
  if (!project) throw createHttpError(404, `Project ${projectId} not found after node update`);
  writeProjectFile(project);
  const node = project.nodes.find((item) => item.node_id === nodeId);
  if (!node) throw createHttpError(404, `Node ${nodeId} not found after update`);
  return node;
}

// ---- Update node meta (system) -----------------------------------------------

export function updateNodeMetaSystem(
  projectId: string, nodeId: string, meta: Record<string, unknown>,
): ProjectNode | null {
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');
  const updated_at = new Date().toISOString();
  withTransaction(() => {
    db.prepare(`UPDATE nodes SET meta_json = @meta_json, updated_at = @updated_at WHERE project_id = @project_id AND node_id = @node_id`)
      .run({ project_id: projectId, node_id: nodeId, meta_json: JSON.stringify(meta ?? {}), updated_at });
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(updated_at, projectId);
  });
  const project = getProject(projectId, undefined, { bypassAuth: true });
  if (!project) return null;
  writeProjectFile(project);
  return project.nodes.find((item) => item.node_id === nodeId) ?? null;
}

// ---- Create node -------------------------------------------------------------

export function createProjectNode(
  projectId: string, input: NodeCreateInput,
  options?: { position?: { x: number; y: number } },
): { node: ProjectNode; updated_at: string } {
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');
  if (!projectExists(projectId)) throw createHttpError(404, `Project ${projectId} not found`);

  const slug = sanitizeNodeSlug(input.slug ?? input.type ?? 'node');
  let nodeId = input.node_id?.trim();
  if (nodeId) {
    if (nodeExists(projectId, nodeId)) throw createHttpError(409, `Node ${nodeId} already exists in project ${projectId}`);
  } else {
    nodeId = generateSequentialNodeId(projectId, slug);
  }

  const now = new Date().toISOString();
  const meta = { ...(input.meta ?? {}) } as Record<string, unknown>;
  if (options?.position) meta.ui_position = { x: Math.round(options.position.x), y: Math.round(options.position.y) };

  const config: Record<string, unknown> = {};
  if (input.ai) config.ai = input.ai;
  if (input.parser) config.parser = input.parser;
  if (input.python) config.python = input.python;
  const visibility = { ...(input.visibility_rules ?? {}) } as Record<string, unknown>;

  const uiSeed: Partial<NodeUI> = input.ui ? { ...input.ui } : {};
  if (options?.position) {
    const defaultUi = createDefaultNodeUI();
    const dw = typeof uiSeed.bbox?.x2 === 'number' && typeof uiSeed.bbox?.x1 === 'number'
      ? uiSeed.bbox.x2 - uiSeed.bbox.x1 : defaultUi.bbox.x2 - defaultUi.bbox.x1;
    const dh = typeof uiSeed.bbox?.y2 === 'number' && typeof uiSeed.bbox?.y1 === 'number'
      ? uiSeed.bbox.y2 - uiSeed.bbox.y1 : defaultUi.bbox.y2 - defaultUi.bbox.y1;
    const x1 = Math.round(options.position.x), y1 = Math.round(options.position.y);
    uiSeed.bbox = { ...(uiSeed.bbox ?? {}), x1, y1, x2: x1 + dw, y2: y1 + dh };
  }
  const ui = normalizeNodeUI(uiSeed);
  const aiVisible = normalizeAiVisible(input.ai_visible);
  const connections = normalizeNodeConnections(input.connections);

  withTransaction(() => {
    db.prepare(
      `INSERT INTO nodes (project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at)
       VALUES (@project_id, @node_id, @type, @title, @content_type, @content, @meta_json, @config_json, @visibility_json, @ui_color, @bbox_x1, @bbox_y1, @bbox_x2, @bbox_y2, @ai_visible, @connections_json, @created_at, @updated_at)`,
    ).run({
      project_id: projectId, node_id: nodeId, type: input.type, title: input.title,
      content_type: input.content_type ?? null, content: input.content ?? null,
      meta_json: JSON.stringify(meta), config_json: JSON.stringify(config),
      visibility_json: JSON.stringify(visibility), ui_color: ui.color,
      bbox_x1: ui.bbox.x1, bbox_y1: ui.bbox.y1, bbox_x2: ui.bbox.x2, bbox_y2: ui.bbox.y2,
      ai_visible: booleanToInteger(aiVisible), connections_json: JSON.stringify(connections),
      created_at: now, updated_at: now,
    });
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
  });

  const project = getProject(projectId, undefined, { bypassAuth: true });
  if (!project) throw createHttpError(404, `Project ${projectId} not found after node creation`);
  writeProjectFile(project);
  const node = project.nodes.find((item) => item.node_id === nodeId);
  if (!node) throw createHttpError(404, `Node ${nodeId} not found after creation`);
  return { node, updated_at: now };
}

// ---- Delete node -------------------------------------------------------------

export function deleteProjectNode(projectId: string, nodeId: string, userId?: string): ProjectFlow {
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');
  const trx = db.transaction((projId: string, nId: string) => {
    const exists = db.prepare('SELECT 1 FROM nodes WHERE project_id = ? AND node_id = ?').get(projId, nId);
    if (!exists) { const e = new Error(`Node ${nId} not found in project ${projId}`); (e as any).status = 404; throw e; }
    db.prepare('DELETE FROM nodes WHERE project_id = ? AND node_id = ?').run(projId, nId);
    db.prepare('DELETE FROM edges WHERE project_id = ? AND (from_node = ? OR to_node = ?)').run(projId, nId, nId);
    db.prepare('DELETE FROM runs WHERE project_id = ? AND node_id = ?').run(projId, nId);
    db.prepare('DELETE FROM assets WHERE project_id = ? AND node_id = ?').run(projId, nId);
    db.prepare('UPDATE projects SET updated_at = ? WHERE project_id = ?').run(new Date().toISOString(), projId);
  });
  trx(projectId, nodeId);
  const project = getProject(projectId, userId, { bypassAuth: !userId });
  if (!project) throw createHttpError(404, `Project ${projectId} not found after node deletion`);
  writeProjectFile(project);
  return project;
}

// ---- Clone node --------------------------------------------------------------

export function cloneNode(projectId: string, sourceNodeId: string, includeSubnodes: boolean): StoredNode {
  const source = getNode(projectId, sourceNodeId);
  if (!source) throw new Error(`Node ${sourceNodeId} not found in project ${projectId}`);
  const cloneId = nextCloneId(projectId, sourceNodeId);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO nodes (project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at)
     VALUES (@project_id, @node_id, @type, @title, @content_type, @content, @meta_json, @config_json, @visibility_json, @ui_color, @bbox_x1, @bbox_y1, @bbox_x2, @bbox_y2, @ai_visible, @connections_json, @created_at, @updated_at)`,
  ).run({
    project_id: source.project_id, node_id: cloneId, type: source.type, title: `${source.title} (clone)`,
    content_type: source.content_type, content: source.content,
    meta_json: JSON.stringify(source.meta ?? {}), config_json: JSON.stringify(source.config ?? {}),
    visibility_json: JSON.stringify(source.visibility ?? {}), ui_color: source.ui.color,
    bbox_x1: source.ui.bbox.x1, bbox_y1: source.ui.bbox.y1,
    bbox_x2: source.ui.bbox.x2, bbox_y2: source.ui.bbox.y2,
    ai_visible: booleanToInteger(source.ai_visible),
    connections_json: JSON.stringify(source.connections ?? createDefaultNodeConnections()),
    created_at: now, updated_at: now,
  });

  db.prepare(
    `INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle)
     SELECT project_id, @clone_id, to_node, label, source_handle, target_handle
     FROM edges WHERE project_id = @project_id AND from_node = @source_id`,
  ).run({ project_id: projectId, source_id: sourceNodeId, clone_id: cloneId });

  if (includeSubnodes) {
    for (const childId of listChildren(projectId, sourceNodeId)) {
      const clonedChild = cloneNode(projectId, childId, false);
      db.prepare(`INSERT OR IGNORE INTO edges (project_id, from_node, to_node, label, source_handle, target_handle) VALUES (?, ?, ?, NULL, NULL, NULL)`)
        .run(projectId, cloneId, clonedChild.node_id);
    }
  }
  return getNode(projectId, cloneId)!;
}
