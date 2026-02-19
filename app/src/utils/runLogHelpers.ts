type Primitive = string | number | boolean | null | undefined;

export interface CreatedNodeLogEntry {
  node_id: string;
  type: string;
  title: string;
  content_type?: string | null;
  ui_position?: { x: number; y: number } | null;
  meta?: Record<string, unknown>;
  links: Array<{ label: string; url: string }>;
}

export interface ParsedRunLog {
  metadata?: Record<string, unknown> | null;
  createdNodes: CreatedNodeLogEntry[];
  predictionPayload?: unknown;
  status?: string | null;
  provider?: string | null;
}

export interface ReplicateHeaderData {
  badgeLabel: string;
  badgeClassName: string;
  model?: string;
  version?: string;
  predictionId?: string;
  updatedAt?: string;
  predictionUrl?: string;
  predictionApiUrl?: string;
  outputUrl?: string;
}

export type PreviewItem = {
  key: string;
  icon: string;
  text: string;
  href?: string;
};

const LINK_KEYS = [
  'image_url',
  'image_original',
  'original_image',
  'image_edited',
  'edited_image',
  'image_crop',
  'crop_image',
  'annotated_image',
  'video_url',
  'audio_url',
  'output_url',
  'url',
];

export function parseRunLogPayload(logs: unknown): ParsedRunLog {
  const candidates: unknown[] = [];
  if (logs && typeof logs === 'object' && !Array.isArray(logs)) {
    candidates.push(logs);
  } else if (Array.isArray(logs)) {
    candidates.push(...logs);
  }

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      if (
        'created_nodes' in record ||
        'metadata' in record ||
        'prediction_payload' in record ||
        'status' in record
      ) {
        return {
          metadata: extractRecord(record.metadata),
          createdNodes: parseCreatedNodes(record.created_nodes),
          predictionPayload: record.prediction_payload ?? record.payload,
          status: typeof record.status === 'string' ? record.status : null,
          provider: typeof record.provider === 'string' ? record.provider : null,
        };
      }
    }
  }

  return {
    metadata: null,
    createdNodes: [],
    predictionPayload: undefined,
    status: null,
    provider: null,
  };
}

export function extractReplicateInfo(
  metadata?: Record<string, unknown> | null,
): {
  model?: string;
  version?: string;
  status?: string;
  predictionId?: string;
  predictionUrl?: string;
  predictionApiUrl?: string;
  outputUrl?: string;
  updatedAt?: string;
  provider?: string;
} {
  if (!metadata) {
    return {};
  }
  const getString = (key: string): string | undefined => {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const info: {
    model?: string;
    version?: string;
    status?: string;
    predictionId?: string;
    predictionUrl?: string;
    predictionApiUrl?: string;
    outputUrl?: string;
    updatedAt?: string;
    provider?: string;
  } = {
    model: getString('replicate_model'),
    version: getString('replicate_version'),
    status: getString('replicate_status'),
    predictionId: getString('replicate_prediction_id'),
    predictionUrl: getString('replicate_prediction_url'),
    predictionApiUrl: getString('replicate_prediction_api_url'),
    outputUrl: getString('replicate_output'),
    updatedAt: getString('replicate_last_run_at'),
    provider: getString('provider'),
  };
  if (!info.outputUrl && metadata.created_nodes && Array.isArray(metadata.created_nodes)) {
    const firstNode = metadata.created_nodes[0];
    if (firstNode && typeof firstNode === 'object' && !Array.isArray(firstNode)) {
      const meta = extractRecord((firstNode as Record<string, unknown>).meta);
      if (meta) {
        const link = collectNodeLinks(meta)[0];
        if (link) {
          info.outputUrl = link.url;
        }
      }
    }
  }
  return info;
}

export function collectNodeLinks(meta?: Record<string, unknown>): Array<{ label: string; url: string }> {
  if (!meta) {
    return [];
  }
  const links: Array<{ label: string; url: string }> = [];
  for (const key of LINK_KEYS) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim() && isLikelyUrl(value)) {
      links.push({ label: key, url: value.trim() });
    }
  }
  return links;
}

export function formatReplicateStatus(status?: string | null): { label: string; className: string } {
  if (!status) {
    return { label: 'Unknown', className: 'bg-slate-700 text-slate-200 border border-slate-600' };
  }
  const normalized = status.toLowerCase();
  if (['succeeded', 'success', 'completed'].includes(normalized)) {
    return { label: 'Success', className: 'bg-green-900/30 text-green-300 border border-green-500/40' };
  }
  if (['failed', 'error', 'canceled'].includes(normalized)) {
    return { label: 'Error', className: 'bg-red-900/30 text-red-300 border border-red-500/40' };
  }
  return { label: status, className: 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/40' };
}

export function formatRunTimestamp(raw?: string | null): string {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function safeStringify(value: unknown): string {
  try {
    const result = JSON.stringify(value, null, 2);
    if (typeof result === 'string') {
      return result;
    }
  } catch {
    // ignore
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  try {
    return String(value);
  } catch {
    return '[unserializable]';
  }
}

function extractRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseCreatedNodes(value: unknown): CreatedNodeLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const nodeId = typeof record.node_id === 'string' ? record.node_id : null;
      const title = typeof record.title === 'string' ? record.title : null;
      const type = typeof record.type === 'string' ? record.type : null;
      if (!nodeId || !title || !type) {
        return null;
      }
      const meta = extractRecord(record.meta);
      const contentType =
        typeof record.content_type === 'string' ? record.content_type : null;
      const uiPositionRaw = extractRecord(record.ui_position);
      const ui_position =
        uiPositionRaw &&
        typeof uiPositionRaw.x === 'number' &&
        typeof uiPositionRaw.y === 'number'
          ? { x: Math.round(uiPositionRaw.x), y: Math.round(uiPositionRaw.y) }
          : null;
      return {
        node_id: nodeId,
        type,
        title,
        content_type: contentType,
        ui_position,
        meta: meta ?? undefined,
        links: collectNodeLinks(meta ?? undefined),
      };
    })
    .filter((entry): entry is CreatedNodeLogEntry => entry !== null);
}

export function buildPreviewItems(nodes: CreatedNodeLogEntry[], outputUrl?: string): PreviewItem[] {
  const items: PreviewItem[] = nodes.map((node, index) => {
    const icon =
      node.type === 'image' ? '🖼️' : node.type === 'video' ? '🎬' : node.type === 'audio' ? '🎧' : '📝';
    const primaryLink = node.links[0];
    const text = primaryLink ? `${node.title}` : `${node.title} (${node.type})`;
    return {
      key: `${node.node_id}-${index}`,
      icon,
      text,
      href: primaryLink?.url,
    };
  });
  if (outputUrl && !items.some((item) => item.href === outputUrl)) {
    items.push({
      key: `output-${outputUrl}`,
      icon: '🔗',
      text: 'Output',
      href: outputUrl,
    });
  }
  return items;
}

export function createReplicateHeaderData(
  runStatus: string | null | undefined,
  info: ReturnType<typeof extractReplicateInfo>,
): ReplicateHeaderData | undefined {
  const hasInfo =
    Boolean(info.model) ||
    Boolean(info.version) ||
    Boolean(info.predictionId) ||
    Boolean(info.predictionUrl) ||
    Boolean(info.outputUrl);
  if (!hasInfo) {
    return undefined;
  }
  const status = formatReplicateStatus(info.status ?? runStatus ?? undefined);
  return {
    badgeLabel: status.label,
    badgeClassName: status.className,
    model: info.model,
    version: info.version,
    predictionId: info.predictionId,
    updatedAt: info.updatedAt ? formatRunTimestamp(info.updatedAt) : undefined,
    predictionUrl: info.predictionUrl,
    predictionApiUrl: info.predictionApiUrl,
    outputUrl: info.outputUrl,
  };
}

function isLikelyUrl(value: Primitive): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^data:(image|video|audio)\//i.test(trimmed)) {
    return true;
  }
  return /^https?:\/\//i.test(trimmed);
}
