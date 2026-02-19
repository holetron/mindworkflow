import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20250929_create_project_collaborators';

export const createProjectCollaboratorsMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create project collaborators table for workflow sharing roles',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_collaborators (
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
        created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
        added_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_project_collaborators_user
        ON project_collaborators(user_id);
    `);
  },
};
