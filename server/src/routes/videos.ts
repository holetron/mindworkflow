import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';
import multer from 'multer';
import {
  extractFrame,
  cropVideo,
  trimVideo,
  ExtractFrameResult,
  CropVideoResult,
  TrimVideoResult,
} from '../services/videoProcessor';
import { createProjectNode, db } from '../db';
import { resolveProjectPath } from '../utils/projectPaths';
import { saveBase64Asset, saveUploadedFile } from '../utils/storage';
import { buildPublicAssetUrl, parseUploadPath } from '../utils/assetUrls';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/videos' });
const router = Router();

/**
 * Helper function to resolve video path from node metadata
 * Handles both file-based videos and legacy base64-encoded videos in database
 */
async function resolveVideoPath(
  videoNode: any,
  projectId: string
): Promise<string> {
  log.info({ data: JSON.stringify(videoNode, null, 2).substring(0, 500) }, '[resolveVideoPath] Input videoNode');
  
  // Parse meta if it's a JSON string
  let meta = videoNode.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  
  log.info('[resolveVideoPath] Parsed meta keys %s', Object.keys(meta || {}));

  const resolveCandidatePath = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed =
      parseUploadPath(trimmed) ??
      (trimmed.startsWith('uploads/') ? parseUploadPath(`/${trimmed}`) : null);

    if (parsed) {
      return resolveProjectPath(parsed.projectId, parsed.assetRelativePath);
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return null;
    }

    const normalized = trimmed.replace(/^\/+/, '');
    if (!normalized || normalized.startsWith('..')) {
      return null;
    }

    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }

    return resolveProjectPath(projectId, normalized);
  };

  const candidateValues: Array<unknown> = [
    meta?.asset_relative_path,
    meta?.video_path,
    meta?.videoPath,
    meta?.path,
    meta?.video_url,
    videoNode.content,
  ];

  let videoPath: string | null = null;

  for (const candidate of candidateValues) {
    const resolved = resolveCandidatePath(candidate);
    if (resolved && fs.existsSync(resolved)) {
      videoPath = resolved;
      break;
    }
  }

  if (!videoPath && meta?.video_file && typeof meta.video_file === 'string') {
    const nodeProjectId = videoNode.project_id || projectId;
    const rawFile = String(meta.video_file).trim();
    const cleanedFile = rawFile
      .replace(/^assets[\\/]+/i, '')
      .replace(/^uploads[\\/]+/i, '')
      .replace(/^videos[\\/]+/i, '');
    const uploadsCandidate = resolveProjectPath(
      nodeProjectId,
      path.join('assets', 'uploads', cleanedFile),
    );
    if (fs.existsSync(uploadsCandidate)) {
      videoPath = uploadsCandidate;
    } else {
      const legacyCandidate = resolveProjectPath(
        nodeProjectId,
        path.join('assets', 'videos', cleanedFile),
      );
      if (fs.existsSync(legacyCandidate)) {
        videoPath = legacyCandidate;
      }
    }
  }

  // Priority 4: Legacy support - if video stored as base64 data URI in database
  if (!videoPath || !fs.existsSync(videoPath)) {
    if (meta?.video_data && typeof meta.video_data === 'string') {
      log.info('[resolveVideoPath] Found legacy video_data, converting to file...');
      try {
        const saved = await saveBase64Asset(projectId, meta.video_data, {
          subdir: 'uploads/videos',
        });
        videoPath = saved.absolutePath;

        // Update node metadata to use file instead of data URI
        const publicUrl = buildPublicAssetUrl(projectId, saved.relativePath);
        const relativeUrl = `/uploads/${projectId}/${saved.relativePath}`.replace(/\\/g, '/');

        meta.video_file = saved.filename;
        meta.video_path = saved.relativePath;
        meta.asset_relative_path = saved.relativePath;
        meta.video_url = publicUrl;
        meta.asset_public_url = publicUrl;
        meta.local_url = relativeUrl;
        meta.file_size = saved.size;
        meta.asset_mime_type = saved.mimeType;
        meta.display_mode = 'upload';
        delete meta.video_data;

        // Update in database
        const updatedMetaJson = JSON.stringify(meta);
        db.prepare('UPDATE nodes SET meta_json = ? WHERE node_id = ?').run(updatedMetaJson, videoNode.node_id);
        
        log.info('[resolveVideoPath] Converted video_data to file %s', saved.relativePath);
      } catch (error) {
        log.error({ err: error }, '[resolveVideoPath] Failed to convert video_data to file');
        throw new Error('Failed to convert legacy video data to file');
      }
    }
  }

  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`Video file not found at ${videoPath}`);
  }

  return videoPath;
}

/**
 * POST /api/videos/:videoNodeId/extract-frame
 * Extract a frame from video at specified timestamp
 */
router.post('/:videoNodeId/extract-frame', async (req: Request, res: Response) => {
  try {
    const { videoNodeId } = req.params;
    const { timestamp, crop } = req.body;
    const projectId = req.headers['x-project-id'] as string;

    log.info(`[extract-frame] Request: videoNodeId=${videoNodeId}, timestamp=${timestamp}, crop=${JSON.stringify(crop)}, projectId=${projectId}`);

    if (!projectId) {
      log.warn('[extract-frame] Missing x-project-id header');
      return res.status(400).json({ message: 'Missing x-project-id header' });
    }

    if (typeof timestamp !== 'number' || timestamp < 0 || !Number.isFinite(timestamp)) {
      log.warn(`[extract-frame] Invalid timestamp: ${timestamp}`);
      return res.status(400).json({ message: 'Invalid timestamp' });
    }

    // Get video node from database to fetch video path
    const videoNode: any = db
      .prepare(
        `
        SELECT node_id, project_id, content, meta_json as meta FROM nodes 
        WHERE node_id = ? AND project_id = ? AND type = 'video'
      `
      )
      .get(videoNodeId, projectId);

    if (!videoNode) {
      log.warn(`[extract-frame] Video node not found: ${videoNodeId}`);
      return res.status(404).json({ message: 'Video node not found' });
    }

    log.info(`[extract-frame] Found video node, resolving path...`);

    // Resolve video path (handles file-based and legacy base64 data)
    const videoPath = await resolveVideoPath(videoNode, projectId);
    
    log.info('[extract-frame] resolved videoPath %s', videoPath);

    // Extract frame with optional crop
    const frameResult: ExtractFrameResult = await extractFrame(videoPath, projectId, timestamp, crop);

    log.info('[extract-frame] Frame extracted, creating image node...');

    // Create Image node for extracted frame
    const frameNodePayload = {
      type: 'image',
      title: `Frame at ${timestamp.toFixed(2)}s`,
      content: frameResult.frameUrl,
      meta: {
        imagePath: frameResult.framePath,
        imageUrl: frameResult.frameUrl,
        width: frameResult.width,
        height: frameResult.height,
        extractedFrom: videoNodeId,
        extractedAtTimestamp: timestamp,
      },
    };

    const { node: newFrameNode } = createProjectNode(projectId, frameNodePayload as any);

    log.info('[extract-frame] Success, sending response');

    res.json({
      success: true,
      frame: frameResult,
      frameNode: newFrameNode,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ detail: errorMsg }, '[extract-frame] error');
    log.error({ err: error }, '[extract-frame] full error');
    
    res.status(500).json({
      success: false,
      message: errorMsg,
      error: errorMsg,
    });
  }
});

/**
 * POST /api/videos/:videoNodeId/crop
 * Crop video to specified dimensions
 */
router.post('/:videoNodeId/crop', async (req: Request, res: Response) => {
  try {
    const { videoNodeId } = req.params;
    const { cropSettings } = req.body;
    const projectId = req.headers['x-project-id'] as string;

    if (!projectId) {
      return res.status(400).json({ message: 'Missing x-project-id header' });
    }

    if (!cropSettings || !cropSettings.x !== undefined || !cropSettings.width) {
      return res.status(400).json({ message: 'Invalid crop settings' });
    }

    // Get video node
    const videoNode: any = db
      .prepare(
        `
        SELECT node_id, project_id, content, meta_json as meta FROM nodes 
        WHERE node_id = ? AND project_id = ? AND type = 'video'
      `
      )
      .get(videoNodeId, projectId);

    if (!videoNode) {
      return res.status(404).json({ message: 'Video node not found' });
    }

    // Resolve video path (handles file-based and legacy base64 data)
    const videoPath = await resolveVideoPath(videoNode, projectId);

    // Crop video
    const cropResult: CropVideoResult = await cropVideo(videoPath, projectId, cropSettings);

    // Create new Video node for cropped video
    const croppedNodePayload = {
      type: 'video',
      title: `Cropped Video (${cropSettings.width}x${cropSettings.height})`,
      content: cropResult.croppedVideoUrl,
      meta: {
        videoPath: cropResult.croppedVideoPath,
        videoUrl: cropResult.croppedVideoUrl,
        width: cropResult.width,
        height: cropResult.height,
        duration: cropResult.duration,
        croppedFrom: videoNodeId,
        cropSettings: cropSettings,
      },
    };

    const { node: newCroppedNode } = createProjectNode(projectId, croppedNodePayload as any);

    res.json({
      success: true,
      croppedVideo: cropResult,
      croppedNode: newCroppedNode,
    });
  } catch (error) {
    log.error({ err: error }, '[crop] error');
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to crop video',
    });
  }
});

/**
 * POST /api/videos/:videoNodeId/trim
 * Trim video to specified time range
 */
router.post('/:videoNodeId/trim', async (req: Request, res: Response) => {
  try {
    const { videoNodeId } = req.params;
    const { startTime, endTime, crop } = req.body;
    const projectId = req.headers['x-project-id'] as string;

    log.info(`[trim] Request: videoNodeId=${videoNodeId}, startTime=${startTime}, endTime=${endTime}, crop=${JSON.stringify(crop)}, projectId=${projectId}`);

    if (!projectId) {
      log.warn('[trim] Missing x-project-id header');
      return res.status(400).json({ message: 'Missing x-project-id header' });
    }

    if (typeof startTime !== 'number' || startTime < 0 || !Number.isFinite(startTime)) {
      log.warn(`[trim] Invalid start time: ${startTime}`);
      return res.status(400).json({ message: 'Invalid start time' });
    }

    if (endTime !== undefined && (typeof endTime !== 'number' || endTime < 0 || !Number.isFinite(endTime))) {
      log.warn(`[trim] Invalid end time: ${endTime}`);
      return res.status(400).json({ message: 'Invalid end time' });
    }

    // Get video node
    log.info(`[trim] Looking up video node...`);
    const videoNode: any = db
      .prepare(
        `
        SELECT node_id, project_id, content, meta_json as meta FROM nodes 
        WHERE node_id = ? AND project_id = ? AND type = 'video'
      `
      )
      .get(videoNodeId, projectId);

    if (!videoNode) {
      log.warn(`[trim] Video node not found: ${videoNodeId}`);
      return res.status(404).json({ message: 'Video node not found' });
    }

    log.info(`[trim] Found video node, resolving path...`);
    // Resolve video path (handles file-based and legacy base64 data)
    const videoPath = await resolveVideoPath(videoNode, projectId);
    
    log.info(`[trim] Video path resolved to: ${videoPath}`);
    log.info(`[trim] Starting trim operation...`);

    // Trim video with optional crop
    const trimResult: TrimVideoResult = await trimVideo(videoPath, projectId, startTime, endTime, crop);

    log.info(`[trim] Trim complete, creating node...`);

    // Create new Video node for trimmed video
    const trimmedNodePayload = {
      type: 'video',
      title: `Trimmed Video (${startTime.toFixed(2)}s - ${endTime ? endTime.toFixed(2) + 's' : 'end'})`,
      content: trimResult.trimmedVideoUrl,
      meta: {
        video_url: trimResult.trimmedVideoUrl,
        video_path: trimResult.trimmedVideoPath,
        duration: trimResult.duration,
        trimmedFrom: videoNodeId,
        trimSettings: {
          startTime,
          endTime,
          crop,
        },
      },
    };

    const { node: newTrimmedNode } = createProjectNode(projectId, trimmedNodePayload as any);

    log.info(`[trim] Success, sending response`);

    res.json({
      success: true,
      trimmedVideo: trimResult,
      trimmedNode: newTrimmedNode,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ detail: errorMsg }, '[trim] error');
    log.error({ err: error }, '[trim] full error');
    res.status(500).json({
      success: false,
      message: errorMsg,
      error: errorMsg,
    });
  }
});

/**
 * POST /api/videos/:videoNodeId/upload
 * Upload a video file and store it on the server
 */
router.post('/:videoNodeId/upload', (req: Request, res: Response) => {
  try {
    const tempDir = path.join(os.tmpdir(), 'mindworkflow', 'uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const upload = multer({
      dest: tempDir,
      limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    });

    upload.single('file')(req, res, async (err) => {
      if (err) {
        log.error({ err: err }, '[upload] multer error');
        return res.status(400).json({
          success: false,
          message: 'File upload failed',
          error: err.message,
        });
      }

      const projectIdHeader = req.headers['x-project-id'];
      const projectId = typeof projectIdHeader === 'string' ? projectIdHeader.trim() : Array.isArray(projectIdHeader) ? projectIdHeader[0]?.trim() : '';

      if (!projectId) {
        if (req.file) {
          fs.promises.unlink(req.file.path).catch(() => {});
        }
        log.warn('[upload] Missing x-project-id header');
        return res.status(400).json({
          success: false,
          message: 'Missing x-project-id header',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided',
        });
      }

      try {
        const { videoNodeId } = req.params;
        const uploadedFile = req.file;

        const saved = await saveUploadedFile(projectId, uploadedFile.path, {
          originalName: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype,
          subdir: 'uploads/videos',
        });

        const publicUrl = buildPublicAssetUrl(projectId, saved.relativePath);
        const relativeUrl = `/uploads/${projectId}/${saved.relativePath}`.replace(/\\/g, '/');

        res.json({
          success: true,
          url: publicUrl,
          publicUrl,
          relativeUrl,
          assetRelativePath: saved.relativePath,
          assetMimeType: saved.mimeType,
          filename: saved.filename,
          originalFilename: uploadedFile.originalname,
          mimeType: saved.mimeType,
          size: saved.size,
          projectId,
          nodeId: videoNodeId,
        });
      } catch (error) {
        if (req.file) {
          fs.promises.unlink(req.file.path).catch(() => {});
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error({ detail: errorMsg }, '[upload] error');
        res.status(500).json({
          success: false,
          message: 'Upload processing failed',
          error: errorMsg,
        });
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ detail: errorMsg }, '[upload] error');
    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: errorMsg,
    });
  }
});

export default router;
