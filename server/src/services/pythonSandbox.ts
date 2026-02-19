import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../utils/projectPaths';

const ALLOWLIST = new Set([
  're',
  'json',
  'sys',
  'csv',
  'itertools',
  'math',
  'statistics',
  'pandas',
  'numpy',
  'bs4',
  'beautifulsoup4',
  'bs4.BeautifulSoup',
  'lxml',
  'markdown',
]);

const DEFAULT_TIMEOUT_MS = 30_000;

export interface PythonExecutionOptions {
  projectId: string;
  code: string;
  input?: unknown;
  allowNetwork: boolean;
}

export interface PythonExecutionResult {
  stdout: string;
  stderr: string;
  outputJson?: unknown;
}

const venvRoot = path.resolve(process.cwd(), '.venv');

export function ensureVenv(): void {
  const pythonBin = resolvePythonBin();
  if (fs.existsSync(pythonBin)) {
    return;
  }

  fs.mkdirSync(venvRoot, { recursive: true });
  const result = spawnSync('python3', ['-m', 'venv', venvRoot], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Failed to create Python venv for sandbox');
  }
}

export async function executePython(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
  const { projectId, code, input, allowNetwork } = options;
  validateImports(code);
  ensureVenv();

  const pythonBin = resolvePythonBin();
  const projectOutputDir = resolveProjectPath(projectId, 'project_output');
  fs.mkdirSync(projectOutputDir, { recursive: true });

  const scriptPath = path.join(projectOutputDir, `sandbox_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, code, 'utf8');

  try {
    const env = {
      ...process.env,
      LCF_SANDBOX: '1',
      LCF_OUTPUT_DIR: projectOutputDir,
      LCF_NETWORK: allowNetwork ? 'proxied' : 'disabled',
      LCF_RAM_LIMIT: '1073741824',
    };

    const args = [scriptPath];
    const subprocess = spawn(pythonBin, args, {
      env,
      cwd: projectOutputDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      subprocess.kill('SIGKILL');
    }, DEFAULT_TIMEOUT_MS);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    subprocess.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    subprocess.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    if (input !== undefined) {
      subprocess.stdin.write(JSON.stringify(input));
    }
    subprocess.stdin.end();

    const exitCode: number = await new Promise((resolve, reject) => {
      subprocess.on('error', reject);
      subprocess.on('close', resolve);
    });

    clearTimeout(timeout);

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');

    const trimmed = stdout.trim();
    let parsed: unknown;
    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        parsed = trimmed;
      }
    }

    if (exitCode !== 0) {
      throw new Error(`Python sandbox exited with code ${exitCode}: ${stderr}`);
    }

    return { stdout, stderr, outputJson: parsed };
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch (error) {
      // ignore cleanup errors
    }
  }
}

function validateImports(code: string): void {
  const importRegex = /^(?:from\s+([\w\.]+)\s+import|import\s+([\w\.]+))/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code))) {
    const module = (match[1] || match[2] || '').split('.')[0];
    if (!ALLOWLIST.has(module)) {
      throw new Error(`Module '${module}' is not allowed in sandbox`);
    }
  }

  if (/open\s*\(/.test(code) && !code.includes('LCF_OUTPUT_DIR')) {
    throw new Error('Direct file access is restricted. Use project_output directory');
  }
}

function resolvePythonBin(): string {
  const isWin = process.platform === 'win32';
  return path.join(venvRoot, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
}
