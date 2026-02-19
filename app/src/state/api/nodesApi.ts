import { apiFetch, throwApiError } from './apiClient';
import type {
  CreateNodePayload,
  CreateNodeResponse,
  FlowNode,
  MoveNodeFolderResponse,
  NodeUpdatePayload,
  ProjectFlow,
  RunLog,
  RunResponse,
  TextSplitPreview,
  TextSplitRequestPayload,
  TextSplitResult,
} from './types';

type BackendTextSplitResponse = {
  created_nodes: Array<{ node_id: string; type: string; title: string }>;
  node_snapshots: Array<{
    node_id: string;
    type: string;
    title: string;
    content_type?: string | null;
    ui_position?: { x: number; y: number } | null;
    meta?: Record<string, unknown>;
  }>;
  edges: Array<{ from: string; to: string }>;
  logs: string[];
  preview: TextSplitPreview;
  project_updated_at: string;
};

function mapSplitResponse(payload: BackendTextSplitResponse): TextSplitResult {
  return {
    createdNodes: payload.created_nodes,
    nodeSnapshots: payload.node_snapshots,
    edges: payload.edges,
    logs: payload.logs,
    preview: payload.preview,
    projectUpdatedAt: payload.project_updated_at,
  };
}

export async function runNode(
  projectId: string,
  nodeId: string,
  overrideInputs?: Record<string, unknown>,
): Promise<RunResponse> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      ...overrideInputs,
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function moveNodeToFolder(
  projectId: string,
  nodeId: string,
  folderId: string,
  options?: { index?: number | null },
): Promise<MoveNodeFolderResponse> {
  const response = await apiFetch('/api/node/folder/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      node_id: nodeId,
      folder_id: folderId,
      index: options?.index ?? null,
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function removeNodeFromFolder(
  projectId: string,
  nodeId: string,
  folderId?: string,
  position?: { x: number; y: number },
): Promise<MoveNodeFolderResponse> {
  const response = await apiFetch('/api/node/folder/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      node_id: nodeId,
      folder_id: folderId ?? null,
      position,
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function rerunNode(
  projectId: string,
  nodeId: string,
  options: { clone?: boolean; include_subnodes?: boolean },
): Promise<RunResponse> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...options }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function previewSplitTextNode(
  projectId: string,
  nodeId: string,
  payload: TextSplitRequestPayload = {},
): Promise<TextSplitPreview> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}/split/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content: payload.content ?? null,
      config: payload.config ?? null,
      manual_titles: payload.manualTitles ?? null,
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  const result = (await response.json()) as { preview: TextSplitPreview };
  return result.preview;
}

export async function splitTextNode(
  projectId: string,
  nodeId: string,
  payload: TextSplitRequestPayload = {},
): Promise<TextSplitResult> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      content: payload.content ?? null,
      config: payload.config ?? null,
      manual_titles: payload.manualTitles ?? null,
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  const result = (await response.json()) as BackendTextSplitResponse;
  return mapSplitResponse(result);
}

export async function fetchNodeLogs(projectId: string, nodeId: string): Promise<RunLog[]> {
  const response = await apiFetch(
    `/api/node/${encodeURIComponent(nodeId)}/logs?project_id=${encodeURIComponent(projectId)}`,
  );
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function updateNode(
  projectId: string,
  nodeId: string,
  payload: NodeUpdatePayload,
): Promise<FlowNode> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...payload }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function createNode(
  projectId: string,
  payload: CreateNodePayload,
): Promise<CreateNodeResponse> {
  const response = await apiFetch('/api/node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...payload }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function deleteNode(
  projectId: string,
  nodeId: string,
): Promise<ProjectFlow> {
  const response = await apiFetch(`/api/node/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function fetchHtmlMetadata(url: string): Promise<{ finalUrl: string; title?: string }> {
  const response = await apiFetch(`/api/html/metadata?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function captureHtmlScreenshot(
  payload: { url: string; viewportWidth?: number; viewportHeight?: number; clipHeight?: number },
): Promise<{ finalUrl: string; title?: string; screenshot?: string }> {
  const response = await apiFetch('/api/html/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}
