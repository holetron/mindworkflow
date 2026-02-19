import Ajv from 'ajv';
import * as path from 'path';
import {
  addProjectEdge,
  createProjectNode,
  getNode,
  StoredNode,
  updateNodeMetaSystem,
  db,
  createAssetRecord,
} from '../db';
import type { AiContext } from './ai';
import { downloadRemoteAsset } from '../utils/storage';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'midjourney' });
export interface MidjourneyIntegrationConfig {
  relayUrl: string;
  token: string;
  integrationId: string;
  userId?: string;
  name?: string;
  mode: 'photo' | 'video';
}

export interface MidjourneyReferenceImage {
  url: string;
  purpose?: string;
  strength?: number;
  source_node_id?: string;
}

export interface MidjourneyArtifact {
  url: string;
  filename?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  job_id?: string;
  source?: string;
  created_at?: string;
  size?: number;
  asset_id?: string;
  storage_path?: string;
  local_url?: string;
}

export interface MidjourneyJobStatus {
  status: string;
  jobId: string;
  progress?: number;
  artifacts: MidjourneyArtifact[];
  raw: unknown;
  error?: string;
}

export function resolveMidjourneyIntegration(): MidjourneyIntegrationConfig | null {
  try {
    log.info('[Midjourney] Resolving integration from database...');
    const row = db
      .prepare(
        `SELECT integration_id as id, config_json as config, name, updated_at, user_id
         FROM global_integrations
         WHERE type = ? AND enabled = 1
         ORDER BY datetime(updated_at) DESC
         LIMIT 1`,
      )
      .get('midjourney_mindworkflow_relay') as
      | { id: string; config: string | null; name?: string | null; user_id?: string | null }
      | undefined;

    log.info({ data: {
      found: !!row,
      hasConfig: row?.config ? 'yes' : 'no',
      configLength: row?.config?.length || 0
    } }, '[Midjourney] Query result');

    if (!row) {
      const disabledRow = db
        .prepare(
          `SELECT enabled FROM global_integrations
             WHERE type = ?
             ORDER BY datetime(updated_at) DESC
             LIMIT 1`,
        )
        .get('midjourney_mindworkflow_relay') as { enabled?: number } | undefined;
      if (disabledRow && disabledRow.enabled === 0) {
        throw new Error('Midjourney Relay integration is disabled by administrator');
      }
      return null;
    }

    const parsedConfig = row.config ? safeJsonParse<Record<string, unknown>>(row.config, {}) : {};
    
    // Resolve relay URL (default to mindworkflow hosted relay)
    let relayUrl =
      typeof parsedConfig.baseUrl === 'string' && parsedConfig.baseUrl.trim()
        ? parsedConfig.baseUrl.trim()
        : typeof parsedConfig.relayUrl === 'string' && parsedConfig.relayUrl.trim()
          ? parsedConfig.relayUrl.trim()
          : 'https://relay.mindworkflow.com';
    
    // Remove trailing slash
    if (relayUrl.endsWith('/')) {
      relayUrl = relayUrl.slice(0, -1);
    }
    
    const token =
      typeof parsedConfig.apiKey === 'string' && parsedConfig.apiKey.trim()
        ? parsedConfig.apiKey.trim()
        : typeof parsedConfig.authToken === 'string' && parsedConfig.authToken.trim()
          ? parsedConfig.authToken.trim()
          : '';
    
    // Resolve mode from config (photo by default)
    const mode: 'photo' | 'video' = 
      typeof parsedConfig.midjourney_mode === 'string' && parsedConfig.midjourney_mode === 'video' 
        ? 'video' 
        : 'photo';

    if (!token) {
      log.error({ detail: {
        hasApiKey: !!parsedConfig.apiKey,
        hasAuthToken: !!parsedConfig.authToken,
        configKeys: Object.keys(parsedConfig)
      } }, '[Midjourney] No Discord token found in config');
      throw new Error('Midjourney Relay integration is missing Discord User Token');
    }

    log.info({ data: {
      relayUrl,
      hasToken: !!token,
      tokenPreview: token.substring(0, 10) + '***',
      mode
    } }, '[Midjourney] Resolved config');

    return {
      relayUrl,
      token,
      integrationId: row.id,
      userId: row.user_id ?? undefined,
      name: row.name ?? undefined,
      mode,
    };
  } catch (error) {
    log.error({ err: error }, '[Midjourney] Failed to resolve integration');
    throw error;
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function maskSecret(secret: string): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= 8) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function normalizeUrl(base: string): string {
  return base.replace(/\/+$/, '');
}

function ensureAbsoluteUrl(baseUrl: string, pathSegment: string): string {
  try {
    return new URL(pathSegment, `${normalizeUrl(baseUrl)}/`).toString();
  } catch {
    return `${normalizeUrl(baseUrl)}/${pathSegment.replace(/^\/+/, '')}`;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

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

    // Контекст добавляется ТОЛЬКО если явно подключен к порту "context"
    // Не добавляем автоматически все previousNodes - это их функция collectReferenceImages

    const previousContext = this.renderPreviousNodesContext(context.previousNodes).trim();

    const promptParts = [promptBase];
    // Modifiers are parsed into inputs as flags, not added to prompt text
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

    // ВАЖНО: Добавляем только изображения из files - они уже отфильтрованы в AiService
    // через специальные порты (reference_image, style_prompt, clip_prompt, context)
    // Не нужно добавлять ВСЕ previousNodes автоматически
    
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

    // НЕ добавляем previousNodes автоматически - только через context.files
    // которые уже отфильтрованы по media портам в collectFilesFromPreviousNodes
    // Это предотвращает добавление video URLs и других нежелательных файлов

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
    // Build Discord prompt from base prompt, references, and parameters
    const discordPrompt = this.buildDiscordPrompt(
      payload.prompt,
      payload.referenceImages,
      payload.additionalInputs || {},
      payload.modelId,
    );

    // Midjourney Relay API: use /mj/submit/imagine endpoint
    // The API expects a simple JSON with just "prompt" field
    const submitUrl = `${this.baseUrl}/mj/submit/imagine`;
    const body: Record<string, unknown> = {
      prompt: discordPrompt,
    };

    // Build a preview version of the request that better reflects what the UI
    // should show. The Relay endpoint itself expects the prompt without the
    // leading `/imagine`, but for previewing we include it so the user sees
    // the Discord-style command (e.g. `/imagine Happy Bullterrier --v 7`).
    const previewPrompt = `/imagine ${discordPrompt}`;
    const previewBody = { prompt: previewPrompt };

    // Log API request preview for debugging — include full prompt and any
    // attached reference image URLs so the UI or logs can display them.
    log.info({ data: JSON.stringify(
        {
          url: submitUrl,
          method: 'POST',
          body: previewBody,
          referenceImages: payload.referenceImages || [],
          tokenMasked: maskSecret(this.token),
        },
        null,
        2,
      ) }, '[Midjourney API Request Preview]');

    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        'mj-api-secret': this.token,
      },
      body: JSON.stringify(body),
    });

    log.info(`[Midjourney Relay HTTP Status] ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Relay error');
      log.error({ detail: errorText }, '[Midjourney Relay Error Response]');
      throw new Error(
        `Midjourney Relay returned ${response.status}: ${errorText} (token ${maskSecret(this.token)})`,
      );
    }

    const data = await response.json().catch(() => ({}));
    
    // DEBUG: Log full relay response
    log.info({ data: JSON.stringify(data, null, 2) }, '[Midjourney Relay Response]');
    
    // Parse midjourney-proxy response format:
    // Success: {code: 1, description: "成功", result: "task_id"}
    // Queue: {code: 22, description: "排队中...", result: "task_id"}
    const dataObj = data as Record<string, unknown>;
    const code = typeof dataObj.code === 'number' ? dataObj.code : 0;
    const description = typeof dataObj.description === 'string' ? dataObj.description : '';
    
    // Job ID is in "result" field
    const jobId = typeof dataObj.result === 'string' ? dataObj.result : '';

    // Status mapping from code
    let status = 'queued';
    if (code === 1) {
      status = 'submitted';
    } else if (code === 21) {
      status = 'exists'; // Task already exists
    } else if (code === 22) {
      status = 'queued';
    } else if (code === 23) {
      status = 'queue_full';
    } else if (code === 24) {
      status = 'banned_prompt';
    }

    if (!jobId) {
      log.error({ detail: data }, '[Midjourney Relay Error] Response missing result (job_id)');
      throw new Error(`Midjourney Relay error: ${description || 'missing job_id'}`);
    }
    
    log.info(`[Midjourney Relay Success] Job ID: ${jobId}, Status: ${status}, Code: ${code}`);

    return {
      jobId,
      status,
      raw: data,
      // Include the preview body so callers can surface the exact preview
      // request that should be shown to users. This is optional and
      // non-breaking for existing callers that ignore it.
      preview: {
        url: submitUrl,
        body: previewBody,
      },
    };
  }

  async pollStatus(jobId: string): Promise<MidjourneyJobStatus> {
    const endpoint = `${this.baseUrl}/mj/task/${jobId}/fetch`;
    log.info('[Midjourney] Polling status %s', endpoint);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Relay error');
      throw new Error(
        `Failed to poll Midjourney status (${response.status}): ${errorText} (token ${maskSecret(this.token)})`,
      );
    }

    const data = await response.json().catch(() => ({}));
    log.info({ data: JSON.stringify(data).substring(0, 300) }, '[Midjourney] Poll response');
    
    const status =
      typeof (data as Record<string, unknown>).status === 'string'
        ? ((data as Record<string, unknown>).status as string)
        : 'unknown';
    const progress =
      typeof (data as Record<string, unknown>).progress === 'number'
        ? ((data as Record<string, unknown>).progress as number)
        : typeof (data as Record<string, unknown>).progress === 'string'
          ? parseInt((data as Record<string, unknown>).progress as string, 10)
          : undefined;
    
    // Check for artifacts array or single imageUrl
    const artifactsArray = Array.isArray((data as Record<string, unknown>).artifacts)
      ? ((data as Record<string, unknown>).artifacts as unknown[])
      : [];
    
    // If no artifacts but imageUrl exists, create single artifact
    if (artifactsArray.length === 0 && (data as Record<string, unknown>).imageUrl) {
      artifactsArray.push({
        url: (data as Record<string, unknown>).imageUrl,
        type: 'image',
      });
    }
    
    const artifacts = artifactsArray
      .map((item) => this.normalizeArtifact(item, jobId))
      .filter((item): item is MidjourneyArtifact => item !== null);

    const errorMessage =
      typeof (data as Record<string, unknown>).error === 'string'
        ? ((data as Record<string, unknown>).error as string)
        : undefined;

    return {
      status,
      jobId,
      progress,
      artifacts,
      raw: data,
      error: errorMessage,
    };
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
    const parts: string[] = [];

    // REMOVED: /imagine is added by the API endpoint, not in the prompt
    // parts.push('/imagine');

    // 2. Separate reference images into categories based on purpose/source
    // Image Prompt (основной визуальный референс) - идёт в начале промпта
    const imagePromptUrls: string[] = [];
    // Style References - для копирования визуального стиля
    const styleRefUrls: string[] = [];
    // Character References - для строгой передачи персонажа через --cref
    const charRefUrls: string[] = [];

    log.info({ referenceImageCount: referenceImages.length }, 'buildDiscordPrompt starting');

    for (const ref of referenceImages) {
      const purpose = (ref.purpose || '').toLowerCase();
      log.info(`[buildDiscordPrompt]   Classifying: url=${ref.url.substring(0, 60)}..., purpose="${purpose}"`);
      
      // Классификация по названию порта
      if (purpose === 'character_reference' || purpose.includes('character') || purpose.includes('char') || purpose === 'omni') {
        charRefUrls.push(ref.url);
        log.info('[buildDiscordPrompt]     → Character reference (--cref flag)');
      } else if (purpose === 'style_reference' || purpose.includes('style')) {
        styleRefUrls.push(ref.url);
        log.info('[buildDiscordPrompt]     → Style reference (перед текстом)');
      } else if (purpose === 'image_prompt' || purpose === 'reference_image' || purpose.includes('reference') || purpose.includes('image')) {
        // Image Prompt - основное визуальное изображение
        imagePromptUrls.push(ref.url);
        log.info('[buildDiscordPrompt]     → Image prompt (в начале)');
      } else {
        // По умолчанию - основное изображение
        imagePromptUrls.push(ref.url);
        log.info('[buildDiscordPrompt]     → Default to Image prompt');
      }
    }

    log.info(`[buildDiscordPrompt] Classified: ${imagePromptUrls.length} image prompts, ${styleRefUrls.length} style refs, ${charRefUrls.length} char refs`);

    // 3. Add Image Prompt URLs (основной визуальный референс сразу после /imagine)
    for (const url of imagePromptUrls) {
      parts.push(url);
    }

    // 4. Add Style Reference URLs (перед текстом промпта)
    for (const url of styleRefUrls) {
      parts.push(url);
    }

    // 5. Add base text description
    parts.push(basePrompt);

    // 6. Build Discord parameters as flags
    const flags: string[] = [];

    // Extract version from model ID (e.g., 'midjourney-v7' -> '7', 'midjourney-niji-6' -> 'niji 6')
    let detectedVersion = '';
    if (modelId) {
      const versionMatch = modelId.match(/midjourney-(v[\d.]+|niji-\d+)/);
      if (versionMatch) {
        const version = versionMatch[1];
        detectedVersion = version;
        if (version.startsWith('niji-')) {
          // niji-6 -> --niji 6
          flags.push(`--${version.replace('-', ' ')}`);
        } else {
          // v7, v6.1, v5.2 -> --v 7, --v 6.1, --v 5.2
          flags.push(`--v ${version.substring(1)}`);
        }
      }
    }

    // Mode: raw -> --style raw (only if not standard/default)
    if (inputs.mode === 'raw') {
      flags.push('--style raw');
    }

    // Aspect ratio: landscape -> --ar 3:2
    const aspectRatioMap: Record<string, string> = {
      'portrait': '2:3',
      'square': '1:1',
      'landscape': '3:2',
    };
    if (typeof inputs.aspect_ratio === 'string' && aspectRatioMap[inputs.aspect_ratio]) {
      flags.push(`--ar ${aspectRatioMap[inputs.aspect_ratio]}`);
    }

    // Stylization: number -> --s 500 (only if not default 100)
    if (typeof inputs.stylization === 'number' && inputs.stylization !== 100) {
      flags.push(`--s ${inputs.stylization}`);
    }

    // Weirdness: number -> --w 1000 (only if > 0)
    if (typeof inputs.weirdness === 'number' && inputs.weirdness > 0) {
      flags.push(`--w ${inputs.weirdness}`);
    }

    // Variety: number -> --vary 50 (if supported)
    if (typeof inputs.variety === 'number' && inputs.variety > 0) {
      flags.push(`--vary ${inputs.variety}`);
    }

    // Speed: turbo -> --turbo, fast -> --fast, relax -> --relax
    if (inputs.speed === 'turbo') {
      flags.push('--turbo');
    } else if (inputs.speed === 'fast') {
      flags.push('--fast');
    } else if (inputs.speed === 'relax') {
      flags.push('--relax');
    }

    // 7. Add Character References as --cref parameters (at the end)
    // NOTE: --cref is NOT compatible with --v 7, only works with v6.1, v6, v5.2 and earlier
    // If version is 7 (or niji), skip --cref to avoid "Invalid parameter" error
    const isCrefUnsupported =
      detectedVersion.startsWith('v7') || detectedVersion.startsWith('niji-');
    
    if (charRefUrls.length > 0 && !isCrefUnsupported) {
      // Format: --cref url1 url2 url3 --cw 80
      flags.push(`--cref ${charRefUrls.join(' ')}`);
      // Add character weight if available
      if (typeof inputs.character_weight === 'number') {
        flags.push(`--cw ${inputs.character_weight}`);
      } else {
        // Default character weight
        flags.push('--cw 80');
      }
    } else if (charRefUrls.length > 0) {
      log.info(
        `[buildDiscordPrompt] ⚠️ Skipping --cref flag (${charRefUrls.length} character refs) ` +
        `because --cref is not compatible with version "${detectedVersion}". ` +
        `Character references require v6.1 or earlier.`
      );
    }

    // 8. Add all flags if any exist
    if (flags.length > 0) {
      parts.push(flags.join(' '));
    }

    // Build final Discord prompt by joining all parts with spaces
    const finalPrompt = parts.filter((p) => p && p.trim().length > 0).join(' ');
    log.info('[buildDiscordPrompt] ✅ Final Discord prompt:');
    log.info('[buildDiscordPrompt] %s', finalPrompt);
    return finalPrompt;
  }

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
        // For flags without value, like --v 6
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
      // Skip video nodes - их content содержит video URL который нельзя использовать как image reference
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

  async submitUpscale(taskId: string, index: number): Promise<{ jobId: string; status: string }> {
    log.info(`[Midjourney] Submitting upscale for task ${taskId}, variant ${index}`);
    
    const response = await fetch(`${this.baseUrl}/mj/submit/change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId,
        action: 'UPSCALE',
        index,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Relay error');
      throw new Error(`Midjourney upscale failed (${response.status}): ${errorText}`);
    }

    const data = await response.json().catch(() => ({}));
    const jobId =
      typeof (data as Record<string, unknown>).result === 'string'
        ? ((data as Record<string, unknown>).result as string)
        : '';
    const status = 'queued';

    if (!jobId) {
      throw new Error('Midjourney upscale response is missing job_id');
    }

    return { jobId, status };
  }
}
