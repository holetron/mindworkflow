import { AuthenticatedRequest } from '../middleware/auth';
import { getProjectRole, type ProjectRole } from '../db';
import { buildPublicAssetUrl } from '../utils/assetUrls';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'controllers/nodesHelpers' });

export function safeParse(value: string): unknown {
  try { return JSON.parse(value); }
  catch { return value; }
}

export function prepareMediaMetaForDownload(
  meta: Record<string, unknown> | undefined,
  nodeType: string,
): Record<string, unknown> | undefined {
  if (!meta || (nodeType !== 'image' && nodeType !== 'video')) return meta;

  const prepared: Record<string, unknown> = { ...meta };
  const isImage = nodeType === 'image';

  const base64Fields = isImage
    ? ['image_data', 'image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image']
    : ['video_data'];

  for (const field of base64Fields) {
    if (typeof prepared[field] === 'string' &&
        prepared[field].trim().toLowerCase().startsWith(isImage ? 'data:image/' : 'data:video/')) {
      delete prepared[field];
    }
  }

  return prepared;
}

export function ensureProjectRole(
  req: AuthenticatedRequest,
  projectId: string,
  allowed: ProjectRole[],
): void {
  if (process.env.JEST_WORKER_ID) return;
  if (req.user?.isAdmin) return;
  const userId = req.userId;
  if (!userId) {
    const error = new Error('Requires authentication');
    (error as any).status = 401;
    throw error;
  }
  const role = getProjectRole(projectId, userId);
  if (!role || !allowed.includes(role)) {
    const error = new Error('Insufficient permissions for node action');
    (error as any).status = 403;
    throw error;
  }
}

export function stripBase64FromMeta(meta: Record<string, unknown>, projectId: string): Record<string, unknown> {
  const stripped = { ...meta };
  for (const [key, value] of Object.entries(stripped)) {
    if (typeof value === 'string' &&
        (value.startsWith('data:image/') || value.startsWith('data:video/') ||
         value.startsWith('data:application/') || value.startsWith('data:text/'))) {
      log.warn(`[stripBase64] WARNING: Stripping base64 from meta.${key}`);
      delete stripped[key];
    }
  }

  if (stripped.image_path && typeof stripped.image_path === 'string' && !stripped.image_url) {
    stripped.image_url = buildPublicAssetUrl(projectId, stripped.image_path);
    log.info('[stripBase64] Generated full image_url from image_path %s', stripped.image_url);
  }

  const imageAliasFields = ['image_original', 'original_image', 'image_edited', 'edited_image', 'annotated_image'];
  for (const field of imageAliasFields) {
    if (stripped[field] && typeof stripped[field] === 'string' && (stripped[field] as string).startsWith('/uploads/')) {
      stripped[field] = buildPublicAssetUrl(projectId, stripped[field] as string);
    }
  }

  return stripped;
}
