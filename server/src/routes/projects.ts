import { Router } from 'express';
import Ajv, { JSONSchemaType } from 'ajv';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  ProjectFlow,
  ProjectNode,
  importProject,
  ensureProjectDirs,
  getProject,
  listProjectNodes,
  listProjectEdges,
  listProjects,
  updateProjectMetadata,
  updateProjectSettings,
  addProjectEdge,
  removeProjectEdge,
  cloneProjectRecord,
  generateCloneProjectId,
  writeProjectFile,
  deleteProjectRecord,
} from '../db';
import { validateBody } from '../middleware/validateBody';
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

interface ProjectImportRequest {
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
      bbox?: {
        x1?: number;
        y1?: number;
        x2?: number;
        y2?: number;
      };
    };
    ai_visible?: boolean;
    connections?: {
      incoming?: Array<{
        edge_id: string;
        from: string;
        routing?: string;
      }>;
      outgoing?: Array<{
        edge_id: string;
        to: string;
        routing?: string;
      }>;
    };
    [key: string]: unknown;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
  schemas: Record<string, unknown>;
}

interface ImportArchiveRequest {
  archive: string;
}

interface ProjectUpdateRequest {
  title?: string;
  description?: string;
}

interface CloneProjectRequest {
  title?: string;
  description?: string;
}

interface CreateProjectRequest {
  project_id?: string;
  title: string;
  description?: string;
}

interface EdgeRequest {
  from: string;
  to: string;
  label?: string | null;
}

interface SettingsUpdateRequest {
  settings?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
}

const allowedNodeTypes = new Set([
  'text',
  'file',
  'ai',
  'parser',
  'python',
  'image_gen',
  'audio_gen',
  'video_gen',
  'html',
]);

export function createProjectsRouter(ajv: Ajv): Router {
  const router = Router();

  const projectSchema = {
    type: 'object',
    required: ['project_id', 'title', 'nodes', 'edges', 'schemas'],
    additionalProperties: true,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      description: { type: 'string', nullable: true },
      created_at: { type: 'string', nullable: true },
      updated_at: { type: 'string', nullable: true },
      settings: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },
      nodes: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['node_id', 'type', 'title'],
          additionalProperties: true,
          properties: {
            node_id: { type: 'string' },
            type: { type: 'string' },
            title: { type: 'string' },
            content_type: { type: 'string', nullable: true },
            content: { type: 'string', nullable: true },
            meta: { type: 'object', nullable: true, additionalProperties: true },
            ai: { type: 'object', nullable: true, additionalProperties: true },
            parser: { type: 'object', nullable: true, additionalProperties: true },
            python: { type: 'object', nullable: true, additionalProperties: true },
            visibility_rules: { type: 'object', nullable: true, additionalProperties: true },
            ui: {
              type: 'object',
              nullable: true,
              additionalProperties: false,
              properties: {
                color: {
                  type: 'string',
                  nullable: true,
                  pattern: '^#(?:[0-9a-fA-F]{3}){1,2}$',
                },
                bbox: {
                  type: 'object',
                  nullable: true,
                  additionalProperties: false,
                  properties: {
                    x1: { type: 'number', nullable: true },
                    y1: { type: 'number', nullable: true },
                    x2: { type: 'number', nullable: true },
                    y2: { type: 'number', nullable: true },
                  },
                },
              },
            },
            ai_visible: { type: 'boolean', nullable: true },
            connections: {
              type: 'object',
              nullable: true,
              additionalProperties: false,
              properties: {
                incoming: {
                  type: 'array',
                  nullable: true,
                  items: {
                    type: 'object',
                    required: ['edge_id', 'from'],
                    additionalProperties: false,
                    properties: {
                      edge_id: { type: 'string' },
                      from: { type: 'string' },
                      routing: { type: 'string', nullable: true },
                    },
                  },
                },
                outgoing: {
                  type: 'array',
                  nullable: true,
                  items: {
                    type: 'object',
                    required: ['edge_id', 'to'],
                    additionalProperties: false,
                    properties: {
                      edge_id: { type: 'string' },
                      to: { type: 'string' },
                      routing: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            label: { type: 'string', nullable: true },
          },
        },
      },
      schemas: {
        type: 'object',
        additionalProperties: true,
      },
    },
  } as unknown as JSONSchemaType<ProjectImportRequest>;

  router.get('/', (req, res, next) => {
    try {
      bootstrapProjectsFromDisk(ajv);
      const projects = listProjects();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  const projectUpdateSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
    },
    required: [],
  } as unknown as JSONSchemaType<ProjectUpdateRequest>;

  const cloneSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
    },
    required: [],
  } as unknown as JSONSchemaType<CloneProjectRequest>;

  const createSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      project_id: { type: 'string', nullable: true },
      title: { type: 'string', minLength: 1 },
      description: { type: 'string', nullable: true },
    },
  } as unknown as JSONSchemaType<CreateProjectRequest>;

  const edgeSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to'],
    properties: {
      from: { type: 'string', minLength: 1 },
      to: { type: 'string', minLength: 1 },
      label: { type: 'string', nullable: true },
    },
  } as unknown as JSONSchemaType<EdgeRequest>;

  const settingsSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      settings: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },
      integrations: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },
    },
  } as unknown as JSONSchemaType<SettingsUpdateRequest>;

  router.post('/', validateBody<ProjectImportRequest>(ajv, projectSchema), (req, res, next) => {
    try {
      const body = req.body as ProjectImportRequest;
      const project = processImport(ajv, body);
      res.status(201).json({ status: 'imported', project_id: project.project_id });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:projectId/edges',
    validateBody<EdgeRequest>(ajv, edgeSchema),
    (req, res, next) => {
      try {
        const { projectId } = req.params;
        const project = addProjectEdge(projectId, req.body as EdgeRequest);
        res.status(201).json({
          edges: project.edges,
          updated_at: project.updated_at,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete('/:projectId/edges/:fromNode/:toNode', (req, res, next) => {
    try {
      const { projectId, fromNode, toNode } = req.params as {
        projectId: string;
        fromNode: string;
        toNode: string;
      };
      const project = removeProjectEdge(projectId, fromNode, toNode);
      res.json({
        edges: project.edges,
        updated_at: project.updated_at,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/create', validateBody<CreateProjectRequest>(ajv, createSchema), (req, res, next) => {
    try {
      const body = req.body as CreateProjectRequest;
      const sanitizedId = sanitizeProjectId(body.project_id ?? body.title);
      const existing = getProject(sanitizedId);
      if (existing) {
        res.status(409).json({ error: 'Project with this id already exists', project_id: sanitizedId });
        return;
      }

      const project = createBlankProject(ajv, {
        project_id: sanitizedId,
        title: body.title.trim(),
        description: body.description?.trim() ?? '',
      });

      res.status(201).json({
        project_id: project.project_id,
        title: project.title,
        description: project.description,
        created_at: project.created_at,
        updated_at: project.updated_at,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/import',
    validateBody<ImportArchiveRequest>(ajv, {
      type: 'object',
      required: ['archive'],
      additionalProperties: false,
      properties: {
        archive: { type: 'string', minLength: 1 },
      },
    }),
    (req, res, next) => {
      try {
        const { archive } = req.body as ImportArchiveRequest;
        const buffer = Buffer.from(archive, 'base64');
        const zip = new AdmZip(buffer);
        const entry = zip.getEntry('project.flow.json');
        if (!entry) {
          throw new Error('project.flow.json missing in archive');
        }
        const json = entry.getData().toString('utf8');
        const projectRequest = JSON.parse(json) as ProjectImportRequest;
        const project = processImport(ajv, projectRequest);
        res.status(201).json({ status: 'imported', project_id: project.project_id });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:projectId',
    validateBody<ProjectUpdateRequest>(ajv, projectUpdateSchema),
    (req, res, next) => {
      try {
        const { projectId } = req.params;
        const body = req.body as ProjectUpdateRequest;
        if (!body.title && !body.description) {
          res.status(400).json({ error: 'Nothing to update' });
          return;
        }
        const updated = updateProjectMetadata(projectId, body);
        res.json({
          project_id: updated.project_id,
          title: updated.title,
          description: updated.description,
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:projectId/settings',
    validateBody<SettingsUpdateRequest>(ajv, settingsSchema),
    (req, res, next) => {
      try {
        const { projectId } = req.params;
        const body = req.body as SettingsUpdateRequest;
        const patch: Record<string, unknown> = {};
        if (body.settings) {
          Object.assign(patch, body.settings);
        }
        if (body.integrations) {
          patch.integrations = body.integrations;
        }
        if (Object.keys(patch).length === 0) {
          res.status(400).json({ error: 'No settings provided' });
          return;
        }
        const project = updateProjectSettings(projectId, patch);
        res.json({
          settings: project.settings,
          updated_at: project.updated_at,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // Update project metadata (title, description)
  router.patch('/:projectId', (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const { title, description } = req.body;
      
      // Validate input
      if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
        const err = new Error('Title must be a non-empty string');
        (err as any).status = 400;
        throw err;
      }
      if (description !== undefined && typeof description !== 'string') {
        const err = new Error('Description must be a string');
        (err as any).status = 400;
        throw err;
      }

      const project = updateProjectMetadata(projectId, { title, description });
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:projectId', (req, res, next) => {
    try {
      const { projectId } = req.params;
      deleteProjectRecord(projectId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:projectId/clone',
    validateBody<CloneProjectRequest>(ajv, cloneSchema),
    (req, res, next) => {
      try {
        const { projectId } = req.params;
        const body = (req.body as CloneProjectRequest) ?? {};
        const newId = generateCloneProjectId(projectId);
        const clone = cloneProjectRecord(projectId, newId, body);
        res.status(201).json({
          project_id: clone.project_id,
          title: clone.title,
          description: clone.description,
          created_at: clone.created_at,
          updated_at: clone.updated_at,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/:projectId/sync-drive', (req, res, next) => {
    try {
      const { projectId } = req.params;
      const project = getProject(projectId);
      if (!project) {
        const err = new Error('Project not found');
        (err as any).status = 404;
        throw err;
      }
      writeProjectFile(project);
      res.json({ status: 'synced' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:projectId', (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      let project = getProject(projectId);
      if (!project) {
        project = loadProjectFromDisk(ajv, projectId);
      }
      if (!project) {
        const err = new Error('Project not found');
        (err as any).status = 404;
        throw err;
      }
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:projectId/export', (req, res, next) => {
    try {
      const project = getProject(req.params.projectId);
      if (!project) {
        const err = new Error('Project not found');
        (err as any).status = 404;
        throw err;
      }

      const zip = new AdmZip();
      zip.addFile('project.flow.json', Buffer.from(JSON.stringify(project, null, 2), 'utf8'));

      const projectDir = path.resolve(process.cwd(), 'projects', project.project_id);
      if (fs.existsSync(projectDir)) {
        zip.addLocalFolder(projectDir, path.join('projects', project.project_id));
      }

      const payload = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${project.project_id}.lcfz"`);
      res.send(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:projectId/graph', (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      res.json({
        nodes: listProjectNodes(projectId),
        edges: listProjectEdges(projectId),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function bootstrapProjectsFromDisk(ajv: Ajv): void {
  const projectsDir = path.resolve(process.cwd(), 'projects');
  if (!fs.existsSync(projectsDir)) {
    return;
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    if (getProject(projectId)) {
      continue;
    }
    loadProjectFromDisk(ajv, projectId);
  }
}

function processImport(ajv: Ajv, body: ProjectImportRequest): ProjectFlow {
  ensureProjectDirs(body.project_id);
  validateNodes(body);
  validateEdges(body);
  validateSchemas(ajv, body.schemas);

  const project: ProjectFlow = {
    project_id: body.project_id,
    title: body.title,
    description: body.description ?? '',
    created_at: body.created_at ?? new Date().toISOString(),
    updated_at: body.updated_at ?? new Date().toISOString(),
    settings: body.settings ?? {},
    nodes: body.nodes.map(normalizeImportedNode),
    edges: body.edges,
    schemas: body.schemas,
  };

  importProject(project);
  writeProjectFile(project);
  return project;
}

function createBlankProject(
  validator: Ajv,
  params: { project_id: string; title: string; description: string },
): ProjectFlow {
  ensureProjectDirs(params.project_id);
  const timestamp = new Date().toISOString();
  const schemas = snapshotSchemas(validator);
  if (Object.keys(schemas).length === 0) {
    throw new Error('Core schemas not registered');
  }

  const defaultNode: ProjectImportRequest['nodes'][number] = {
    node_id: 'n1_brief',
    type: 'text',
    title: 'Project Brief',
    content_type: 'text/markdown',
    content: '# Project Brief\n\nDescribe the goals, audience, and constraints for this workflow.',
    meta: {
      short_description: 'Editable brief for collaborators',
      ui_position: { x: 0, y: 0 },
    },
  };

  const project: ProjectFlow = {
    project_id: params.project_id,
    title: params.title,
    description: params.description,
    created_at: timestamp,
    updated_at: timestamp,
    settings: {
      integrations: {
        google_drive_root: process.env.GOOGLE_DRIVE_ROOT_ID ?? '',
      },
    },
    nodes: [normalizeImportedNode(defaultNode)],
    edges: [],
    schemas,
  };

  importProject(project);
  writeProjectFile(project);
  return project;
}

function validateNodes(project: ProjectImportRequest): void {
  const ids = new Set<string>();
  for (const node of project.nodes) {
    if (ids.has(node.node_id)) {
      throw new Error(`Duplicate node id ${node.node_id}`);
    }
    ids.add(node.node_id);
    if (!allowedNodeTypes.has(node.type)) {
      throw new Error(`Unsupported node type ${node.type}`);
    }
  }
}

function normalizeImportedNode(node: ProjectImportRequest['nodes'][number]): ProjectNode {
  const ui: NodeUI = node.ui
    ? normalizeNodeUI(node.ui as Partial<NodeUI>)
    : createDefaultNodeUI();
  const connections: NodeConnections = node.connections
    ? normalizeNodeConnections(node.connections as Partial<NodeConnections>)
    : createDefaultNodeConnections();

  return {
    ...node,
    ui,
    ai_visible: normalizeAiVisible(node.ai_visible),
    connections,
  } as ProjectNode;
}

function validateEdges(project: ProjectImportRequest): void {
  const nodeIds = new Set(project.nodes.map((node) => node.node_id));
  for (const edge of project.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`Edge ${edge.from} -> ${edge.to} references unknown node`);
    }
  }
}

function validateSchemas(ajv: Ajv, schemas: Record<string, unknown>): void {
  const required = ['PLAN_SCHEMA', 'ACTOR_SCHEMA', 'PARSE_SCHEMA', 'TEXT_RESPONSE'];
  for (const key of required) {
    if (!schemas[key]) {
      throw new Error(`Schema ${key} missing in project`);
    }
    if (!ajv.validateSchema(schemas[key]!)) {
      throw new Error(`Schema ${key} failed validation`);
    }
  }
}

function loadProjectFromDisk(ajv: Ajv, projectId: string): ProjectFlow | null {
  const filePath = path.resolve(process.cwd(), 'projects', projectId, 'project.flow.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const projectRequest = JSON.parse(raw) as ProjectImportRequest;
    return processImport(ajv, projectRequest);
  } catch (error) {
    // Swallow disk errors to keep HTTP surface consistent with DB lookups.
    console.error(`Failed to bootstrap project ${projectId} from disk:`, error);
    return null;
  }
}

function snapshotSchemas(validator: Ajv): Record<string, unknown> {
  const schemaNames = ['PLAN_SCHEMA', 'ACTOR_SCHEMA', 'PARSE_SCHEMA', 'TEXT_RESPONSE'];
  const result: Record<string, unknown> = {};
  for (const name of schemaNames) {
    const schema = validator.getSchema(name)?.schema;
    if (schema) {
      result[name] = JSON.parse(JSON.stringify(schema)) as unknown;
    }
  }
  return result;
}

function sanitizeProjectId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (normalized.length === 0) {
    return `project-${Date.now()}`;
  }
  return normalized;
}
