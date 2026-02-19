// Barrel export — re-exports + facade for backward compatibility
// Consumers use `require('../services/googleDrive').googleDriveService`

import { GoogleDriveConfig, GoogleDriveToken, GoogleDriveFile } from '../../types/googleDrive';
import { GoogleDriveAuth } from './auth';
import { GoogleDriveOperations } from './operations';

export { GoogleDriveAuth } from './auth';
export { GoogleDriveOperations } from './operations';

/**
 * Facade class that delegates to GoogleDriveAuth and GoogleDriveOperations,
 * preserving the original GoogleDriveService public API so that existing
 * callers continue to work without changes.
 */
export class GoogleDriveService {
  private auth: GoogleDriveAuth;
  private ops: GoogleDriveOperations;

  constructor(config: GoogleDriveConfig) {
    this.auth = new GoogleDriveAuth(config);
    this.ops = new GoogleDriveOperations(this.auth);
  }

  // --- Auth methods --------------------------------------------------------
  getAuthorizationUrl(state: string): string {
    return this.auth.getAuthorizationUrl(state);
  }

  async exchangeCodeForTokens(code: string, userId: string): Promise<GoogleDriveToken> {
    return this.auth.exchangeCodeForTokens(code, userId);
  }

  async getValidAccessToken(userId: string): Promise<string> {
    return this.auth.getValidAccessToken(userId);
  }

  async revokeAccess(userId: string): Promise<void> {
    return this.auth.revokeAccess(userId);
  }

  isConnected(userId: string): boolean {
    return this.auth.isConnected(userId);
  }

  getConnectionInfo(userId: string): GoogleDriveToken | null {
    return this.auth.getConnectionInfo(userId);
  }

  // --- Operations methods --------------------------------------------------
  async ensureProjectFolder(userId: string, projectId: string, projectName: string): Promise<string> {
    return this.ops.ensureProjectFolder(userId, projectId, projectName);
  }

  async uploadProjectFile(
    userId: string,
    projectId: string,
    projectName: string,
    filename: string,
    data: Buffer,
  ): Promise<string> {
    return this.ops.uploadProjectFile(userId, projectId, projectName, filename, data);
  }

  async downloadProjectFile(userId: string, projectId: string, filename: string): Promise<Buffer> {
    return this.ops.downloadProjectFile(userId, projectId, filename);
  }

  async listProjectFiles(userId: string, projectId: string): Promise<GoogleDriveFile[]> {
    return this.ops.listProjectFiles(userId, projectId);
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    return this.ops.deleteProject(userId, projectId);
  }
}

// Service initialization
export const googleDriveService = new GoogleDriveService({
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
});
