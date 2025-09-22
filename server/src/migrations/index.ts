import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { addNodeVisualPropertiesMigration } from './20241012_add_node_visual_properties';

export interface Migration {
  id: string;
  name: string;
  run: (db: BetterSqliteDatabase) => void;
}

const MIGRATIONS: Migration[] = [addNodeVisualPropertiesMigration];

export function runMigrations(db: BetterSqliteDatabase): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const appliedRows = db.prepare('SELECT id FROM migrations').all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }

    const started = Date.now();
    console.info(`[migration] Applying ${migration.id} (${migration.name})`);
    try {
      migration.run(db);
      db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString(),
      );
      console.info(
        `[migration] Applied ${migration.id} in ${Date.now() - started}ms`,
      );
    } catch (error) {
      console.error(`[migration] Failed ${migration.id}:`, error);
      throw error;
    }
  }
}
