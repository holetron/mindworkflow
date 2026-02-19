import type Ajv from 'ajv';
import * as fs from 'fs';
import { getProjectsRoot, resolveProjectPath } from '../utils/projectPaths';
import {
  ProjectFlow,
  ProjectNode,
  importProject,
  ensureProjectDirs,
  writeProjectFile,
  projectExists,
} from '../db';
import {
  createDefaultNodeConnections,
  createDefaultNodeUI,
  NodeConnections,
  NodeUI,
} from '../types';
import {
  normalizeAiVisible,
  normalizeNodeConnections,
  normalizeNodeUI,
} from '../validation';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'controllers/projectsHelpers' });

const allowedNodeTypes = new Set([
  'text', 'file', 'ai', 'ai_improved', 'html_editor', 'parser',
  'python', 'image_gen', 'audio_gen', 'video_gen', 'html',
  'image', 'video', 'table', 'pdf', 'image_test',
]);

export interface ProjectImportRequest {
  project_id: string;
  title: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  settings?: Record<string, unknown>;
  nodes: Array<{
    node_id: string;
    type: string;
    title: string;
    content_type?: string;
    content?: string;
    meta?: Record<string, unknown>;
    ai?: Record<string, unknown>;
    parser?: Record<string, unknown>;
    python?: Record<string, unknown>;
    visibility_rules?: Record<string, unknown>;
    ui?: {
      color?: string;
      bbox?: { x1?: number; y1?: number; x2?: number; y2?: number };
    };
    ai_visible?: boolean;
    connections?: {
      incoming?: Array<{ edge_id: string; from: string; routing?: string }>;
      outgoing?: Array<{ edge_id: string; to: string; routing?: string }>;
    };
    [key: string]: unknown;
  }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  schemas: Record<string, unknown>;
}

export function normalizeImportedNode(node: ProjectImportRequest['nodes'][number]): ProjectNode {
  const ui: NodeUI = node.ui
    ? normalizeNodeUI(node.ui as Partial<NodeUI>)
    : createDefaultNodeUI();
  const connections: NodeConnections = node.connections
    ? normalizeNodeConnections(node.connections as Partial<NodeConnections>)
    : createDefaultNodeConnections();

  let normalizedNode = { ...node };
  if (normalizedNode.type === 'ai_improved') {
    normalizedNode.type = 'ai';
    const responseType = (normalizedNode.ai && typeof normalizedNode.ai === 'object' && (normalizedNode.ai as any).response_type) || 'text';
    if (normalizedNode.meta) {
      normalizedNode.meta.output_type = responseType;
    } else {
      normalizedNode.meta = { output_type: responseType };
    }
    if (normalizedNode.ai && typeof normalizedNode.ai === 'object') {
      delete (normalizedNode.ai as any).response_type;
    }
  }

  return {
    ...normalizedNode, ui,
    ai_visible: normalizeAiVisible(normalizedNode.ai_visible),
    connections,
  } as ProjectNode;
}

export function validateNodes(project: ProjectImportRequest): void {
  const ids = new Set<string>();
  for (const node of project.nodes) {
    if (ids.has(node.node_id)) throw new Error(`Duplicate node id ${node.node_id}`);
    ids.add(node.node_id);
    if (!allowedNodeTypes.has(node.type)) throw new Error(`Unsupported node type ${node.type}`);
  }
}

export function validateEdges(project: ProjectImportRequest): void {
  const nodeIds = new Set(project.nodes.map((node) => node.node_id));
  for (const edge of project.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`Edge ${edge.from} -> ${edge.to} references unknown node`);
    }
  }
}

export function validateSchemas(ajv: Ajv, schemas: Record<string, unknown> | undefined): void {
  if (!schemas) return;
  const required = ['PLAN_SCHEMA', 'ACTOR_SCHEMA', 'PARSE_SCHEMA', 'TEXT_RESPONSE'];
  for (const key of required) {
    if (!schemas[key]) throw new Error(`Schema ${key} missing in project`);
    if (!ajv.validateSchema(schemas[key]!)) throw new Error(`Schema ${key} failed validation`);
  }
}

export function snapshotSchemas(validator: Ajv): Record<string, unknown> {
  const schemaNames = ['PLAN_SCHEMA', 'ACTOR_SCHEMA', 'PARSE_SCHEMA', 'TEXT_RESPONSE'];
  const result: Record<string, unknown> = {};
  for (const name of schemaNames) {
    const schema = validator.getSchema(name)?.schema;
    if (schema) result[name] = JSON.parse(JSON.stringify(schema)) as unknown;
  }
  return result;
}

export function sanitizeProjectId(value: string): string {
  const normalized = value.trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (normalized.length === 0) return `project-${Date.now()}`;
  return normalized;
}

export function processImport(ajv: Ajv, body: ProjectImportRequest, userId?: string): ProjectFlow {
  ensureProjectDirs(body.project_id);
  validateNodes(body);
  validateEdges(body);
  validateSchemas(ajv, body.schemas);
  const project: ProjectFlow = {
    project_id: body.project_id, title: body.title,
    description: body.description ?? '',
    created_at: body.created_at ?? new Date().toISOString(),
    updated_at: body.updated_at ?? new Date().toISOString(),
    settings: body.settings ?? {},
    nodes: body.nodes.map(normalizeImportedNode),
    edges: body.edges, schemas: body.schemas, user_id: userId,
  };
  importProject(project, userId ?? '9638027e-8b97-41c2-8159-653ba485e38d');
  writeProjectFile(project);
  return project;
}

export function createBlankProject(
  validator: Ajv,
  params: { project_id: string; title: string; description: string },
  userId?: string,
): ProjectFlow {
  ensureProjectDirs(params.project_id);
  const timestamp = new Date().toISOString();
  const schemas = snapshotSchemas(validator);
  if (Object.keys(schemas).length === 0) throw new Error('Core schemas not registered');
  const defaultNode: ProjectImportRequest['nodes'][number] = {
    node_id: 'n1_brief', type: 'text', title: 'Project Brief',
    content_type: 'text/markdown',
    content: '# Project Brief\n\nDescribe the goals, audience, and constraints for this workflow.',
    meta: { short_description: 'Editable brief for collaborators', ui_position: { x: 0, y: 0 } },
  };
  const project: ProjectFlow = {
    project_id: params.project_id, title: params.title,
    description: params.description,
    created_at: timestamp, updated_at: timestamp,
    settings: { integrations: { google_drive_root: process.env.GOOGLE_DRIVE_ROOT_ID ?? '' } },
    nodes: [normalizeImportedNode(defaultNode)],
    edges: [], schemas,
  };
  importProject(project, userId);
  writeProjectFile(project);
  return project;
}

export function bootstrapProjectsFromDisk(ajv: Ajv): void {
  const projectsDir = getProjectsRoot();
  if (!fs.existsSync(projectsDir)) return;
  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (projectExists(entry.name)) continue;
    loadProjectFromDisk(ajv, entry.name);
  }
}

export function loadProjectFromDisk(ajv: Ajv, projectId: string): ProjectFlow | null {
  const filePath = resolveProjectPath(projectId, 'project.flow.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return processImport(ajv, JSON.parse(raw) as ProjectImportRequest, undefined);
  } catch (error) {
    log.error({ err: error }, '`Failed to bootstrap project ${projectId} from disk:`');
    return null;
  }
}
