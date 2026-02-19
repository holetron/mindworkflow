import { logger } from '../../lib/logger';


const log = logger.child({ module: 'db/edgeRepository' });
// edgeRepository.ts — Edge operations
import {
  db,
  withTransaction,
  createHttpError,
} from '../connection';
import type {
  StoredEdge,
  ProjectFlow,
  AddProjectEdgeResult,
} from '../types';

// ---- Internal helpers --------------------------------------------------------

function assertNodeExists(projectId: string, nodeId: string): void {
  const row = db
    .prepare(`SELECT 1 FROM nodes WHERE project_id = ? AND node_id = ? LIMIT 1`)
    .get(projectId, nodeId) as unknown;
  if (!row) {
    throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);
  }
}

function edgeExists(
  projectId: string,
  fromNode: string,
  toNode: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  // Check if edge exists with the same nodes AND handles
  // Handles comparison: both null counts as match, or exact match
  const row = db
    .prepare(`SELECT 1 FROM edges
              WHERE project_id = ?
              AND from_node = ?
              AND to_node = ?
              AND ((source_handle IS NULL AND ? IS NULL) OR source_handle = ?)
              AND ((target_handle IS NULL AND ? IS NULL) OR target_handle = ?)
              LIMIT 1`)
    .get(
      projectId,
      fromNode,
      toNode,
      sourceHandle ?? null,
      sourceHandle ?? null,
      targetHandle ?? null,
      targetHandle ?? null,
    ) as unknown;
  return Boolean(row);
}

// ---- Edge read operations ----------------------------------------------------

export function listProjectEdges(projectId: string): StoredEdge[] {
  const rows = db
    .prepare(`SELECT project_id, from_node, to_node, label, source_handle, target_handle FROM edges WHERE project_id = ?`)
    .all(projectId) as Array<{
      project_id: string;
      from_node: string;
      to_node: string;
      label: string | null;
      source_handle: string | null;
      target_handle: string | null;
    }>;
  return rows.map((row) => ({
    project_id: row.project_id,
    from_node: row.from_node,
    to_node: row.to_node,
    label: row.label,
    source_handle: row.source_handle,
    target_handle: row.target_handle,
  }));
}

// ---- Edge write operations ---------------------------------------------------

export function addProjectEdge(
  projectId: string,
  edge: { from: string; to: string; label?: string | null; sourceHandle?: string | null; targetHandle?: string | null },
  userId?: string,
): AddProjectEdgeResult {
  // Lazy import to avoid circular dependency
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');

  const now = new Date().toISOString();
  const transactionResult = withTransaction(() => {
    assertNodeExists(projectId, edge.from);
    assertNodeExists(projectId, edge.to);
    if (edgeExists(projectId, edge.from, edge.to, edge.sourceHandle, edge.targetHandle)) {
      return 'duplicate' as const;
    }
    db.prepare(
      `INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle)
       VALUES (@project_id, @from_node, @to_node, @label, @source_handle, @target_handle)`,
    ).run({
      project_id: projectId,
      from_node: edge.from,
      to_node: edge.to,
      label: edge.label ?? null,
      source_handle: edge.sourceHandle ?? null,
      target_handle: edge.targetHandle ?? null,
    });
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
    return 'created' as const;
  });

  const status: 'created' | 'duplicate' = transactionResult ?? 'created';
  const project = getProject(projectId, userId, { bypassAuth: !userId });
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after edge insert`);
  }
  if (status === 'created') {
    writeProjectFile(project);
  }

  const result: AddProjectEdgeResult = { project, status };
  if (status === 'duplicate') {
    result.notification = {
      code: 'duplicate_edge',
      message: `Connection ${edge.from} -> ${edge.to} already exists`,
      severity: 'warning',
    };
  }

  return result;
}

export function removeProjectEdge(
  projectId: string,
  fromNode: string,
  toNode: string,
  userId?: string,
): ProjectFlow {
  // Lazy import to avoid circular dependency
  const { getProject, writeProjectFile } = require('./projectRepository') as typeof import('./projectRepository');

  log.info({ projectId, fromNode, toNode }, 'removeProjectEdge called');
  const now = new Date().toISOString();
  withTransaction(() => {
    const removal = db
      .prepare(`DELETE FROM edges WHERE project_id = ? AND from_node = ? AND to_node = ?`)
      .run(projectId, fromNode, toNode);
    // Don't throw error if edge doesn't exist - it might have been already deleted
    // when deleting connected nodes in bulk operations
    if (removal.changes > 0) {
      db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
    }
  });

  const project = getProject(projectId, userId, { bypassAuth: !userId });
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after edge removal`);
  }
  writeProjectFile(project);
  log.info({ edgeCount: project.edges.length }, 'removeProjectEdge returning project');
  return project;
}
