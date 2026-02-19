/**
 * Factory that creates the mock implementation for ../../connection module.
 *
 * IMPORTANT: This module is designed to be imported inside vi.mock() factories
 * using vi.hoisted() or dynamic import. It must NOT be referenced from
 * top-level variables that vi.mock's hoisted factory cannot access.
 */
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3';
import {
  NodeConnections,
  NodeUI,
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from '../../../../types';
import {
  normalizeNodeConnections,
  normalizeNodeUI,
} from '../../../../validation';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    settings_json TEXT NOT NULL DEFAULT '{}',
    schemas_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT,
    is_public INTEGER NOT NULL DEFAULT 0
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
    source_handle TEXT,
    target_handle TEXT,
    PRIMARY KEY (project_id, from_node, to_node),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT,
    logs_json TEXT NOT NULL,
    FOREIGN KEY (project_id, node_id) REFERENCES nodes(project_id, node_id) ON DELETE CASCADE
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
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_collaborators (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
    created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    added_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS feedback_entries (
    feedback_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    contact TEXT,
    resolution TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS prompt_presets (
    preset_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    tags_json TEXT,
    is_quick_access INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS global_integrations (
    integration_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );
`;

/** Shared test database instance — module-level singleton */
let _db: BetterSqlite3Database | null = null;

export function getTestDb(): BetterSqlite3Database {
  if (!_db) {
    _db = new Database(':memory:');
    _db.pragma('foreign_keys = ON');
    _db.exec(SCHEMA_SQL);
  }
  return _db;
}

export function resetTestDb(): void {
  const db = getTestDb();
  db.exec(`
    DELETE FROM password_reset_tokens;
    DELETE FROM global_integrations;
    DELETE FROM prompt_presets;
    DELETE FROM feedback_entries;
    DELETE FROM runs;
    DELETE FROM assets;
    DELETE FROM edges;
    DELETE FROM nodes;
    DELETE FROM project_collaborators;
    DELETE FROM projects;
    DELETE FROM users;
  `);
}

/**
 * Returns a mock module object for vi.mock('../../connection', ...).
 * Must be called INSIDE the vi.mock factory or through vi.hoisted.
 */
export function createConnectionMock(): Record<string, unknown> {
  const db = getTestDb();

  function safeParse(value: string | null): Record<string, unknown> {
    if (!value) return {};
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  function booleanToInteger(value: boolean): number { return value ? 1 : 0; }
  function integerToBoolean(value: number | null | undefined): boolean {
    if (value === null || value === undefined) return true;
    return value !== 0;
  }
  function parseConnectionsJson(json: string | null): NodeConnections {
    if (!json) return createDefaultNodeConnections();
    try { return normalizeNodeConnections(JSON.parse(json) as Partial<NodeConnections>); } catch { return createDefaultNodeConnections(); }
  }
  function serializeConnectionsJson(connections: NodeConnections): string {
    return JSON.stringify(normalizeNodeConnections(connections));
  }
  function toNodeUI(row: { ui_color: string; bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number }): NodeUI {
    return normalizeNodeUI({ color: row.ui_color, bbox: { x1: row.bbox_x1, y1: row.bbox_y1, x2: row.bbox_x2, y2: row.bbox_y2 } });
  }
  function decomposeNodeUI(ui?: Partial<NodeUI>): { color: string; bbox_x1: number; bbox_y1: number; bbox_x2: number; bbox_y2: number } {
    const normalized = normalizeNodeUI(ui);
    return { color: normalized.color, bbox_x1: normalized.bbox.x1, bbox_y1: normalized.bbox.y1, bbox_x2: normalized.bbox.x2, bbox_y2: normalized.bbox.y2 };
  }
  function createHttpError(status: number, message: string): Error {
    const error = new Error(message);
    (error as { status?: number }).status = status;
    return error;
  }
  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
  function deepClone<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
  }
  function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(patch)) {
      if (isPlainObject(value)) {
        const current = result[key];
        if (isPlainObject(current)) { result[key] = deepMerge(current, value); } else { result[key] = deepClone(value); }
      } else { result[key] = value; }
    }
    return result;
  }
  function withTransaction<T>(fn: () => T): T {
    const trx = db.transaction(fn);
    return trx();
  }
  function extractConfig(node: Record<string, unknown>): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const key of ['ai', 'parser', 'python', 'image_gen', 'audio_gen', 'video_gen', 'settings', 'payload']) {
      if (node[key]) config[key] = node[key];
    }
    return config;
  }
  function hashContent(value: unknown): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
  }

  return {
    db,
    safeParse,
    booleanToInteger,
    integerToBoolean,
    parseConnectionsJson,
    serializeConnectionsJson,
    toNodeUI,
    decomposeNodeUI,
    createHttpError,
    isPlainObject,
    deepClone,
    deepMerge,
    withTransaction,
    extractConfig,
    hashContent,
  };
}
