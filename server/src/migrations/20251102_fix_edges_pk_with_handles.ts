import { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251102_fix_edges_pk_with_handles' });
const MIGRATION_ID = '20251102_fix_edges_pk_with_handles';

export const fixEdgesPkWithHandlesMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Fix edges table PK to include source_handle and target_handle',
  run: (db: BetterSqliteDatabase): void => {
    try {
      // Check if the table has the old structure (PK without handles)
      const tableInfo = db.prepare("PRAGMA table_info(edges)").all() as any[];
      
      // Check if constraint already includes handles (by checking table_list)
      const constraints = db.prepare("SELECT * FROM sqlite_master WHERE type='table' AND name='edges'").get() as any;
      
      // If migration already applied, skip
      if (constraints?.sql?.includes('UNIQUE')) {
        log.info(`ℹ️ Migration ${MIGRATION_ID}: UNIQUE constraint already exists, skipping`);
        return;
      }

      // Add UNIQUE constraint on (project_id, from_node, to_node, source_handle, target_handle)
      // This allows multiple edges between same nodes but with different handles
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique_with_handles
        ON edges(project_id, from_node, to_node, 
                 COALESCE(source_handle, ''), 
                 COALESCE(target_handle, ''))
      `);
      
      log.info(`✅ Migration ${MIGRATION_ID}: Created UNIQUE index with handle support`);
    } catch (error) {
      log.error({ err: error }, '`❌ Migration ${MIGRATION_ID} failed:`');
      throw error;
    }
  },
};
