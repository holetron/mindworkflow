import { google } from 'googleapis';
import axios from 'axios';
import { db } from '../../db';
import { GoogleDriveConfig, GoogleDriveToken } from '../../types/googleDrive';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'googleDrive' });

/**
 * Handles OAuth2 authentication flow for Google Drive.
 */
export class GoogleDriveAuth {
  private oauth2Client: any;
  private config: GoogleDriveConfig;

  constructor(config: GoogleDriveConfig) {
    this.config = config;

    if (!config.clientId || !config.clientSecret) {
      log.warn('[GoogleDrive] Credentials not configured. OAuth2 will be unavailable.');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri,
    );
  }

  getOAuth2Client(): any {
    return this.oauth2Client;
  }

  /**
   * Get authorization URL
   */
  getAuthorizationUrl(state: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      state,
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, userId: string): Promise<GoogleDriveToken> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      const googleToken: GoogleDriveToken = {
        user_id: userId,
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || '',
        expires_at: (tokens.expiry_date || 0) / 1000,
      };

      const stmt = db.prepare(`
        INSERT INTO google_drive_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(
        googleToken.user_id,
        googleToken.access_token,
        googleToken.refresh_token,
        googleToken.expires_at,
      );

      log.info(`[GoogleDrive] Tokens exchanged and saved for user ${userId}`);
      return googleToken;
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error exchanging code for tokens');
      throw error;
    }
  }

  /**
   * Get or refresh access token
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const tokenRecord = db.prepare(`
      SELECT * FROM google_drive_tokens WHERE user_id = ?
    `).get(userId) as any;

    if (!tokenRecord) {
      throw new Error('No Google Drive tokens found for user');
    }

    const now = Math.floor(Date.now() / 1000);

    if (tokenRecord.expires_at > now + 300) {
      return tokenRecord.access_token;
    }

    return this.refreshAccessToken(userId);
  }

  /**
   * Refresh access token if expired
   */
  private async refreshAccessToken(userId: string): Promise<string> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    try {
      const tokenRecord = db.prepare(`
        SELECT * FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord || !tokenRecord.refresh_token) {
        throw new Error('No refresh token found');
      }

      this.oauth2Client.setCredentials({
        refresh_token: tokenRecord.refresh_token,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      const stmt = db.prepare(`
        UPDATE google_drive_tokens
        SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);

      stmt.run(
        credentials.access_token,
        (credentials.expiry_date || 0) / 1000,
        userId,
      );

      log.info(`[GoogleDrive] Access token refreshed for user ${userId}`);
      return credentials.access_token || '';
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error refreshing access token');
      throw error;
    }
  }

  /**
   * Disconnect sync (revoke tokens)
   */
  async revokeAccess(userId: string): Promise<void> {
    try {
      const tokenRecord = db.prepare(`
        SELECT access_token FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord) {
        return;
      }

      await axios.get(`https://oauth2.googleapis.com/revoke`, {
        params: {
          token: tokenRecord.access_token,
        },
      }).catch(err => {
        log.warn('[GoogleDrive] Token revoke warning %s', err.message);
      });

      const stmt = db.prepare(`DELETE FROM google_drive_tokens WHERE user_id = ?`);
      stmt.run(userId);

      log.info(`[GoogleDrive] Access revoked for user ${userId}`);
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error revoking access');
      throw error;
    }
  }

  /**
   * Check connection status
   */
  isConnected(userId: string): boolean {
    const tokenRecord = db.prepare(`
      SELECT id FROM google_drive_tokens WHERE user_id = ? LIMIT 1
    `).get(userId) as any;

    return !!tokenRecord;
  }

  /**
   * Get connection information
   */
  getConnectionInfo(userId: string): GoogleDriveToken | null {
    const tokenRecord = db.prepare(`
      SELECT user_id, drive_folder_id, last_sync_at, created_at, updated_at
      FROM google_drive_tokens
      WHERE user_id = ?
    `).get(userId) as any;

    if (!tokenRecord) {
      return null;
    }

    return {
      user_id: tokenRecord.user_id,
      drive_folder_id: tokenRecord.drive_folder_id,
      last_sync_at: tokenRecord.last_sync_at,
      created_at: tokenRecord.created_at,
      updated_at: tokenRecord.updated_at,
    } as GoogleDriveToken;
  }
}
