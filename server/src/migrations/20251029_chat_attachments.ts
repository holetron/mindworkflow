import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251029_chat_attachments' });
const MIGRATION_ID = '20251029_chat_attachments';

/**
 * Migration: Add attachments support to chat messages
 * 
 * Adds attachments_json column to store file references in chat messages
 */

export const chatAttachmentsMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Add attachments support to chat messages',
  run(db: BetterSqliteDatabase): void {
    log.info(`Running migration: ${MIGRATION_ID}`);
    
    // First ensure the table exists with the correct schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attachments_json TEXT DEFAULT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );
    `);
    
    // Check if attachments_json column exists, if not add it
    const tableInfo = db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{name: string}>;
    const hasAttachmentsColumn = tableInfo.some(col => col.name === 'attachments_json');
    
    if (!hasAttachmentsColumn) {
      db.exec(`
        ALTER TABLE chat_messages 
        ADD COLUMN attachments_json TEXT DEFAULT NULL;
      `);
    }
    
    // Create index if it doesn't exist
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
    `);
    
    log.info(`Migration ${MIGRATION_ID} completed successfully`);
  },
};
