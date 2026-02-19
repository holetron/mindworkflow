import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createGlobalIntegrationsTableMigration } from './20250922_create_global_integrations_table';
import { addUserIdToTablesMigration } from './20250926_add_user_id_to_tables';
import { createUsersTableMigration } from './20250927_create_users_table';
import { createProjectCollaboratorsMigration } from './20250929_create_project_collaborators';
import { updateProjectCollaboratorsSchemaMigration } from './20251012_update_project_collaborators_schema';
import { addProjectPublicFieldMigration } from './20251006_add_project_public_field';
import { createPasswordResetTokensMigration } from './20251002_create_password_reset_tokens';
import { createPromptPresetsMigration } from './20251010_create_prompt_presets';
import { fixGlobalIntegrationsSchemaMigration } from './20251015_fix_global_integrations_schema';
import { removePlaceholderReplicateTokensMigration } from './20251016_remove_placeholder_replicate_tokens';
import { addUniqueIndexGlobalIntegrationsMigration } from './20251020_add_unique_index_global_integrations';
import { createFeedbackEntriesMigration } from './20251021_create_feedback_entries';
import { addEdgeHandlesMigration } from './20251020_add_edge_handles';
import { addIsDefaultToIntegrationsMigration } from './20251027_add_is_default_to_integrations';
import { migration as createAgentPresetsMigration } from './20251028_create_agent_presets';
import { chatAgentPromptsMigration } from './20251029_chat_agent_prompts';
import { chatAttachmentsMigration } from './20251029_chat_attachments';
import { googleDriveTokensMigration } from './20251029_google_drive_tokens';
import { userMidjourneyAccountsMigration } from './20251031_user_midjourney_accounts';
import { fixEdgesPkWithHandlesMigration } from './20251102_fix_edges_pk_with_handles';
import { removeUniqueProviderIndexMigration } from './20251103_remove_unique_provider_index';


import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/index' });
export interface Migration {
  id: string;
  name: string;
  run: (db: BetterSqliteDatabase) => void;
}

const MIGRATIONS: Migration[] = [
  createGlobalIntegrationsTableMigration,
  fixGlobalIntegrationsSchemaMigration,
  removePlaceholderReplicateTokensMigration,
  addUniqueIndexGlobalIntegrationsMigration,
  addEdgeHandlesMigration,
  addUserIdToTablesMigration,
  createUsersTableMigration,
  createProjectCollaboratorsMigration,
  updateProjectCollaboratorsSchemaMigration,
  addProjectPublicFieldMigration,
  createPasswordResetTokensMigration,
  createPromptPresetsMigration,
  createFeedbackEntriesMigration,
  addIsDefaultToIntegrationsMigration,
  createAgentPresetsMigration,
  chatAgentPromptsMigration,
  chatAttachmentsMigration,
  googleDriveTokensMigration,
  userMidjourneyAccountsMigration,
  fixEdgesPkWithHandlesMigration,
  removeUniqueProviderIndexMigration,
];

export function runMigrations(db: BetterSqliteDatabase): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const appliedRows = db.prepare('SELECT id FROM migrations').all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }

    const started = Date.now();
    log.info(`[migration] Applying ${migration.id} (${migration.name})`);
    try {
      migration.run(db);
      db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString(),
      );
      log.info(
        `[migration] Applied ${migration.id} in ${Date.now() - started}ms`,
      );
    } catch (error) {
      log.error({ err: error }, '`[migration] Failed ${migration.id}:`');
      throw error;
    }
  }
}
