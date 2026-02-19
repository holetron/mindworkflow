import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251006_add_project_public_field';

export const addProjectPublicFieldMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Add is_public field to projects table for public access',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      ALTER TABLE projects ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
    `);
  },
};