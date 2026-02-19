import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20250927_create_users_table_v2';

export const createUsersTableMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create users table for authentication',
  run: (db: BetterSqliteDatabase) => {
    // Ensure the table exists with correct schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0
      );
    `);
    
    // Check if table exists and has the correct schema
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
    if (!hasUpdatedAt) {
      db.exec('ALTER TABLE users ADD COLUMN updated_at TEXT;');
    }

    const hasIsAdmin = tableInfo.some(col => col.name === 'is_admin');
    if (!hasIsAdmin) {
      db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;');
    }
  },
};
