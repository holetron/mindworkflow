import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251016_remove_placeholder_replicate_tokens';

const PLACEHOLDER_TOKENS = [
  'r8_dev_placeholder_token',
  'replicate_placeholder_token',
  'replicate_token_placeholder',
  'replicate_api_token_placeholder',
].map((value) => value.toLowerCase());

function isPlaceholderToken(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (PLACEHOLDER_TOKENS.includes(normalized)) {
    return true;
  }
  return normalized.includes('placeholder') || normalized.includes('changeme');
}

function parseConfig(configJson: string | null | undefined): Record<string, unknown> {
  if (typeof configJson !== 'string' || configJson.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(configJson) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export const removePlaceholderReplicateTokensMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Remove placeholder Replicate tokens and disable invalid integrations',
  run: (db: BetterSqliteDatabase) => {
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='global_integrations'")
      .get() as { name: string } | undefined;

    if (!hasTable) {
      return;
    }

    const rows = db
      .prepare(
        `SELECT integration_id, config_json, enabled
           FROM global_integrations
          WHERE type = 'replicate'`,
      )
      .all() as Array<{ integration_id: string; config_json: string | null; enabled: number }>;

    if (rows.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    for (const row of rows) {
      const config = parseConfig(row.config_json);
      const rawKey =
        typeof config.apiKey === 'string'
          ? config.apiKey
          : typeof (config as Record<string, unknown>).api_token === 'string'
            ? ((config as Record<string, unknown>).api_token as string)
            : '';
      const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : '';
      const placeholder = isPlaceholderToken(normalizedKey);

      if (placeholder) {
        db.prepare('DELETE FROM global_integrations WHERE integration_id = ?').run(row.integration_id);
        continue;
      }

      let needsUpdate = false;

      if ('api_token' in config) {
        delete (config as Record<string, unknown>).api_token;
        needsUpdate = true;
      }

      if (normalizedKey !== rawKey) {
        config.apiKey = normalizedKey;
        needsUpdate = true;
      }

      if (!normalizedKey) {
        if (config.apiKey !== '') {
          config.apiKey = '';
          needsUpdate = true;
        }
      }

      const desiredEnabled = normalizedKey ? 1 : 0;
      if (row.enabled !== desiredEnabled) {
        needsUpdate = true;
      }

      if (!needsUpdate) {
        continue;
      }

      db.prepare(
        `UPDATE global_integrations
            SET config_json = ?,
                enabled = ?,
                updated_at = ?
          WHERE integration_id = ?`,
      ).run(JSON.stringify(config), desiredEnabled, now, row.integration_id);
    }
  },
};
