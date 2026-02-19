// connection.ts — DB init, migrations, connection pool, getDb(), shared helpers
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Database, { Database as BetterSqlite3Database } from 'better-sqlite3';
import { runMigrations } from '../migrations';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'db/connection' });
import {
  NodeConnections,
  NodeUI,
  createDefaultNodeConnections,
  createDefaultNodeUI,
} from '../types';
import {
  normalizeNodeConnections,
  normalizeNodeUI,
  normalizeAiVisible,
} from '../validation';

// ---- Database path resolution ------------------------------------------------

log.info('DB imports done');

const isPkg = typeof (process as any).pkg !== 'undefined';
const dbEnvOverride = process.env.MWF_DB_PATH;
const dbPath = dbEnvOverride
  ? path.resolve(dbEnvOverride)
  : isPkg
      ? path.resolve(process.cwd(), 'data', 'localcreativeflow.db')
      : path.resolve(__dirname, '../../../data/localcreativeflow.db');
log.info('Database path %s', dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
cleanupStaleJournalFiles(dbPath);

log.info('Creating DB');
export const db: BetterSqlite3Database = new Database(dbPath);
log.info('DB created successfully');

// ---- Base table creation -----------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    settings_json TEXT NOT NULL,
    schemas_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id TEXT
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

  CREATE INDEX IF NOT EXISTS idx_project_collaborators_user
    ON project_collaborators(user_id);

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
`);
log.info('Base tables created');

log.info('About to run migrations');
runMigrations(db);
const { changes: migratedMarkdownNodes } = db
  .prepare(`UPDATE nodes SET type = 'text' WHERE type = 'markdown'`)
  .run();
if (migratedMarkdownNodes > 0) {
  log.info(`[DB] Migrated ${migratedMarkdownNodes} legacy markdown nodes to text`);
}
log.info('DB imported successfully');

db.pragma('foreign_keys = ON');

// ---- Shared utility functions ------------------------------------------------

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
        log.warn({ err: error }, '`Failed to remove stale SQLite journal file ${candidate}:`');
      }
    }
  }
}

export function booleanToInteger(value: boolean): number {
  return value ? 1 : 0;
}

export function integerToBoolean(value: number | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return value !== 0;
}

export function parseConnectionsJson(json: string | null): NodeConnections {
  if (!json) {
    return createDefaultNodeConnections();
  }
  try {
    return normalizeNodeConnections(JSON.parse(json) as Partial<NodeConnections>);
  } catch (error) {
    return createDefaultNodeConnections();
  }
}

export function serializeConnectionsJson(connections: NodeConnections): string {
  return JSON.stringify(normalizeNodeConnections(connections));
}

export function toNodeUI(row: {
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

export function decomposeNodeUI(ui?: Partial<NodeUI>): {
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

export function createHttpError(status: number, message: string): Error {
  const error = new Error(message);
  (error as { status?: number }).status = status;
  return error;
}

export function safeParse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    return {};
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function deepMerge(
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

export function extractConfig(node: { ai?: Record<string, unknown>; parser?: Record<string, unknown>; python?: Record<string, unknown>; image_gen?: Record<string, unknown>; audio_gen?: Record<string, unknown>; video_gen?: Record<string, unknown>; settings?: Record<string, unknown>; payload?: Record<string, unknown> }): Record<string, unknown> {
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
