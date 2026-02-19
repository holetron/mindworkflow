export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleDriveToken {
  id?: number;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  drive_folder_id?: string;
  last_sync_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}
