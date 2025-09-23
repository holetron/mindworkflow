import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { runMigrations } from './migrations';
import {
  NodeConnections,
  NodeUI,
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from './types';
import {
  mergeNodeConnections,
  mergeNodeUI,
  normalizeAiVisible,
  normalizeNodeConnections,
  normalizeNodeUI,
} from './validation';

export interface ProjectFlow {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  schemas: Record<string, unknown>;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectNode {
  node_id: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  ui: NodeUI;
  ai_visible: boolean;
  connections: NodeConnections;
  [key: string]: unknown;
}

export interface ProjectEdge {
  from: string;
  to: string;
  label?: string;
}

export interface RunRecord {
  run_id: string;
  project_id: string;
  node_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  input_hash: string;
  output_hash: string;
  logs_json: string;
}

const dbPath = path.resolve(__dirname, '../../data/localcreativeflow.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
cleanupStaleJournalFiles(dbPath);

export const db: BetterSqlite3Database = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    settings_json TEXT NOT NULL,
    schemas_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content_type TEXT,
    content TEXT,
    meta_json TEXT,
    config_json TEXT,
    visibility_json TEXT,
    ui_color TEXT NOT NULL DEFAULT '#6B7280',
    bbox_x1 REAL NOT NULL DEFAULT 0,
    bbox_y1 REAL NOT NULL DEFAULT 0,
    bbox_x2 REAL NOT NULL DEFAULT 240,
    bbox_y2 REAL NOT NULL DEFAULT 120,
    ai_visible INTEGER NOT NULL DEFAULT 1,
    connections_json TEXT NOT NULL DEFAULT '{"incoming":[],"outgoing":[]}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, node_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS edges (
    project_id TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    label TEXT,
    PRIMARY KEY (project_id, from_node, to_node),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    status TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    logs_json TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    asset_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    node_id TEXT,
    path TEXT NOT NULL,
    meta_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
  );
`);

runMigrations(db);

db.pragma('foreign_keys = ON');

export function hashContent(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function cleanupStaleJournalFiles(basePath: string): void {
  if (fs.existsSync(basePath)) return;
  for (const suffix of ['-wal', '-shm']) {
    const candidate = `${basePath}${suffix}`;
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch (error) {
        // Best-effort cleanup; ignore permission issues in production.
        console.warn(`Failed to remove stale SQLite journal file ${candidate}:`, error);
      }
    }
  }
}

function booleanToInteger(value: boolean): number {
  return value ? 1 : 0;
}

function integerToBoolean(value: number | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return value !== 0;
}

function parseConnectionsJson(json: string | null): NodeConnections {
  if (!json) {
    return createDefaultNodeConnections();
  }
  try {
    return normalizeNodeConnections(JSON.parse(json) as Partial<NodeConnections>);
  } catch (error) {
    return createDefaultNodeConnections();
  }
}

function serializeConnectionsJson(connections: NodeConnections): string {
  return JSON.stringify(normalizeNodeConnections(connections));
}

function toNodeUI(row: {
  ui_color: string;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
}): NodeUI {
  return normalizeNodeUI({
    color: row.ui_color,
    bbox: {
      x1: row.bbox_x1,
      y1: row.bbox_y1,
      x2: row.bbox_x2,
      y2: row.bbox_y2,
    },
  });
}

function decomposeNodeUI(ui?: Partial<NodeUI>): {
  color: string;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
} {
  const normalized = normalizeNodeUI(ui);
  return {
    color: normalized.color,
    bbox_x1: normalized.bbox.x1,
    bbox_y1: normalized.bbox.y1,
    bbox_x2: normalized.bbox.x2,
    bbox_y2: normalized.bbox.y2,
  };
}

function createHttpError(status: number, message: string): Error {
  const error = new Error(message);
  (error as { status?: number }).status = status;
  return error;
}

export function listProjects(): ProjectSummary[] {
  const rows = db
    .prepare(
      `SELECT project_id, title, description, created_at, updated_at
       FROM projects
       ORDER BY datetime(updated_at) DESC`,
    )
    .all() as Array<{
      project_id: string;
      title: string;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>;

  return rows.map((row) => ({
    project_id: row.project_id,
    title: row.title,
    description: row.description ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function importProject(flow: ProjectFlow): void {
  const now = new Date().toISOString();
  const trx = db.transaction((project: ProjectFlow) => {
    db.prepare('DELETE FROM runs WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM assets WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM edges WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM nodes WHERE project_id = ?').run(project.project_id);
    db.prepare('DELETE FROM projects WHERE project_id = ?').run(project.project_id);

    db.prepare(
      `INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at)
       VALUES (@project_id, @title, @description, @settings_json, @schemas_json, @created_at, @updated_at)`,
    ).run({
      project_id: project.project_id,
      title: project.title,
      description: project.description,
      settings_json: JSON.stringify(project.settings ?? {}),
      schemas_json: JSON.stringify(project.schemas ?? {}),
      created_at: project.created_at ?? now,
      updated_at: project.updated_at ?? now,
    });

    const insertNode = db.prepare(
      `INSERT INTO nodes (
         project_id,
         node_id,
         type,
         title,
         content_type,
         content,
         meta_json,
         config_json,
         visibility_json,
         ui_color,
         bbox_x1,
         bbox_y1,
         bbox_x2,
         bbox_y2,
         ai_visible,
         connections_json,
         created_at,
         updated_at
       )
       VALUES (
         @project_id,
         @node_id,
         @type,
         @title,
         @content_type,
         @content,
         @meta_json,
         @config_json,
         @visibility_json,
         @ui_color,
         @bbox_x1,
         @bbox_y1,
         @bbox_x2,
         @bbox_y2,
         @ai_visible,
         @connections_json,
         @created_at,
         @updated_at
       )`,
    );

    for (const node of project.nodes) {
      const ui = decomposeNodeUI(node.ui);
      const aiVisible = normalizeAiVisible(node.ai_visible);
      const connectionsJson = serializeConnectionsJson(
        (node.connections as NodeConnections | undefined) ?? createDefaultNodeConnections(),
      );
      insertNode.run({
        project_id: project.project_id,
        node_id: node.node_id,
        type: node.type,
        title: node.title,
        content_type: node.content_type ?? null,
        content: node.content ?? null,
        meta_json: JSON.stringify(node.meta ?? {}),
        config_json: JSON.stringify(extractConfig(node)),
        visibility_json: JSON.stringify(node.visibility_rules ?? {}),
        ui_color: ui.color,
        bbox_x1: ui.bbox_x1,
        bbox_y1: ui.bbox_y1,
        bbox_x2: ui.bbox_x2,
        bbox_y2: ui.bbox_y2,
        ai_visible: booleanToInteger(aiVisible),
        connections_json: connectionsJson,
        created_at: project.created_at ?? now,
        updated_at: project.updated_at ?? now,
      });
    }

    const insertEdge = db.prepare(
      `INSERT INTO edges (project_id, from_node, to_node, label)
       VALUES (@project_id, @from_node, @to_node, @label)`,
    );

    for (const edge of project.edges) {
      insertEdge.run({
        project_id: project.project_id,
        from_node: edge.from,
        to_node: edge.to,
        label: edge.label ?? null,
      });
    }
  });

  trx(flow);
}

export function ensureProjectDirs(projectId: string): void {
  const projectRoot = path.resolve(process.cwd(), 'projects', projectId);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'project_output'), { recursive: true });
  const driveRoot = path.resolve(process.cwd(), 'drive', projectId);
  fs.mkdirSync(driveRoot, { recursive: true });
}

export function mirrorProjectToDrive(projectId: string): void {
  const driveRoot = path.resolve(process.cwd(), 'drive');
  const sourceDir = path.resolve(process.cwd(), 'projects', projectId);
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
  const filePath = path.resolve(process.cwd(), 'projects', project.project_id, 'project.flow.json');
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8');
  mirrorProjectToDrive(project.project_id);
}

function extractConfig(node: ProjectNode): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (node.ai) config.ai = node.ai;
  if (node.parser) config.parser = node.parser;
  if (node.python) config.python = node.python;
  if (node.image_gen) config.image_gen = node.image_gen;
  if (node.audio_gen) config.audio_gen = node.audio_gen;
  if (node.video_gen) config.video_gen = node.video_gen;
  if (node.settings) config.settings = node.settings;
  if (node.payload) config.payload = node.payload;
  return config;
}

export interface StoredNode {
  project_id: string;
  node_id: string;
  type: string;
  title: string;
  content_type: string | null;
  content: string | null;
  meta: Record<string, unknown>;
  config: Record<string, unknown>;
  visibility: Record<string, unknown>;
  ui: NodeUI;
  ai_visible: boolean;
  connections: NodeConnections;
  created_at: string;
  updated_at: string;
}

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

export interface NodeUpdatePatch {
  title?: string;
  content?: string | null;
  content_type?: string | null;
  meta?: Record<string, unknown> | null;
  ai?: Record<string, unknown> | null;
  parser?: Record<string, unknown> | null;
  python?: Record<string, unknown> | null;
  ui?: Partial<NodeUI> | null;
  ai_visible?: boolean | null;
  connections?: Partial<NodeConnections> | null;
}

export function updateNode(projectId: string, nodeId: string, patch: NodeUpdatePatch): ProjectNode {
  assertNodeExists(projectId, nodeId);
  const updated_at = new Date().toISOString();

  withTransaction(() => {
    const stored = getNode(projectId, nodeId);
    if (!stored) {
      throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);
    }

    const config = { ...(stored.config ?? {}) } as Record<string, unknown>;
    let configChanged = false;

    if (Object.prototype.hasOwnProperty.call(patch, 'ai')) {
      if (patch.ai) {
        config.ai = patch.ai;
      } else {
        delete config.ai;
      }
      configChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'parser')) {
      if (patch.parser) {
        config.parser = patch.parser;
      } else {
        delete config.parser;
      }
      configChanged = true;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'python')) {
      if (patch.python) {
        config.python = patch.python;
      } else {
        delete config.python;
      }
      configChanged = true;
    }

    let nextUi = stored.ui;
    let uiChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'ui')) {
      nextUi = patch.ui === null ? createDefaultNodeUI() : mergeNodeUI(stored.ui, patch.ui);
      uiChanged = true;
    }

    let nextAiVisible = stored.ai_visible;
    let aiVisibleChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'ai_visible')) {
      nextAiVisible = normalizeAiVisible(patch.ai_visible);
      aiVisibleChanged = true;
    }

    let nextConnections = stored.connections;
    let connectionsChanged = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'connections')) {
      nextConnections =
        patch.connections === null
          ? createDefaultNodeConnections()
          : mergeNodeConnections(stored.connections, patch.connections);
      connectionsChanged = true;
    }

    db.prepare(
      `UPDATE nodes
       SET title = COALESCE(@title, title),
           content = COALESCE(@content, content),
           content_type = COALESCE(@content_type, content_type),
           meta_json = COALESCE(@meta_json, meta_json),
           config_json = COALESCE(@config_json, config_json),
           ui_color = COALESCE(@ui_color, ui_color),
           bbox_x1 = COALESCE(@bbox_x1, bbox_x1),
           bbox_y1 = COALESCE(@bbox_y1, bbox_y1),
           bbox_x2 = COALESCE(@bbox_x2, bbox_x2),
           bbox_y2 = COALESCE(@bbox_y2, bbox_y2),
           ai_visible = COALESCE(@ai_visible, ai_visible),
           connections_json = COALESCE(@connections_json, connections_json),
           updated_at = @updated_at
       WHERE project_id = @project_id AND node_id = @node_id`,
    ).run({
      project_id: projectId,
      node_id: nodeId,
      title: patch.title ?? null,
      content: Object.prototype.hasOwnProperty.call(patch, 'content') ? patch.content ?? null : null,
      content_type: Object.prototype.hasOwnProperty.call(patch, 'content_type')
        ? patch.content_type ?? null
        : null,
      meta_json: Object.prototype.hasOwnProperty.call(patch, 'meta')
        ? JSON.stringify(patch.meta ?? {})
        : null,
      config_json: configChanged ? JSON.stringify(config) : null,
      ui_color: uiChanged ? nextUi.color : null,
      bbox_x1: uiChanged ? nextUi.bbox.x1 : null,
      bbox_y1: uiChanged ? nextUi.bbox.y1 : null,
      bbox_x2: uiChanged ? nextUi.bbox.x2 : null,
      bbox_y2: uiChanged ? nextUi.bbox.y2 : null,
      ai_visible: aiVisibleChanged ? booleanToInteger(nextAiVisible) : null,
      connections_json: connectionsChanged ? serializeConnectionsJson(nextConnections) : null,
      updated_at,
    });

    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(updated_at, projectId);
  });

  const project = getProject(projectId);
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after node update`);
  }
  writeProjectFile(project);
  const node = project.nodes.find((item) => item.node_id === nodeId);
  if (!node) {
    throw createHttpError(404, `Node ${nodeId} not found after update`);
  }
  return node;
}

export function storeRun(run: RunRecord): void {
  db.prepare(
    `INSERT INTO runs (run_id, project_id, node_id, started_at, finished_at, status, input_hash, output_hash, logs_json)
     VALUES (@run_id, @project_id, @node_id, @started_at, @finished_at, @status, @input_hash, @output_hash, @logs_json)`,
  ).run(run);
}

export function getNodeRuns(projectId: string, nodeId: string): RunRecord[] {
  const rows = db
    .prepare(
      `SELECT run_id, project_id, node_id, started_at, finished_at, status, input_hash, output_hash, logs_json
       FROM runs WHERE project_id = ? AND node_id = ? ORDER BY started_at DESC`,
    )
    .all(projectId, nodeId) as Array<{
    run_id: string;
    project_id: string;
    node_id: string;
    started_at: string;
    finished_at: string;
    status: string;
    input_hash: string;
    output_hash: string;
    logs_json: string;
  }>;

  return rows.map((row) => ({
    ...row,
    logs_json: row.logs_json,
  }));
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

export interface StoredEdge {
  project_id: string;
  from_node: string;
  to_node: string;
  label?: string | null;
}

export function listProjectEdges(projectId: string): StoredEdge[] {
  const rows = db
    .prepare(`SELECT project_id, from_node, to_node, label FROM edges WHERE project_id = ?`)
    .all(projectId) as Array<{
      project_id: string;
      from_node: string;
      to_node: string;
      label: string | null;
    }>;
  return rows.map((row) => ({
    project_id: row.project_id,
    from_node: row.from_node,
    to_node: row.to_node,
    label: row.label,
  }));
}

function nodeExists(projectId: string, nodeId: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM nodes WHERE project_id = ? AND node_id = ? LIMIT 1`)
    .get(projectId, nodeId) as unknown;
  return Boolean(row);
}

function sanitizeNodeSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '');
  return normalized || 'node';
}

function generateSequentialNodeId(projectId: string, slug: string): string {
  const normalizedSlug = sanitizeNodeSlug(slug);
  const rows = db
    .prepare(`SELECT node_id FROM nodes WHERE project_id = ?`)
    .all(projectId) as Array<{ node_id: string }>;

  const existing = new Set(rows.map((row) => row.node_id));
  let maxNumber = 0;
  for (const nodeId of existing) {
    const match = /^n(\d+)_/.exec(nodeId);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isNaN(value)) {
      maxNumber = Math.max(maxNumber, value);
    }
  }

  let attempt = maxNumber + 1;
  let candidate = `n${attempt}_${normalizedSlug}`;
  while (existing.has(candidate)) {
    attempt += 1;
    candidate = `n${attempt}_${normalizedSlug}`;
  }
  return candidate;
}

export interface NodeCreateInput {
  node_id?: string;
  slug?: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  ui?: Partial<NodeUI>;
  ai_visible?: boolean;
  connections?: Partial<NodeConnections>;
}

export function createProjectNode(
  projectId: string,
  input: NodeCreateInput,
  options?: { position?: { x: number; y: number } },
): { node: ProjectNode; updated_at: string } {
  if (!projectExists(projectId)) {
    throw createHttpError(404, `Project ${projectId} not found`);
  }

  const slug = sanitizeNodeSlug(input.slug ?? input.type ?? 'node');
  let nodeId = input.node_id?.trim();
  if (nodeId) {
    if (nodeExists(projectId, nodeId)) {
      throw createHttpError(409, `Node ${nodeId} already exists in project ${projectId}`);
    }
  } else {
    nodeId = generateSequentialNodeId(projectId, slug);
  }

  const now = new Date().toISOString();
  const meta = { ...(input.meta ?? {}) } as Record<string, unknown>;
  if (options?.position) {
    meta.ui_position = {
      x: Math.round(options.position.x),
      y: Math.round(options.position.y),
    };
  }

  const config: Record<string, unknown> = {};
  if (input.ai) config.ai = input.ai;
  if (input.parser) config.parser = input.parser;
  if (input.python) config.python = input.python;

  const visibility = { ...(input.visibility_rules ?? {}) } as Record<string, unknown>;

  const uiSeed: Partial<NodeUI> = input.ui ? { ...input.ui } : {};
  if (options?.position) {
    const defaultUi = createDefaultNodeUI();
    const desiredWidth =
      typeof uiSeed.bbox?.x2 === 'number' && typeof uiSeed.bbox?.x1 === 'number'
        ? uiSeed.bbox.x2 - uiSeed.bbox.x1
        : defaultUi.bbox.x2 - defaultUi.bbox.x1;
    const desiredHeight =
      typeof uiSeed.bbox?.y2 === 'number' && typeof uiSeed.bbox?.y1 === 'number'
        ? uiSeed.bbox.y2 - uiSeed.bbox.y1
        : defaultUi.bbox.y2 - defaultUi.bbox.y1;
    const x1 = Math.round(options.position.x);
    const y1 = Math.round(options.position.y);
    uiSeed.bbox = {
      ...(uiSeed.bbox ?? {}),
      x1,
      y1,
      x2: x1 + desiredWidth,
      y2: y1 + desiredHeight,
    };
  }
  const ui = normalizeNodeUI(uiSeed);
  const aiVisible = normalizeAiVisible(input.ai_visible);
  const connections = normalizeNodeConnections(input.connections);
  const connectionsJson = JSON.stringify(connections);

  withTransaction(() => {
    db.prepare(
      `INSERT INTO nodes (
         project_id,
         node_id,
         type,
         title,
         content_type,
         content,
         meta_json,
         config_json,
         visibility_json,
         ui_color,
         bbox_x1,
         bbox_y1,
         bbox_x2,
         bbox_y2,
         ai_visible,
         connections_json,
         created_at,
         updated_at
       )
       VALUES (
         @project_id,
         @node_id,
         @type,
         @title,
         @content_type,
         @content,
         @meta_json,
         @config_json,
         @visibility_json,
         @ui_color,
         @bbox_x1,
         @bbox_y1,
         @bbox_x2,
         @bbox_y2,
         @ai_visible,
         @connections_json,
         @created_at,
         @updated_at
       )`,
    ).run({
      project_id: projectId,
      node_id: nodeId,
      type: input.type,
      title: input.title,
      content_type: input.content_type ?? null,
      content: input.content ?? null,
      meta_json: JSON.stringify(meta),
      config_json: JSON.stringify(config),
      visibility_json: JSON.stringify(visibility),
      ui_color: ui.color,
      bbox_x1: ui.bbox.x1,
      bbox_y1: ui.bbox.y1,
      bbox_x2: ui.bbox.x2,
      bbox_y2: ui.bbox.y2,
      ai_visible: booleanToInteger(aiVisible),
      connections_json: connectionsJson,
      created_at: now,
      updated_at: now,
    });

    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
  });

  const project = getProject(projectId);
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after node creation`);
  }
  writeProjectFile(project);
  const node = project.nodes.find((item) => item.node_id === nodeId);
  if (!node) {
    throw createHttpError(404, `Node ${nodeId} not found after creation`);
  }

  return { node, updated_at: now };
}

function assertNodeExists(projectId: string, nodeId: string): void {
  const row = db
    .prepare(`SELECT 1 FROM nodes WHERE project_id = ? AND node_id = ? LIMIT 1`)
    .get(projectId, nodeId) as unknown;
  if (!row) {
    throw createHttpError(404, `Node ${nodeId} not found in project ${projectId}`);
  }
}

function edgeExists(projectId: string, fromNode: string, toNode: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM edges WHERE project_id = ? AND from_node = ? AND to_node = ? LIMIT 1`)
    .get(projectId, fromNode, toNode) as unknown;
  return Boolean(row);
}

export function addProjectEdge(
  projectId: string,
  edge: { from: string; to: string; label?: string | null },
): ProjectFlow {
  const now = new Date().toISOString();
  withTransaction(() => {
    assertNodeExists(projectId, edge.from);
    assertNodeExists(projectId, edge.to);
    if (edgeExists(projectId, edge.from, edge.to)) {
      throw createHttpError(409, `Edge ${edge.from} -> ${edge.to} already exists`);
    }
    db.prepare(
      `INSERT INTO edges (project_id, from_node, to_node, label)
       VALUES (@project_id, @from_node, @to_node, @label)`,
    ).run({
      project_id: projectId,
      from_node: edge.from,
      to_node: edge.to,
      label: edge.label ?? null,
    });
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
  });

  const project = getProject(projectId);
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after edge insert`);
  }
  writeProjectFile(project);
  return project;
}

export function removeProjectEdge(projectId: string, fromNode: string, toNode: string): ProjectFlow {
  const now = new Date().toISOString();
  withTransaction(() => {
    const removal = db
      .prepare(`DELETE FROM edges WHERE project_id = ? AND from_node = ? AND to_node = ?`)
      .run(projectId, fromNode, toNode);
    if (removal.changes === 0) {
      throw createHttpError(404, `Edge ${fromNode} -> ${toNode} not found in project ${projectId}`);
    }
    db.prepare(`UPDATE projects SET updated_at = ? WHERE project_id = ?`).run(now, projectId);
  });

  const project = getProject(projectId);
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after edge removal`);
  }
  writeProjectFile(project);
  return project;
}

export function getProject(projectId: string): ProjectFlow | null {
  const project = db
    .prepare(
      `SELECT project_id, title, description, settings_json, schemas_json, created_at, updated_at
       FROM projects WHERE project_id = ?`,
    )
    .get(projectId) as
    | {
        project_id: string;
        title: string;
        description: string;
        settings_json: string;
        schemas_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!project) return null;

  const nodes = listProjectNodes(projectId).map((node) => ({
    node_id: node.node_id,
    type: node.type,
    title: node.title,
    content_type: node.content_type ?? undefined,
    content: node.content ?? undefined,
    meta: node.meta,
    visibility_rules: node.visibility,
    ui: {
      color: node.ui.color,
      bbox: { ...node.ui.bbox },
    },
    ai_visible: node.ai_visible,
    connections: {
      incoming: node.connections.incoming.map((entry) => ({ ...entry })),
      outgoing: node.connections.outgoing.map((entry) => ({ ...entry })),
    },
    ...node.config,
  }));

  const edges = listProjectEdges(projectId).map((edge) => ({
    from: edge.from_node,
    to: edge.to_node,
    label: edge.label ?? undefined,
  }));

  return {
    project_id: project.project_id,
    title: project.title,
    description: project.description,
    created_at: project.created_at,
    updated_at: project.updated_at,
    settings: safeParse(project.settings_json),
    schemas: safeParse(project.schemas_json),
    nodes,
    edges,
  };
}

export function updateProjectMetadata(
  projectId: string,
  patch: { title?: string; description?: string },
): ProjectFlow {
  const current = getProject(projectId);
  if (!current) {
    throw new Error(`Project ${projectId} not found`);
  }

  const next: ProjectFlow = {
    ...current,
    title: patch.title?.trim() ? patch.title.trim() : current.title,
    description: patch.description ?? current.description,
    updated_at: new Date().toISOString(),
  };

  db.prepare('UPDATE projects SET title = ?, description = ?, updated_at = ? WHERE project_id = ?').run(
    next.title,
    next.description,
    next.updated_at,
    projectId,
  );

  writeProjectFile(next);
  return next;
}

export function updateProjectSettings(projectId: string, patch: Record<string, unknown>): ProjectFlow {
  const current = getProject(projectId);
  if (!current) {
    throw createHttpError(404, `Project ${projectId} not found`);
  }

  const nextSettings = deepMerge(current.settings ?? {}, patch ?? {});
  const updated_at = new Date().toISOString();

  withTransaction(() => {
    db.prepare('UPDATE projects SET settings_json = ?, updated_at = ? WHERE project_id = ?').run(
      JSON.stringify(nextSettings),
      updated_at,
      projectId,
    );
  });

  const project = getProject(projectId);
  if (!project) {
    throw createHttpError(404, `Project ${projectId} not found after settings update`);
  }
  writeProjectFile(project);
  return project;
}

export function deleteProjectRecord(projectId: string): void {
  const remove = db.prepare('DELETE FROM projects WHERE project_id = ?');
  const result = remove.run(projectId);
  if (result.changes === 0) {
    const error = new Error(`Project ${projectId} not found`);
    (error as { status?: number }).status = 404;
    throw error;
  }

  const projectDir = path.resolve(process.cwd(), 'projects', projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  const driveDir = path.resolve(process.cwd(), 'drive', projectId);
  if (fs.existsSync(driveDir)) {
    fs.rmSync(driveDir, { recursive: true, force: true });
  }
}

export function generateCloneProjectId(baseId: string): string {
  const normalized = baseId.replace(/[^a-zA-Z0-9_-]/g, '_');
  let candidate = `${normalized}_copy`;
  let suffix = 1;
  while (projectExists(candidate)) {
    candidate = `${normalized}_copy${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function cloneProjectRecord(
  sourceProjectId: string,
  newProjectId: string,
  overrides?: { title?: string; description?: string },
): ProjectFlow {
  const original = getProject(sourceProjectId);
  if (!original) {
    throw new Error(`Project ${sourceProjectId} not found`);
  }

  const timestamp = new Date().toISOString();
  const cloneValue = <T>(value: T): T =>
    value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

  const clone: ProjectFlow = {
    project_id: newProjectId,
    title: overrides?.title?.trim() && overrides.title.trim().length > 0
      ? overrides.title.trim()
      : `Copy of ${original.title}`,
    description: overrides?.description ?? original.description,
    created_at: timestamp,
    updated_at: timestamp,
    settings: cloneValue(original.settings),
    schemas: cloneValue(original.schemas),
    nodes: original.nodes.map((node) => ({
      ...node,
      ui: node.ui
        ? {
            color: node.ui.color,
            bbox: { ...node.ui.bbox },
          }
        : createDefaultNodeUI(),
      ai_visible: node.ai_visible ?? true,
      connections: node.connections
        ? {
            incoming: node.connections.incoming.map((entry) => ({ ...entry })),
            outgoing: node.connections.outgoing.map((entry) => ({ ...entry })),
          }
        : createDefaultNodeConnections(),
      meta: node.meta ? cloneValue(node.meta) : undefined,
      visibility_rules: node.visibility_rules ? cloneValue(node.visibility_rules) : undefined,
      ai: node.ai ? cloneValue(node.ai) : undefined,
      parser: node.parser ? cloneValue(node.parser) : undefined,
      python: node.python ? cloneValue(node.python) : undefined,
      image_gen: (node as { image_gen?: unknown }).image_gen
        ? cloneValue((node as { image_gen?: unknown }).image_gen)
        : undefined,
      audio_gen: (node as { audio_gen?: unknown }).audio_gen
        ? cloneValue((node as { audio_gen?: unknown }).audio_gen)
        : undefined,
      video_gen: (node as { video_gen?: unknown }).video_gen
        ? cloneValue((node as { video_gen?: unknown }).video_gen)
        : undefined,
    })),
    edges: original.edges.map((edge) => ({ ...edge })),
  };

  ensureProjectDirs(newProjectId);
  importProject(clone);
  writeProjectFile(clone);
  return clone;
}

function projectExists(projectId: string): boolean {
  const row = db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(projectId) as unknown;
  return row !== undefined;
}

export function cloneNode(
  projectId: string,
  sourceNodeId: string,
  includeSubnodes: boolean,
): StoredNode {
  const source = getNode(projectId, sourceNodeId);
  if (!source) {
    throw new Error(`Node ${sourceNodeId} not found in project ${projectId}`);
  }

  const cloneId = nextCloneId(projectId, sourceNodeId);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO nodes (
       project_id,
       node_id,
       type,
       title,
       content_type,
       content,
       meta_json,
       config_json,
       visibility_json,
       ui_color,
       bbox_x1,
       bbox_y1,
       bbox_x2,
       bbox_y2,
       ai_visible,
       connections_json,
       created_at,
       updated_at
     )
     VALUES (
       @project_id,
       @node_id,
       @type,
       @title,
       @content_type,
       @content,
       @meta_json,
       @config_json,
       @visibility_json,
       @ui_color,
       @bbox_x1,
       @bbox_y1,
       @bbox_x2,
       @bbox_y2,
       @ai_visible,
       @connections_json,
       @created_at,
       @updated_at
     )`,
  ).run({
    project_id: source.project_id,
    node_id: cloneId,
    type: source.type,
    title: `${source.title} (clone)`,
    content_type: source.content_type,
    content: source.content,
    meta_json: JSON.stringify(source.meta ?? {}),
    config_json: JSON.stringify(source.config ?? {}),
    visibility_json: JSON.stringify(source.visibility ?? {}),
    ui_color: source.ui.color,
    bbox_x1: source.ui.bbox.x1,
    bbox_y1: source.ui.bbox.y1,
    bbox_x2: source.ui.bbox.x2,
    bbox_y2: source.ui.bbox.y2,
    ai_visible: booleanToInteger(source.ai_visible),
    connections_json: JSON.stringify(source.connections ?? createDefaultNodeConnections()),
    created_at: now,
    updated_at: now,
  });

  db.prepare(
    `INSERT INTO edges (project_id, from_node, to_node, label)
     SELECT project_id, @clone_id, to_node, label
     FROM edges WHERE project_id = @project_id AND from_node = @source_id`,
  ).run({
    project_id: projectId,
    source_id: sourceNodeId,
    clone_id: cloneId,
  });

  if (includeSubnodes) {
    const children = listChildren(projectId, sourceNodeId);
    for (const childId of children) {
      const clonedChild = cloneNode(projectId, childId, false);
      db.prepare(
        `INSERT OR IGNORE INTO edges (project_id, from_node, to_node, label) VALUES (?, ?, ?, NULL)`,
      ).run(projectId, cloneId, clonedChild.node_id);
    }
  }

  return getNode(projectId, cloneId)!;
}

function listChildren(projectId: string, nodeId: string): string[] {
  const rows = db
    .prepare(`SELECT to_node FROM edges WHERE project_id = ? AND from_node = ?`)
    .all(projectId, nodeId) as Array<{ to_node: string }>;
  return rows.map((row) => row.to_node);
}

function nextCloneId(projectId: string, baseId: string): string {
  const existing = db
    .prepare(`SELECT node_id FROM nodes WHERE project_id = ? AND node_id LIKE ?`)
    .all(projectId, `${baseId}_clone_%`) as Array<{ node_id: string }>;

  const existingIds = existing.map((row) => row.node_id);

  let counter = 1;
  while (true) {
    const candidate = `${baseId}_clone_${counter.toString().padStart(3, '0')}`;
    if (!existingIds.includes(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export function getProjectSettings(projectId: string): Record<string, unknown> {
  const row = db
    .prepare(`SELECT settings_json FROM projects WHERE project_id = ?`)
    .get(projectId) as { settings_json: string } | undefined;
  return row ? safeParse(row.settings_json) : {};
}

export function safeParse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value)) {
      const current = result[key];
      if (isPlainObject(current)) {
        result[key] = deepMerge(current, value);
      } else {
        result[key] = deepClone(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function withTransaction<T>(fn: () => T): T {
  const trx = db.transaction(fn);
  return trx();
}


