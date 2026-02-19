import { google, drive_v3 } from 'googleapis';
import axios from 'axios';
import { db } from '../db';
import { GoogleDriveConfig, GoogleDriveToken, GoogleOAuthTokenResponse, GoogleDriveFile } from '../types/googleDrive';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'googleDrive' });
export class GoogleDriveService {
  private oauth2Client: any;
  private driveService: drive_v3.Drive | null = null;
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
      config.redirectUri
    );
  }

  /**
   * Получить URL для авторизации
   */
  getAuthorizationUrl(state: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      state,
      prompt: 'consent', // Force consent screen to get refresh token
    });
  }

  /**
   * Обменять authorization code на токены
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
        expires_at: (tokens.expiry_date || 0) / 1000, // Convert to seconds
      };

      // Сохраняем или обновляем токены в БД
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
        googleToken.expires_at
      );

      log.info(`[GoogleDrive] Tokens exchanged and saved for user ${userId}`);
      return googleToken;
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error exchanging code for tokens');
      throw error;
    }
  }

  /**
   * Получить или обновить access token
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const tokenRecord = db.prepare(`
      SELECT * FROM google_drive_tokens WHERE user_id = ?
    `).get(userId) as any;

    if (!tokenRecord) {
      throw new Error('No Google Drive tokens found for user');
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Если токен еще действителен (запас 300 сек), используем его
    if (tokenRecord.expires_at > now + 300) {
      return tokenRecord.access_token;
    }

    // Иначе обновляем
    return this.refreshAccessToken(userId);
  }

  /**
   * Обновить access token если истек
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
        userId
      );

      log.info(`[GoogleDrive] Access token refreshed for user ${userId}`);
      return credentials.access_token || '';
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error refreshing access token');
      throw error;
    }
  }

  /**
   * Инициализировать Drive сервис с валидным токеном
   */
  private async initializeDriveService(userId: string): Promise<drive_v3.Drive> {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    const accessToken = await this.getValidAccessToken(userId);
    this.oauth2Client.setCredentials({ access_token: accessToken });

    if (!this.driveService) {
      this.driveService = google.drive({ version: 'v3', auth: this.oauth2Client });
    }

    return this.driveService;
  }

  /**
   * Создать или получить папку проекта на Drive
   */
  async ensureProjectFolder(userId: string, projectId: string, projectName: string): Promise<string> {
    const drive = await this.initializeDriveService(userId);

    try {
      // Получаем или создаем корневую папку "MindWorkflow Projects"
      let rootFolderId = await this.getOrCreateRootFolder(userId);

      if (!rootFolderId) {
        // Создаем корневую папку
        const rootFolder = await drive.files.create({
          requestBody: {
            name: 'MindWorkflow Projects',
            mimeType: 'application/vnd.google-apps.folder',
            properties: {
              mindworkflow_root: 'true',
            },
          },
          fields: 'id',
        });

        rootFolderId = rootFolder.data.id || '';

        // Сохраняем ID в БД
        const stmt = db.prepare(`
          UPDATE google_drive_tokens
          SET drive_folder_id = ?
          WHERE user_id = ?
        `);
        stmt.run(rootFolderId, userId);
      }

      // Проверяем, есть ли папка проекта
      const projectFolderQuery = `'${rootFolderId}' in parents and name = '${projectId}' and trashed = false`;
      const projectFolderResponse = await drive.files.list({
        q: projectFolderQuery,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const projectFolders = projectFolderResponse.data.files || [];

      if (projectFolders.length > 0) {
        return projectFolders[0].id || '';
      }

      // Создаем папку проекта
      const projectFolder = await drive.files.create({
        requestBody: {
          name: projectId,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
        },
        fields: 'id',
      });

      return projectFolder.data.id || '';
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error ensuring project folder');
      throw error;
    }
  }

  /**
   * Получить ID корневой папки
   */
  private async getOrCreateRootFolder(userId: string): Promise<string | null> {
    const drive = await this.initializeDriveService(userId);

    try {
      const rootQuery = `name = 'MindWorkflow Projects' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
      const response = await drive.files.list({
        q: rootQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const files = response.data.files || [];
      return files.length > 0 ? (files[0].id || null) : null;
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error getting root folder');
      return null;
    }
  }

  /**
   * Загрузить файл на Google Drive
   */
  async uploadProjectFile(
    userId: string,
    projectId: string,
    projectName: string,
    filename: string,
    data: Buffer
  ): Promise<string> {
    const drive = await this.initializeDriveService(userId);

    try {
      const projectFolderId = await this.ensureProjectFolder(userId, projectId, projectName);

      // Проверяем, существует ли уже файл
      const fileQuery = `'${projectFolderId}' in parents and name = '${filename}' and trashed = false`;
      const existingResponse = await drive.files.list({
        q: fileQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const existingFiles = existingResponse.data.files || [];
      const fileId = existingFiles.length > 0 ? existingFiles[0].id : null;

      if (fileId) {
        // Обновляем существующий файл
        await drive.files.update({
          fileId,
          media: {
            body: data,
            mimeType: 'application/json',
          },
        });

        log.info(`[GoogleDrive] File updated: ${filename} in project ${projectId}`);
      } else {
        // Создаем новый файл
        const createResponse = await drive.files.create({
          requestBody: {
            name: filename,
            parents: [projectFolderId],
          },
          media: {
            body: data,
            mimeType: 'application/json',
          },
          fields: 'id',
        });

        log.info(`[GoogleDrive] File uploaded: ${filename} to project ${projectId}`);
      }

      // Обновляем last_sync_at
      const stmt = db.prepare(`
        UPDATE google_drive_tokens
        SET last_sync_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      stmt.run(userId);

      return fileId || '';
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error uploading file');
      throw error;
    }
  }

  /**
   * Скачать файл из Google Drive
   */
  async downloadProjectFile(userId: string, projectId: string, filename: string): Promise<Buffer> {
    const drive = await this.initializeDriveService(userId);

    try {
      const tokenRecord = db.prepare(`
        SELECT drive_folder_id FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord?.drive_folder_id) {
        throw new Error('No drive folder ID found');
      }

      // Находим папку проекта
      const projectFolderQuery = `'${tokenRecord.drive_folder_id}' in parents and name = '${projectId}' and trashed = false`;
      const projectFolderResponse = await drive.files.list({
        q: projectFolderQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const projectFolders = projectFolderResponse.data.files || [];
      if (projectFolders.length === 0) {
        throw new Error('Project folder not found on Drive');
      }

      const projectFolderId = projectFolders[0].id || '';

      // Находим файл
      const fileQuery = `'${projectFolderId}' in parents and name = '${filename}' and trashed = false`;
      const fileResponse = await drive.files.list({
        q: fileQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const files = fileResponse.data.files || [];
      if (files.length === 0) {
        throw new Error(`File ${filename} not found on Drive`);
      }

      const fileId = files[0].id || '';

      // Скачиваем файл
      const getResponse = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      return Buffer.from(getResponse.data as ArrayBuffer);
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error downloading file');
      throw error;
    }
  }

  /**
   * Список файлов проекта на Drive
   */
  async listProjectFiles(userId: string, projectId: string): Promise<GoogleDriveFile[]> {
    const drive = await this.initializeDriveService(userId);

    try {
      const tokenRecord = db.prepare(`
        SELECT drive_folder_id FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord?.drive_folder_id) {
        throw new Error('No drive folder ID found');
      }

      // Находим папку проекта
      const projectFolderQuery = `'${tokenRecord.drive_folder_id}' in parents and name = '${projectId}' and trashed = false`;
      const projectFolderResponse = await drive.files.list({
        q: projectFolderQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const projectFolders = projectFolderResponse.data.files || [];
      if (projectFolders.length === 0) {
        return [];
      }

      const projectFolderId = projectFolders[0].id || '';

      // Список файлов в проекте
      const filesQuery = `'${projectFolderId}' in parents and trashed = false`;
      const filesResponse = await drive.files.list({
        q: filesQuery,
        spaces: 'drive',
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, webViewLink)',
        pageSize: 100,
      });

      return (filesResponse.data.files || []).map(file => ({
        id: file.id || '',
        name: file.name || '',
        mimeType: file.mimeType || '',
        createdTime: file.createdTime || undefined,
        modifiedTime: file.modifiedTime || undefined,
        webViewLink: file.webViewLink || undefined,
      })) as GoogleDriveFile[];
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error listing files');
      throw error;
    }
  }

  /**
   * Удалить проект с Drive
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const drive = await this.initializeDriveService(userId);

    try {
      const tokenRecord = db.prepare(`
        SELECT drive_folder_id FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord?.drive_folder_id) {
        throw new Error('No drive folder ID found');
      }

      // Находим папку проекта
      const projectFolderQuery = `'${tokenRecord.drive_folder_id}' in parents and name = '${projectId}' and trashed = false`;
      const projectFolderResponse = await drive.files.list({
        q: projectFolderQuery,
        spaces: 'drive',
        fields: 'files(id)',
        pageSize: 1,
      });

      const projectFolders = projectFolderResponse.data.files || [];
      if (projectFolders.length > 0) {
        const projectFolderId = projectFolders[0].id || '';
        await drive.files.delete({ fileId: projectFolderId });
        log.info(`[GoogleDrive] Project ${projectId} deleted from Drive`);
      }
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error deleting project');
      throw error;
    }
  }

  /**
   * Отключить синхронизацию (revoke токены)
   */
  async revokeAccess(userId: string): Promise<void> {
    try {
      const tokenRecord = db.prepare(`
        SELECT access_token FROM google_drive_tokens WHERE user_id = ?
      `).get(userId) as any;

      if (!tokenRecord) {
        return;
      }

      // Отзываем токен у Google
      await axios.get(`https://oauth2.googleapis.com/revoke`, {
        params: {
          token: tokenRecord.access_token,
        },
      }).catch(err => {
        // Игнорируем ошибки отзыва (токен может уже быть невалидным)
        log.warn('[GoogleDrive] Token revoke warning %s', err.message);
      });

      // Удаляем токены из БД
      const stmt = db.prepare(`DELETE FROM google_drive_tokens WHERE user_id = ?`);
      stmt.run(userId);

      log.info(`[GoogleDrive] Access revoked for user ${userId}`);
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error revoking access');
      throw error;
    }
  }

  /**
   * Проверить статус подключения
   */
  isConnected(userId: string): boolean {
    const tokenRecord = db.prepare(`
      SELECT id FROM google_drive_tokens WHERE user_id = ? LIMIT 1
    `).get(userId) as any;

    return !!tokenRecord;
  }

  /**
   * Получить информацию о подключении
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

// Инициализация сервиса
export const googleDriveService = new GoogleDriveService({
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
});
