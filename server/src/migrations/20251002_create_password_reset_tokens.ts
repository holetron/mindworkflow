import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251002_create_password_reset_tokens' });
const MIGRATION_ID = '20251002_create_password_reset_tokens';

export const createPasswordResetTokensMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create password reset tokens table',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used_at TEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);
    
    // Create index for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
      ON password_reset_tokens(user_id);
    `);
    
    // Create index for cleanup of expired tokens
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
      ON password_reset_tokens(expires_at);
    `);
    
    log.info('✅ Password reset tokens table created successfully');
  },
};