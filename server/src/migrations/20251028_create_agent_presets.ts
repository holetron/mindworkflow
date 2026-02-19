import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251028_create_agent_presets' });
const MIGRATION_ID = '20251028_create_agent_presets';

/**
 * Миграция для создания таблицы agent_presets
 * Хранит полные JSON-шаблоны нод агентов для быстрого создания
 */
export const migration: Migration = {
  id: MIGRATION_ID,
  name: 'Create agent_presets table',
  run: (db: BetterSqliteDatabase) => {
    log.info(`[Migration ${MIGRATION_ID}] Starting...`);

    // Создаём таблицу для пресетов агентов
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_presets (
        preset_id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '🤖',
        node_template TEXT NOT NULL,
        tags TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    log.info(`[Migration ${MIGRATION_ID}] Created agent_presets table`);

    // Индексы для быстрого поиска
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_presets_user_id 
      ON agent_presets(user_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_presets_created_at 
      ON agent_presets(created_at DESC);
    `);

    log.info(`[Migration ${MIGRATION_ID}] Created indexes`);
    log.info(`[Migration ${MIGRATION_ID}] Completed successfully`);
  },
};
