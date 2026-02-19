import { randomUUID } from 'crypto';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251015_fix_global_integrations_schema';

function columnExists(db: BetterSqliteDatabase, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export const fixGlobalIntegrationsSchemaMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Ensure global_integrations uses config_json and enabled flag',
  run: (db: BetterSqliteDatabase) => {
    const hasTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='global_integrations'",
      )
      .get() as { name: string } | undefined;

    if (!hasTable) {
      return;
    }

    const needsFullRewrite =
      !columnExists(db, 'global_integrations', 'config_json') ||
      columnExists(db, 'global_integrations', 'providerId');

    if (needsFullRewrite) {
      db.exec('BEGIN TRANSACTION');
      try {
        const legacyRows = db.prepare('SELECT * FROM global_integrations').all() as Array<
          Record<string, unknown>
        >;

        db.exec('ALTER TABLE global_integrations RENAME TO global_integrations_legacy');

        db.exec(`
          CREATE TABLE global_integrations (
            integration_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            config_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
          );
        `);

        const insert = db.prepare(
          `INSERT INTO global_integrations (
             integration_id, user_id, type, name, config_json, enabled, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const now = new Date().toISOString();

        for (const row of legacyRows) {
          const integrationId =
            pickString(row.integration_id) ||
            pickString(row.id) ||
            randomUUID();
          const userId = pickString(row.user_id) || pickString(row.userId);
          if (!userId) {
            // Skip orphaned integrations to preserve referential integrity.
            continue;
          }

          const type =
            pickString(row.type) ||
            pickString(row.providerId) ||
            'custom';
          const name = pickString(row.name) || type;

          const config =
            typeof row.config_json === 'string' && row.config_json.trim().length > 0
              ? parseJsonColumn<Record<string, unknown>>(row.config_json, {})
              : {
                  description: pickString(row.description),
                  apiKey: pickString(row.apiKey),
                  baseUrl: pickString(row.baseUrl),
                  organization: pickString(row.organization),
                  webhookContract: pickString(row.webhookContract),
                  systemPrompt: pickString(row.systemPrompt),
                  inputFields: parseJsonColumn<unknown[]>(row.inputFields, []),
                  exampleRequest: parseJsonColumn<Record<string, unknown> | null>(
                    row.exampleRequest,
                    null,
                  ),
                  exampleResponseMapping: parseJsonColumn<Record<string, unknown> | null>(
                    row.exampleResponseMapping,
                    null,
                  ),
                };

          const enabledValue =
            typeof row.enabled === 'number'
              ? row.enabled
              : typeof row.enabled === 'string'
                ? Number(row.enabled)
                : 1;
          const enabled = Number.isFinite(enabledValue) ? (enabledValue as number) : 1;

          const createdAt =
            pickString(row.created_at) ||
            pickString(row.createdAt) ||
            now;
          const updatedAt =
            pickString(row.updated_at) ||
            pickString(row.updatedAt) ||
            createdAt;

          insert.run(
            integrationId,
            userId,
            type,
            name,
            JSON.stringify(config),
            enabled ? 1 : 0,
            createdAt,
            updatedAt,
          );
        }

        db.exec('DROP TABLE global_integrations_legacy');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else if (!columnExists(db, 'global_integrations', 'enabled')) {
      db.exec(`ALTER TABLE global_integrations ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;`);
    }
  },
};
