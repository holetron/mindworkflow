import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20250926_add_user_id_to_tables';

function columnExists(db: BetterSqliteDatabase, table: string, column: string): boolean {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return rows.some(row => row.name === column);
}

export const addUserIdToTablesMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Add user_id and mode to global_integrations and projects tables',
  run: (db: BetterSqliteDatabase) => {
    // Add user_id to global_integrations if not exists
    if (!columnExists(db, 'global_integrations', 'user_id')) {
      db.exec(`
        ALTER TABLE global_integrations ADD COLUMN user_id TEXT;
      `);
    }
    // Add user_id to projects if not exists
    if (!columnExists(db, 'projects', 'user_id')) {
      db.exec(`
        ALTER TABLE projects ADD COLUMN user_id TEXT;
      `);
    }
    // Add mode to projects if not exists
    if (!columnExists(db, 'projects', 'mode')) {
      db.exec(`
        ALTER TABLE projects ADD COLUMN mode TEXT;
      `);
    }
  },
};