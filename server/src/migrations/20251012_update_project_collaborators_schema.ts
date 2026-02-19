import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251012_update_project_collaborators_schema';

interface ColumnInfo {
  name: string;
}

interface LegacyCollaboratorRow {
  project_id: string | null;
  user_id: string | null;
  role: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  added_at?: string | null;
}

const CREATE_PROJECT_COLLABORATORS_SQL = `
  CREATE TABLE project_collaborators (
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
`;

const CREATE_PROJECT_COLLABORATORS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_project_collaborators_user
    ON project_collaborators(user_id);
`;

export const updateProjectCollaboratorsSchemaMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Ensure project_collaborators has consistent timestamp columns and index',
  run: (db: BetterSqliteDatabase) => {
    const columns = db
      .prepare(`PRAGMA table_info('project_collaborators')`)
      .all() as ColumnInfo[];

    if (columns.length === 0) {
      db.exec(`${CREATE_PROJECT_COLLABORATORS_SQL}${CREATE_PROJECT_COLLABORATORS_INDEX_SQL}`);
      return;
    }

    const hasCreatedAt = columns.some((column) => column.name === 'created_at');
    const hasUpdatedAt = columns.some((column) => column.name === 'updated_at');
    const hasAddedAt = columns.some((column) => column.name === 'added_at');

    if (hasCreatedAt && hasUpdatedAt && hasAddedAt) {
      db.exec(CREATE_PROJECT_COLLABORATORS_INDEX_SQL);
      return;
    }

    const migrate = db.transaction(() => {
      const existingRows = db
        .prepare('SELECT * FROM project_collaborators')
        .all() as LegacyCollaboratorRow[];

      db.exec('ALTER TABLE project_collaborators RENAME TO project_collaborators_old;');
      db.exec(CREATE_PROJECT_COLLABORATORS_SQL);

      const insert = db.prepare(`
        INSERT INTO project_collaborators (project_id, user_id, role, created_at, updated_at, added_at)
        VALUES (@project_id, @user_id, @role, @created_at, @updated_at, @added_at)
      `);

      for (const row of existingRows) {
        if (typeof row.project_id !== 'string' || row.project_id.trim().length === 0) {
          continue;
        }
        if (typeof row.user_id !== 'string' || row.user_id.trim().length === 0) {
          continue;
        }
        const roleCandidate = typeof row.role === 'string' ? row.role.trim() : '';
        const role =
          roleCandidate === 'owner' || roleCandidate === 'editor' || roleCandidate === 'viewer'
            ? roleCandidate
            : 'viewer';

        const now = new Date().toISOString();
        const rawCreated = typeof row.created_at === 'string' && row.created_at.trim().length > 0 ? row.created_at : undefined;
        const rawUpdated = typeof row.updated_at === 'string' && row.updated_at.trim().length > 0 ? row.updated_at : undefined;
        const rawAdded = typeof row.added_at === 'string' && row.added_at.trim().length > 0 ? row.added_at : undefined;

        const created_at = rawCreated ?? rawAdded ?? now;
        const added_at = rawAdded ?? created_at;
        const updated_at = rawUpdated ?? created_at;

        insert.run({
          project_id: row.project_id.trim(),
          user_id: row.user_id.trim(),
          role,
          created_at,
          updated_at,
          added_at,
        });
      }

      db.exec('DROP TABLE project_collaborators_old;');
      db.exec(CREATE_PROJECT_COLLABORATORS_INDEX_SQL);
    });

    migrate();
  },
};
