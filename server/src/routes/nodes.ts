import { Router } from 'express';
import Ajv, { AnySchema, JSONSchemaType } from 'ajv';
import { validateBody } from '../middleware/validateBody';
import { ExecutorService } from '../services/executor';
import { cloneNode, createProjectNode, getNodeRuns, updateNode, deleteProjectNode, getProject, type NodeUpdatePatch } from '../db';
import type { NodeConnections, NodeUI } from '../types';

interface NodeRunRequest {
  project_id: string;
}

interface NodeRerunRequest extends NodeRunRequest {
  clone?: boolean;
  include_subnodes?: boolean;
}

interface NodeUpdateRequest extends NodeRunRequest, NodeUpdatePatch {}

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


export function createNodesRouter(ajv: Ajv): Router {
  const router = Router();
  const executor = new ExecutorService(ajv);

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

  const updateSchema: AnySchema = {
    type: 'object',
    required: ['project_id'],
    additionalProperties: false,
    properties: {
      project_id: { type: 'string', minLength: 1 },
      title: { type: 'string', nullable: true },
      content: { type: 'string', nullable: true },
      content_type: { type: 'string', nullable: true },
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

  router.post('/', validateBody<NodeCreateRequest>(ajv, createSchema), async (req, res, next) => {
    try {
      const body = req.body as NodeCreateRequest;
      const { project_id, position, ui, connections, ...rest } = body;
      const createInput = {
        ...rest,
        ui: ui ?? undefined,
        connections: connections ?? undefined,
      };

      const { node, updated_at } = createProjectNode(project_id, createInput, {
        position:
          position &&
          typeof position.x === 'number' &&
          typeof position.y === 'number'
            ? { x: position.x, y: position.y }
            : undefined,
      });
      res.status(201).json({ node, project_updated_at: updated_at });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:nodeId/run', validateBody<NodeRunRequest>(ajv, runSchema), async (req, res, next) => {
    try {
      const { project_id } = req.body as NodeRunRequest;
      const { nodeId } = req.params;
      const result = await executor.runNode(project_id, nodeId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:nodeId/rerun', validateBody<NodeRerunRequest>(ajv, rerunSchema), async (req, res, next) => {
    try {
      const { project_id, clone, include_subnodes } = req.body as NodeRerunRequest;
      let targetNodeId = req.params.nodeId;
      if (clone) {
        const cloned = cloneNode(project_id, targetNodeId, Boolean(include_subnodes));
        targetNodeId = cloned.node_id;
      }
      const result = await executor.runNode(project_id, targetNodeId);
      res.json({
        ...result,
        cloned: clone ?? false,
        targetNodeId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:nodeId/logs', async (req, res, next) => {
    try {
      const projectId = String(req.query.project_id ?? '');
      if (!projectId) {
        const err = new Error('project_id query parameter is required');
        (err as any).status = 400;
        throw err;
      }
      const runs = getNodeRuns(projectId, req.params.nodeId).map((run) => ({
        ...run,
        logs: safeParse(run.logs_json),
      }));
      res.json(runs);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:nodeId', validateBody<NodeUpdateRequest>(ajv, updateSchema), async (req, res, next) => {
    try {
      const { nodeId } = req.params;
      const body = req.body as NodeUpdateRequest;
      const node = updateNode(body.project_id, nodeId, body);
      res.json(node);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:nodeId', validateBody<NodeRunRequest>(ajv, runSchema), async (req, res, next) => {
    try {
      const { project_id } = req.body as NodeRunRequest;
      const { nodeId } = req.params;
      
      if (!project_id || !nodeId) {
        return res.status(400).json({ message: 'Project ID and Node ID are required' });
      }

      // Delete the node and return updated project
      const updatedProject = await deleteProjectNode(project_id, nodeId);
      res.json(updatedProject);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}
