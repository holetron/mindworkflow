import Ajv from 'ajv';
import * as path from 'path';
import {
  addProjectEdge,
  createProjectNode,
  getNode,
  StoredNode,
  updateNodeMetaSystem,
  createAssetRecord,
} from '../../db';
import type { AiContext } from '../ai';
import { downloadRemoteAsset } from '../../utils/storage';
import { logger } from '../../lib/logger';
import { normalizeUrl, nowIso, maskSecret } from './client';
import { enqueueJob, pollJobStatus, submitUpscale as submitUpscaleClient } from './client';
import { buildDiscordPrompt } from './promptBuilder';
import type {
  MidjourneyIntegrationConfig,
  MidjourneyReferenceImage,
  MidjourneyArtifact,
  MidjourneyJobStatus,
} from './types';

const log = logger.child({ module: 'midjourney' });

export class MidjourneyService {
  private readonly baseUrl: string;

  constructor(
    private readonly relayUrl: string,
    private readonly token: string,
    private readonly ajv: Ajv,
    private readonly mode: 'photo' | 'video' = 'photo',
  ) {
    this.baseUrl = normalizeUrl(relayUrl);
  }

  queueJob(context: AiContext): {
    prompt: string;
    referenceImages: MidjourneyReferenceImage[];
    logs: string[];
    additionalInputs?: Record<string, unknown>;
  } {
    const logs: string[] = [];
    const meta = (context.node.meta ?? {}) as Record<string, unknown>;

    const promptBase =
      typeof context.node.content === 'string' && context.node.content.trim().length > 0
        ? context.node.content.trim()
        : '';
    const modifiers = this.extractPromptModifiers(meta);
    const modifierInputs = modifiers ? this.parseModifiersToInputs(modifiers) : {};

    const referenceImages = this.collectReferenceImages(context);

    const previousContext = this.renderPreviousNodesContext(context.previousNodes).trim();

    const promptParts = [promptBase];
    if (previousContext) {
      promptParts.push(previousContext);
    }

    const prompt = promptParts.filter(Boolean).join('\n\n').trim();
    if (!prompt) {
      throw new Error('Midjourney prompt is empty. Add content or modifiers before queuing the job.');
    }

    log.info('[queueJob] ✅ Reference images %s', referenceImages.length);
    for (let i = 0; i < referenceImages.length; i++) {
      log.info(`[queueJob]   Image ${i}: url=${referenceImages[i].url}, purpose=${referenceImages[i].purpose}`);
    }

    logs.push(`Prompt length: ${prompt.length} characters`);
    logs.push(`Prompt preview: ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);
    logs.push(`Reference images attached: ${referenceImages.length}`);
    logs.push(`Mode: ${this.mode}`);

    return {
      prompt,
      referenceImages,
      logs,
      additionalInputs: modifierInputs,
    };
  }

  collectReferenceImages(context: AiContext): MidjourneyReferenceImage[] {
    const references: MidjourneyReferenceImage[] = [];
    const unique = new Map<string, MidjourneyReferenceImage>();

    log.info('[collectReferenceImages] context.files %s', context.files ? `${context.files.length} files` : 'undefined');
    if (context.files) {
      for (let i = 0; i < context.files.length; i++) {
        log.info(`[collectReferenceImages]   File ${i}: name="${context.files[i].name}", type="${context.files[i].type}", content_length=${context.files[i].content.length}`);
      }
    }

    if (Array.isArray(context.files)) {
      for (const file of context.files) {
        if (!file || typeof file.content !== 'string') {
          continue;
        }
        const trimmed = file.content.trim();
        if (!trimmed) {
          continue;
        }
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          log.info('[collectReferenceImages] ✅ Found image URL %s', trimmed);
          unique.set(trimmed, {
            url: trimmed,
            purpose: file.name || 'reference',
            strength: 0.75,
            source_node_id: file.source_node_id ?? undefined,
          });
        }
      }
    }

    references.push(...unique.values());
    return references;
  }

  async createOrResolveFolder(context: AiContext, jobId: string): Promise<StoredNode> {
    if (!context.projectId) {
      throw new Error('Midjourney folder creation requires a project context.');
    }
    const projectId = context.projectId;
    const meta = (context.node.meta ?? {}) as Record<string, unknown>;
    const existingFolderId =
      typeof meta.output_folder_id === 'string' ? meta.output_folder_id : undefined;

    if (existingFolderId) {
      const existing = getNode(projectId, existingFolderId);
      if (existing) {
        this.updateAiMeta(context, existing.node_id, jobId);
        return existing;
      }
    }

    const targetPosition = this.deriveFolderPosition(context);
    const folderTitle = `Midjourney ${jobId.slice(0, 8)}`;
    const folderMeta: Record<string, unknown> = {
      artifacts: [],
      source_job_id: jobId,
      source_node_id: context.node.node_id,
      created_at: nowIso(),
    };

    const { node: folderNode } = createProjectNode(
      projectId,
      {
        type: 'folder',
        title: folderTitle,
        content: '',
        meta: folderMeta,
      },
      { position: targetPosition },
    );

    addProjectEdge(projectId, {
      from: context.node.node_id,
      to: folderNode.node_id,
    });

    const storedFolder = getNode(projectId, folderNode.node_id);
    if (!storedFolder) {
      throw new Error('Failed to create folder node for Midjourney artifacts');
    }

    this.updateAiMeta(context, storedFolder.node_id, jobId);
    return storedFolder;
  }

  async enqueue(
    payload: {
      prompt: string;
      referenceImages: MidjourneyReferenceImage[];
      additionalInputs?: Record<string, unknown>;
      modelId?: string;
    },
    integration: MidjourneyIntegrationConfig,
  ): Promise<{
    jobId: string;
    status: string;
    raw: unknown;
    preview?: { url: string; body: Record<string, unknown> };
  }> {
    return enqueueJob(
      this.baseUrl,
      this.token,
      payload,
      this.buildDiscordPrompt.bind(this),
    );
  }

  async pollStatus(jobId: string): Promise<MidjourneyJobStatus> {
    return pollJobStatus(
      this.baseUrl,
      this.token,
      jobId,
      this.normalizeArtifact.bind(this),
    );
  }

  async persistArtifacts(
    projectId: string,
    aiNode: StoredNode,
    folderNode: StoredNode,
    jobId: string,
    artifacts: MidjourneyArtifact[],
  ): Promise<MidjourneyArtifact[]> {
    if (!artifacts.length) {
      return [];
    }

    const folderMeta = (folderNode.meta ?? {}) as Record<string, unknown>;
    const existingArtifacts = Array.isArray(folderMeta.artifacts)
      ? (folderMeta.artifacts as MidjourneyArtifact[])
      : [];
    const existingUrls = new Set(existingArtifacts.map((artifact) => artifact.url));

    const mergedArtifacts = [...existingArtifacts];
    for (const artifact of artifacts) {
      if (!artifact.url || existingUrls.has(artifact.url)) {
        continue;
      }

      let storedArtifact: MidjourneyArtifact = {
        ...artifact,
        job_id: jobId,
        created_at: nowIso(),
      };

      if (artifact.url.startsWith('http://') || artifact.url.startsWith('https://')) {
        try {
          const download = await downloadRemoteAsset(projectId, artifact.url, {
            subdir: path.join('midjourney', folderNode.node_id),
          });

          const asset = createAssetRecord({
            projectId,
            nodeId: folderNode.node_id,
            path: download.relativePath,
            meta: {
              mime_type: download.mimeType,
              size: download.size,
              source_url: artifact.url,
              job_id: jobId,
              filename: download.filename,
            },
          });

          storedArtifact = {
            ...storedArtifact,
            filename: download.filename,
            mime_type: download.mimeType,
            size: download.size,
            asset_id: asset.asset_id,
            storage_path: download.relativePath,
            local_url: `/uploads/${projectId}/${download.relativePath}`.replace(/\\/g, '/'),
          };
        } catch (error) {
          log.error({ err: error }, '[Midjourney] Failed to download artifact');
        }
      }

      mergedArtifacts.push(storedArtifact);
      existingUrls.add(artifact.url);
    }

    folderMeta.artifacts = mergedArtifacts;
    folderMeta.updated_at = nowIso();
    updateNodeMetaSystem(projectId, folderNode.node_id, folderMeta);

    const aiMeta = (aiNode.meta ?? {}) as Record<string, unknown>;
    aiMeta.artifacts = mergedArtifacts;
    aiMeta.last_render_completed_at = nowIso();
    updateNodeMetaSystem(projectId, aiNode.node_id, aiMeta);

    return mergedArtifacts;
  }

  buildDiscordPrompt(
    basePrompt: string,
    referenceImages: MidjourneyReferenceImage[],
    inputs: Record<string, unknown>,
    modelId?: string,
  ): string {
    return buildDiscordPrompt(basePrompt, referenceImages, inputs, modelId);
  }

  async submitUpscale(taskId: string, index: number): Promise<{ jobId: string; status: string }> {
    return submitUpscaleClient(this.baseUrl, taskId, index);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractPromptModifiers(meta: Record<string, unknown>): string {
    const rawModifiers = meta.prompt_modifiers;
    if (Array.isArray(rawModifiers)) {
      return rawModifiers.filter((item) => typeof item === 'string').join('\n');
    }
    if (typeof rawModifiers === 'string') {
      return rawModifiers;
    }
    return '';
  }

  private parseModifiersToInputs(modifiers: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    const lines = modifiers.split('\n').map(l => l.trim()).filter(l => l.startsWith('--'));
    for (const line of lines) {
      const match = line.match(/^--(\w+)\s+(.+)$/);
      if (match) {
        const [, key, value] = match;
        inputs[key] = value;
      } else {
        const flagMatch = line.match(/^--(\w+)$/);
        if (flagMatch) {
          inputs[flagMatch[1]] = true;
        }
      }
    }
    return inputs;
  }

  private renderPreviousNodesContext(previousNodes: StoredNode[]): string {
    const blocks: string[] = [];
    for (const node of previousNodes) {
      if (node.type === 'video') {
        continue;
      }

      if (typeof node.content === 'string' && node.content.trim()) {
        blocks.push(`Ref ${node.title || node.node_id}:\n${node.content.trim()}`);
      }
    }
    return blocks.join('\n\n');
  }

  private pickImageUrlFromMeta(meta: Record<string, unknown>): string | undefined {
    if (typeof meta.image_url === 'string') {
      return meta.image_url;
    }
    if (typeof meta.url === 'string') {
      return meta.url;
    }
    if (
      meta.files &&
      Array.isArray(meta.files) &&
      meta.files.length > 0 &&
      typeof (meta.files as unknown[])[0] === 'object'
    ) {
      const first = (meta.files as Array<Record<string, unknown>>)[0];
      if (typeof first.url === 'string') {
        return first.url;
      }
    }
    return undefined;
  }

  private deriveFolderPosition(context: AiContext): { x: number; y: number } {
    const bbox = context.node.ui?.bbox;
    if (bbox) {
      return {
        x: Math.round(bbox.x2 + 160),
        y: Math.round(bbox.y1),
      };
    }
    return { x: 0, y: 0 };
  }

  private updateAiMeta(context: AiContext, folderId: string, jobId: string): void {
    if (!context.projectId) {
      return;
    }
    const nextMeta = {
      ...((context.node.meta ?? {}) as Record<string, unknown>),
      output_folder_id: folderId,
      midjourney_job_id: jobId,
    };
    updateNodeMetaSystem(context.projectId, context.node.node_id, nextMeta);
    context.node.meta = nextMeta;
  }

  private normalizeArtifact(candidate: unknown, jobId: string): MidjourneyArtifact | null {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }
    const artifact = candidate as Record<string, unknown>;
    if (typeof artifact.url !== 'string' || !artifact.url) {
      return null;
    }
    return {
      url: artifact.url,
      filename: typeof artifact.filename === 'string' ? artifact.filename : undefined,
      mime_type: typeof artifact.mime_type === 'string' ? artifact.mime_type : undefined,
      width: typeof artifact.width === 'number' ? artifact.width : undefined,
      height: typeof artifact.height === 'number' ? artifact.height : undefined,
      job_id: jobId,
      source: typeof artifact.source === 'string' ? artifact.source : undefined,
      created_at: nowIso(),
    };
  }
}
