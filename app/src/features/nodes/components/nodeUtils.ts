import type { ModelSchemaInput, AutoPort, FlowNode } from './nodeTypes';
import { SCREEN_WIDTHS } from './nodeConstants';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Determine model type by name
export function getModelType(modelName?: string): { type: string; emoji: string; color: string } {
  if (!modelName) return { type: 'text', emoji: '\u{1F4DD}', color: '#6b7280' };

  const name = modelName.toLowerCase();

  // Images
  if (name.includes('dall-e') || name.includes('dalle') || name.includes('stable-diffusion') ||
      name.includes('midjourney') || name.includes('imagen') || name.includes('firefly') ||
      name.includes('flux') || name.includes('playground') || name.includes('sd-') ||
      name.includes('image') || name.includes('img')) {
    return { type: 'image', emoji: '\u{1F3A8}', color: '#8b5cf6' };
  }

  // Video
  if (name.includes('sora') || name.includes('runway') || name.includes('pika') ||
      name.includes('video') || name.includes('gen-2') || name.includes('gen-3') ||
      name.includes('kling') || name.includes('luma')) {
    return { type: 'video', emoji: '\u{1F3AC}', color: '#ec4899' };
  }

  // 3D
  if (name.includes('3d') || name.includes('mesh') || name.includes('model') ||
      name.includes('shap-e') || name.includes('meshy')) {
    return { type: '3d', emoji: '\u{1F3B2}', color: '#06b6d4' };
  }

  // Audio
  if (name.includes('whisper') || name.includes('tts') || name.includes('audio') ||
      name.includes('sound') || name.includes('voice') || name.includes('elevenlabs') ||
      name.includes('bark') || name.includes('musicgen')) {
    return { type: 'audio', emoji: '\u{1F3B5}', color: '#f59e0b' };
  }

  // Multimodal
  if (name.includes('gpt-4-vision') || name.includes('gpt-4o') || name.includes('claude-3') ||
      name.includes('gemini-pro-vision') || name.includes('gemini-1.5') ||
      name.includes('vision') || name.includes('multimodal')) {
    return { type: 'multi', emoji: '\u{1F441}\uFE0F', color: '#10b981' };
  }

  // Text (default)
  return { type: 'text', emoji: '\u{1F4DD}', color: '#6b7280' };
}

export function generateAutoPorts(inputs: ModelSchemaInput[], enabledPorts: string[] = []): AutoPort[] {
  const filtered = inputs.filter((input) => {
    if (input.name === 'prompt') {
      return false;
    }
    return input.required || enabledPorts.includes(input.name);
  });

  return filtered.map((input) => {
    let portType = input.type;
    const nameLC = input.name.toLowerCase();
    const descLC = (input.description || '').toLowerCase();

    if (nameLC.includes('image') || nameLC.includes('img') || nameLC.includes('photo') || nameLC.includes('picture')) {
      portType = 'image';
    } else if (nameLC.includes('video') || nameLC.includes('vid')) {
      portType = 'video';
    } else if (nameLC.includes('audio') || nameLC.includes('sound')) {
      portType = 'audio';
    } else if (descLC.includes('image') || descLC.includes('picture') || descLC.includes('photo')) {
      portType = 'image';
    } else if (descLC.includes('video')) {
      portType = 'video';
    } else if (descLC.includes('audio') || descLC.includes('sound')) {
      portType = 'audio';
    }

    return {
      id: input.name,
      label: input.name.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      type: portType,
      required: input.required,
      position: 'left',
      description: input.description,
      default: input.default,
    } satisfies AutoPort;
  });
}

export const sortFontSteps = (steps: { maxLength: number; multiplier: number }[]): { maxLength: number; multiplier: number }[] =>
  [...steps].sort((a, b) => a.maxLength - b.maxLength);

export const computeDynamicFontSize = (
  length: number,
  base: number,
  steps: { maxLength: number; multiplier: number }[],
  scaleMultiplier = 1,
): number => {
  if (!Number.isFinite(length) || length < 0) {
    return base;
  }
  const sorted = sortFontSteps(steps);
  const step = sorted.find((item) => length <= item.maxLength) ?? sorted[sorted.length - 1];
  const multiplier = step && Number.isFinite(step.multiplier) && step.multiplier > 0 ? step.multiplier : 1;
  const resolvedScale = Number.isFinite(scaleMultiplier) && scaleMultiplier > 0 ? scaleMultiplier : 1;
  const size = base * multiplier * resolvedScale;
  return Math.max(6, Math.min(size, base * 12 * resolvedScale));
};

export function normalizePlaceholderValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, val]) => typeof key === 'string' && typeof val === 'string',
  ) as Array<[string, string]>;
  return entries.reduce<Record<string, string>>((acc, [key, val]) => {
    acc[key] = val;
    return acc;
  }, {});
}

export function shallowEqualRecords(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

// Helper function to calculate scale for different screen widths
export function getScaleForScreenWidth(screenWidthId: string, nodeWidth: number): number {
  const screenWidthConfig = SCREEN_WIDTHS.find(sw => sw.id === screenWidthId);
  if (!screenWidthConfig) return 1;

  const targetWidth = parseInt(screenWidthConfig.width);
  const availableWidth = nodeWidth - 32;

  if (targetWidth > availableWidth) {
    return availableWidth / targetWidth;
  }

  return 1;
}

export function getChildImagePreview(child: FlowNode): string | null {
  const meta = (child.meta ?? {}) as Record<string, unknown>;
  const readString = (candidate: unknown): string | null =>
    typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;

  const normalizeUrl = (url: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith('/uploads/') && !url.startsWith('http')) {
      return `https://mindworkflow.com${url}`;
    }
    return url;
  };

  if (child.type === 'image') {
    return normalizeUrl(
      readString(meta.preview_url) ??
      readString(meta.local_url) ??
      readString(meta.image_url) ??
      readString(meta.url) ??
      readString(meta.image_data) ??
      null
    );
  }

  if (Array.isArray(meta.artifacts)) {
    for (const artifact of meta.artifacts as Array<Record<string, unknown>>) {
      const preview = normalizeUrl(
        readString(artifact.local_url) ??
        readString(artifact.preview_url) ??
        readString(artifact.url)
      );
      if (preview) {
        return preview;
      }
    }
  }

  return normalizeUrl(
    (typeof meta.thumbnail === 'string' ? meta.thumbnail : null) ??
    (typeof meta.image_url === 'string' ? meta.image_url : null) ??
    (typeof meta.preview === 'string' ? meta.preview : null)
  );
}

export function clampPreviewText(value: string, max = 140): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}\u2026`;
}

export function getChildPreviewText(child: FlowNode): string {
  const meta = (child.meta ?? {}) as Record<string, unknown>;
  const fromContent = typeof child.content === 'string' ? child.content : '';

  if (child.type === 'text') {
    return clampPreviewText(fromContent);
  }

  if (child.type === 'ai') {
    const aiSummary =
      (typeof meta.summary === 'string' && meta.summary) ||
      (typeof meta.response === 'string' && meta.response) ||
      fromContent;
    if (aiSummary) {
      return clampPreviewText(String(aiSummary));
    }
  }

  if (child.type === 'file') {
    const fileName =
      (typeof meta.file_name === 'string' && meta.file_name) ||
      (typeof meta.title === 'string' && meta.title);
    if (fileName) {
      return clampPreviewText(String(fileName), 80);
    }
  }

  if (fromContent) {
    return clampPreviewText(fromContent);
  }

  if (typeof meta.description === 'string') {
    return clampPreviewText(meta.description, 100);
  }

  return '';
}
