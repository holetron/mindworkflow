// types.ts — All type/interface exports that were originally in db.ts
import type { NodeUI, NodeConnections } from '../types';
import type { TextOperation } from '../utils/textOperations';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface ProjectCollaborator {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  email?: string;
  name?: string;
  added_at: string;
}

export interface ProjectFlow {
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  schemas: Record<string, unknown>;
  user_id?: string | null;
  is_public?: boolean;
  mode?: 'editing' | 'viewing';
  role?: ProjectRole;
  collaborators?: ProjectCollaborator[];
}

export interface EdgeActionNotification {
  code: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
}

export interface AddProjectEdgeResult {
  project: ProjectFlow;
  status: 'created' | 'duplicate';
  notification?: EdgeActionNotification;
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

export interface ProjectNode {
  node_id: string;
  type: string;
  title: string;
  content_type?: string;
  content?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  image_gen?: Record<string, unknown>;
  audio_gen?: Record<string, unknown>;
  video_gen?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  visibility_rules?: Record<string, unknown>;
  ui: NodeUI;
  ai_visible: boolean;
  connections: NodeConnections;
  [key: string]: unknown;
}

export interface ProjectEdge {
  from: string;
  to: string;
  label?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface RunRecord {
  run_id: string;
  project_id: string;
  node_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  input_hash: string;
  output_hash: string;
  logs_json: string;
}

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

export interface PromptPresetCreateInput {
  category: PromptPresetCategory;
  label: string;
  content: string;
  description?: string | null;
  tags?: string[];
  is_quick_access?: boolean;
  sort_order?: number;
}

export interface PromptPresetUpdateInput {
  category?: PromptPresetCategory;
  label?: string;
  content?: string;
  description?: string | null;
  tags?: string[];
  is_quick_access?: boolean;
  sort_order?: number;
}

export type FeedbackType = 'problem' | 'suggestion' | 'unknown';
export type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

export interface FeedbackRecord {
  feedback_id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  contact: string | null;
  resolution: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackSummary {
  feedback_id: string;
  type: FeedbackType;
  title: string;
  status: FeedbackStatus;
  contact: string | null;
  created_at: string;
  updated_at: string;
  excerpt: string;
  has_resolution: boolean;
}

export interface FeedbackCreateInput {
  feedback_id?: string;
  type: FeedbackType;
  title: string;
  description: string;
  status?: FeedbackStatus;
  contact?: string | null;
  resolution?: string | null;
  source?: string | null;
  created_at?: string;
}

export interface FeedbackUpdateInput {
  title?: string;
  description?: string;
  status?: FeedbackStatus;
  contact?: string | null;
  resolution?: string | null;
}

export interface StoredNode {
  project_id: string;
  node_id: string;
  type: string;
  title: string;
  content_type: string | null;
  content: string | null;
  meta: Record<string, unknown>;
  config: Record<string, unknown>;
  visibility: Record<string, unknown>;
  ui: NodeUI;
  ai_visible: boolean;
  connections: NodeConnections;
  created_at: string;
  updated_at: string;
}

export interface StoredEdge {
  project_id: string;
  from_node: string;
  to_node: string;
  label?: string | null;
  source_handle?: string | null;
  target_handle?: string | null;
}

export interface NodeUpdatePatch {
  title?: string;
  content?: string | null;
  content_ops?: TextOperation[] | null;
  content_type?: string | null;
  meta?: Record<string, unknown> | null;
  ai?: Record<string, unknown> | null;
  parser?: Record<string, unknown> | null;
  python?: Record<string, unknown> | null;
  ui?: Partial<NodeUI> | null;
  ai_visible?: boolean | null;
  connections?: Partial<NodeConnections> | null;
}

export interface NodeCreateInput {
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
  ui?: Partial<NodeUI>;
  ai_visible?: boolean;
  connections?: Partial<NodeConnections>;
}

export interface AssetRecord {
  asset_id: string;
  project_id: string;
  node_id: string | null;
  path: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AdminUserSummary {
  user_id: string;
  email: string;
  name: string;
  created_at: string;
  is_admin: boolean;
  projects: Array<{ project_id: string; title: string; created_at: string; updated_at: string }>;
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

export interface PasswordResetTokenRecord {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

export interface PromptPresetImportInput extends PromptPresetCreateInput {
  preset_id?: string;
  created_at?: string;
  updated_at?: string;
}
