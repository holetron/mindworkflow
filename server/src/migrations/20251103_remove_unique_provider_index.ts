import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251103_remove_unique_provider_index' });
const MIGRATION_ID = '20251103_remove_unique_provider_index';

export const removeUniqueProviderIndexMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Remove unique constraint on user_id and provider to allow multiple integrations per provider',
  run: (db: BetterSqliteDatabase) => {
    // Drop the unique index that was preventing multiple integrations per provider
    try {
      db.exec('DROP INDEX IF EXISTS idx_global_integrations_user_provider;');
    } catch (error) {
      log.warn({ err: error }, 'Could not drop index');
    }
  },
};
