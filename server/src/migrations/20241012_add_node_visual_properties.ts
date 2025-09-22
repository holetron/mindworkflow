import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createDefaultNodeConnections, NodeConnections, NodeUI } from '../types';
import {
  normalizeNodeConnections,
  normalizeNodeUI,
  assertValidNodeConnections,
  assertValidNodeUI,
} from '../validation';

const COLUMN_DEFINITIONS: Array<{ name: string; sql: string }> = [
  { name: 'ui_color', sql: "ui_color TEXT NOT NULL DEFAULT '#6B7280'" },
  { name: 'bbox_x1', sql: 'bbox_x1 REAL NOT NULL DEFAULT 0' },
  { name: 'bbox_y1', sql: 'bbox_y1 REAL NOT NULL DEFAULT 0' },
  { name: 'bbox_x2', sql: 'bbox_x2 REAL NOT NULL DEFAULT 240' },
  { name: 'bbox_y2', sql: 'bbox_y2 REAL NOT NULL DEFAULT 120' },
  { name: 'ai_visible', sql: 'ai_visible INTEGER NOT NULL DEFAULT 1' },
  {
    name: 'connections_json',
    sql: `connections_json TEXT NOT NULL DEFAULT '{"incoming":[],"outgoing":[]}'`,
  },
];

export const addNodeVisualPropertiesMigration = {
  id: '20241012_add_node_visual_properties',
  name: 'Add node visual properties and cached connections',
  run(db: BetterSqliteDatabase): void {
    console.info('[migration] Starting 20241012_add_node_visual_properties');
    const apply = db.transaction(() => {
      ensureColumns(db);
      hydrateExistingRows(db);
      validateData(db);
    });

    apply();
    console.info('[migration] Completed 20241012_add_node_visual_properties');
  },
};

type NodeRow = {
  project_id: string;
  node_id: string;
  ui_color: string;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  ai_visible: number;
  connections_json: string;
};

type NormalizedRow = {
  ui: NodeUI;
  ai_visible: number;
  connections: NodeConnections;
};

function ensureColumns(db: BetterSqliteDatabase): void {
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info('nodes')").all() as Array<{ name: string }>).map(
      (entry) => entry.name,
    ),
  );

  for (const column of COLUMN_DEFINITIONS) {
    const hasColumn = existingColumns.has(column.name);
    if (hasColumn) {
      continue;
    }
    console.info(`[migration] Adding column nodes.${column.name}`);
    db.exec(`ALTER TABLE nodes ADD COLUMN ${column.sql}`);
  }
}

function hydrateExistingRows(db: BetterSqliteDatabase): void {
  const rows = db
    .prepare(
      `SELECT project_id, node_id, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json FROM nodes`,
    )
    .all() as NodeRow[];

  if (rows.length === 0) {
    return;
  }

  const update = db.prepare(
    `UPDATE nodes
     SET ui_color = @ui_color,
         bbox_x1 = @bbox_x1,
         bbox_y1 = @bbox_y1,
         bbox_x2 = @bbox_x2,
         bbox_y2 = @bbox_y2,
         ai_visible = @ai_visible,
         connections_json = @connections_json
     WHERE project_id = @project_id AND node_id = @node_id`,
  );

  let updates = 0;
  for (const row of rows) {
    const normalized = normalizeRow(row);
    const serializedConnections = JSON.stringify(normalized.connections);
    if (
      row.ui_color !== normalized.ui.color ||
      row.bbox_x1 !== normalized.ui.bbox.x1 ||
      row.bbox_y1 !== normalized.ui.bbox.y1 ||
      row.bbox_x2 !== normalized.ui.bbox.x2 ||
      row.bbox_y2 !== normalized.ui.bbox.y2 ||
      row.ai_visible !== normalized.ai_visible ||
      row.connections_json !== serializedConnections
    ) {
      update.run({
        project_id: row.project_id,
        node_id: row.node_id,
        ui_color: normalized.ui.color,
        bbox_x1: normalized.ui.bbox.x1,
        bbox_y1: normalized.ui.bbox.y1,
        bbox_x2: normalized.ui.bbox.x2,
        bbox_y2: normalized.ui.bbox.y2,
        ai_visible: normalized.ai_visible,
        connections_json: serializedConnections,
      });
      updates += 1;
    }
  }

  if (updates > 0) {
    console.info(`[migration] Normalized ${updates} existing node records`);
  }
}

function validateData(db: BetterSqliteDatabase): void {
  const colorIssues = db
    .prepare(`SELECT COUNT(1) as total FROM nodes WHERE ui_color IS NULL OR TRIM(ui_color) = ''`)
    .get() as { total: number };
  if (colorIssues.total > 0) {
    throw new Error(`Migration validation failed: ${colorIssues.total} nodes missing ui_color`);
  }

  const aiIssues = db
    .prepare(`SELECT COUNT(1) as total FROM nodes WHERE ai_visible NOT IN (0, 1)`)
    .get() as { total: number };
  if (aiIssues.total > 0) {
    throw new Error(`Migration validation failed: ${aiIssues.total} nodes have invalid ai_visible`);
  }

  const rows = db
    .prepare(
      `SELECT project_id, node_id, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json FROM nodes`,
    )
    .all() as NodeRow[];

  for (const row of rows) {
    const normalized = normalizeRow(row);
    try {
      assertValidNodeUI(normalized.ui);
      assertValidNodeConnections(normalized.connections);
    } catch (error) {
      throw new Error(
        `Migration validation failed for node ${row.project_id}/${row.node_id}: ${(error as Error).message}`,
      );
    }
  }

  console.info(`[migration] Validated ${rows.length} node records`);
}

function normalizeRow(row: NodeRow): NormalizedRow {
  let connections: NodeConnections;
  try {
    connections = normalizeNodeConnections(JSON.parse(row.connections_json));
  } catch (error) {
    connections = createDefaultNodeConnections();
  }

  const ui = normalizeNodeUI({
    color: row.ui_color,
    bbox: {
      x1: row.bbox_x1,
      y1: row.bbox_y1,
      x2: row.bbox_x2,
      y2: row.bbox_y2,
    },
  });

  const aiVisible = row.ai_visible === 0 ? 0 : 1;

  return {
    ui,
    ai_visible: aiVisible,
    connections,
  };
}
