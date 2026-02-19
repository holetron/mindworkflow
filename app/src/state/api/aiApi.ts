import { apiFetch, throwApiError } from './apiClient';
import type {
  MidjourneyStatusResponse,
  ModelSchemaResponse,
  UiSettings,
  UserMidjourneyAccount,
  CreateUserMidjourneyAccountPayload,
  UpdateUserMidjourneyAccountPayload,
  AgentPreset,
  AgentPresetPayload,
} from './types';

export async function fetchMidjourneyStatus(
  projectId: string,
  nodeId: string,
  jobId: string,
): Promise<MidjourneyStatusResponse> {
  const response = await apiFetch('/api/node/ai/midjourney/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, node_id: nodeId, job_id: jobId }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchModelSchema(provider: string, modelId: string): Promise<ModelSchemaResponse> {
  const response = await apiFetch(
    `/api/integrations/models/${encodeURIComponent(provider)}/info?modelId=${encodeURIComponent(modelId)}`
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchWorkflowUiSettings(projectId: string): Promise<UiSettings> {
  const response = await apiFetch(
    `/api/settings/ui?scope=workflow&project_id=${encodeURIComponent(projectId)}`,
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateWorkflowUiSettings(
  projectId: string,
  payload: UiSettings,
): Promise<UiSettings> {
  const response = await apiFetch(
    `/api/settings/ui?scope=workflow&project_id=${encodeURIComponent(projectId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchGlobalUiSettings(): Promise<UiSettings> {
  const response = await apiFetch(
    `/api/settings/ui?scope=global`,
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateGlobalUiSettings(
  payload: UiSettings,
): Promise<UiSettings> {
  const response = await apiFetch(
    `/api/settings/ui?scope=global`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

// Midjourney Accounts
export async function fetchUserMidjourneyAccounts(): Promise<UserMidjourneyAccount[]> {
  const response = await apiFetch('/api/midjourney/accounts');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function createUserMidjourneyAccount(payload: CreateUserMidjourneyAccountPayload): Promise<UserMidjourneyAccount> {
  const response = await apiFetch('/api/midjourney/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateUserMidjourneyAccount(id: number, payload: UpdateUserMidjourneyAccountPayload): Promise<UserMidjourneyAccount> {
  const response = await apiFetch(`/api/midjourney/accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteUserMidjourneyAccount(id: number): Promise<void> {
  const response = await apiFetch(`/api/midjourney/accounts/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

// Agent Presets
export async function fetchAgentPresets(): Promise<AgentPreset[]> {
  const response = await apiFetch('/api/agent-presets');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchAgentPreset(id: string): Promise<AgentPreset> {
  const response = await apiFetch(`/api/agent-presets/${id}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function createAgentPreset(payload: AgentPresetPayload): Promise<AgentPreset> {
  const response = await apiFetch('/api/agent-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateAgentPreset(id: string, payload: Partial<AgentPresetPayload>): Promise<AgentPreset> {
  console.log('[api.updateAgentPreset] Sending to server:', {
    id,
    input_fields: payload.node_template?.ai?.input_fields,
    field_mapping: payload.node_template?.ai?.field_mapping,
  });

  const response = await apiFetch(`/api/agent-presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteAgentPreset(id: string): Promise<void> {
  const response = await apiFetch(`/api/agent-presets/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
}

export async function toggleAgentFavorite(id: string): Promise<AgentPreset> {
  const response = await apiFetch(`/api/agent-presets/${id}/favorite`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}
