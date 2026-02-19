import { Database } from 'better-sqlite3';
import { encryptSecret, decryptSecret } from '../utils/secretStorage';

export interface UserMidjourneyAccount {
  id: number;
  user_id: string;
  name: string;
  guild_id: string;
  channel_id: string;
  user_token: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export function createUserMidjourneyAccount(
  db: Database,
  userId: string,
  name: string,
  guildId: string,
  channelId: string,
  userToken: string,
  userAgent?: string
): UserMidjourneyAccount {
  const encryptedToken = encryptSecret(userToken);
  const stmt = db.prepare(`
    INSERT INTO user_midjourney_accounts (user_id, name, guild_id, channel_id, user_token, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(userId, name, guildId, channelId, encryptedToken, userAgent);
  
  return {
    id: result.lastInsertRowid as number,
    user_id: userId,
    name,
    guild_id: guildId,
    channel_id: channelId,
    user_token: userToken,
    user_agent: userAgent,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function getUserMidjourneyAccounts(db: Database, userId: string): UserMidjourneyAccount[] {
  const stmt = db.prepare(`
    SELECT * FROM user_midjourney_accounts WHERE user_id = ? ORDER BY created_at DESC
  `);
  const rows = stmt.all(userId) as Array<UserMidjourneyAccount>;
  return rows.map((row) => ({
    ...row,
    user_token: row.user_token ? decryptSecret(row.user_token) : '',
  }));
}

export function getUserMidjourneyAccountById(db: Database, userId: string, id: number): UserMidjourneyAccount | null {
  const stmt = db.prepare(`
    SELECT * FROM user_midjourney_accounts WHERE user_id = ? AND id = ?
  `);
  const row = stmt.get(userId, id) as UserMidjourneyAccount | null;
  if (!row) {
    return null;
  }
  return {
    ...row,
    user_token: row.user_token ? decryptSecret(row.user_token) : '',
  };
}

export function updateUserMidjourneyAccount(
  db: Database,
  userId: string,
  id: number,
  name: string,
  guildId: string,
  channelId: string,
  userToken: string,
  userAgent?: string
): boolean {
  const encryptedToken = encryptSecret(userToken);
  const stmt = db.prepare(`
    UPDATE user_midjourney_accounts 
    SET name = ?, guild_id = ?, channel_id = ?, user_token = ?, user_agent = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `);
  
  const result = stmt.run(name, guildId, channelId, encryptedToken, userAgent, new Date().toISOString(), userId, id);
  return result.changes > 0;
}

export function deleteUserMidjourneyAccount(db: Database, userId: string, id: number): boolean {
  const stmt = db.prepare(`
    DELETE FROM user_midjourney_accounts WHERE user_id = ? AND id = ?
  `);
  
  const result = stmt.run(userId, id);
  return result.changes > 0;
}
