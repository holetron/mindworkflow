import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251020_add_unique_index_global_integrations';

export const addUniqueIndexGlobalIntegrationsMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Ensure unique global integrations per user and provider',
  run: (db: BetterSqliteDatabase) => {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='global_integrations'")
      .get() as { name: string } | undefined;

    if (!tableExists) {
      return;
    }

    db.exec(`
      WITH ranked AS (
        SELECT
          rowid,
          integration_id,
          user_id,
          type,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, type
            ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
          ) AS rn
        FROM global_integrations
      )
      DELETE FROM global_integrations
      WHERE rowid IN (SELECT rowid FROM ranked WHERE rn > 1);
    `);

    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_global_integrations_user_provider ON global_integrations(user_id, type);',
    );
  },
};

