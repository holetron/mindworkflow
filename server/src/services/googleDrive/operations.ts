import { google, drive_v3 } from 'googleapis';
import { db } from '../../db';
import { GoogleDriveFile } from '../../types/googleDrive';
import { logger } from '../../lib/logger';
import { GoogleDriveAuth } from './auth';

const log = logger.child({ module: 'googleDrive' });

/**
 * Handles Google Drive file and folder operations.
 */
export class GoogleDriveOperations {
  private driveService: drive_v3.Drive | null = null;

  constructor(private readonly auth: GoogleDriveAuth) {}

  /**
   * Initialize Drive service with a valid token
   */
  private async initializeDriveService(userId: string): Promise<drive_v3.Drive> {
    const oauth2Client = this.auth.getOAuth2Client();
    if (!oauth2Client) {
      throw new Error('Google OAuth2 not configured');
    }

    const accessToken = await this.auth.getValidAccessToken(userId);
    oauth2Client.setCredentials({ access_token: accessToken });

    if (!this.driveService) {
      this.driveService = google.drive({ version: 'v3', auth: oauth2Client });
    }

    return this.driveService;
  }

  /**
   * Create or get project folder on Drive
   */
  async ensureProjectFolder(userId: string, projectId: string, projectName: string): Promise<string> {
    const drive = await this.initializeDriveService(userId);

    try {
      let rootFolderId = await this.getOrCreateRootFolder(userId);

      if (!rootFolderId) {
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

        const stmt = db.prepare(`
          UPDATE google_drive_tokens
          SET drive_folder_id = ?
          WHERE user_id = ?
        `);
        stmt.run(rootFolderId, userId);
      }

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
   * Get root folder ID
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
   * Upload file to Google Drive
   */
  async uploadProjectFile(
    userId: string,
    projectId: string,
    projectName: string,
    filename: string,
    data: Buffer,
  ): Promise<string> {
    const drive = await this.initializeDriveService(userId);

    try {
      const projectFolderId = await this.ensureProjectFolder(userId, projectId, projectName);

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
        await drive.files.update({
          fileId,
          media: {
            body: data,
            mimeType: 'application/json',
          },
        });

        log.info(`[GoogleDrive] File updated: ${filename} in project ${projectId}`);
      } else {
        await drive.files.create({
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
   * Download file from Google Drive
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

      const getResponse = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );

      return Buffer.from(getResponse.data as ArrayBuffer);
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error downloading file');
      throw error;
    }
  }

  /**
   * List project files on Drive
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
   * Delete project from Drive
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
}
