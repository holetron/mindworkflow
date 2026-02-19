import { Router } from 'express';
import Ajv, { JSONSchemaType } from 'ajv';
import { validateBody } from '../middleware/validateBody';
import { createProjectsController, type ProjectImportRequest } from '../controllers/projectsController';

interface ImportArchiveRequest {
  archive: string;
}

interface ProjectUpdateRequest {
  title?: string;
  description?: string;
  is_public?: boolean;
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
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

interface SettingsUpdateRequest {
  settings?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
}

export function createProjectsRouter(ajv: Ajv): Router {
  const router = Router();
  const controller = createProjectsController(ajv);

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
      settings: { type: 'object', nullable: true, additionalProperties: true },
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
              type: 'object', nullable: true, additionalProperties: false,
              properties: {
                color: { type: 'string', nullable: true, pattern: '^#(?:[0-9a-fA-F]{3}){1,2}$' },
                bbox: {
                  type: 'object', nullable: true, additionalProperties: false,
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
              type: 'object', nullable: true, additionalProperties: false,
              properties: {
                incoming: {
                  type: 'array', nullable: true,
                  items: {
                    type: 'object', required: ['edge_id', 'from'], additionalProperties: false,
                    properties: {
                      edge_id: { type: 'string' }, from: { type: 'string' },
                      routing: { type: 'string', nullable: true },
                    },
                  },
                },
                outgoing: {
                  type: 'array', nullable: true,
                  items: {
                    type: 'object', required: ['edge_id', 'to'], additionalProperties: false,
                    properties: {
                      edge_id: { type: 'string' }, to: { type: 'string' },
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
          type: 'object', required: ['from', 'to'],
          properties: {
            from: { type: 'string' }, to: { type: 'string' },
            label: { type: 'string', nullable: true },
          },
        },
      },
      schemas: { type: 'object', additionalProperties: true },
    },
  } as unknown as JSONSchemaType<ProjectImportRequest>;

  const projectUpdateSchema = {
    type: 'object', additionalProperties: false, required: [],
    properties: {
      title: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
      is_public: { type: 'boolean', nullable: true },
    },
  } as unknown as JSONSchemaType<ProjectUpdateRequest>;

  const cloneSchema = {
    type: 'object', additionalProperties: false, required: [],
    properties: {
      title: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
    },
  } as unknown as JSONSchemaType<CloneProjectRequest>;

  const createSchema = {
    type: 'object', additionalProperties: false, required: ['title'],
    properties: {
      project_id: { type: 'string', nullable: true },
      title: { type: 'string', minLength: 1 },
      description: { type: 'string', nullable: true },
    },
  } as unknown as JSONSchemaType<CreateProjectRequest>;

  const edgeSchema = {
    type: 'object', additionalProperties: false, required: ['from', 'to'],
    properties: {
      from: { type: 'string', minLength: 1 },
      to: { type: 'string', minLength: 1 },
      label: { type: 'string', nullable: true },
      sourceHandle: { type: 'string', nullable: true },
      targetHandle: { type: 'string', nullable: true },
    },
  } as unknown as JSONSchemaType<EdgeRequest>;

  const settingsSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      settings: { type: 'object', nullable: true, additionalProperties: true },
      integrations: { type: 'object', nullable: true, additionalProperties: true },
    },
  } as unknown as JSONSchemaType<SettingsUpdateRequest>;

  // Route definitions
  router.get('/', controller.list);
  router.post('/', validateBody<ProjectImportRequest>(ajv, projectSchema), controller.importProject);
  router.post('/:projectId/edges', validateBody<EdgeRequest>(ajv, edgeSchema), controller.addEdge);
  router.delete('/:projectId/edges/:fromNode/:toNode', controller.deleteEdge);
  router.post('/create', validateBody<CreateProjectRequest>(ajv, createSchema), controller.createProject);
  router.post('/import', validateBody<ImportArchiveRequest>(ajv, {
    type: 'object', required: ['archive'], additionalProperties: false,
    properties: { archive: { type: 'string', minLength: 1 } },
  }), controller.importArchive);
  router.patch('/:projectId', validateBody<ProjectUpdateRequest>(ajv, projectUpdateSchema), controller.updateProject);
  router.patch('/:projectId/settings', validateBody<SettingsUpdateRequest>(ajv, settingsSchema), controller.updateSettings);
  router.delete('/:projectId', controller.deleteProject);
  router.post('/:projectId/clone', validateBody<CloneProjectRequest>(ajv, cloneSchema), controller.cloneProject);
  router.post('/:projectId/sync-drive', controller.syncDrive);
  router.get('/:projectId', controller.getProject);
  router.get('/:projectId/export', controller.exportProject);
  router.get('/:projectId/graph', controller.getGraph);
  router.get('/:projectId/share', controller.getShare);
  router.post('/:projectId/share', controller.addShare);
  router.delete('/:projectId/share/:userId', controller.removeShare);

  return router;
}
