// projectRepository.ts — Project CRUD, import/export, clone, file operations
import * as path from 'path';
import * as fs from 'fs';
import { getProjectDir, resolveProjectPath } from '../../utils/projectPaths';
import {
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from '../../types';
import { normalizeAiVisible } from '../../validation';
import {
  db,
  withTransaction,
  safeParse,
  createHttpError,
  decomposeNodeUI,
  serializeConnectionsJson,
  booleanToInteger,
  extractConfig,
  deepMerge,
} from '../connection';
import type {
  ProjectRole,
  ProjectFlow,
  ProjectSummary,
} from '../types';
import { listProjectNodes } from './nodeRepository';
import { listProjectEdges } from './edgeRepository';
import {
  getProjectRole,
  listProjectCollaborators,
  upsertProjectCollaborator,
} from './collaboratorRepository';

// Re-export collaborator functions so existing imports from projectRepository still work
export {
  getProjectRole,
  listProjectCollaborators,
  upsertProjectCollaborator,
  removeProjectCollaborator,
  getProjectOwnerId,
  updateProjectOwner,
  listAdminProjects,
} from './collaboratorRepository';

// ---- Project file helpers ----------------------------------------------------

export function ensureProjectDirs(projectId: string): void {
  const projectRoot = getProjectDir(projectId);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'project_output'), { recursive: true });
  const driveRoot = path.resolve(process.cwd(), 'drive', projectId);
  fs.mkdirSync(driveRoot, { recursive: true });
}

export function mirrorProjectToDrive(projectId: string): void {
  const driveRoot = path.resolve(process.cwd(), 'drive');
  const sourceDir = getProjectDir(projectId);
  const targetDir = path.join(driveRoot, projectId);
  fs.mkdirSync(driveRoot, { recursive: true });

  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

export function writeProjectFile(project: ProjectFlow): void {
  ensureProjectDirs(project.project_id);
  const filePath = resolveProjectPath(project.project_id, 'project.flow.json');
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8');
  mirrorProjectToDrive(project.project_id);
}

// ---- Project queries ---------------------------------------------------------

export function projectExists(projectId: string): boolean {
  const row = db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(projectId) as unknown;
  return row !== undefined;
}

export function listProjects(userId?: string): ProjectSummary[] {
  if (userId) {
    const userRow = db.prepare('SELECT is_admin FROM users WHERE user_id = ?').get(userId) as { is_admin: number } | undefined;
    const isAdmin = userRow?.is_admin === 1;

    const query = isAdmin
      ? `SELECT p.project_id, p.title, p.description, p.created_at, p.updated_at, p.user_id, p.is_public,
                (SELECT COUNT(*) FROM project_collaborators pc_cnt WHERE pc_cnt.project_id = p.project_id AND pc_cnt.role = 'editor') AS editor_count,
                (SELECT COUNT(*) FROM project_collaborators pc_cnt WHERE pc_cnt.project_id = p.project_id AND pc_cnt.role = 'viewer') AS viewer_count,
                CASE
                  WHEN p.user_id = ? THEN 'owner'
                  WHEN pc.role IS NOT NULL THEN pc.role
                  ELSE NULL
                END AS role
         FROM projects p
         LEFT JOIN project_collaborators pc
           ON pc.project_id = p.project_id AND pc.user_id = ?
         ORDER BY datetime(p.updated_at) DESC`
      : `SELECT p.project_id, p.title, p.description, p.created_at, p.updated_at, p.user_id, p.is_public,
                (SELECT COUNT(*) FROM project_collaborators pc_cnt WHERE pc_cnt.project_id = p.project_id AND pc_cnt.role = 'editor') AS editor_count,
                (SELECT COUNT(*) FROM project_collaborators pc_cnt WHERE pc_cnt.project_id = p.project_id AND pc_cnt.role = 'viewer') AS viewer_count,
                CASE
                  WHEN p.user_id = ? THEN 'owner'
                  WHEN pc.role IS NOT NULL THEN pc.role
                  ELSE NULL
                END AS role
         FROM projects p
         LEFT JOIN project_collaborators pc
           ON pc.project_id = p.project_id AND pc.user_id = ?
         WHERE p.user_id = ? OR pc.user_id IS NOT NULL
         ORDER BY datetime(p.updated_at) DESC`;

    const params = isAdmin ? [userId, userId] : [userId, userId, userId];
    const rows = db.prepare(query).all(...params) as Array<{
      project_id: string; title: string; description: string | null;
      created_at: string; updated_at: string; user_id: string | null;
      is_public: number; editor_count: number | null; viewer_count: number | null;
      role: ProjectRole | null;
    }>;

    return rows.map((row) => {
      const baseEditorCount = row.editor_count ?? 0;
      const ownerCount = row.user_id ? 1 : 0;
      const explicitRole = row.role ?? undefined;
      const isOwner = row.user_id === userId;
      const resolvedRole: ProjectRole | undefined = explicitRole ?? (isOwner ? 'owner' : undefined);
      const canEdit = isAdmin || resolvedRole === 'owner' || resolvedRole === 'editor';
      return {
        project_id: row.project_id, title: row.title, description: row.description ?? '',
        created_at: row.created_at, updated_at: row.updated_at, user_id: row.user_id,
        is_public: Boolean(row.is_public), editor_count: baseEditorCount + ownerCount,
        viewer_count: row.viewer_count ?? 0, role: resolvedRole,
        mode: (canEdit ? 'editing' : 'viewing') as 'editing' | 'viewing',
      };
    });
  }

  const rows = db.prepare(
    `SELECT project_id, title, description, created_at, updated_at, user_id, is_public,
            (SELECT COUNT(*) FROM project_collaborators pc WHERE pc.project_id = projects.project_id AND pc.role = 'editor') AS editor_count,
            (SELECT COUNT(*) FROM project_collaborators pc WHERE pc.project_id = projects.project_id AND pc.role = 'viewer') AS viewer_count
     FROM projects WHERE user_id IS NULL OR is_public = 1
     ORDER BY datetime(updated_at) DESC`,
  ).all() as Array<{
    project_id: string; title: string; description: string | null;
    created_at: string; updated_at: string; user_id: string | null;
    is_public: number; editor_count: number | null; viewer_count: number | null;
  }>;

  return rows.map((row) => ({
    project_id: row.project_id, title: row.title, description: row.description ?? '',
    created_at: row.created_at, updated_at: row.updated_at, user_id: row.user_id,
    is_public: Boolean(row.is_public),
    editor_count: (row.editor_count ?? 0) + (row.user_id ? 1 : 0),
    viewer_count: row.viewer_count ?? 0,
    role: row.is_public ? 'viewer' : undefined, mode: 'viewing',
  }));
}

export function getProject(
  projectId: string, userId?: string, options?: { bypassAuth?: boolean },
): ProjectFlow | null {
  const bypassAuth = options?.bypassAuth === true;
  const project = db.prepare(
    `SELECT project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id, is_public
     FROM projects WHERE project_id = ?`,
  ).get(projectId) as { project_id: string; title: string; description: string; settings_json: string; schemas_json: string; created_at: string; updated_at: string; user_id: string | null; is_public: number } | undefined;

  if (!project) return null;

  let resolvedRole: ProjectRole | undefined;
  if (userId) {
    const role = getProjectRole(project.project_id, userId);
    if (!role && project.user_id && project.user_id !== userId && !project.is_public) return null;
    resolvedRole = role ?? (project.user_id ? undefined : 'viewer');
    if (!role && project.is_public) resolvedRole = 'viewer';
  } else if (project.user_id && !bypassAuth && !project.is_public) {
    return null;
  } else if (!project.user_id || project.is_public) {
    resolvedRole = 'viewer';
  }

  const nodes = listProjectNodes(projectId).map((node) => ({
    node_id: node.node_id, type: node.type, title: node.title,
    content_type: node.content_type ?? undefined, content: node.content ?? undefined,
    meta: node.meta, visibility_rules: node.visibility,
    ui: { color: node.ui.color, bbox: { ...node.ui.bbox } },
    ai_visible: node.ai_visible,
    connections: {
      incoming: node.connections.incoming.map((e) => ({ ...e })),
      outgoing: node.connections.outgoing.map((e) => ({ ...e })),
    },
    ...node.config,
  }));

  const edges = listProjectEdges(projectId).map((edge) => ({
    from: edge.from_node, to: edge.to_node,
    label: edge.label ?? undefined,
    sourceHandle: edge.source_handle ?? undefined,
    targetHandle: edge.target_handle ?? undefined,
  }));

  const collaborators = resolvedRole === 'owner' ? listProjectCollaborators(projectId) : undefined;
  const canEdit = bypassAuth || resolvedRole === 'owner' || resolvedRole === 'editor';

  return {
    project_id: project.project_id, title: project.title, description: project.description,
    created_at: project.created_at, updated_at: project.updated_at,
    settings: safeParse(project.settings_json), schemas: safeParse(project.schemas_json),
    nodes, edges, user_id: project.user_id, is_public: Boolean(project.is_public),
    role: resolvedRole, mode: canEdit ? 'editing' : 'viewing', collaborators,
  };
}

// ---- Project mutations -------------------------------------------------------

export function importProject(flow: ProjectFlow, userId?: string): void {
  const now = new Date().toISOString();
  const trx = db.transaction((project: ProjectFlow) => {
    db.prepare('DELETE FROM runs WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM assets WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM edges WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM nodes WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM projects WHERE project_id = ?').run(project.project_id);

    const columns = ['project_id', 'title', 'description', 'settings_json', 'schemas_json', 'created_at', 'updated_at', 'user_id'];
    const values: (string | null)[] = [
      project.project_id, project.title, project.description,
      JSON.stringify(project.settings ?? {}), JSON.stringify(project.schemas ?? {}),
      project.created_at ?? now, project.updated_at ?? now, userId ?? null,
    ];
    const placeholders = columns.map(() => '?').join(', ');
    db.prepare(`INSERT INTO projects (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);

    const insertNode = db.prepare(
      `INSERT INTO nodes (project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at)
       VALUES (@project_id, @node_id, @type, @title, @content_type, @content, @meta_json, @config_json, @visibility_json, @ui_color, @bbox_x1, @bbox_y1, @bbox_x2, @bbox_y2, @ai_visible, @connections_json, @created_at, @updated_at)`,
    );

    for (const node of project.nodes) {
      const ui = decomposeNodeUI(node.ui);
      const aiVisible = normalizeAiVisible(node.ai_visible);
      const connectionsJson = serializeConnectionsJson(
        (node.connections as import('../../types').NodeConnections | undefined) ?? createDefaultNodeConnections(),
      );
      insertNode.run({
        project_id: project.project_id, node_id: node.node_id, type: node.type,
        title: node.title, content_type: node.content_type ?? null, content: node.content ?? null,
        meta_json: JSON.stringify(node.meta ?? {}), config_json: JSON.stringify(extractConfig(node)),
        visibility_json: JSON.stringify(node.visibility_rules ?? {}),
        ui_color: ui.color, bbox_x1: ui.bbox_x1, bbox_y1: ui.bbox_y1, bbox_x2: ui.bbox_x2, bbox_y2: ui.bbox_y2,
        ai_visible: booleanToInteger(aiVisible), connections_json: connectionsJson,
        created_at: project.created_at ?? now, updated_at: project.updated_at ?? now,
      });
    }

    const insertEdge = db.prepare(
      `INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle)
       VALUES (@project_id, @from_node, @to_node, @label, @source_handle, @target_handle)`,
    );
    for (const edge of project.edges) {
      insertEdge.run({
        project_id: project.project_id, from_node: edge.from, to_node: edge.to,
        label: edge.label ?? null, source_handle: edge.sourceHandle ?? null,
        target_handle: edge.targetHandle ?? null,
      });
    }
  });
  trx(flow);
}

export function updateProjectMetadata(
  projectId: string, patch: { title?: string; description?: string; is_public?: boolean },
  userId?: string, options?: { bypassAuth?: boolean },
): ProjectFlow {
  const bypassAuth = options?.bypassAuth ?? (!userId);
  const current = getProject(projectId, userId, { bypassAuth });
  if (!current) throw new Error(`Project ${projectId} not found`);

  const next: ProjectFlow = {
    ...current,
    title: patch.title?.trim() ? patch.title.trim() : current.title,
    description: patch.description ?? current.description,
    is_public: patch.is_public ?? current.is_public,
    updated_at: new Date().toISOString(),
  };

  const query = userId
    ? 'UPDATE projects SET title = ?, description = ?, is_public = ?, updated_at = ? WHERE project_id = ? AND user_id = ?'
    : 'UPDATE projects SET title = ?, description = ?, is_public = ?, updated_at = ? WHERE project_id = ?';
  const params = userId
    ? [next.title, next.description, next.is_public ? 1 : 0, next.updated_at, projectId, userId]
    : [next.title, next.description, next.is_public ? 1 : 0, next.updated_at, projectId];
  db.prepare(query).run(...params);

  const updated = getProject(projectId, userId, { bypassAuth }) ?? next;
  writeProjectFile(updated);
  return updated;
}

export function updateProjectSettings(projectId: string, patch: Record<string, unknown>): ProjectFlow {
  const current = getProject(projectId, undefined, { bypassAuth: true });
  if (!current) throw createHttpError(404, `Project ${projectId} not found`);

  const nextSettings = deepMerge(current.settings ?? {}, patch ?? {});
  const updated_at = new Date().toISOString();
  withTransaction(() => {
    db.prepare('UPDATE projects SET settings_json = ?, updated_at = ? WHERE project_id = ?').run(
      JSON.stringify(nextSettings), updated_at, projectId);
  });

  const project = getProject(projectId, undefined, { bypassAuth: true });
  if (!project) throw createHttpError(404, `Project ${projectId} not found after settings update`);
  writeProjectFile(project);
  return project;
}

export function getProjectSettings(projectId: string): Record<string, unknown> {
  const row = db.prepare(`SELECT settings_json FROM projects WHERE project_id = ?`)
    .get(projectId) as { settings_json: string } | undefined;
  return row ? safeParse(row.settings_json) : {};
}

export function deleteProjectRecord(projectId: string, userId?: string): void {
  const remove = userId
    ? db.prepare('DELETE FROM projects WHERE project_id = ? AND user_id = ?')
    : db.prepare('DELETE FROM projects WHERE project_id = ?');
  const result = userId ? remove.run(projectId, userId) : remove.run(projectId);
  if (result.changes === 0) {
    const error = new Error(`Project ${projectId} not found`);
    (error as { status?: number }).status = 404;
    throw error;
  }
  const projectDir = getProjectDir(projectId);
  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
  const driveDir = path.resolve(process.cwd(), 'drive', projectId);
  if (fs.existsSync(driveDir)) fs.rmSync(driveDir, { recursive: true, force: true });
}

export function generateCloneProjectId(baseId: string): string {
  const normalized = baseId.replace(/[^a-zA-Z0-9_-]/g, '_');
  let candidate = `${normalized}_copy`;
  let suffix = 1;
  while (projectExists(candidate)) { candidate = `${normalized}_copy${suffix}`; suffix += 1; }
  return candidate;
}

export function cloneProjectRecord(
  sourceProjectId: string, newProjectId: string,
  overrides?: { title?: string; description?: string },
): ProjectFlow {
  const original = getProject(sourceProjectId, undefined, { bypassAuth: true });
  if (!original) throw new Error(`Project ${sourceProjectId} not found`);

  const timestamp = new Date().toISOString();
  const cloneValue = <T>(value: T): T =>
    value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

  const clone: ProjectFlow = {
    project_id: newProjectId,
    title: overrides?.title?.trim() && overrides.title.trim().length > 0
      ? overrides.title.trim() : `Copy of ${original.title}`,
    description: overrides?.description ?? original.description,
    created_at: timestamp, updated_at: timestamp,
    settings: cloneValue(original.settings), schemas: cloneValue(original.schemas),
    nodes: original.nodes.map((node) => ({
      ...node,
      ui: node.ui ? { color: node.ui.color, bbox: { ...node.ui.bbox } } : createDefaultNodeUI(),
      ai_visible: node.ai_visible ?? true,
      connections: node.connections
        ? { incoming: node.connections.incoming.map((e) => ({ ...e })), outgoing: node.connections.outgoing.map((e) => ({ ...e })) }
        : createDefaultNodeConnections(),
      meta: node.meta ? cloneValue(node.meta) : undefined,
      visibility_rules: node.visibility_rules ? cloneValue(node.visibility_rules) : undefined,
      ai: node.ai ? cloneValue(node.ai) : undefined,
      parser: node.parser ? cloneValue(node.parser) : undefined,
      python: node.python ? cloneValue(node.python) : undefined,
      image_gen: (node as { image_gen?: Record<string, unknown> }).image_gen ?? undefined,
      audio_gen: (node as { audio_gen?: Record<string, unknown> }).audio_gen ?? undefined,
      video_gen: (node as { video_gen?: Record<string, unknown> }).video_gen ?? undefined,
    })),
    edges: original.edges.map((edge) => ({ ...edge })),
  };

  ensureProjectDirs(newProjectId);
  importProject(clone);
  writeProjectFile(clone);
  return clone;
}
