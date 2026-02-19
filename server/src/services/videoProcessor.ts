import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getProjectsRoot } from '../utils/projectPaths';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'videoProcessor' });
const ffmpeg = require('fluent-ffmpeg');

// Set FFmpeg and FFprobe paths (should be in system PATH)
// If not found, install with: apt-get install ffmpeg

const PROJECTS_ROOT = getProjectsRoot();

export interface ExtractFrameResult {
  framePath: string;
  frameUrl: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface CropVideoResult {
  croppedVideoPath: string;
  croppedVideoUrl: string;
  width: number;
  height: number;
  duration: number;
}

export interface TrimVideoResult {
  trimmedVideoPath: string;
  trimmedVideoUrl: string;
  duration: number;
}

/**
 * Extract a single frame from video at given timestamp
 * @param videoPath Full path to input video file
 * @param projectId Project ID for output directory
 * @param timestamp Timestamp in seconds
 * @param cropParams Optional crop parameters { x, y, width, height }
 * @returns Frame file path, URL, and dimensions
 */
export async function extractFrame(
  videoPath: string,
  projectId: string,
  timestamp: number,
  cropParams?: { x: number; y: number; width: number; height: number }
): Promise<ExtractFrameResult> {
  return new Promise((resolve, reject) => {
    try {
      // Verify video file exists
      if (!fs.existsSync(videoPath)) {
        log.error(`[extractFrame] Video file not found: ${videoPath}`);
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // Create output directory if not exists
      const outputDir = path.join(PROJECTS_ROOT, projectId);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const frameFileName = `frame_${timestamp}_${uuidv4()}.jpg`;
      const framePath = path.join(outputDir, frameFileName);
      const frameUrl = `https://mindworkflow.com/uploads/${projectId}/${frameFileName}`;

      log.info(`[extractFrame] Starting extraction from ${videoPath} at ${timestamp}s`);

      // First, get video dimensions with ffprobe
      ffmpeg.ffprobe(videoPath, (err: Error | null, metadata: any) => {
        if (err) {
          log.error({ err: err }, '`[extractFrame] ffprobe error for ${videoPath}:`');
          return reject(new Error(`Failed to get video metadata: ${err.message}`));
        }

        const stream = metadata.streams.find((s: any) => s.codec_type === 'video');
        const width = stream?.width || 1280;
        const height = stream?.height || 720;

        log.info(`[extractFrame] Video dimensions: ${width}x${height}`);
        if (cropParams) {
          log.info(`[extractFrame] Crop parameters: x=${cropParams.x}, y=${cropParams.y}, w=${cropParams.width}, h=${cropParams.height}`);
        }

        // Extract frame preserving original aspect ratio and quality
        const command = ffmpeg(videoPath)
          .seekInput(timestamp)
          .frames(1)
          .output(framePath);

        const outputOptions = ['-q:v', '2']; // High quality

        // Add crop filter if crop parameters are provided
        if (cropParams) {
          command.videoFilters([
            `crop=${cropParams.width}:${cropParams.height}:${cropParams.x}:${cropParams.y}`
          ]);
        }

        command
          .outputOptions(outputOptions)
          .on('end', () => {
            log.info(`[extractFrame] Screenshot created: ${framePath}`);
            
            // Verify the frame was actually created
            if (!fs.existsSync(framePath)) {
              log.error(`[extractFrame] Frame file was not created at ${framePath}`);
              return reject(new Error(`Frame file was not created`));
            }

            const finalWidth = cropParams ? cropParams.width : width;
            const finalHeight = cropParams ? cropParams.height : height;

            log.info(`[extractFrame] Frame extracted successfully: ${frameUrl} (${finalWidth}x${finalHeight})`);

            resolve({
              framePath,
              frameUrl,
              width: finalWidth,
              height: finalHeight,
              timestamp,
            });
          })
          .on('error', (err: Error) => {
            log.error({ err: err }, '`[extractFrame] ffmpeg error:`');
            reject(new Error(`Failed to extract frame: ${err.message}`));
          })
          .run();
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error({ detail: errorMsg }, '`[extractFrame] Exception:`');
      reject(new Error(`Failed to extract frame: ${errorMsg}`));
    }
  });
}

/**
 * Crop video to specified dimensions
 * @param videoPath Full path to input video file
 * @param projectId Project ID for output directory
 * @param cropSettings Crop settings { x, y, width, height }
 * @returns Cropped video path, URL, and dimensions
 */
export async function cropVideo(
  videoPath: string,
  projectId: string,
  cropSettings: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): Promise<CropVideoResult> {
  return new Promise((resolve, reject) => {
    // Validate crop settings
    if (
      cropSettings.x < 0 ||
      cropSettings.y < 0 ||
      cropSettings.width <= 0 ||
      cropSettings.height <= 0
    ) {
      return reject(new Error('Invalid crop settings'));
    }

    // Create output directory
    const outputDir = path.join(PROJECTS_ROOT, projectId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFileName = `cropped_${uuidv4()}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);
    const outputUrl = `https://mindworkflow.com/uploads/${projectId}/${outputFileName}`;

    const cropFilter = `crop=${cropSettings.width}:${cropSettings.height}:${cropSettings.x}:${cropSettings.y}`;

    log.info({ data: { videoPath, outputPath, cropFilter } }, '`[cropVideo] Starting crop operation:`');

    ffmpeg(videoPath)
      .videoFilter(cropFilter)
      .output(outputPath)
      .on('start', (cmd: any) => {
        log.info('`[cropVideo] ffmpeg command started:` %s', cmd);
      })
      .on('progress', (progress: any) => {
        log.info('`[cropVideo] Progress:` %s', progress);
      })
      .on('end', () => {
        log.info(`[cropVideo] Crop operation completed`);
        // Get output video dimensions and duration
        ffmpeg.ffprobe(outputPath, (err: Error | null, metadata: any) => {
          if (err) {
            log.error({ err: err }, '`[cropVideo] ffprobe error:`');
            return resolve({
              croppedVideoPath: outputPath,
              croppedVideoUrl: outputUrl,
              width: cropSettings.width,
              height: cropSettings.height,
              duration: 0,
            });
          }

          const stream = metadata.streams.find((s: any) => s.codec_type === 'video');
          const duration = metadata.format.duration || 0;

          log.info({ data: { width: stream?.width, height: stream?.height, duration } }, '`[cropVideo] Resolved with metadata:`');

          resolve({
            croppedVideoPath: outputPath,
            croppedVideoUrl: outputUrl,
            width: stream?.width || cropSettings.width,
            height: stream?.height || cropSettings.height,
            duration,
          });
        });
      })
      .on('error', (err: Error) => {
        log.error({ err: err }, '`[cropVideo] ffmpeg error:`');
        reject(new Error(`Failed to crop video: ${err.message}`));
      })
      .run();
  });
}

/**
 * Trim video to specified time range
 * @param videoPath Full path to input video file
 * @param projectId Project ID for output directory
 * @param startTime Start time in seconds
 * @param endTime End time in seconds (optional; if not provided, trim to end)
 * @param cropParams Optional crop parameters { x, y, width, height }
 * @returns Trimmed video path, URL, and duration
 */
export async function trimVideo(
  videoPath: string,
  projectId: string,
  startTime: number,
  endTime?: number,
  cropParams?: { x: number; y: number; width: number; height: number }
): Promise<TrimVideoResult> {
  return new Promise((resolve, reject) => {
    try {
      // Validate input video exists
      if (!fs.existsSync(videoPath)) {
        log.error(`[trimVideo] Input video not found: ${videoPath}`);
        throw new Error(`Input video not found: ${videoPath}`);
      }

      // Validate times
      if (startTime < 0) {
        return reject(new Error('Start time must be >= 0'));
      }

      if (endTime !== undefined && endTime <= startTime) {
        return reject(new Error('End time must be > start time'));
      }

      // Create output directory
      const outputDir = path.join(PROJECTS_ROOT, projectId);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputFileName = `trimmed_${uuidv4()}.mp4`;
      const outputPath = path.join(outputDir, outputFileName);
      const outputUrl = `https://mindworkflow.com/uploads/${projectId}/${outputFileName}`;

      log.info(`[trimVideo] Starting trim: ${videoPath} (${startTime}s - ${endTime || 'end'}s) -> ${outputPath}`);
      if (cropParams) {
        log.info(`[trimVideo] Crop parameters: x=${cropParams.x}, y=${cropParams.y}, w=${cropParams.width}, h=${cropParams.height}`);
      }

      let cmd = ffmpeg(videoPath).setStartTime(startTime);

      if (endTime !== undefined) {
        cmd = cmd.setDuration(endTime - startTime);
      }

      // Add crop filter if crop parameters are provided
      if (cropParams) {
        cmd = cmd.videoFilters([
          `crop=${cropParams.width}:${cropParams.height}:${cropParams.x}:${cropParams.y}`
        ]);
      }

      cmd
        .output(outputPath)
        .on('start', (commandLine: string) => {
          log.info(`[trimVideo] Spawned ffmpeg with command: ${commandLine}`);
        })
        .on('progress', (progress: any) => {
          log.info(`[trimVideo] Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          log.info(`[trimVideo] Encoding finished for ${outputPath}`);
          
          // Verify output file exists
          if (!fs.existsSync(outputPath)) {
            log.error(`[trimVideo] Output file was not created at ${outputPath}`);
            return reject(new Error('Trimmed video file was not created'));
          }

          // Get trimmed video duration
          ffmpeg.ffprobe(outputPath, (err: Error | null, metadata: any) => {
            if (err) {
              log.error({ err: err }, '`[trimVideo] ffprobe error:`');
              return resolve({
                trimmedVideoPath: outputPath,
                trimmedVideoUrl: outputUrl,
                duration: 0,
              });
            }

            const duration = metadata.format.duration || 0;
            log.info(`[trimVideo] Trimmed video duration: ${duration}s`);

            resolve({
              trimmedVideoPath: outputPath,
              trimmedVideoUrl: outputUrl,
              duration,
            });
          });
        })
        .on('error', (err: Error) => {
          log.error({ err: err }, '`[trimVideo] ffmpeg error:`');
          reject(new Error(`Failed to trim video: ${err.message}`));
        })
        .run();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error({ detail: errorMsg }, '`[trimVideo] Exception:`');
      reject(new Error(`Failed to trim video: ${errorMsg}`));
    }
  });
}
