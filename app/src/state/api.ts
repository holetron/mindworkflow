import type { InputPortKind } from '../data/inputPortTypes';

export interface ProjectFlow {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  nodes: FlowNode[];
  edges: FlowEdge[];
  schemas: Record<string, unknown>;
}

export interface NodeBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface NodeIncomingConnection {
  edge_id: string;
  from: string;
  routing: string;
}

export interface NodeOutgoingConnection {
  edge_id: string;
  to: string;
  routing: string;
}

export interface NodeConnections {
  incoming: NodeIncomingConnection[];
  outgoing: NodeOutgoingConnection[];
}

export interface NodeUI {
  color: string;
  bbox: NodeBoundingBox;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectPayload {
  project_id?: string;
  title: string;
  description?: string;
}

export interface InputPortSpec {
  id: string;
  title: string;
  kind: InputPortKind;
  required?: boolean;
  max_items?: number;
  description?: string;
}

export interface FlowNode {
  node_id: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string;
  meta?: ({ input_ports?: InputPortSpec[] } & Record<string, unknown>);
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  ui: NodeUI;
  ai_visible: boolean;
  connections: NodeConnections;
  [key: string]: unknown;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface EdgeListResponse {
  edges: FlowEdge[];
  updated_at: string;
}

export interface NodeUpdatePayload {
  title?: string;
  content?: string | null;
  content_type?: string | null;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  ui?: Partial<NodeUI> | null;
  ai_visible?: boolean | null;
  connections?: Partial<NodeConnections> | null;
}

export interface CreateNodePayload {
  node_id?: string;
  slug?: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  position?: { x: number; y: number };
  ui?: Partial<NodeUI>;
  ai_visible?: boolean;
  connections?: Partial<NodeConnections>;
}

export interface CreateNodeResponse {
  node: FlowNode;
  project_updated_at: string;
}

export interface IntegrationFieldConfig {
  id: string;
  label: string;
  key: string;
  type?: 'text' | 'textarea';
  placeholder?: string;
  description?: string;
  required?: boolean;
  default_value?: string;
}

export interface RunResponse {
  status: string;
  nodeId: string;
  content?: string | null;
  contentType?: string | null;
  logs: string[];
  runId: string;
  cloned?: boolean;
  targetNodeId?: string;
}

export async function fetchProject(projectId: string): Promise<ProjectFlow> {
  const response = await fetch(`/api/project/${projectId}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchProjectList(): Promise<ProjectSummary[]> {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function runNode(projectId: string, nodeId: string): Promise<RunResponse> {
  const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function rerunNode(
  projectId: string,
  nodeId: string,
  options: { clone?: boolean; include_subnodes?: boolean },
): Promise<RunResponse> {
  const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...options }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export interface ValidateResponse {
  valid: boolean;
  errors: unknown[];
}

export async function validateSchema(schemaRef: string, data: unknown): Promise<ValidateResponse> {
  const response = await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema_ref: schemaRef, data }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export interface RunLog {
  run_id: string;
  project_id: string;
  node_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  input_hash: string;
  output_hash: string;
  logs: unknown;
}

export async function fetchNodeLogs(projectId: string, nodeId: string): Promise<RunLog[]> {
  const response = await fetch(
    `/api/node/${encodeURIComponent(nodeId)}/logs?project_id=${encodeURIComponent(projectId)}`,
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function renameProject(
  projectId: string,
  payload: { title?: string; description?: string },
): Promise<ProjectSummary> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function cloneProject(
  projectId: string,
  payload?: { title?: string },
): Promise<ProjectSummary> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function syncProjectDrive(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sync-drive`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function createProject(payload: CreateProjectPayload): Promise<ProjectSummary> {
  const response = await fetch('/api/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function updateNode(
  projectId: string,
  nodeId: string,
  payload: NodeUpdatePayload,
): Promise<FlowNode> {
  const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...payload }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function createNode(
  projectId: string,
  payload: CreateNodePayload,
): Promise<CreateNodeResponse> {
  const response = await fetch('/api/node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ...payload }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function createEdge(
  projectId: string,
  payload: { from: string; to: string; label?: string },
): Promise<EdgeListResponse> {
  const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteEdge(
  projectId: string,
  from: string,
  to: string,
): Promise<EdgeListResponse> {
  const response = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/edges/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
    {
      method: 'DELETE',
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteNode(
  projectId: string,
  nodeId: string,
): Promise<ProjectFlow> {
  const response = await fetch(`/api/node/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export interface IntegrationFieldConfig {
  id: string;
  label: string;
  key: string;
  type?: 'text' | 'textarea';
  placeholder?: string;
  description?: string;
  required?: boolean;
  default_value?: string;
}

export interface GlobalIntegration {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  webhookContract?: string;
  systemPrompt?: string;
  inputFields?: IntegrationFieldConfig[];
  exampleRequest?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
  exampleResponseMapping?: {
    incoming?: Record<string, string>;
    outgoing?: Record<string, string>;
  };
  createdAt: string;
  updatedAt: string;
}

export async function fetchGlobalIntegrations(): Promise<GlobalIntegration[]> {
  const response = await fetch('/api/integrations');
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function fetchGlobalIntegration(id: string): Promise<GlobalIntegration> {
  const response = await fetch(`/api/integrations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function createGlobalIntegration(payload: Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>): Promise<GlobalIntegration> {
  const response = await fetch('/api/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function updateGlobalIntegration(id: string, payload: Partial<Omit<GlobalIntegration, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GlobalIntegration> {
  const response = await fetch(`/api/integrations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteGlobalIntegration(id: string): Promise<void> {
  const response = await fetch(`/api/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export interface RunResponse {
  status: string;
  nodeId: string;
  content?: string | null;
  contentType?: string | null;
  logs: string[];
  runId: string;
  cloned?: boolean;
  targetNodeId?: string;
}

export async function updateProjectSettingsRemote(
  projectId: string,
  payload: { settings?: Record<string, unknown> },
): Promise<{ settings: Record<string, unknown>; updated_at: string }> {
  const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function updateProjectMeta(
  projectId: string,
  payload: { title?: string; description?: string },
): Promise<ProjectFlow> {
  const response = await fetch(`/api/project/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function importProjectArchive(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);

  const response = await fetch('/api/project/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archive: base64 }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  if (!data?.project_id) {
    throw new Error('Import response missing project id');
  }
  return data.project_id as string;
}
