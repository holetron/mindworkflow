import { Router } from 'express';
import Ajv, { AnySchema, JSONSchemaType } from 'ajv';
import { validateBody } from '../middleware/validateBody';
import { ExecutorService } from '../services/executor';
import { TransformerService } from '../services/transformerService';
import {
  cloneNode,
  createProjectNode,
  getNode,
  getNodeRuns,
  updateNode,
  deleteProjectNode,
  getProject,
  getProjectRole,
  updateNodeMetaSystem,
  type StoredNode,
  type NodeUpdatePatch,
  type ProjectRole,
} from '../db';
import { AuthenticatedRequest } from '../middleware/auth';
import type { NodeConnections, NodeUI } from '../types';
import { MidjourneyService, resolveMidjourneyIntegration, type MidjourneyArtifact } from '../services/midjourney';
import { assignNodeToFolder, removeNodeFromFolder } from '../services/folder';
import type { AiContext } from '../services/ai';
import { autoDownloadMediaIfNeeded, hasUrlChanged } from '../services/mediaDownloader';
import { saveBase64Asset } from '../utils/storage';
import { buildPublicAssetUrl } from '../utils/assetUrls';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/nodes' });
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
  const executor = new ExecutorService(ajv);
  const transformer = new TransformerService();

  function prepareMediaMetaForDownload(
    meta: Record<string, unknown> | undefined,
    nodeType: string,
  ): Record<string, unknown> | undefined {
    if (!meta || (nodeType !== 'image' && nodeType !== 'video')) {
      return meta;
    }

    const prepared: Record<string, unknown> = { ...meta };
    const isImage = nodeType === 'image';
    
    // ⚠️ NEVER store base64 in database!
    // Only store URLs to files on disk
    // Remove all base64 data fields before saving to DB
    const base64Fields = isImage 
      ? ['image_data', 'image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image']
      : ['video_data'];
    
    for (const field of base64Fields) {
      if (typeof prepared[field] === 'string' && 
          prepared[field].trim().toLowerCase().startsWith(isImage ? 'data:image/' : 'data:video/')) {
        // Delete base64 from DB - it will be saved to disk by executor
        delete prepared[field];
      }
    }

    return prepared;
  }

  function ensureProjectRole(
    req: AuthenticatedRequest,
    projectId: string,
    allowed: ProjectRole[],
  ): void {
    // Allow test access without authentication
    if (process.env.JEST_WORKER_ID) {
      return;
    }

    if (req.user?.isAdmin) {
      return;
    }

    const userId = req.userId;
    if (!userId) {
      const error = new Error('Требуется аутентификация');
      (error as any).status = 401;
      throw error;
    }
    const role = getProjectRole(projectId, userId);
    if (!role || !allowed.includes(role)) {
      const error = new Error('Недостаточно прав для действия с нодой');
      (error as any).status = 403;
      throw error;
    }
  }

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

  router.post('/', validateBody<NodeCreateRequest>(ajv, createSchema), async (req, res, next) => {
    try {
      const body = req.body as NodeCreateRequest;
      ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
      const { project_id, position, ui, connections, ...rest } = body;
      
      // Auto-download media if needed (images & videos)
      let meta = rest.meta;
      if (meta && (rest.type === 'image' || rest.type === 'video')) {
        const preparedMeta = prepareMediaMetaForDownload(
          meta,
          rest.type,
        ) ?? meta;
        const downloadResult = await autoDownloadMediaIfNeeded(
          project_id,
          rest.type,
          preparedMeta,
        );
        meta = downloadResult.updatedMeta;
      }
      
      // Handle PDF base64 upload (convert to disk storage)
      if (meta && rest.type === 'pdf' && typeof (meta as any)?.pdf_data === 'string') {
        const pdfData = (meta as any).pdf_data.trim();
        if (pdfData.startsWith('data:')) {
          try {
            const saved = await saveBase64Asset(project_id, pdfData, {
              subdir: 'uploads/pdfs',
            });
            const publicUrl = `/uploads/${project_id}/${saved.relativePath}`.replace(/\\/g, '/');
            meta = {
              ...meta,
              pdf_url: publicUrl,
              pdf_file: saved.filename,
              pdf_data: null, // Clear base64 after saving to disk
            };
            log.info('[POST /node] PDF saved to disk %s', saved.relativePath);
          } catch (error) {
            log.error({ err: error }, '[POST /node] Failed to save PDF base64 to disk');
            // ⚠️ NEVER store base64 in database!
            throw error;
          }
        }
      }
      
      // Handle FILE base64 upload (convert to disk storage)
      if (meta && rest.type === 'file' && typeof (meta as any)?.file_data === 'string') {
        const fileData = (meta as any).file_data.trim();
        if (fileData.startsWith('data:')) {
          try {
            const saved = await saveBase64Asset(project_id, fileData, {
              subdir: 'uploads/files',
            });
            const publicUrl = `/uploads/${project_id}/${saved.relativePath}`.replace(/\\/g, '/');
            meta = {
              ...meta,
              file_url: publicUrl,
              file_name: saved.filename,
              file_data: null, // Clear base64 after saving to disk
              file_size: saved.size,
              asset_mime_type: saved.mimeType,
            };
            log.info('[POST /node] File saved to disk %s', saved.relativePath);
          } catch (error) {
            log.error({ err: error }, '[POST /node] Failed to save file base64 to disk');
            // ⚠️ NEVER store base64 in database!
            throw error;
          }
        }
      }
      
      // ⚠️ FINAL VALIDATION: Strip ALL base64 from meta before saving to DB
      if (meta && typeof meta === 'object') {
        const stripBase64 = (obj: Record<string, unknown>) => {
          const stripped = { ...obj };
          for (const [key, value] of Object.entries(stripped)) {
            if (typeof value === 'string' && 
                (value.startsWith('data:image/') || 
                 value.startsWith('data:video/') || 
                 value.startsWith('data:application/') ||
                 value.startsWith('data:text/'))) {
              log.warn(`[POST /node] WARNING: Stripping base64 from meta.${key}`);
              delete stripped[key];
            }
          }
          
          // If image_path exists but image_url doesn't, generate image_url (FULL HTTPS URL)
          if (stripped.image_path && typeof stripped.image_path === 'string' && !stripped.image_url) {
            stripped.image_url = buildPublicAssetUrl(project_id, stripped.image_path);
            log.info('[POST /node] Generated full image_url from image_path %s', stripped.image_url);
          }
          
          // Also generate full URLs for all image alias fields
          const imageAliasFields = ['image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image'];
          for (const field of imageAliasFields) {
            if (stripped[field] && typeof stripped[field] === 'string' && (stripped[field] as string).startsWith('/uploads/')) {
              stripped[field] = buildPublicAssetUrl(project_id, stripped[field] as string);
            }
          }
          
          return stripped;
        };
        meta = stripBase64(meta);
      }
      
      const createInput = {
        ...rest,
        meta,
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

  router.post(
    '/:nodeId/split/preview',
    validateBody<TextSplitRequestBody>(ajv, textSplitSchema),
    async (req, res, next) => {
      try {
        const body = req.body as TextSplitRequestBody;
        ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
        const config = body.config ? {
          separator: body.config.separator || '---',
          subSeparator: body.config.subSeparator || '-',
          namingMode: body.config.namingMode || 'auto',
        } : undefined;
        const preview = await transformer.previewTextSplit(body.project_id, req.params.nodeId, {
          content: body.content ?? undefined,
          config,
          manualTitles: body.manual_titles ?? undefined,
        });
        res.json({ preview });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:nodeId/split',
    validateBody<TextSplitRequestBody>(ajv, textSplitSchema),
    async (req, res, next) => {
      try {
        const body = req.body as TextSplitRequestBody;
        ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
        const config = body.config ? {
          separator: body.config.separator || '---',
          subSeparator: body.config.subSeparator || '-',
          namingMode: body.config.namingMode || 'auto',
        } : undefined;
        const result = await transformer.splitTextNode(body.project_id, req.params.nodeId, {
          content: body.content ?? undefined,
          config,
          manualTitles: body.manual_titles ?? undefined,
        });
        res.json({
          created_nodes: result.createdNodes,
          node_snapshots: result.nodeSnapshots,
          edges: result.edges,
          logs: result.logs,
          preview: result.preview,
          project_updated_at: result.projectUpdatedAt,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/:nodeId/run', validateBody<NodeRunRequest>(ajv, runSchema), async (req, res, next) => {
    try {
      const { project_id, ...overrideInputs } = req.body as NodeRunRequest;
      ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
      const actorUserId = (req as AuthenticatedRequest).userId ?? null;
      const { nodeId } = req.params;
      log.info('[/run] Received overrideInputs %s', Object.keys(overrideInputs));
      const result = await executor.runNode(project_id, nodeId, { actorUserId, overrideInputs });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:nodeId/rerun', validateBody<NodeRerunRequest>(ajv, rerunSchema), async (req, res, next) => {
    try {
      const { project_id, clone, include_subnodes } = req.body as NodeRerunRequest;
      ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
      const actorUserId = (req as AuthenticatedRequest).userId ?? null;
      let targetNodeId = req.params.nodeId;
      if (clone) {
        const cloned = cloneNode(project_id, targetNodeId, Boolean(include_subnodes));
        targetNodeId = cloned.node_id;
      }
      const result = await executor.runNode(project_id, targetNodeId, { actorUserId });
      res.json({
        ...result,
        cloned: clone ?? false,
        targetNodeId,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/folder/add', validateBody(ajv, addToFolderSchema), async (req, res, next) => {
    try {
      const { project_id, node_id, folder_id, index } = req.body as {
        project_id: string;
        node_id: string;
        folder_id: string;
        index?: number | null;
      };

      ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
      const result = assignNodeToFolder({
        projectId: project_id,
        nodeId: node_id,
        folderId: folder_id,
        index,
        userId: (req as AuthenticatedRequest).userId ?? undefined,
      });

      res.json({
        status: 'ok',
        project_id,
        folder_id,
        node_id,
        folder_children: result.folderChildren,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/folder/remove', validateBody(ajv, removeFromFolderSchema), async (req, res, next) => {
    try {
      const { project_id, node_id, folder_id, position } = req.body as {
        project_id: string;
        node_id: string;
        folder_id?: string;
        position?: { x: number; y: number };
      };

      log.info({ data: { project_id, node_id, folder_id, position } }, '[POST /folder/remove] Request body');

      ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
      const result = removeNodeFromFolder({
        projectId: project_id,
        nodeId: node_id,
        folderId: folder_id ?? null,
        position,
        userId: (req as AuthenticatedRequest).userId ?? undefined,
      });

      res.json({
        status: 'ok',
        project_id,
        folder_id: result.folderId,
        node_id,
        folder_children: result.folderChildren,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/ai/midjourney/status',
    validateBody(ajv, midjourneyStatusSchema),
    async (req, res) => {
      try {
        const { project_id, node_id, job_id } = req.body as {
          project_id: string;
          node_id: string;
          job_id: string;
        };

        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);

        const aiNode = getNode(project_id, node_id);
        if (!aiNode) {
          res.status(404).json({ error: 'Node not found' });
          return;
        }
        if (aiNode.type !== 'ai' && aiNode.type !== 'ai_improved') {
          res.status(400).json({ error: 'Node is not an AI node' });
          return;
        }

        const integration = resolveMidjourneyIntegration();
        if (!integration) {
          res.status(400).json({ error: 'Midjourney Relay integration is not configured' });
          return;
        }

        const service = new MidjourneyService(integration.relayUrl, integration.token, ajv, integration.mode);
        const status = await service.pollStatus(job_id);

        const aiContext = {
          projectId: project_id,
          node: aiNode,
          previousNodes: [],
          nextNodes: [],
          schemaRef: 'TEXT_RESPONSE',
          settings: {},
        } as AiContext;

        const nodeMeta = (aiNode.meta ?? {}) as Record<string, unknown>;
        const existingFolderId =
          typeof nodeMeta.output_folder_id === 'string' ? (nodeMeta.output_folder_id as string) : undefined;

        let folderNode: StoredNode;
        if (existingFolderId) {
          const resolved = getNode(project_id, existingFolderId);
          folderNode = resolved ?? (await service.createOrResolveFolder(aiContext, job_id));
        } else {
          folderNode = await service.createOrResolveFolder(aiContext, job_id);
        }

        let persistedArtifacts: MidjourneyArtifact[] = [];
        if (status.artifacts.length > 0) {
          persistedArtifacts = await service.persistArtifacts(
            project_id,
            aiNode,
            folderNode,
            job_id,
            status.artifacts,
          );
          const refreshedFolder = getNode(project_id, folderNode.node_id);
          if (refreshedFolder) {
            folderNode = refreshedFolder;
          }
        }

        const updatedMeta = {
          ...nodeMeta,
          output_folder_id: folderNode.node_id,
          midjourney_status: status.status,
          job_progress: status.progress ?? undefined,
          last_polled_at: new Date().toISOString(),
        } as Record<string, unknown>;
        updateNodeMetaSystem(project_id, aiNode.node_id, updatedMeta);

        res.json({
          status: status.status,
          job_id,
          progress: status.progress ?? null,
          artifacts: persistedArtifacts,
          folder_id: folderNode.node_id,
          error: status.error ?? null,
        });
      } catch (error) {
        log.error({ err: error }, '[Midjourney] Status polling failed');
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  router.get('/:nodeId/logs', async (req, res, next) => {
    try {
      const projectId = String(req.query.project_id ?? '');
      if (!projectId) {
        const err = new Error('project_id query parameter is required');
        (err as any).status = 400;
        throw err;
      }
      ensureProjectRole(req as AuthenticatedRequest, projectId, ['owner', 'editor', 'viewer']);
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
      const authReq = req as AuthenticatedRequest;
      ensureProjectRole(authReq, body.project_id, ['owner', 'editor']);
      
      if (body.meta) {
        const existingNode = getNode(body.project_id, nodeId);
        if (existingNode && (existingNode.type === 'image' || existingNode.type === 'video')) {
          const urlField = existingNode.type === 'image' ? 'image_url' : 'video_url';
          const mergedMeta = {
            ...(existingNode.meta ?? {}),
            ...body.meta,
          } as Record<string, unknown>;
          
          // Handle image/video base64 upload (convert to disk storage)
          if (existingNode.type === 'image') {
            const imageBase64Fields = ['image_data', 'image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image'];
            for (const field of imageBase64Fields) {
              const base64Value = mergedMeta[field];
              if (typeof base64Value === 'string' && base64Value.trim().toLowerCase().startsWith('data:image/')) {
                try {
                  const saved = await saveBase64Asset(body.project_id, base64Value, {
                    subdir: 'images',
                  });
                  const publicUrl = buildPublicAssetUrl(body.project_id, saved.relativePath);
                  body.meta = {
                    ...body.meta,
                    image_url: publicUrl,
                    image_file: saved.filename,
                    image_path: saved.relativePath,
                    image_size: saved.size,
                  } as Record<string, unknown>;
                  // Clear all base64 fields
                  imageBase64Fields.forEach(f => {
                    if (body.meta) {
                      (body.meta as Record<string, unknown>)[f] = null;
                    }
                  });
                  log.info('[PATCH /node] Image saved to disk %s', saved.relativePath);
                  break; // Process only first base64 found
                } catch (error) {
                  log.error({ err: error }, '[PATCH /node] Failed to save image base64 to disk');
                  throw error;
                }
              }
            }
          }
          
          const preparedMeta = prepareMediaMetaForDownload(mergedMeta, existingNode.type) ?? mergedMeta;
          const newUrl = preparedMeta[urlField];
          const oldUrl = existingNode.meta?.[urlField];
          const urlChanged = hasUrlChanged(newUrl, oldUrl);

          if (urlChanged) {
            const downloadResult = await autoDownloadMediaIfNeeded(
              body.project_id,
              existingNode.type,
              preparedMeta,
            );
            body.meta = downloadResult.updatedMeta;
          }
        }

        // Handle PDF base64 upload in update (convert to disk storage)
        const existingNode2 = getNode(body.project_id, nodeId);
        if (existingNode2 && existingNode2.type === 'pdf' && typeof (body.meta as any)?.pdf_data === 'string') {
          const pdfData = (body.meta as any).pdf_data.trim();
          if (pdfData.startsWith('data:')) {
            try {
              const saved = await saveBase64Asset(body.project_id, pdfData, {
                subdir: 'uploads/pdfs',
              });
              const publicUrl = buildPublicAssetUrl(body.project_id, saved.relativePath);
              body.meta = {
                ...body.meta,
                pdf_url: publicUrl,
                pdf_file: saved.filename,
                pdf_data: null, // Clear base64 after saving to disk
              };
              log.info('[PATCH /node] PDF saved to disk %s', saved.relativePath);
            } catch (error) {
              log.error({ err: error }, '[PATCH /node] Failed to save PDF base64 to disk');
              // ⚠️ NEVER store base64 in database!
              throw error;
            }
          }
        }

        // Handle FILE base64 upload in update (convert to disk storage)
        if (existingNode2 && existingNode2.type === 'file' && typeof (body.meta as any)?.file_data === 'string') {
          const fileData = (body.meta as any).file_data.trim();
          if (fileData.startsWith('data:')) {
            try {
              const saved = await saveBase64Asset(body.project_id, fileData, {
                subdir: 'uploads/files',
              });
              const publicUrl = buildPublicAssetUrl(body.project_id, saved.relativePath);
              body.meta = {
                ...body.meta,
                file_url: publicUrl,
                file_name: saved.filename,
                file_data: null, // Clear base64 after saving to disk
                file_size: saved.size,
                asset_mime_type: saved.mimeType,
              };
              log.info('[PATCH /node] File saved to disk %s', saved.relativePath);
            } catch (error) {
              log.error({ err: error }, '[PATCH /node] Failed to save file base64 to disk');
              // ⚠️ NEVER store base64 in database!
              throw error;
            }
          }
        }
      }
      
      // ⚠️ FINAL VALIDATION: Strip ALL base64 from meta before saving to DB
      if (body.meta && typeof body.meta === 'object') {
        const stripBase64 = (obj: Record<string, unknown>) => {
          const stripped = { ...obj };
          for (const [key, value] of Object.entries(stripped)) {
            if (typeof value === 'string' && 
                (value.startsWith('data:image/') || 
                 value.startsWith('data:video/') || 
                 value.startsWith('data:application/') ||
                 value.startsWith('data:text/'))) {
              log.warn(`[PATCH /node] WARNING: Stripping base64 from meta.${key}`);
              delete stripped[key];
            }
          }
          
          // If image_path exists but image_url doesn't, generate image_url (FULL HTTPS URL)
          if (stripped.image_path && typeof stripped.image_path === 'string' && !stripped.image_url) {
            stripped.image_url = buildPublicAssetUrl(body.project_id, stripped.image_path);
            log.info('[PATCH /node] Generated full image_url from image_path %s', stripped.image_url);
          }
          
          // Also generate full URLs for all image alias fields
          const imageAliasFields = ['image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image'];
          for (const field of imageAliasFields) {
            if (stripped[field] && typeof stripped[field] === 'string' && (stripped[field] as string).startsWith('/uploads/')) {
              stripped[field] = buildPublicAssetUrl(body.project_id, stripped[field] as string);
            }
          }
          
          return stripped;
        };
        body.meta = stripBase64(body.meta as Record<string, unknown>);
      }
      
      const node = updateNode(body.project_id, nodeId, body, authReq.userId);
      res.json(node);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:nodeId', validateBody<NodeRunRequest>(ajv, runSchema), async (req, res, next) => {
    try {
      const { project_id } = req.body as NodeRunRequest;
      const { nodeId } = req.params;
      const authReq = req as AuthenticatedRequest;
      
      if (!project_id || !nodeId) {
        return res.status(400).json({ message: 'Project ID and Node ID are required' });
      }

      ensureProjectRole(authReq, project_id, ['owner', 'editor']);

      // Delete the node and return updated project
      const updatedProject = deleteProjectNode(project_id, nodeId, authReq.userId);
      res.json(updatedProject);
    } catch (error) {
      next(error);
    }
  });

  // ✅ NEW: Preview AI request payload with current field_mapping configuration
  router.post('/:nodeId/ai/preview-payload', validateBody<NodeRunRequest>(ajv, runSchema), async (req, res, next) => {
    try {
      const { project_id } = req.body as NodeRunRequest;
      const { nodeId } = req.params;
      const authReq = req as AuthenticatedRequest;

      if (!project_id || !nodeId) {
        return res.status(400).json({ message: 'Project ID and Node ID are required' });
      }

      ensureProjectRole(authReq, project_id, ['owner', 'editor', 'viewer']);

      // Get node and project
      const node = getNode(project_id, nodeId);
      if (!node) {
        return res.status(404).json({ message: 'Node not found' });
      }

      const project = getProject(project_id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Get AI context to simulate what executor would do
      const aiConfig = (node.config.ai ?? {}) as Record<string, unknown>;
      const providerId = typeof aiConfig.provider === 'string' ? aiConfig.provider : 'stub';

      // Special handling for Midjourney: build the actual Discord prompt with URLs
      if (providerId === 'midjourney') {
        try {
          const integration = resolveMidjourneyIntegration();
          if (integration) {
            const mjService = new MidjourneyService(integration.relayUrl, integration.token, ajv, integration.mode);
            
            // Collect files from connected nodes for preview
            const files: Array<{ name: string; type: string; content: string; source_node_id?: string; port?: string }> = [];
            
            // Find edges pointing to this node
            const incomingEdges = project.edges.filter(e => e.to === nodeId);
            
            for (const edge of incomingEdges) {
              const sourceNode = getNode(project_id, edge.from);
              if (!sourceNode) continue;
              
              const targetPort = edge.targetHandle || 'context';
              
              if (sourceNode.type === 'image' && sourceNode.meta) {
                const imageUrl = (sourceNode.meta as any).image_url || (sourceNode.meta as any).original_url;
                if (imageUrl) {
                  files.push({
                    name: sourceNode.title,
                    type: 'image',
                    content: imageUrl,
                    source_node_id: sourceNode.node_id,
                    port: targetPort,
                  });
                }
              }
            }
            
            // Build a minimal AiContext to simulate what executor would send
            const context: AiContext = {
              projectId: project_id,
              node: node as StoredNode,
              previousNodes: [],
              nextNodes: [],
              schemaRef: '',
              settings: {},
              files: files,
            };

            // Get the prompt and references that would be sent
            const { prompt, referenceImages, logs: promptLogs } = mjService.queueJob(context);
            
            // Build the full Discord prompt using the service's method
            // This handles all compatibility checks (e.g., --cref not compatible with v7)
            const nodeAny = node as any;
            const aiInputs = typeof nodeAny.ai === 'object' && nodeAny.ai !== null 
              ? nodeAny.ai as Record<string, unknown>
              : {};
            const modelId = typeof nodeAny.ai_model_id === 'string'
              ? nodeAny.ai_model_id
              : undefined;

            const discordPrompt = mjService.buildDiscordPrompt(prompt, referenceImages, aiInputs, modelId);
            const previewPrompt = `/imagine ${discordPrompt}`;

            const previewPayload = {
              provider: providerId,
              node: {
                node_id: node.node_id,
                title: node.title,
                type: node.type,
              },
              midjourney: {
                prompt: previewPrompt,
                referenceImages: referenceImages.map((r) => ({
                  url: r.url,
                  purpose: r.purpose || 'reference',
                })),
                logs: promptLogs,
              },
            };

            return res.json(previewPayload);
          }
        } catch (mjError) {
          // Fallback to generic preview if Midjourney fails
          log.error({ err: mjError }, '[Preview API] Failed to build Midjourney preview');
        }
      }

      // Generic preview for non-Midjourney providers
      const previewPayload = {
        provider: providerId,
        node: {
          node_id: node.node_id,
          title: node.title,
          type: node.type,
        },
        ai_config: {
          // Include field_mapping info
          field_mapping: aiConfig.field_mapping ?? {},
          auto_ports: aiConfig.auto_ports ?? null,
          additional_fields: (aiConfig.field_mapping as any)?.additional_fields ?? {},
          // System prompt info
          system_prompt: aiConfig.system_prompt ?? '',
          system_prompt_source: (aiConfig.field_mapping as any)?.system_prompt_source ?? 'manual',
          system_prompt_target: (aiConfig.field_mapping as any)?.system_prompt_target ?? 'prompt',
          // Output example
          output_example: aiConfig.output_example ?? '',
          output_example_source: (aiConfig.field_mapping as any)?.output_example_source ?? 'manual',
          output_example_target: (aiConfig.field_mapping as any)?.output_example_target ?? 'prompt',
          // Temperature
          temperature: aiConfig.temperature ?? 0.7,
          temperature_source: (aiConfig.field_mapping as any)?.temperature_source ?? 'manual',
          temperature_target: (aiConfig.field_mapping as any)?.temperature_target ?? 'temperature',
          // Other params
          model: aiConfig.model ?? '',
          max_tokens: aiConfig.max_tokens ?? 2000,
          negative_prompt: aiConfig.negative_prompt ?? '',
        },
      };

      res.json(previewPayload);
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
