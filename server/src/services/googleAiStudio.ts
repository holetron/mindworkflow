import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  addProjectEdge,
  createProjectNode,
  getNode,
  StoredNode,
  updateNodeMetaSystem,
  createAssetRecord,
} from '../db';
import type { AiContext } from './ai';
import { saveBase64Asset } from '../utils/storage';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'googleAiStudio' });
import {
  getLatestEnabledIntegrationByProvider,
  getLatestIntegrationByProvider,
} from './integrationRepository';

export interface GoogleAiStudioIntegrationConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  mode: 'image' | 'text';
  integrationId: string;
  userId?: string;
  name?: string;
  maxOutputs?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBaseUrl(baseUrl?: string): string {
  const normalized = (baseUrl || 'https://generativelanguage.googleapis.com').trim();
  return normalized.replace(/\/+$/, '');
}

export interface GoogleAiStudioArtifact {
  mime_type: string;
  base64_data?: string;
  url?: string;
  filename?: string;
  width?: number;
  height?: number;
  created_at?: string;
  job_id?: string;
  storage_path?: string;
  local_url?: string;
  asset_id?: string;
}

export interface GoogleAiStudioGeneration {
  artifacts: GoogleAiStudioArtifact[];
  textOutputs: string[];
  raw: unknown;
  logs: string[];
}

export function resolveGoogleAiStudioIntegration(): GoogleAiStudioIntegrationConfig | null {
  const integration = getLatestEnabledIntegrationByProvider('google_ai_studio');
  if (!integration) {
    const latest = getLatestIntegrationByProvider('google_ai_studio');
    if (latest && latest.enabled === false) {
      throw new Error('Google AI Studio integration is disabled by administrator');
    }
    return null;
  }

  const { extra, ...config } = integration.config;
  const fallback = (key: string): string => {
    if (extra && typeof extra === 'object' && extra !== null) {
      const value = (extra as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  };

  const apiKey = config.apiKey?.trim() || fallback('GOOGLE_AI_STUDIO_API_KEY');
  if (!apiKey) {
    throw new Error('Google AI Studio integration is missing API key');
  }

  const resolveFirstModel = (): string | undefined => {
    if (extra && typeof extra === 'object') {
      const rawModel = (extra as Record<string, unknown>).model;
      if (typeof rawModel === 'string' && rawModel.trim().length > 0) {
        return rawModel.trim();
      }
    }
    if (config.models && config.models.length > 0) {
      const candidate = config.models.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
      if (candidate) {
        return candidate.trim();
      }
    }
    const fallbackModel = fallback('model');
    return fallbackModel || undefined;
  };

  const model = resolveFirstModel() ?? 'gemini-2.0-flash-exp';

  const baseUrlCandidate = config.baseUrl?.trim() || fallback('baseUrl');
  const baseUrl = baseUrlCandidate || 'https://generativelanguage.googleapis.com';

  const modeRaw = fallback('mode');
  const mode = modeRaw === 'text' ? 'text' : 'image';

  const extraMaxOutputs = (() => {
    if (!extra || typeof extra !== 'object') {
      return undefined;
    }
    const source = extra as Record<string, unknown>;
    const value =
      typeof source.maxOutputs === 'number'
        ? source.maxOutputs
        : typeof source.max_outputs === 'number'
          ? source.max_outputs
          : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(1, Math.min(8, Math.trunc(value)));
    }
    return undefined;
  })();

  return {
    apiKey,
    model,
    baseUrl: normalizeBaseUrl(baseUrl),
    mode,
    integrationId: integration.id,
    userId: integration.userId ?? undefined,
    name: integration.name ?? undefined,
    maxOutputs: extraMaxOutputs,
  };
}

export class GoogleAiStudioService {
  private readonly endpoint: string;

  constructor(private readonly config: GoogleAiStudioIntegrationConfig) {
    const apiHost = normalizeBaseUrl(config.baseUrl);
    this.endpoint = `${apiHost}/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(
      config.apiKey,
    )}`;
  }

  buildPrompt(context: AiContext): { prompt: string; logs: string[] } {
    const logs: string[] = [];
    const blocks: string[] = [];

    if (typeof context.node.content === 'string' && context.node.content.trim().length > 0) {
      blocks.push(context.node.content.trim());
    }

    const previous = context.previousNodes
      .map((node) => {
        const body =
          typeof node.content === 'string' && node.content.trim().length > 0
            ? node.content.trim()
            : '';
        if (!body) {
          return null;
        }
        return `Context from "${node.title || node.node_id}":\n${body}`;
      })
      .filter((chunk): chunk is string => Boolean(chunk));

    if (previous.length > 0) {
      logs.push(`Context blocks: ${previous.length}`);
      blocks.push(...previous);
    }

    const prompt = blocks.join('\n\n').trim();
    logs.push(`Prompt length: ${prompt.length}`);
    return { prompt, logs };
  }

  generateJobId(): string {
    return `gaistudio-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  }

  async createOrResolveFolder(context: AiContext, jobId: string): Promise<StoredNode> {
    if (!context.projectId) {
      throw new Error('Google AI Studio folder creation requires a project context.');
    }
    const projectId = context.projectId;
    const meta = (context.node.meta ?? {}) as Record<string, unknown>;
    const existingFolderId =
      typeof meta.output_folder_id === 'string' ? meta.output_folder_id : undefined;

    if (existingFolderId) {
      const existing = getNode(projectId, existingFolderId);
      if (existing) {
        this.updateNodeMeta(context, existing.node_id, jobId);
        return existing;
      }
    }

    const folderTitle = `Google Studio ${jobId.slice(0, 8)}`;
    const { node: folderNode } = createProjectNode(
      projectId,
      {
        type: 'folder',
        title: folderTitle,
        meta: {
          artifacts: [],
          display_mode: 'grid',
          source_node_id: context.node.node_id,
          created_at: nowIso(),
        },
      },
      {
        position: this.deriveFolderPosition(context),
      },
    );

    addProjectEdge(projectId, {
      from: context.node.node_id,
      to: folderNode.node_id,
    });

    const storedFolder = getNode(projectId, folderNode.node_id);
    if (!storedFolder) {
      throw new Error('Failed to create folder node for Google AI Studio artifacts');
    }

    this.updateNodeMeta(context, storedFolder.node_id, jobId);
    return storedFolder;
  }

  async generateContent(prompt: string, files?: AiContext['files']): Promise<GoogleAiStudioGeneration> {
    // Note: Imagen models may not work with standard Google AI Studio API
    // For image generation, consider using Replicate or Vertex AI instead
    
    const payload: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: this.config.mode === 'text' ? 0.7 : 0.3,
        topK: 40,
        topP: 0.8,
      },
    };

    if (Array.isArray(files) && files.length > 0) {
      type FilePartPayload =
        | { inlineData: { mimeType: string; data: string } }
        | { text: string };

      const fileParts = files
        .map<FilePartPayload | null>((file) => {
          if (!file || typeof file.content !== 'string') {
            return null;
          }
          if (file.type === 'image/base64') {
            return {
              inlineData: {
                mimeType: 'image/png',
                data: file.content.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''),
              },
            };
          }
          if (file.type === 'image/url') {
            return { text: `Reference image: ${file.content}` };
          }
          if (file.type.startsWith('text/')) {
            return { text: `Reference from ${file.name}:\n${file.content}` };
          }
          return null;
        })
        .filter((part): part is FilePartPayload => part !== null);

      if (fileParts.length > 0) {
        (payload.contents as Array<Record<string, unknown>>)[0].parts = [
          ...(((payload.contents as Array<{ parts?: FilePartPayload[] }>)[0]?.parts) ?? []),
          ...fileParts,
        ];
      }
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Google AI Studio error');
      throw new Error(`Google AI Studio returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const artifacts: GoogleAiStudioArtifact[] = [];
    const texts: string[] = [];

    const candidates = Array.isArray((data as Record<string, unknown>).candidates)
      ? ((data as Record<string, unknown>).candidates as unknown[])
      : [];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      const parts =
        Array.isArray((candidate as { content?: { parts?: unknown[] } }).content?.parts)
          ? ((candidate as { content?: { parts?: unknown[] } }).content!.parts as unknown[])
          : Array.isArray((candidate as Record<string, unknown>).parts)
            ? ((candidate as Record<string, unknown>).parts as unknown[])
            : [];

      for (const part of parts) {
        if (!part || typeof part !== 'object') {
          continue;
        }
        const partRecord = part as Record<string, unknown>;
        if (
          partRecord.inlineData &&
          typeof (partRecord.inlineData as Record<string, unknown>).data === 'string'
        ) {
          const inline = partRecord.inlineData as Record<string, unknown>;
          artifacts.push({
            mime_type: typeof inline.mimeType === 'string' ? inline.mimeType : 'image/png',
            base64_data: inline.data as string,
            created_at: nowIso(),
          });
        } else if (typeof partRecord.text === 'string' && partRecord.text.trim().length > 0) {
          texts.push(partRecord.text.trim());
        }
      }
    }

    const logs = [
      `Candidates received: ${candidates.length}`,
      `Artifacts extracted: ${artifacts.length}`,
      `Text outputs: ${texts.length}`,
    ];

    return {
      artifacts,
      textOutputs: texts,
      raw: data,
      logs,
    };
  }

  async persistArtifacts(
    projectId: string,
    aiNode: StoredNode,
    folderNode: StoredNode,
    jobId: string,
    artifacts: GoogleAiStudioArtifact[],
  ): Promise<GoogleAiStudioArtifact[]> {
    if (!artifacts.length) {
      return [];
    }

    const folderMeta = (folderNode.meta ?? {}) as Record<string, unknown>;
    const existingArtifacts = Array.isArray(folderMeta.artifacts)
      ? (folderMeta.artifacts as GoogleAiStudioArtifact[])
      : [];

    const stored: GoogleAiStudioArtifact[] = [];
    for (const artifact of artifacts) {
      if (!artifact.base64_data) {
        continue;
      }

      try {
        const saved = await saveBase64Asset(projectId, artifact.base64_data, {
          subdir: path.join('google_ai_studio', folderNode.node_id),
          mimeType: artifact.mime_type,
        });

        const asset = createAssetRecord({
          projectId,
          nodeId: folderNode.node_id,
          path: saved.relativePath,
          meta: {
            mime_type: saved.mimeType,
            size: saved.size,
            job_id: jobId,
            provider: 'google_ai_studio',
          },
        });

        const storedArtifact: GoogleAiStudioArtifact = {
          mime_type: saved.mimeType,
          filename: saved.filename,
          storage_path: saved.relativePath,
          local_url: `/uploads/${projectId}/${saved.relativePath}`.replace(/\\/g, '/'),
          asset_id: asset.asset_id,
          created_at: nowIso(),
          job_id: jobId,
        };

        stored.push(storedArtifact);
      } catch (error) {
        log.error({ err: error }, '[Google AI Studio] Failed to persist artifact');
      }
    }

    const merged = [...existingArtifacts, ...stored];
    folderMeta.artifacts = merged;
    folderMeta.updated_at = nowIso();
    updateNodeMetaSystem(projectId, folderNode.node_id, folderMeta);

    const aiMeta = (aiNode.meta ?? {}) as Record<string, unknown>;
    aiMeta.artifacts = merged;
    aiMeta.google_ai_status = 'completed';
    aiMeta.google_ai_last_generated_at = nowIso();
    updateNodeMetaSystem(projectId, aiNode.node_id, aiMeta);

    return merged;
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

  private updateNodeMeta(context: AiContext, folderId: string, jobId: string): void {
    if (!context.projectId) {
      return;
    }
    const nextMeta = {
      ...((context.node.meta ?? {}) as Record<string, unknown>),
      output_folder_id: folderId,
      google_ai_job_id: jobId,
    };
    updateNodeMetaSystem(context.projectId, context.node.node_id, nextMeta);
    context.node.meta = nextMeta;
  }
}
