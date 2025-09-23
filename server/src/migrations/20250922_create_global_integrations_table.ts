import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20250922_create_global_integrations_table';

export const createGlobalIntegrationsTableMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create global_integrations table',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS global_integrations (
        id TEXT PRIMARY KEY,
        providerId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        apiKey TEXT,
        baseUrl TEXT,
        organization TEXT,
        webhookContract TEXT,
        systemPrompt TEXT,
        inputFields JSON DEFAULT '[]',
        exampleRequest JSON,
        exampleResponseMapping JSON,
        createdAt TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updatedAt TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
  },
};
