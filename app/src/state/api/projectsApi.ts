import { apiFetch, throwApiError } from './apiClient';
import type {
  CreateProjectPayload,
  EdgeListResponse,
  FlowEdge,
  ProjectFlow,
  ProjectMetaUpdateResponse,
  ProjectSummary,
  SharePayload,
  ShareResponse,
} from './types';

export async function fetchProject(projectId: string): Promise<ProjectFlow> {
  const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchProjectList(): Promise<ProjectSummary[]> {
  const response = await apiFetch('/api/projects');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchProjectShare(projectId: string): Promise<ShareResponse> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/share`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function upsertProjectShare(projectId: string, payload: SharePayload): Promise<ShareResponse> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function removeProjectShare(projectId: string, userId: string): Promise<void> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/share/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function renameProject(
  projectId: string,
  payload: { title?: string; description?: string },
): Promise<ProjectSummary> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function cloneProject(
  projectId: string,
  payload?: { title?: string; description?: string },
): Promise<ProjectSummary> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function syncProjectDrive(projectId: string): Promise<void> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/sync-drive`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // If error - Google Drive is not connected
    if (errorData.action === 'connect_google_drive') {
      throw new Error(errorData.error || 'Google Drive not connected');
    }

    await throwApiError(response);
  }

  const result = await response.json();
  if (result.status === 'partially_synced') {
    console.warn('[GoogleDrive] Partial sync:', result.message);
  }
}

export async function createProject(payload: CreateProjectPayload): Promise<ProjectSummary> {
  const response = await apiFetch('/api/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateProjectSettingsRemote(
  projectId: string,
  payload: { settings?: Record<string, unknown> },
): Promise<{ settings: Record<string, unknown>; updated_at: string }> {
  const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateProjectMeta(
  projectId: string,
  payload: { title?: string; description?: string; is_public?: boolean },
): Promise<ProjectMetaUpdateResponse> {
  const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function importProjectArchive(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  const base64 = btoa(binary);

  const response = await apiFetch('/api/project/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archive: base64 }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  const data = await response.json();
  if (!data?.project_id) {
    throw new Error('Import response missing project id');
  }
  return data.project_id as string;
}

export async function exportProjectArchive(projectId: string): Promise<Blob> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/export`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.blob();
}

export async function createEdge(
  projectId: string,
  payload: { from: string; to: string; label?: string; sourceHandle?: string | null; targetHandle?: string | null },
): Promise<EdgeListResponse> {
  const response = await apiFetch(`/api/project/${encodeURIComponent(projectId)}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteEdge(
  projectId: string,
  from: string,
  to: string,
): Promise<EdgeListResponse> {
  console.log('deleteEdge called for project:', projectId, 'from:', from, 'to:', to);
  const response = await apiFetch(
    `/api/project/${encodeURIComponent(projectId)}/edges/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    {
      method: 'DELETE',
    },
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  const result = await response.json();
  console.log('deleteEdge result:', result);
  return result;
}

export async function validateSchema(schemaRef: string, data: unknown): Promise<{ valid: boolean; errors: unknown[] }> {
  const response = await apiFetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema_ref: schemaRef, data }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}
