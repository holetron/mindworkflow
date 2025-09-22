import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface VideoStubOptions {
  projectId: string;
  nodeId: string;
}

export interface VideoStubResult {
  videoPath: string;
  logs: string[];
}

export async function generatePreviz(options: VideoStubOptions): Promise<VideoStubResult> {
  const { projectId } = options;
  const projectOutputDir = path.resolve(process.cwd(), 'projects', projectId, 'project_output');
  fs.mkdirSync(projectOutputDir, { recursive: true });
  const destPath = path.join(projectOutputDir, 'previz.mp4');

  if (fs.existsSync(destPath)) {
    return {
      videoPath: destPath,
      logs: ['FFmpeg stub reused existing previz.mp4'],
    };
  }

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1280x720:d=5',
    '-vcodec',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    destPath,
  ];

  try {
    await runFfmpeg(args);
  } catch (error) {
    if ((error as Error).message.includes('ENOENT')) {
      fs.writeFileSync(destPath, Buffer.alloc(1024));
      return {
        videoPath: destPath,
        logs: ['FFmpeg not found, created placeholder video file'],
      };
    }
    throw error;
  }

  const stats = fs.statSync(destPath);
  return {
    videoPath: destPath,
    logs: [`FFmpeg stub created ${destPath} (${stats.size} bytes)`],
  };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'ignore' });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg execution failed: ${(error as Error).message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}
