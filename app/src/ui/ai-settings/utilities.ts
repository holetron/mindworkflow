import type { ModelSchemaInput, AutoPort } from '../../state/api';

/**
 * Generate automatic ports from model schema inputs.
 * Excludes the "prompt" port which is assembled automatically.
 */
export function generateAutoPorts(inputs: ModelSchemaInput[], enabledPorts: string[] = []): AutoPort[] {
  const ports: AutoPort[] = [];

  const filtered = inputs.filter(input => {
    if (input.name === 'prompt') {
      return false;
    }
    return input.required || enabledPorts.includes(input.name);
  });

  filtered.forEach(input => {
    let portType = input.type;

    const nameLC = input.name.toLowerCase();
    if (nameLC.includes('image') || nameLC.includes('img') || nameLC.includes('photo') || nameLC.includes('picture')) {
      portType = 'image';
    } else if (nameLC.includes('video') || nameLC.includes('vid')) {
      portType = 'video';
    } else if (nameLC.includes('audio') || nameLC.includes('sound')) {
      portType = 'audio';
    }

    const descLC = (input.description || '').toLowerCase();
    if (descLC.includes('image') || descLC.includes('picture') || descLC.includes('photo')) {
      portType = 'image';
    } else if (descLC.includes('video')) {
      portType = 'video';
    }

    ports.push({
      id: input.name,
      label: input.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: portType,
      required: input.required,
      position: 'left',
      description: input.description,
      default: input.default,
      options: input.options,
      min: input.min,
      max: input.max,
    });
  });

  return ports;
}

/**
 * Determine Midjourney version from model ID.
 */
export function getMidjourneyVersion(modelId: string): 6 | 7 | null {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('v7') || normalized.includes('-7')) return 7;
  if (normalized.includes('v6') || normalized.includes('-6')) return 6;
  return null;
}

/**
 * Get node type icon.
 */
export function getNodeIcon(type: string): string {
  const iconMap: Record<string, string> = {
    text: '📝',
    ai: '🤖',
    markdown: '📄',
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
    pdf: '📕',
    file: '📎',
    code: '💻',
    html: '🌐',
    data: '🗂️',
  };
  return iconMap[type] || '📦';
}

/**
 * Check if value looks like a media URL or data URI.
 */
export function looksLikeMediaValue(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('data:');
}

/**
 * Expand a raw media value string into an array of URLs.
 */
export function expandMediaValue(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const separators = /[;\n\r]+/;
  if (separators.test(trimmed)) {
    const tokens = trimmed
      .split(separators)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length > 1 && tokens.every(looksLikeMediaValue)) {
      return tokens;
    }
  }
  return [trimmed];
}

/**
 * Summarize a scalar value for display (truncate long strings, describe data URIs).
 */
export function summarizeScalar(value: string): string {
  if (value.startsWith('data:')) {
    const approxKb = Math.round(value.length / 1024);
    return `<data uri ~${approxKb}KB>`;
  }
  if (looksLikeMediaValue(value)) {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

/**
 * Pick image candidate URL from a node's meta fields.
 */
export function pickImageCandidate(node: any): string | null {
  if (!node || node.type !== 'image') {
    return null;
  }
  const meta = (node.meta ?? {}) as Record<string, unknown>;
  const candidates = [
    typeof meta.image_url === 'string' ? meta.image_url : null,
    typeof meta.original_image === 'string' ? meta.original_image : null,
    typeof meta.image_original === 'string' ? meta.image_original : null,
    typeof meta.image_edited === 'string' ? meta.image_edited : null,
    typeof meta.annotated_image === 'string' ? meta.annotated_image : null,
    typeof meta.local_url === 'string' ? meta.local_url : null,
    typeof node.content === 'string' ? node.content : null,
  ];
  const found = candidates.find((item) => typeof item === 'string' && item.trim().length > 0);
  return found ? found.trim() : null;
}
