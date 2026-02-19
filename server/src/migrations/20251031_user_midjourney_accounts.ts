import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_midjourney_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_token TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(user_id, channel_id),
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    )
  `);
  
  db.exec(`CREATE INDEX idx_user_midjourney_accounts_user_id ON user_midjourney_accounts(user_id)`);
}

export function down(db: Database) {
  db.exec('DROP TABLE IF EXISTS user_midjourney_accounts');
}

export const userMidjourneyAccountsMigration = {
  id: '20251031_user_midjourney_accounts',
  name: 'Create user midjourney accounts table',
  run: up,
};