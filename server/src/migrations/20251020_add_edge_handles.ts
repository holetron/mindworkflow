import { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251020_add_edge_handles' });
const MIGRATION_ID = '20251020_add_edge_handles';

export const addEdgeHandlesMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Add source_handle and target_handle to edges table',
  run: (db: BetterSqliteDatabase): void => {
    // Check if columns already exist (they may be in base schema)
    const columns = db.prepare("PRAGMA table_info(edges)").all() as any[];
    const hasSourceHandle = columns.some((col: any) => col.name === 'source_handle');
    const hasTargetHandle = columns.some((col: any) => col.name === 'target_handle');
    
    if (!hasSourceHandle) {
      db.exec(`ALTER TABLE edges ADD COLUMN source_handle TEXT;`);
    }
    if (!hasTargetHandle) {
      db.exec(`ALTER TABLE edges ADD COLUMN target_handle TEXT;`);
    }
    log.info(`✅ Migration ${MIGRATION_ID}: Ensured source_handle and target_handle columns exist in edges table`);
  },
};
