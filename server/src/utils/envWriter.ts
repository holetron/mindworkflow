import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

/**
 * Upsert key/value pairs into the local .env file without disturbing
 * other entries. Lines with comments are preserved.
 */
export function upsertEnvVariables(updates: Record<string, string>): void {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  let lines: string[] = [];
  if (fs.existsSync(ENV_FILE_PATH)) {
    const raw = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    lines = raw.split(/\r?\n/);
  }

  const seen = new Set<string>();

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        seen.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  const additions: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      additions.push(`${key}=${value}`);
    }
  }

  const finalLines = [...updatedLines, ...additions].filter(
    (line, index, arr) => line !== '' || index !== arr.length - 1,
  );

  fs.writeFileSync(ENV_FILE_PATH, finalLines.join('\n') + '\n', 'utf8');
}
