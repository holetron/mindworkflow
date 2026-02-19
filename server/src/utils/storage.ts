import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { getProjectDir } from './projectPaths';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'storage' });
export interface DownloadOptions {
  subdir?: string;
  filename?: string;
  maxSize?: number;
}

export interface DownloadResult {
  absolutePath: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  size: number;
  skipped?: boolean;
  reason?: string;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function inferExtension(mimeType: string): string {
  if (!mimeType) {
    return 'bin';
  }
  // Images
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('bmp')) return 'bmp';
  // Videos
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mov')) return 'mov';
  if (mimeType.includes('avi')) return 'avi';
  if (mimeType.includes('mkv')) return 'mkv';
  return 'bin';
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function sanitizeSubdir(subdir?: string | null): string | null {
  if (!subdir) {
    return null;
  }
  const segments = subdir
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .map((segment) => sanitizeSegment(segment))
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  return path.join(...segments);
}

function deriveFilename(url: string, mimeType: string): string {
  try {
    const parsed = new URL(url);
    const basename = path.basename(parsed.pathname);
    if (basename && basename !== '/' && basename !== '.') {
      return sanitizeSegment(basename);
    }
  } catch {
    // ignore
  }
  return `${randomUUID()}.${inferExtension(mimeType)}`;
}

export async function downloadRemoteAsset(
  projectId: string,
  url: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const projectDir = getProjectDir(projectId);
  const assetsDir = path.join(projectDir, 'assets');
  await ensureDirectory(assetsDir);

  const targetDir = options.subdir ? path.join(assetsDir, options.subdir) : assetsDir;
  await ensureDirectory(targetDir);

  log.info(`[downloadRemoteAsset] projectDir: ${projectDir}`);
  log.info(`[downloadRemoteAsset] assetsDir: ${assetsDir}`);
  log.info(`[downloadRemoteAsset] targetDir: ${targetDir}`);

  // Check size with HEAD request if maxSize is specified
  if (options.maxSize) {
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      
      const contentLength = headResponse.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > options.maxSize) {
          return {
            absolutePath: '',
            relativePath: '',
            filename: '',
            mimeType: '',
            size: size,
            skipped: true,
            reason: 'file_too_large',
          };
        }
      }
    } catch (error) {
      // HEAD request failed, proceed with GET but still enforce size limit
      log.warn({ err: error }, '`[downloadRemoteAsset] HEAD request failed for ${url}:`');
    }
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });
  
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download asset (${response.status} ${response.statusText})`);
  }

  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  const filename = sanitizeSegment(
    options.filename ?? deriveFilename(url, mimeType),
  );
  const absolutePath = path.join(targetDir, filename);

  log.info(`[downloadRemoteAsset] Starting download: url=${url}`);
  log.info(`[downloadRemoteAsset] Target directory: ${targetDir}`);
  log.info(`[downloadRemoteAsset] Filename: ${filename}`);
  log.info(`[downloadRemoteAsset] Absolute path: ${absolutePath}`);

  // Stream download with size checking if maxSize is set
  const nodeStream = Readable.fromWeb(response.body as unknown as ReadableStream);
  const writeStream = fs.createWriteStream(absolutePath);
  
  let downloadedSize = 0;
  let streamError: Error | null = null;
  
  writeStream.on('error', (err) => {
    log.error({ err: err }, '`[downloadRemoteAsset] Write stream error for ${absolutePath}:`');
    streamError = err;
  });
  
  if (options.maxSize) {
    nodeStream.on('data', (chunk: Buffer) => {
      downloadedSize += chunk.length;
      if (downloadedSize > options.maxSize!) {
        nodeStream.destroy();
        writeStream.destroy();
        // Clean up partial file
        fs.promises.unlink(absolutePath).catch(() => {});
        throw new Error(`File size exceeds maximum allowed size of ${options.maxSize} bytes`);
      }
    });
  }

  try {
    await pipeline(nodeStream, writeStream);
    log.info(`[downloadRemoteAsset] Pipeline completed successfully for: ${absolutePath}`);
    
    if (streamError) {
      throw streamError;
    }
  } catch (pipelineError) {
    log.error({ err: pipelineError }, '`[downloadRemoteAsset] Pipeline error for ${absolutePath}:`');
    throw pipelineError;
  }

  try {
    const stats = await fs.promises.stat(absolutePath);
    log.info(`[downloadRemoteAsset] File stats: size=${stats.size}, exists=true`);
  } catch (statError) {
    log.error({ err: statError }, '`[downloadRemoteAsset] Stat error - file may not exist: ${absolutePath}`');
    throw new Error(`File was not created at ${absolutePath}`);
  }

  const stats = await fs.promises.stat(absolutePath);
  const relativePath = path.relative(projectDir, absolutePath);

  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, '/'),
    filename,
    mimeType,
    size: stats.size,
  };
}

export interface SaveBase64Options extends DownloadOptions {
  mimeType?: string;
}

export async function saveBase64Asset(
  projectId: string,
  base64: string,
  options: SaveBase64Options = {},
): Promise<DownloadResult> {
  const projectDir = getProjectDir(projectId);
  const assetsDir = path.join(projectDir, 'assets');
  const targetDir = options.subdir ? path.join(assetsDir, options.subdir) : assetsDir;
  await ensureDirectory(targetDir);

  let mimeType = options.mimeType ?? 'application/octet-stream';
  let data = base64.trim();

  const dataUrlMatch = /^data:([^;]+);base64,(.*)$/i.exec(data);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType;
    data = dataUrlMatch[2] || '';
  }

  const filename = sanitizeSegment(
    options.filename ?? `${randomUUID()}.${inferExtension(mimeType)}`,
  );
  const absolutePath = path.join(targetDir, filename);
  const buffer = Buffer.from(data, 'base64');
  await fs.promises.writeFile(absolutePath, buffer);

  const stats = await fs.promises.stat(absolutePath);
  const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, '/');

  return {
    absolutePath,
    relativePath,
    filename,
    mimeType,
    size: stats.size,
  };
}

export interface SaveUploadedFileOptions extends DownloadOptions {
  originalName?: string;
  mimeType?: string;
}

export async function saveUploadedFile(
  projectId: string,
  temporaryPath: string,
  options: SaveUploadedFileOptions = {},
): Promise<DownloadResult> {
  const { originalName, mimeType: providedMimeType } = options;

  const projectDir = getProjectDir(projectId);
  const assetsDir = path.join(projectDir, 'assets');
  const targetDir = options.subdir ? path.join(assetsDir, options.subdir) : path.join(assetsDir, 'uploads');
  await ensureDirectory(targetDir);

  const stats = await fs.promises.stat(temporaryPath);
  if (!stats.isFile()) {
    throw new Error(`Temporary upload path is not a file: ${temporaryPath}`);
  }

  const mimeType = providedMimeType ?? 'application/octet-stream';
  const ext = inferExtension(mimeType);
  const baseName = originalName ? path.parse(originalName).name : randomUUID();
  const filename = `${sanitizeSegment(baseName)}.${ext}`;
  const absolutePath = path.join(targetDir, filename);

  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.promises.rename(temporaryPath, absolutePath);

  const finalStats = await fs.promises.stat(absolutePath);
  const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, '/');

  return {
    absolutePath,
    relativePath,
    filename,
    mimeType,
    size: finalStats.size,
  };
}

/**
 * Convert a local file path to a data URI
 * Used for sending local images to external APIs (like Replicate)
 * 
 * @param absolutePath - Absolute path to the file
 * @returns Data URI string (e.g. "data:image/jpeg;base64,/9j/4AAQ...")
 */
export async function localFileToDataUri(absolutePath: string): Promise<string> {
  try {
    const buffer = await fs.promises.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    
    // Determine MIME type from extension
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.bmp') mimeType = 'image/bmp';
    
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    log.error({ err: error }, '`[localFileToDataUri] Failed to read file ${absolutePath}:`');
    throw error;
  }
}
