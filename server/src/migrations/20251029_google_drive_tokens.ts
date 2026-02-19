import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_drive_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      drive_folder_id TEXT,
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(user_id),
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    )
  `);
  
  db.exec(`CREATE INDEX idx_google_drive_tokens_user_id ON google_drive_tokens(user_id)`);
}

export function down(db: Database) {
  db.exec('DROP TABLE IF EXISTS google_drive_tokens');
}

export const googleDriveTokensMigration = {
  id: '20251029_google_drive_tokens',
  name: 'Create google drive tokens table',
  run: up,
};
