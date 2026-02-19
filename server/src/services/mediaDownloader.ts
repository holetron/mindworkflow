import { downloadRemoteAsset, saveBase64Asset, type DownloadResult } from '../utils/storage';
import { isExternalUrl, isLocalUploadPath } from '../utils/security';
import { buildPublicAssetUrl, computeAssetSignature, parseUploadPath } from '../utils/assetUrls';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'mediaDownloader' });
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export interface AutoDownloadResult {
  updatedMeta: Record<string, unknown>;
  downloaded: boolean;
}

type MediaNodeType = 'image' | 'video';

interface ApplyMetaOptions {
  nodeType: MediaNodeType;
  projectId: string;
  publicUrl: string;
  relativePath: string;
  size: number;
  mimeType?: string;
  signature?: string;
  sourceValue?: string;
}

function shouldReplaceMediaValue(current: unknown, sourceValue?: string): boolean {
  if (typeof current !== 'string') {
    return true;
  }
  const trimmed = current.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.startsWith('data:')) {
    return true;
  }
  if (sourceValue && trimmed === sourceValue.trim()) {
    return true;
  }
  return parseUploadPath(trimmed) === null;
}

function applyLocalMediaMeta(
  originalMeta: Record<string, unknown>,
  options: ApplyMetaOptions,
): Record<string, unknown> {
  const nextMeta: Record<string, unknown> = { ...originalMeta };
  const { nodeType, projectId, publicUrl, relativePath, size, mimeType, signature } = options;

  const normalizedRelativePath = relativePath.replace(/^\/+/, '');
  const relativeUrl = `/uploads/${projectId}/${normalizedRelativePath}`;
  const urlField = nodeType === 'image' ? 'image_url' : 'video_url';
  const pathField = nodeType === 'image' ? 'image_path' : 'video_path';
  const sourceValue = options.sourceValue;
  const sanitizedSource =
    typeof sourceValue === 'string' && sourceValue.trim().toLowerCase().startsWith('data:')
      ? publicUrl
      : sourceValue;

  if (
    typeof originalMeta.source_asset_value === 'string' &&
    originalMeta.source_asset_value.trim().toLowerCase().startsWith('data:')
  ) {
    nextMeta.source_asset_value = publicUrl;
  } else if (nodeType === 'video' && typeof originalMeta.source_asset_value === 'string') {
    // For video nodes, always update source_asset_value to the new publicUrl
    nextMeta.source_asset_value = publicUrl;
  }

  nextMeta[urlField] = publicUrl;
  nextMeta[pathField] = relativeUrl;
  nextMeta.original_url = publicUrl;
  nextMeta.local_url = relativeUrl;
  nextMeta.source_url = sanitizedSource ?? publicUrl;
  nextMeta.source_download_url = sanitizedSource ?? publicUrl;
  nextMeta.asset_public_url = publicUrl;
  nextMeta.asset_relative_path = normalizedRelativePath;
  nextMeta.asset_origin = 'auto_download';
  nextMeta.file_size = size;
  nextMeta.auto_downloaded = true;
  nextMeta.download_timestamp = new Date().toISOString();
  if (mimeType) {
    nextMeta.asset_mime_type = mimeType;
  }
  if (signature) {
    nextMeta.source_asset_signature = signature;
  }

  delete nextMeta.auto_download_failed;
  delete nextMeta.download_error;
  delete nextMeta.auto_download_skipped;
  delete nextMeta.skip_reason;

  if (nodeType === 'image') {
    const imageFields = [
      'image_original',
      'original_image',
      'image_edited',
      'edited_image',
      'annotated_image',
    ];
    const absoluteFields = new Set(imageFields);
    for (const field of imageFields) {
      const current = nextMeta[field];
      if (shouldReplaceMediaValue(current, sourceValue)) {
        nextMeta[field] = absoluteFields.has(field) ? publicUrl : relativeUrl;
      }
    }
    nextMeta.display_mode = 'url';
    delete nextMeta.image_data;
  } else if (nodeType === 'video') {
    if (shouldReplaceMediaValue(nextMeta.video_url, sourceValue)) {
      nextMeta.video_url = publicUrl;
    }
    delete nextMeta.video_data;
  }

  return nextMeta;
}

function extractSourceValue(meta: Record<string, unknown>, nodeType: MediaNodeType): string | undefined {
  if (typeof meta.source_asset_value === 'string' && meta.source_asset_value.trim()) {
    return meta.source_asset_value.trim();
  }
  if (nodeType === 'image') {
    const candidates = [
      meta.image_url,
      meta.image_original,
      meta.original_image,
      meta.image_edited,
      meta.edited_image,
      meta.image_data,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  } else {
    const candidates = [meta.video_url, meta.video_data];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

/**
 * Automatically downloads media files (images/videos) from external URLs
 * and updates node metadata to point to the local copy.
 * 
 * @param projectId - The project ID
 * @param nodeType - The node type ('image' or 'video')
 * @param meta - The node metadata object
 * @returns Updated metadata with local URL if download succeeded
 */
export async function autoDownloadMediaIfNeeded(
  projectId: string,
  nodeType: string,
  meta: Record<string, unknown>,
): Promise<AutoDownloadResult> {
  // Only process image and video nodes
  if (nodeType !== 'image' && nodeType !== 'video') {
    return { updatedMeta: meta, downloaded: false };
  }

  const typedNodeType = nodeType as MediaNodeType;
  const urlField = typedNodeType === 'image' ? 'image_url' : 'video_url';
  const url = meta[urlField];
  const initialSource = extractSourceValue(meta, typedNodeType);
  const existingSignature =
    typeof meta.source_asset_signature === 'string' && meta.source_asset_signature.trim().length > 0
      ? String(meta.source_asset_signature).trim()
      : '';
  const assetSignature =
    existingSignature || (initialSource ? computeAssetSignature(initialSource) : undefined);

  const baseMeta: Record<string, unknown> = { ...meta };
  if (assetSignature) {
    baseMeta.source_asset_signature = assetSignature;
  }

  if (typeof url === 'string' && parseUploadPath(url)) {
    const parsed = parseUploadPath(url)!;
    const publicUrl = buildPublicAssetUrl(parsed.projectId, parsed.assetRelativePath);
    return {
      updatedMeta: applyLocalMediaMeta(baseMeta, {
        nodeType: typedNodeType,
        projectId: parsed.projectId,
        publicUrl,
        relativePath: parsed.assetRelativePath,
        size: typeof meta.file_size === 'number' ? meta.file_size : 0,
        mimeType: typeof meta.asset_mime_type === 'string' ? meta.asset_mime_type : undefined,
        signature: assetSignature,
        sourceValue: initialSource,
      }),
      downloaded: false,
    };
  }

  // Handle image_data with data URI
  if (
    typedNodeType === 'image' &&
    typeof meta.image_data === 'string' &&
    meta.image_data.trim().startsWith('data:image/')
  ) {
    try {
      const saveResult = await saveBase64Asset(projectId, meta.image_data.trim(), {
        subdir: 'auto_downloads',
      });
      const publicUrl = buildPublicAssetUrl(projectId, saveResult.relativePath);
      const updatedMeta = applyLocalMediaMeta(baseMeta, {
        nodeType: typedNodeType,
        projectId,
        publicUrl,
        relativePath: saveResult.relativePath,
        size: saveResult.size,
        mimeType: saveResult.mimeType,
        signature: assetSignature,
        sourceValue: initialSource,
      });
      return { updatedMeta, downloaded: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        updatedMeta: {
          ...baseMeta,
          auto_download_failed: true,
          download_error: errorMessage,
        },
        downloaded: false,
      };
    }
  }

  // Handle video_data with data URI
  if (
    typedNodeType === 'video' &&
    typeof meta.video_data === 'string' &&
    meta.video_data.trim().startsWith('data:video/')
  ) {
    try {
      const saveResult = await saveBase64Asset(projectId, meta.video_data.trim(), {
        subdir: 'auto_downloads',
      });
      const publicUrl = buildPublicAssetUrl(projectId, saveResult.relativePath);
      const updatedMeta = applyLocalMediaMeta(baseMeta, {
        nodeType: typedNodeType,
        projectId,
        publicUrl,
        relativePath: saveResult.relativePath,
        size: saveResult.size,
        mimeType: saveResult.mimeType,
        signature: assetSignature,
        sourceValue: initialSource,
      });
      return { updatedMeta, downloaded: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        updatedMeta: {
          ...baseMeta,
          auto_download_failed: true,
          download_error: errorMessage,
        },
        downloaded: false,
      };
    }
  }

  // Skip if URL is not a string or is missing
  if (typeof url !== 'string') {
    return { updatedMeta: baseMeta, downloaded: false };
  }

  // Skip if already a local upload path
  if (isLocalUploadPath(url)) {
    const parsed = parseUploadPath(url);
    if (!parsed) {
      return { updatedMeta: baseMeta, downloaded: false };
    }
    const publicUrl = buildPublicAssetUrl(parsed.projectId, parsed.assetRelativePath);
    return {
      updatedMeta: applyLocalMediaMeta(baseMeta, {
        nodeType: typedNodeType,
        projectId: parsed.projectId,
        publicUrl,
        relativePath: parsed.assetRelativePath,
        size: typeof meta.file_size === 'number' ? meta.file_size : 0,
        mimeType: typeof meta.asset_mime_type === 'string' ? meta.asset_mime_type : undefined,
        signature: assetSignature,
        sourceValue: initialSource,
      }),
      downloaded: false,
    };
  }

  // Skip if not an external HTTP/HTTPS URL (validates and prevents SSRF)
  if (!isExternalUrl(url)) {
    return { updatedMeta: baseMeta, downloaded: false };
  }

  // Skip if already downloaded (has auto_downloaded flag)
  if (meta.auto_downloaded === true) {
    return { updatedMeta: baseMeta, downloaded: false };
  }

  try {
    log.info(`[Auto-download] Downloading ${nodeType} from ${url}`);
    
    const downloadResult: DownloadResult = await downloadRemoteAsset(projectId, url, {
      subdir: 'auto_downloads',
      maxSize: MAX_FILE_SIZE,
    });

    // Check if download was skipped due to size
    if (downloadResult.skipped) {
      log.info(`[Auto-download] Skipped ${url}: ${downloadResult.reason}`);
    return {
      updatedMeta: {
        ...baseMeta,
        auto_download_skipped: true,
        skip_reason: downloadResult.reason,
        },
        downloaded: false,
      };
    }

    // Download succeeded - build full URL with domain
    const publicUrl = buildPublicAssetUrl(projectId, downloadResult.relativePath);
    
    log.info(`[Auto-download] Successfully downloaded to ${publicUrl}`);
    
    return {
      updatedMeta: applyLocalMediaMeta(baseMeta, {
        nodeType: typedNodeType,
        projectId,
        publicUrl,
        relativePath: downloadResult.relativePath,
        size: downloadResult.size,
        mimeType: downloadResult.mimeType,
        signature: assetSignature,
        sourceValue: initialSource ?? url,
      }),
      downloaded: true,
    };
  } catch (error) {
    // Download failed - log error and keep original URL
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ detail: errorMessage }, '`[Auto-download] Failed for ${url}:`');
    
    return {
      updatedMeta: {
        ...baseMeta,
        auto_download_failed: true,
        download_error: errorMessage,
      },
      downloaded: false,
    };
  }
}

/**
 * Checks if a URL has changed compared to a previous value.
 * Used to determine if we need to re-download when updating a node.
 * 
 * @param newUrl - The new URL value
 * @param oldUrl - The previous URL value
 * @returns true if the URL has changed and requires re-download
 */
export function hasUrlChanged(newUrl: unknown, oldUrl: unknown): boolean {
  // If either is not a string, treat as changed
  if (typeof newUrl !== 'string' || typeof oldUrl !== 'string') {
    return newUrl !== oldUrl;
  }

  // Normalize URLs before comparison
  const normalizeUrl = (url: string): string => {
    return url.trim().toLowerCase();
  };

  return normalizeUrl(newUrl) !== normalizeUrl(oldUrl);
}
