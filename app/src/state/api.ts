import type { InputPortKind } from '../data/inputPortTypes';
import type { TextOperation } from '../utils/textOperations';

const API_BASE = '';

type HeadersRecord = Record<string, string>;

function normalizeHeaders(headersInit?: HeadersInit): HeadersRecord {
  if (!headersInit) {
    return {};
  }
  if (typeof Headers !== 'undefined' && headersInit instanceof Headers) {
    const result: HeadersRecord = {};
    headersInit.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headersInit)) {
    return headersInit.reduce<HeadersRecord>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return { ...(headersInit as HeadersRecord) };
}

async function throwApiError(response: Response): Promise<never> {
  let message = '';
  try {
    message = await response.text();
  } catch {
    message = '';
  }
  throw new Error(message || response.statusText);
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = normalizeHeaders(options.headers);
  try {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // localStorage might not be available (e.g. SSR); ignore gracefully.
  }
  if (!headers.Accept) {
    headers.Accept = 'application/json';
  }
  return fetch(`${API_BASE}${url}`, { ...options, headers });
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
  routing?: string | null;
}

export interface NodeOutgoingConnection {
  edge_id: string;
  to: string;
  routing?: string | null;
}

export interface NodeConnections {
  incoming: NodeIncomingConnection[];
  outgoing: NodeOutgoingConnection[];
}

export interface NodeUI {
  color: string;
  bbox: NodeBoundingBox;
}

export interface TextSplitPreviewSegment {
  path: string;
  depth: number;
  order: number;
  title: string;
  content: string;
  children: TextSplitPreviewSegment[];
}

export interface TextSplitPreview {
  sourceNodeId: string;
  config: {
    separator: string;
    subSeparator: string;
    namingMode: 'auto' | 'manual';
  };
  segments: TextSplitPreviewSegment[];
}

export interface TextSplitResult {
  createdNodes: Array<{ node_id: string; type: string; title: string }>;
  nodeSnapshots: Array<{
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
  projectUpdatedAt: string;
}

export interface TextSplitRequestPayload {
  content?: string;
  config?: {
    separator?: string;
    subSeparator?: string;
    namingMode?: 'auto' | 'manual';
  };
  manualTitles?: Array<{ path: string; title: string }>;
}

export interface InputPortSpec {
  id: string;
  title: string;
  kind: InputPortKind;
  required?: boolean;
  max_items?: number;
  description?: string;
}

export interface AutoPort {
  id: string;           // "prompt", "control_image", etc.
  label: string;        // "Prompt", "Control Image"
  type: string;         // "text", "image", "number"
  required: boolean;    // true/false
  position: 'left' | 'right';  // left для prompt, right для остальных
  description?: string; // из API
  default?: any;        // значение по умолчанию
  options?: Array<{ value: string; label: string }>; // для select/dropdown
  min?: number;         // для number (slider)
  max?: number;         // для number (slider)
}

export interface AdditionalFieldMapping {
  source: 'manual' | 'port';  // 'manual' - ручной ввод, 'port' - из порта
  value?: string | number | boolean;  // значение для manual
  target?: string;  // в какое API поле идёт (для кастомных полей)
}

export interface FieldMapping {
  // Системный промпт
  system_prompt_target?: string;      // В какое API поле идёт (по умолчанию 'system_prompt' или 'prompt')
  system_prompt_source?: 'manual' | 'port';  // 'manual' - ручной ввод, 'port' - создать порт
  
  // Пример выходных данных
  output_example_target?: string;     // В какое API поле идёт (обычно добавляется к 'prompt')
  output_example_source?: 'manual' | 'port';
  
  // Температура
  temperature_target?: string;        // В какое API поле идёт (по умолчанию 'temperature')
  temperature_source?: 'manual' | 'port';
  
  // Дополнительные поля из схемы модели (image, max_tokens и т.д.)
  additional_fields?: Record<string, AdditionalFieldMapping>;
}

export interface FlowNodeAI {
  provider?: string;
  model?: string;
  temperature?: number;
  system_prompt?: string;
  user_prompt_template?: string;
  output_example?: string;
  context_mode?: 'simple' | 'full_json' | 'clean' | 'simple_json';
  auto_ports?: AutoPort[];  // автоматически сгенерированные порты
  field_mapping?: FieldMapping;  // маппинг полей на входящие ноды
  system_prompt_source?: string;  // DEPRECATED: use field_mapping
  output_example_source?: string; // DEPRECATED: use field_mapping
  temperature_source?: string;    // DEPRECATED: use field_mapping
  [key: string]: unknown;
}

export interface FlowNode {
  node_id: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string | null;
  meta?: ({ input_ports?: InputPortSpec[] } & Record<string, unknown>);
  ai?: FlowNodeAI;
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
  label?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface HtmlMetadataResponse {
  finalUrl: string;
  title?: string;
}

export interface HtmlScreenshotRequest {
  url: string;
  viewportWidth?: number;
  viewportHeight?: number;
  clipHeight?: number;
}

export type HtmlScreenshotResponse = HtmlMetadataResponse & {
  screenshot?: string;
};

export type PromptPresetCategory = 'system_prompt' | 'output_example';

export interface PromptPreset {
  preset_id: string;
  category: PromptPresetCategory;
  label: string;
  description: string | null;
  content: string;
  tags: string[];
  is_quick_access: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PromptPresetPayload {
  category: PromptPresetCategory;
  label: string;
  content: string;
  description?: string | null;
  tags?: string[];
  is_quick_access?: boolean;
  sort_order?: number;
}

export type PromptPresetUpdatePayload = Partial<Omit<PromptPresetPayload, 'category'>> & {
  category?: PromptPresetCategory;
};

export interface PromptPresetImportPayload {
  prompts: PromptPreset[];
  mode?: 'append' | 'replace';
}

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface ProjectCollaborator {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  email?: string;
  name?: string;
  added_at: string;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  is_public?: boolean;
  mode?: 'editing' | 'viewing';
  role?: ProjectRole;
  editor_count?: number;
  viewer_count?: number;
}

export interface ProjectMetaUpdateResponse {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
}

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
  user_id?: string | null;
  is_public?: boolean;
  mode?: 'editing' | 'viewing';
  role?: ProjectRole;
  collaborators?: ProjectCollaborator[];
}

export interface EdgeNotification {
  code: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
}

export interface EdgeListResponse {
  edges: FlowEdge[];
  updated_at: string;
  notification?: EdgeNotification;
}

export interface NodeUpdatePayload {
  title?: string | null;
  content?: string | null;
  content_type?: string | null;
  content_ops?: TextOperation[] | null;
  meta?: Record<string, unknown> | null;
  ai?: Record<string, unknown> | null;
  parser?: Record<string, unknown> | null;
  python?: Record<string, unknown> | null;
  ui?: Partial<NodeUI> | null;
  ai_visible?: boolean | null;
  connections?: Partial<NodeConnections> | null;
  visibility_rules?: Record<string, unknown> | null;
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
  value?: string;
}

export interface IntegrationModelSyncPayload {
  apiKey?: string;
  baseUrl?: string;
  limit?: number;
  organization?: string;
  projectId?: string;
  location?: string;
  selector?: string;
  prompt?: string;
}

export interface IntegrationModelSyncResponse {
  models: string[];
  count: number;
  updatedAt: string;
  baseUrl?: string;
  integration?: GlobalIntegration;
}

export interface UiFontScaleStep {
  maxLength: number;
  multiplier: number;
}

export interface UiTextNodeFontScaling {
  baseFontSize: number;
  steps: UiFontScaleStep[];
  targetNodeTypes: string[];
  scaleMultiplier: number;
}

export interface UiMarkdownPreviewSettings {
  lineHeight: number;
  paragraphSpacing: number;
  breakSpacing: number;
  codeBlockPaddingY: number;
  codeBlockPaddingX: number;
  backgroundColor: string;
  borderColor: string;
}

export interface UiSettings {
  textNodeFontScaling: UiTextNodeFontScaling;
  markdownPreview: UiMarkdownPreviewSettings;
}

export interface GlobalIntegration {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  apiKey?: string | null;
  apiKeyStored?: boolean;
  apiKeyPreview?: string | null;
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
  models?: string[];
  modelsUpdatedAt?: string | null;
  enabled: boolean;
  isDefault?: boolean; // 🎁 BONUS: Mark this integration as default for new AI nodes
  createdAt: string;
  updatedAt: string;
  extra?: Record<string, unknown> | null;
}

export interface AdminIntegrationUserSummary {
  id: string;
  email: string | null;
  name: string | null;
  is_admin: boolean;
}

export interface AdminIntegration extends GlobalIntegration {
  user: AdminIntegrationUserSummary;
}

export interface AdminIntegrationPayload {
  id?: string;
  userId: string;
  providerId: string;
  name: string;
  description?: string;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  webhookContract?: string;
  systemPrompt?: string;
  inputFields?: IntegrationFieldConfig[];
  exampleRequest?: GlobalIntegration['exampleRequest'];
  exampleResponseMapping?: GlobalIntegration['exampleResponseMapping'];
  models?: string[];
  modelsUpdatedAt?: string | null;
  enabled?: boolean;
}

export type AdminIntegrationUpdatePayload = Partial<Omit<AdminIntegrationPayload, 'userId' | 'providerId'>> & {
  userId?: string;
  providerId?: string;
};

export interface ValidateResponse {
  valid: boolean;
  errors: unknown[];
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

export interface RunResponse {
  status: string;
  nodeId: string;
  content?: string | null;
  contentType?: string | null;
  logs: string[];
  runId: string;
  cloned?: boolean;
  targetNodeId?: string;
  createdNodes?: Array<{ node_id: string; type: string; title: string }>;
  createdNodeSnapshots?: Array<{
    node_id: string;
    type: string;
    title: string;
    content_type?: string | null;
    ui_position?: { x: number; y: number } | null;
    meta?: Record<string, unknown>;
  }>;
  isMultiNodeResult?: boolean;
  predictionUrl?: string | null;
  predictionId?: string | null;
  provider?: string | null;
  predictionPayload?: unknown;
}

export interface MidjourneyStatusResponse {
  status: string;
  job_id: string;
  progress?: number | null;
  artifacts: Array<Record<string, unknown>>;
  folder_id?: string;
  error?: string | null;
}

export type ShareRole = Exclude<ProjectRole, 'owner'>;

export interface SharePayload {
  user_id?: string;
  email?: string;
  role: ShareRole;
}

export interface ShareResponse {
  project_id: string;
  owner_id: string;
  collaborators: ProjectCollaborator[];
}

export interface AdminUserProjectSummary {
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserSummary {
  user_id: string;
  email: string;
  name: string;
  created_at: string;
  is_admin: boolean;
  projects: AdminUserProjectSummary[];
}

export interface AdminUserPatch {
  email?: string;
  name?: string;
  is_admin?: boolean;
  password?: string;
}

export interface AdminUserUpdateResponse {
  user_id: string;
  email: string;
  name: string;
  is_admin: boolean;
}

export interface AdminEmailConfig {
  gmailUser: string;
  frontendUrl: string;
  gmailConfigured: boolean;
  googleClientId: string | null;
  googleClientConfigured: boolean;
}

export interface AdminEmailConfigPayload {
  gmailUser?: string;
  gmailAppPassword?: string;
  frontendUrl?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export interface AdminProjectSummary {
  project_id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  owner_email: string | null;
  updated_at: string;
  editors: AdminProjectCollaborator[];
  viewers: AdminProjectCollaborator[];
  collaborator_count: number;
}

export interface AdminProjectCollaborator {
  user_id: string;
  email?: string | null;
  name?: string | null;
  role: ProjectRole;
  added_at?: string | null;
}

export type AdminFeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

export interface AdminFeedbackSummary {
  feedback_id: string;
  type: 'problem' | 'suggestion' | 'unknown';
  title: string;
  status: AdminFeedbackStatus;
  contact: string | null;
  created_at: string;
  updated_at: string;
  excerpt: string;
  has_resolution: boolean;
}

export interface AdminFeedbackDetails extends AdminFeedbackSummary {
  description: string;
  resolution: string | null;
  source?: string | null;
}

export interface AdminFeedbackUpdatePayload {
  title?: string;
  description?: string;
  status?: AdminFeedbackStatus;
  contact?: string | null;
  resolution?: string | null;
}

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
      ...overrideInputs, // 🔑 НОВОЕ: Передаём overrideInputs если есть
    }),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export interface MoveNodeFolderResponse {
  status: string;
  project_id: string;
  folder_id: string;
  node_id: string;
  folder_children: string[];
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

export async function validateSchema(schemaRef: string, data: unknown): Promise<ValidateResponse> {
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

export async function fetchNodeLogs(projectId: string, nodeId: string): Promise<RunLog[]> {
  const response = await apiFetch(
    `/api/node/${encodeURIComponent(nodeId)}/logs?project_id=${encodeURIComponent(projectId)}`,
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
    
    // Если ошибка - Google Drive не подключен
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

export interface CreateProjectPayload {
  project_id?: string;
  title: string;
  description?: string;
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

export async function fetchHtmlMetadata(url: string): Promise<HtmlMetadataResponse> {
  const response = await apiFetch(`/api/html/metadata?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

export async function captureHtmlScreenshot(
  payload: HtmlScreenshotRequest,
): Promise<HtmlScreenshotResponse> {
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

export interface ModelSchemaInput {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: any;
  options?: Array<{ value: string; label: string }>; // ✅ Для select
  min?: number;  // ✅ Для slider
  max?: number;  // ✅ Для slider
}

export interface ModelSchemaResponse {
  inputs: ModelSchemaInput[];
  context_limit?: number;
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

function isAdminAccessError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (!rawMessage) {
    return false;
  }
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error.toLowerCase().includes('admin access required');
    }
  } catch {
    // Not a JSON payload, fall back to plain string check
  }
  return rawMessage.toLowerCase().includes('admin access required');
}

export async function fetchQuickPromptPresets(category: PromptPresetCategory, limit = 8): Promise<PromptPreset[]> {
  try {
    // Используем обычный API вместо admin для доступа без прав админа
    const prompts = await searchPromptPresets({ category });
    const filtered = prompts
      .filter((preset) => preset.is_quick_access)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label));
    return filtered.slice(0, Math.max(1, limit));
  } catch (error) {
    if (isAdminAccessError(error)) {
      return [];
    }
    throw error;
  }
}

export async function searchPromptPresets(options: { category?: PromptPresetCategory; search?: string; limit?: number } = {}): Promise<PromptPreset[]> {
  try {
    // Use public /api/prompts endpoint instead of admin-only
    const params = new URLSearchParams();
    if (options.category) {
      params.set('category', options.category);
    }
    if (options.search && options.search.trim().length > 0) {
      params.set('search', options.search.trim());
    }
    if (options.limit && Number.isFinite(options.limit)) {
      params.set('limit', Math.max(1, Math.trunc(options.limit)).toString());
    }
    const query = params.toString();
    const response = await apiFetch(`/api/prompts${query ? `?${query}` : ''}`);
    if (!response.ok) {
      // If access denied, return empty array
      if (response.status === 403) {
        return [];
      }
      await throwApiError(response);
    }
    return response.json() as Promise<PromptPreset[]>;
  } catch (error) {
    if (isAdminAccessError(error)) {
      return [];
    }
    throw error;
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

export async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
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

export interface SubmitFeedbackPayload {
  type: 'problem' | 'suggestion';
  title: string;
  description: string;
  contact?: string | null;
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<{ feedback_id: string }> {
  const response = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}

// Midjourney Accounts
export interface UserMidjourneyAccount {
  id: number;
  user_id: string;
  name: string;
  guild_id: string;
  channel_id: string;
  user_token: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserMidjourneyAccountPayload {
  name: string;
  guildId: string;
  channelId: string;
  userToken: string;
  userAgent?: string;
}

export interface UpdateUserMidjourneyAccountPayload {
  name: string;
  guildId: string;
  channelId: string;
  userToken: string;
  userAgent?: string;
}

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

// ============================================================================
// Agent Presets
// ============================================================================

export interface AgentPreset {
  preset_id: string;
  user_id: string | null;
  title: string;
  description: string;
  icon: string;
  node_template: FlowNode;
  tags: string[];
  is_favorite: boolean;
  folder?: string | null; // NEW: folder for organizing agents
  created_at: string;
  updated_at: string;
}

export interface AgentPresetPayload {
  title: string;
  description: string;
  icon: string;
  node_template: FlowNode;
  tags: string[];
  folder?: string | null; // NEW: folder for organizing agents
}

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
