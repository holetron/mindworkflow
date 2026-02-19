import { apiFetch, throwApiError } from './apiClient';
import type {
  GlobalIntegration,
  IntegrationModelSyncPayload,
  IntegrationModelSyncResponse,
} from './types';

export async function fetchGlobalIntegrations(): Promise<GlobalIntegration[]> {
  const response = await apiFetch('/api/integrations');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchGlobalIntegration(id: string): Promise<GlobalIntegration> {
  const response = await apiFetch(`/api/integrations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function createGlobalIntegration(
  payload: Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<GlobalIntegration> {
  const response = await apiFetch('/api/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateGlobalIntegration(
  id: string,
  payload: Partial<Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<GlobalIntegration> {
  const response = await apiFetch(`/api/integrations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteGlobalIntegration(id: string): Promise<void> {
  const response = await apiFetch(`/api/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function syncIntegrationModels(
  id: string,
  payload: IntegrationModelSyncPayload = {},
  provider: string,
): Promise<IntegrationModelSyncResponse> {
  const response = await apiFetch(`/api/integrations/${encodeURIComponent(id)}/models/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, ...payload }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}
