import type { Request, Response, NextFunction } from 'express';
import type Ajv from 'ajv';
import { ExecutorService } from '../services/executor';
import { TransformerService } from '../services/transformerService';
import {
  cloneNode, createProjectNode, getNode, getNodeRuns, updateNode,
  deleteProjectNode, getProject, updateNodeMetaSystem,
  type StoredNode,
} from '../db';
import { AuthenticatedRequest } from '../middleware/auth';
import { MidjourneyService, resolveMidjourneyIntegration, type MidjourneyArtifact } from '../services/midjourney';
import { assignNodeToFolder, removeNodeFromFolder } from '../services/folder';
import type { AiContext } from '../services/ai';
import { autoDownloadMediaIfNeeded, hasUrlChanged } from '../services/mediaDownloader';
import { saveBase64Asset } from '../utils/storage';
import { buildPublicAssetUrl } from '../utils/assetUrls';
import {
  safeParse, prepareMediaMetaForDownload, ensureProjectRole, stripBase64FromMeta,
} from './nodesHelpers';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'controllers/nodes' });

export function createNodesController(ajv: Ajv) {
  const executor = new ExecutorService(ajv);
  const transformer = new TransformerService();

  return {
    async create(req: Request, res: Response, next: NextFunction) {
      try {
        const body = req.body;
        ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
        const { project_id, position, ui, connections, ...rest } = body;
        let meta = rest.meta;
        if (meta && (rest.type === 'image' || rest.type === 'video')) {
          const preparedMeta = prepareMediaMetaForDownload(meta, rest.type) ?? meta;
          meta = (await autoDownloadMediaIfNeeded(project_id, rest.type, preparedMeta)).updatedMeta;
        }
        if (meta && rest.type === 'pdf' && typeof (meta as any)?.pdf_data === 'string') {
          const pdfData = (meta as any).pdf_data.trim();
          if (pdfData.startsWith('data:')) {
            const saved = await saveBase64Asset(project_id, pdfData, { subdir: 'uploads/pdfs' });
            meta = { ...meta, pdf_url: `/uploads/${project_id}/${saved.relativePath}`.replace(/\\/g, '/'), pdf_file: saved.filename, pdf_data: null };
          }
        }
        if (meta && rest.type === 'file' && typeof (meta as any)?.file_data === 'string') {
          const fileData = (meta as any).file_data.trim();
          if (fileData.startsWith('data:')) {
            const saved = await saveBase64Asset(project_id, fileData, { subdir: 'uploads/files' });
            meta = { ...meta, file_url: `/uploads/${project_id}/${saved.relativePath}`.replace(/\\/g, '/'), file_name: saved.filename, file_data: null, file_size: saved.size, asset_mime_type: saved.mimeType };
          }
        }
        if (meta && typeof meta === 'object') meta = stripBase64FromMeta(meta, project_id);
        const { node, updated_at } = createProjectNode(project_id, { ...rest, meta, ui: ui ?? undefined, connections: connections ?? undefined }, {
          position: position && typeof position.x === 'number' && typeof position.y === 'number' ? { x: position.x, y: position.y } : undefined,
        });
        res.status(201).json({ node, project_updated_at: updated_at });
      } catch (error) { next(error); }
    },

    async splitPreview(req: Request, res: Response, next: NextFunction) {
      try {
        const body = req.body;
        ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
        const config = body.config ? { separator: body.config.separator || '---', subSeparator: body.config.subSeparator || '-', namingMode: body.config.namingMode || 'auto' } : undefined;
        const preview = await transformer.previewTextSplit(body.project_id, req.params.nodeId, { content: body.content ?? undefined, config, manualTitles: body.manual_titles ?? undefined });
        res.json({ preview });
      } catch (error) { next(error); }
    },

    async split(req: Request, res: Response, next: NextFunction) {
      try {
        const body = req.body;
        ensureProjectRole(req as AuthenticatedRequest, body.project_id, ['owner', 'editor']);
        const config = body.config ? { separator: body.config.separator || '---', subSeparator: body.config.subSeparator || '-', namingMode: body.config.namingMode || 'auto' } : undefined;
        const result = await transformer.splitTextNode(body.project_id, req.params.nodeId, { content: body.content ?? undefined, config, manualTitles: body.manual_titles ?? undefined });
        res.json({ created_nodes: result.createdNodes, node_snapshots: result.nodeSnapshots, edges: result.edges, logs: result.logs, preview: result.preview, project_updated_at: result.projectUpdatedAt });
      } catch (error) { next(error); }
    },

    async run(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id, ...overrideInputs } = req.body;
        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
        const actorUserId = (req as AuthenticatedRequest).userId ?? null;
        res.json(await executor.runNode(project_id, req.params.nodeId, { actorUserId, overrideInputs }));
      } catch (error) { next(error); }
    },

    async rerun(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id, clone, include_subnodes } = req.body;
        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
        const actorUserId = (req as AuthenticatedRequest).userId ?? null;
        let targetNodeId = req.params.nodeId;
        if (clone) { targetNodeId = cloneNode(project_id, targetNodeId, Boolean(include_subnodes)).node_id; }
        const result = await executor.runNode(project_id, targetNodeId, { actorUserId });
        res.json({ ...result, cloned: clone ?? false, targetNodeId });
      } catch (error) { next(error); }
    },

    async folderAdd(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id, node_id, folder_id, index } = req.body;
        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
        const result = assignNodeToFolder({ projectId: project_id, nodeId: node_id, folderId: folder_id, index, userId: (req as AuthenticatedRequest).userId ?? undefined });
        res.json({ status: 'ok', project_id, folder_id, node_id, folder_children: result.folderChildren });
      } catch (error) { next(error); }
    },

    async folderRemove(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id, node_id, folder_id, position } = req.body;
        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
        const result = removeNodeFromFolder({ projectId: project_id, nodeId: node_id, folderId: folder_id ?? null, position, userId: (req as AuthenticatedRequest).userId ?? undefined });
        res.json({ status: 'ok', project_id, folder_id: result.folderId, node_id, folder_children: result.folderChildren });
      } catch (error) { next(error); }
    },

    async midjourneyStatus(req: Request, res: Response) {
      try {
        const { project_id, node_id, job_id } = req.body;
        ensureProjectRole(req as AuthenticatedRequest, project_id, ['owner', 'editor']);
        const aiNode = getNode(project_id, node_id);
        if (!aiNode) { res.status(404).json({ error: 'Node not found' }); return; }
        if (aiNode.type !== 'ai' && aiNode.type !== 'ai_improved') { res.status(400).json({ error: 'Node is not an AI node' }); return; }
        const integration = resolveMidjourneyIntegration();
        if (!integration) { res.status(400).json({ error: 'Midjourney Relay integration is not configured' }); return; }
        const service = new MidjourneyService(integration.relayUrl, integration.token, ajv, integration.mode);
        const status = await service.pollStatus(job_id);
        const aiContext = { projectId: project_id, node: aiNode, previousNodes: [], nextNodes: [], schemaRef: 'TEXT_RESPONSE', settings: {} } as AiContext;
        const nodeMeta = (aiNode.meta ?? {}) as Record<string, unknown>;
        const existingFolderId = typeof nodeMeta.output_folder_id === 'string' ? nodeMeta.output_folder_id : undefined;
        let folderNode: StoredNode;
        if (existingFolderId) { const resolved = getNode(project_id, existingFolderId); folderNode = resolved ?? (await service.createOrResolveFolder(aiContext, job_id)); }
        else { folderNode = await service.createOrResolveFolder(aiContext, job_id); }
        let persistedArtifacts: MidjourneyArtifact[] = [];
        if (status.artifacts.length > 0) {
          persistedArtifacts = await service.persistArtifacts(project_id, aiNode, folderNode, job_id, status.artifacts);
          const refreshedFolder = getNode(project_id, folderNode.node_id);
          if (refreshedFolder) folderNode = refreshedFolder;
        }
        updateNodeMetaSystem(project_id, aiNode.node_id, { ...nodeMeta, output_folder_id: folderNode.node_id, midjourney_status: status.status, job_progress: status.progress ?? undefined, last_polled_at: new Date().toISOString() } as Record<string, unknown>);
        res.json({ status: status.status, job_id, progress: status.progress ?? null, artifacts: persistedArtifacts, folder_id: folderNode.node_id, error: status.error ?? null });
      } catch (error) { log.error({ err: error }, '[Midjourney] Status polling failed'); res.status(500).json({ error: (error as Error).message }); }
    },

    async getLogs(req: Request, res: Response, next: NextFunction) {
      try {
        const projectId = String(req.query.project_id ?? '');
        if (!projectId) { const e = new Error('project_id query parameter is required'); (e as any).status = 400; throw e; }
        ensureProjectRole(req as AuthenticatedRequest, projectId, ['owner', 'editor', 'viewer']);
        res.json(getNodeRuns(projectId, req.params.nodeId).map((run) => ({ ...run, logs: safeParse(run.logs_json) })));
      } catch (error) { next(error); }
    },

    async update(req: Request, res: Response, next: NextFunction) {
      try {
        const { nodeId } = req.params;
        const body = req.body;
        const authReq = req as AuthenticatedRequest;
        ensureProjectRole(authReq, body.project_id, ['owner', 'editor']);
        if (body.meta) {
          const existingNode = getNode(body.project_id, nodeId);
          if (existingNode && (existingNode.type === 'image' || existingNode.type === 'video')) {
            const urlField = existingNode.type === 'image' ? 'image_url' : 'video_url';
            const mergedMeta = { ...(existingNode.meta ?? {}), ...body.meta } as Record<string, unknown>;
            if (existingNode.type === 'image') {
              const imageBase64Fields = ['image_data', 'image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image'];
              for (const field of imageBase64Fields) {
                const bv = mergedMeta[field];
                if (typeof bv === 'string' && bv.trim().toLowerCase().startsWith('data:image/')) {
                  const saved = await saveBase64Asset(body.project_id, bv, { subdir: 'images' });
                  const publicUrl = buildPublicAssetUrl(body.project_id, saved.relativePath);
                  body.meta = { ...body.meta, image_url: publicUrl, image_file: saved.filename, image_path: saved.relativePath, image_size: saved.size } as Record<string, unknown>;
                  imageBase64Fields.forEach(f => { if (body.meta) (body.meta as Record<string, unknown>)[f] = null; });
                  break;
                }
              }
            }
            const preparedMeta = prepareMediaMetaForDownload(mergedMeta, existingNode.type) ?? mergedMeta;
            if (hasUrlChanged(preparedMeta[urlField], existingNode.meta?.[urlField])) {
              body.meta = (await autoDownloadMediaIfNeeded(body.project_id, existingNode.type, preparedMeta)).updatedMeta;
            }
          }
          const existingNode2 = getNode(body.project_id, nodeId);
          if (existingNode2?.type === 'pdf' && typeof (body.meta as any)?.pdf_data === 'string') {
            const pdfData = (body.meta as any).pdf_data.trim();
            if (pdfData.startsWith('data:')) {
              const saved = await saveBase64Asset(body.project_id, pdfData, { subdir: 'uploads/pdfs' });
              body.meta = { ...body.meta, pdf_url: buildPublicAssetUrl(body.project_id, saved.relativePath), pdf_file: saved.filename, pdf_data: null };
            }
          }
          if (existingNode2?.type === 'file' && typeof (body.meta as any)?.file_data === 'string') {
            const fileData = (body.meta as any).file_data.trim();
            if (fileData.startsWith('data:')) {
              const saved = await saveBase64Asset(body.project_id, fileData, { subdir: 'uploads/files' });
              body.meta = { ...body.meta, file_url: buildPublicAssetUrl(body.project_id, saved.relativePath), file_name: saved.filename, file_data: null, file_size: saved.size, asset_mime_type: saved.mimeType };
            }
          }
        }
        if (body.meta && typeof body.meta === 'object') body.meta = stripBase64FromMeta(body.meta as Record<string, unknown>, body.project_id);
        res.json(updateNode(body.project_id, nodeId, body, authReq.userId));
      } catch (error) { next(error); }
    },

    async remove(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id } = req.body;
        const { nodeId } = req.params;
        const authReq = req as AuthenticatedRequest;
        if (!project_id || !nodeId) return res.status(400).json({ message: 'Project ID and Node ID are required' });
        ensureProjectRole(authReq, project_id, ['owner', 'editor']);
        res.json(deleteProjectNode(project_id, nodeId, authReq.userId));
      } catch (error) { next(error); }
    },

    async previewAiPayload(req: Request, res: Response, next: NextFunction) {
      try {
        const { project_id } = req.body;
        const { nodeId } = req.params;
        const authReq = req as AuthenticatedRequest;
        if (!project_id || !nodeId) return res.status(400).json({ message: 'Project ID and Node ID are required' });
        ensureProjectRole(authReq, project_id, ['owner', 'editor', 'viewer']);
        const node = getNode(project_id, nodeId);
        if (!node) return res.status(404).json({ message: 'Node not found' });
        const project = getProject(project_id);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        const aiConfig = (node.config.ai ?? {}) as Record<string, unknown>;
        const providerId = typeof aiConfig.provider === 'string' ? aiConfig.provider : 'stub';
        if (providerId === 'midjourney') {
          try {
            const integration = resolveMidjourneyIntegration();
            if (integration) {
              const mjService = new MidjourneyService(integration.relayUrl, integration.token, ajv, integration.mode);
              const files: Array<{ name: string; type: string; content: string; source_node_id?: string; port?: string }> = [];
              for (const edge of project.edges.filter(e => e.to === nodeId)) {
                const sourceNode = getNode(project_id, edge.from);
                if (!sourceNode) continue;
                if (sourceNode.type === 'image' && sourceNode.meta) {
                  const imageUrl = (sourceNode.meta as any).image_url || (sourceNode.meta as any).original_url;
                  if (imageUrl) files.push({ name: sourceNode.title, type: 'image', content: imageUrl, source_node_id: sourceNode.node_id, port: edge.targetHandle || 'context' });
                }
              }
              const context: AiContext = { projectId: project_id, node: node as StoredNode, previousNodes: [], nextNodes: [], schemaRef: '', settings: {}, files };
              const { prompt, referenceImages, logs: promptLogs } = mjService.queueJob(context);
              const nodeAny = node as any;
              const aiInputs = typeof nodeAny.ai === 'object' && nodeAny.ai !== null ? nodeAny.ai as Record<string, unknown> : {};
              const modelId = typeof nodeAny.ai_model_id === 'string' ? nodeAny.ai_model_id : undefined;
              return res.json({
                provider: providerId, node: { node_id: node.node_id, title: node.title, type: node.type },
                midjourney: { prompt: `/imagine ${mjService.buildDiscordPrompt(prompt, referenceImages, aiInputs, modelId)}`, referenceImages: referenceImages.map(r => ({ url: r.url, purpose: r.purpose || 'reference' })), logs: promptLogs },
              });
            }
          } catch (mjError) { log.error({ err: mjError }, '[Preview API] Failed to build Midjourney preview'); }
        }
        const fm = aiConfig.field_mapping as any;
        res.json({
          provider: providerId, node: { node_id: node.node_id, title: node.title, type: node.type },
          ai_config: {
            field_mapping: aiConfig.field_mapping ?? {}, auto_ports: aiConfig.auto_ports ?? null,
            additional_fields: fm?.additional_fields ?? {},
            system_prompt: aiConfig.system_prompt ?? '', system_prompt_source: fm?.system_prompt_source ?? 'manual', system_prompt_target: fm?.system_prompt_target ?? 'prompt',
            output_example: aiConfig.output_example ?? '', output_example_source: fm?.output_example_source ?? 'manual', output_example_target: fm?.output_example_target ?? 'prompt',
            temperature: aiConfig.temperature ?? 0.7, temperature_source: fm?.temperature_source ?? 'manual', temperature_target: fm?.temperature_target ?? 'temperature',
            model: aiConfig.model ?? '', max_tokens: aiConfig.max_tokens ?? 2000, negative_prompt: aiConfig.negative_prompt ?? '',
          },
        });
      } catch (error) { next(error); }
    },
  };
}
