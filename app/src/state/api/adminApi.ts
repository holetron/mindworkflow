import { apiFetch, throwApiError } from './apiClient';
import type {
  AdminEmailConfig,
  AdminEmailConfigPayload,
  AdminFeedbackDetails,
  AdminFeedbackSummary,
  AdminFeedbackUpdatePayload,
  AdminIntegration,
  AdminIntegrationPayload,
  AdminIntegrationUpdatePayload,
  AdminProjectSummary,
  AdminUserPatch,
  AdminUserSummary,
  AdminUserUpdateResponse,
  PromptPreset,
  PromptPresetCategory,
  PromptPresetImportPayload,
  PromptPresetPayload,
  PromptPresetUpdatePayload,
} from './types';

export async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateAdminUser(
  userId: string,
  patch: AdminUserPatch,
): Promise<AdminUserUpdateResponse> {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function fetchAdminProjects(): Promise<AdminProjectSummary[]> {
  const response = await apiFetch('/api/admin/projects');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function changeProjectOwner(projectId: string, newOwnerId: string): Promise<void> {
  const response = await apiFetch(`/api/admin/projects/${encodeURIComponent(projectId)}/owner`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ newOwnerId }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function fetchAdminEmailConfig(): Promise<AdminEmailConfig> {
  const response = await apiFetch('/api/admin/email-config');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateAdminEmailConfig(
  payload: AdminEmailConfigPayload,
): Promise<AdminEmailConfig> {
  const response = await apiFetch('/api/admin/email-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function testAdminEmailConfig(): Promise<void> {
  const response = await apiFetch('/api/admin/email-config/test', {
    method: 'POST',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function fetchAdminFeedback(): Promise<AdminFeedbackSummary[]> {
  const response = await apiFetch('/api/admin/feedback');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchAdminFeedbackDetails(feedbackId: string): Promise<AdminFeedbackDetails> {
  const response = await apiFetch(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateAdminFeedback(
  feedbackId: string,
  payload: AdminFeedbackUpdatePayload,
): Promise<AdminFeedbackDetails> {
  const response = await apiFetch(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteAdminFeedback(feedbackId: string): Promise<void> {
  const response = await apiFetch(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function fetchAdminPromptPresets(options: { category?: PromptPresetCategory; search?: string } = {}): Promise<PromptPreset[]> {
  const params = new URLSearchParams();
  if (options.category) {
    params.set('category', options.category);
  }
  if (options.search && options.search.trim().length > 0) {
    params.set('search', options.search.trim());
  }
  const query = params.toString();
  const response = await apiFetch(`/api/admin/prompts${query ? `?${query}` : ''}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json() as Promise<PromptPreset[]>;
}

export async function createAdminPromptPreset(payload: PromptPresetPayload): Promise<PromptPreset> {
  const response = await apiFetch('/api/admin/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json() as Promise<PromptPreset>;
}

export async function updateAdminPromptPreset(
  presetId: string,
  payload: PromptPresetUpdatePayload,
): Promise<PromptPreset> {
  const response = await apiFetch(`/api/admin/prompts/${encodeURIComponent(presetId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json() as Promise<PromptPreset>;
}

export async function deleteAdminPromptPreset(presetId: string): Promise<void> {
  const response = await apiFetch(`/api/admin/prompts/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    await throwApiError(response);
  }
}

export async function exportAdminPromptPresets(): Promise<{ exported_at: string; count: number; prompts: PromptPreset[] }> {
  const response = await apiFetch('/api/admin/prompts/export');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json() as Promise<{ exported_at: string; count: number; prompts: PromptPreset[] }>;
}

export async function importAdminPromptPresets(
  payload: PromptPresetImportPayload,
): Promise<{ imported: number; mode: 'append' | 'replace'; prompts: PromptPreset[] }> {
  const response = await apiFetch('/api/admin/prompts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json() as Promise<{ imported: number; mode: 'append' | 'replace'; prompts: PromptPreset[] }>;
}

export async function fetchAdminIntegrations(params: {
  userId?: string;
  providerId?: string;
} = {}): Promise<AdminIntegration[]> {
  const search = new URLSearchParams();
  if (params.userId) {
    search.set('userId', params.userId);
  }
  if (params.providerId) {
    search.set('providerId', params.providerId);
  }
  const path = search.toString()
    ? `/api/admin/integrations?${search.toString()}`
    : '/api/admin/integrations';
  const response = await apiFetch(path);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchAdminIntegration(id: string): Promise<AdminIntegration> {
  const response = await apiFetch(`/api/admin/integrations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function createAdminIntegration(
  payload: AdminIntegrationPayload,
): Promise<AdminIntegration> {
  const response = await apiFetch('/api/admin/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateAdminIntegration(
  id: string,
  payload: AdminIntegrationUpdatePayload,
): Promise<AdminIntegration> {
  const response = await apiFetch(`/api/admin/integrations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteAdminIntegration(id: string): Promise<void> {
  const response = await apiFetch(`/api/admin/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}
