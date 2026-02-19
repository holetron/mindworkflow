import { Router } from 'express';
import Ajv, { AnySchema, JSONSchemaType } from 'ajv';
import { validateBody } from '../middleware/validateBody';
import { createNodesController } from '../controllers/nodesController';
import type { NodeConnections, NodeUI } from '../types';

interface NodeRunRequest {
  project_id: string;
}

interface NodeRerunRequest extends NodeRunRequest {
  clone?: boolean;
  include_subnodes?: boolean;
}

interface NodeUpdateRequest extends NodeRunRequest {
  title?: string;
  content?: string;
  content_type?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  parser?: Record<string, unknown>;
  python?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  ai_visible?: boolean;
  connections?: Record<string, unknown>;
}

interface NodeCreateRequest {
  project_id: string;
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
  position?: {
    x?: number;
    y?: number;
  };
  ui?: NodeUI | null;
  ai_visible?: boolean;
  connections?: NodeConnections | null;
}

interface TextSplitRequestBody {
  project_id: string;
  content?: string | null;
  config?: {
    separator?: string | null;
    subSeparator?: string | null;
    namingMode?: 'auto' | 'manual' | null;
  } | null;
  manual_titles?: Array<{
    path: string;
    title: string;
  }> | null;
}

export function createNodesRouter(ajv: Ajv): Router {
  const router = Router();
  const controller = createNodesController(ajv);

  const runSchema: JSONSchemaType<NodeRunRequest> = {
    type: 'object',
    required: ['project_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
    },
  };

  const rerunSchema: JSONSchemaType<NodeRerunRequest> = {
    type: 'object',
    required: ['project_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      clone: { type: 'boolean', nullable: true },
      include_subnodes: { type: 'boolean', nullable: true },
    },
  };

  const textSplitSchema: JSONSchemaType<TextSplitRequestBody> = {
    type: 'object',
    required: ['project_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      content: { type: 'string', nullable: true },
      config: {
        type: 'object',
        nullable: true,
        required: [],
        additionalProperties: false,
        properties: {
          separator: { type: 'string', nullable: true },
          subSeparator: { type: 'string', nullable: true },
          namingMode: { type: 'string', nullable: true, enum: ['auto', 'manual'] },
        },
      },
      manual_titles: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          required: ['path', 'title'],
          additionalProperties: false,
          properties: {
            path: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  };

  const midjourneyStatusSchema: JSONSchemaType<{
    project_id: string;
    node_id: string;
    job_id: string;
  }> = {
    type: 'object',
    required: ['project_id', 'node_id', 'job_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      node_id: { type: 'string', minLength: 1 },
      job_id: { type: 'string', minLength: 1 },
    },
  };

  const addToFolderSchema: JSONSchemaType<{
    project_id: string;
    node_id: string;
    folder_id: string;
    index?: number | null;
  }> = {
    type: 'object',
    required: ['project_id', 'node_id', 'folder_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      node_id: { type: 'string', minLength: 1 },
      folder_id: { type: 'string', minLength: 1 },
      index: { type: 'integer', nullable: true },
    },
  };

  const removeFromFolderSchema: JSONSchemaType<{
    project_id: string;
    node_id: string;
    folder_id?: string;
    position?: {
      x: number;
      y: number;
    };
  }> = {
    type: 'object',
    required: ['project_id', 'node_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      node_id: { type: 'string', minLength: 1 },
      folder_id: { type: 'string', nullable: true },
      position: {
        type: 'object',
        nullable: true,
        required: ['x', 'y'],
        additionalProperties: false,
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
  };

  const updateSchema: AnySchema = {
    type: 'object',
    required: ['project_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      title: { type: 'string', nullable: true },
      content: { type: 'string', nullable: true },
      content_type: { type: 'string', nullable: true },
      content_ops: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            op: { type: 'string', enum: ['retain', 'insert', 'delete'] },
            count: { type: 'integer', minimum: 0 },
            text: { type: 'string' },
          },
          required: ['op'],
          allOf: [
            {
              if: { properties: { op: { enum: ['retain', 'delete'] } } },
              then: { required: ['count'] },
            },
            {
              if: { properties: { op: { const: 'insert' } } },
              then: { required: ['text'] },
            },
          ],
        },
      },
      meta: { type: 'object', nullable: true, additionalProperties: true },
      ai: { type: 'object', nullable: true, additionalProperties: true },
      parser: { type: 'object', nullable: true, additionalProperties: true },
      python: { type: 'object', nullable: true, additionalProperties: true },
      ui: { type: 'object', nullable: true, additionalProperties: true },
      ai_visible: { type: 'boolean', nullable: true },
      connections: { type: 'object', nullable: true, additionalProperties: true },
    },
  };

  const createSchema: AnySchema = {
    type: 'object',
    required: ['project_id', 'type', 'title'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      node_id: { type: 'string', nullable: true },
      slug: { type: 'string', nullable: true },
      type: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      content_type: { type: 'string', nullable: true },
      content: { type: 'string', nullable: true },
      meta: { type: 'object', nullable: true, additionalProperties: true },
      ai: { type: 'object', nullable: true, additionalProperties: true },
      parser: { type: 'object', nullable: true, additionalProperties: true },
      python: { type: 'object', nullable: true, additionalProperties: true },
      visibility_rules: { type: 'object', nullable: true, additionalProperties: true },
      position: {
        type: 'object',
        nullable: true,
        additionalProperties: false,
        properties: {
          x: { type: 'number', nullable: true },
          y: { type: 'number', nullable: true },
        },
      },
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
  };

  // Route definitions
  router.post('/', validateBody<NodeCreateRequest>(ajv, createSchema), controller.create);
  router.post('/:nodeId/split/preview', validateBody<TextSplitRequestBody>(ajv, textSplitSchema), controller.splitPreview);
  router.post('/:nodeId/split', validateBody<TextSplitRequestBody>(ajv, textSplitSchema), controller.split);
  router.post('/:nodeId/run', validateBody<NodeRunRequest>(ajv, runSchema), controller.run);
  router.post('/:nodeId/rerun', validateBody<NodeRerunRequest>(ajv, rerunSchema), controller.rerun);
  router.post('/folder/add', validateBody(ajv, addToFolderSchema), controller.folderAdd);
  router.post('/folder/remove', validateBody(ajv, removeFromFolderSchema), controller.folderRemove);
  router.post('/ai/midjourney/status', validateBody(ajv, midjourneyStatusSchema), controller.midjourneyStatus);
  router.get('/:nodeId/logs', controller.getLogs);
  router.patch('/:nodeId', validateBody<NodeUpdateRequest>(ajv, updateSchema), controller.update);
  router.delete('/:nodeId', validateBody<NodeRunRequest>(ajv, runSchema), controller.remove);
  router.post('/:nodeId/ai/preview-payload', validateBody<NodeRunRequest>(ajv, runSchema), controller.previewAiPayload);

  return router;
}
