export interface MidjourneyIntegrationConfig {
  relayUrl: string;
  token: string;
  integrationId: string;
  userId?: string;
  name?: string;
  mode: 'photo' | 'video';
}

export interface MidjourneyReferenceImage {
  url: string;
  purpose?: string;
  strength?: number;
  source_node_id?: string;
}

export interface MidjourneyArtifact {
  url: string;
  filename?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  job_id?: string;
  source?: string;
  created_at?: string;
  size?: number;
  asset_id?: string;
  storage_path?: string;
  local_url?: string;
}

export interface MidjourneyJobStatus {
  status: string;
  jobId: string;
  progress?: number;
  artifacts: MidjourneyArtifact[];
  raw: unknown;
  error?: string;
}
