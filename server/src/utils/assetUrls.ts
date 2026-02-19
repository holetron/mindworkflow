import { createHash } from 'crypto';
import * as path from 'path';

/**
 * Resolve the public base URL for the MindWorkflow backend.
 * Preference order:
 *   1. APP_DOMAIN (without trailing slash)
 *   2. APP_HOST/HOST_BACKEND combined with PORT_BACKEND/PORT
 *   3. http://localhost:6048 (hardcoded fallback)
 */
function replacePlaceholders(value: string): string {
  if (!value.includes('${')) {
    return value;
  }

  const replacements: Record<string, string> = {
    PORT_BACKEND:
      process.env.PORT_BACKEND ??
      process.env.APP_PORT ??
      process.env.PORT ??
      '6048',
    PORT:
      process.env.PORT ??
      process.env.PORT_BACKEND ??
      process.env.APP_PORT ??
      '6048',
    HOST_BACKEND:
      process.env.HOST_BACKEND ??
      process.env.APP_HOST ??
      'localhost',
    APP_HOST:
      process.env.APP_HOST ??
      process.env.HOST_BACKEND ??
      'localhost',
  };

  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (match, key) => {
    const replacement = replacements[key];
    return typeof replacement === 'string' ? replacement : match;
  });
}

export function resolveAppBaseUrl(): string {
  const rawEnvDomain =
    typeof process.env.APP_DOMAIN === 'string' ? process.env.APP_DOMAIN.trim() : '';
  if (rawEnvDomain) {
    const envDomain = replacePlaceholders(rawEnvDomain);
    try {
      const url = new URL(envDomain);
      return url.origin;
    } catch {
      return envDomain.replace(/\/+$/, '');
    }
  }

  const protocol = (process.env.APP_PROTOCOL ?? 'http').trim().replace(/:$/, '') || 'http';
  const rawHost =
    (process.env.APP_HOST ??
      process.env.HOST_BACKEND ??
      process.env.BACKEND_HOST ??
      '').trim();

  const invalidHosts = new Set(['0.0.0.0', '::', '::1', '[::]', '[::1]', '*']);
  const fallbackHost =
    rawHost && !invalidHosts.has(rawHost)
      ? replacePlaceholders(rawHost)
      : 'localhost';

  let host = fallbackHost.includes('::') && !fallbackHost.startsWith('[')
    ? 'localhost'
    : fallbackHost;

  let rawPort =
    (process.env.PORT_BACKEND ??
      process.env.APP_PORT ??
      process.env.PORT ??
      '').trim();

  if (host.includes(':') && !host.startsWith('[')) {
    const hostParts = host.split(':');
    if (hostParts.length > 1 && /^\d+$/.test(hostParts[hostParts.length - 1])) {
      rawPort = '';
    }
  }

  rawPort = replacePlaceholders(rawPort);

  const portSegment =
    rawPort ? `:${rawPort}` : host.includes(':') && !host.startsWith('[') ? '' : ':6048';

  return `${protocol}://${host}${portSegment}`;
}

/**
 * Build a public URL for a project asset based on its relative path.
 */
export function buildPublicAssetUrl(projectId: string, relativePath: string): string {
  const baseUrl = resolveAppBaseUrl().replace(/\/+$/, '');
  const sanitizedRelative = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${baseUrl}/uploads/${projectId}/${sanitizedRelative}`;
}

/**
 * Parse a URL or path and extract the projectId and asset relative path if it belongs to /uploads.
 */
export function parseUploadPath(input: string): { projectId: string; assetRelativePath: string } | null {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return null;
  }

  const trimmed = input.trim();
  let pathname = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }

  const match = /^\/uploads\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match) {
    return null;
  }

  return {
    projectId: match[1],
    assetRelativePath: match[2],
  };
}

/**
 * Resolve an absolute filesystem path for a public upload URL/path.
 * Returns null if the input does not belong to /uploads or would escape the project directory.
 */
export function resolveAssetAbsolutePath(input: string): string | null {
  const parsed = parseUploadPath(input);
  if (!parsed) {
    return null;
  }

  const { projectId, assetRelativePath } = parsed;
  const sanitizedRelative = assetRelativePath
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/');

  if (!sanitizedRelative) {
    return null;
  }

  const projectsRoot = path.resolve(process.cwd(), 'projects');
  const projectDir = path.resolve(projectsRoot, projectId);
  const absolutePath = path.resolve(projectDir, sanitizedRelative);

  if (!absolutePath.startsWith(projectDir + path.sep) && absolutePath !== projectDir) {
    return null;
  }

  return absolutePath;
}

/**
 * Compute a deterministic signature for an asset value (URL or data URI).
 */
export function computeAssetSignature(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex');
}

/**
 * Check whether a URL belongs to the current backend domain (/uploads).
 */
export function isInternalAssetUrl(input: string): boolean {
  const parsed = parseUploadPath(input);
  if (!parsed) {
    return false;
  }

  const baseUrl = resolveAppBaseUrl();
  try {
    const base = new URL(baseUrl);
    const url = new URL(input, baseUrl);
    return url.host === base.host;
  } catch {
    return false;
  }
}
