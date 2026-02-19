import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251027_add_is_default_to_integrations';

export const addIsDefaultToIntegrationsMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Add is_default column to global_integrations table',
  run: (db: BetterSqliteDatabase) => {
    // Check if column already exists to avoid error
    const tableInfo = db.prepare(`PRAGMA table_info(global_integrations)`).all();
    const hasIsDefault = (tableInfo as Array<{ name: string }>).some(col => col.name === 'is_default');
    
    if (!hasIsDefault) {
      db.exec(`
        ALTER TABLE global_integrations ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
      `);
    }
  },
};
