import type { InputPortKind } from '../../data/inputPortTypes';
import type { TextOperation } from '../../utils/textOperations';

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
  id: string;
  label: string;
  type: string;
  required: boolean;
  position: 'left' | 'right';
  description?: string;
  default?: any;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface AdditionalFieldMapping {
  source: 'manual' | 'port';
  value?: string | number | boolean;
  target?: string;
}

export interface FieldMapping {
  system_prompt_target?: string;
  system_prompt_source?: 'manual' | 'port';
  output_example_target?: string;
  output_example_source?: 'manual' | 'port';
  temperature_target?: string;
  temperature_source?: 'manual' | 'port';
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
  auto_ports?: AutoPort[];
  field_mapping?: FieldMapping;
  system_prompt_source?: string;
  output_example_source?: string;
  temperature_source?: string;
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
  isDefault?: boolean;
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

export interface SubmitFeedbackPayload {
  type: 'problem' | 'suggestion';
  title: string;
  description: string;
  contact?: string | null;
}

export interface MoveNodeFolderResponse {
  status: string;
  project_id: string;
  folder_id: string;
  node_id: string;
  folder_children: string[];
}

export interface CreateProjectPayload {
  project_id?: string;
  title: string;
  description?: string;
}

export interface ModelSchemaInput {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: any;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface ModelSchemaResponse {
  inputs: ModelSchemaInput[];
  context_limit?: number;
}

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

export interface AgentPreset {
  preset_id: string;
  user_id: string | null;
  title: string;
  description: string;
  icon: string;
  node_template: FlowNode;
  tags: string[];
  is_favorite: boolean;
  folder?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentPresetPayload {
  title: string;
  description: string;
  icon: string;
  node_template: FlowNode;
  tags: string[];
  folder?: string | null;
}
