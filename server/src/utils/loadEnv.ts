import * as fs from 'fs';
import * as path from 'path';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'loadEnv' });
let envLoaded = false;

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadEnv(): void {
  log.info('loadEnv called');
  if (envLoaded || process.env.SKIP_ENV_FILE_LOAD === '1') {
    return;
  }

  const envPath = path.resolve(process.cwd(), '.env');
  log.info('envPath %s', envPath);
  if (!fs.existsSync(envPath)) {
    envLoaded = true;
    return;
  }

  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : error }, '⚠️ Failed to read .env file');
  } finally {
    envLoaded = true;
  }
}
