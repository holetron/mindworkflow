import * as fs from 'fs';
import * as path from 'path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'migrations/20251021_create_feedback_entries' });
const MIGRATION_ID = '20251021_create_feedback_entries';

const STATUS_MAP: Record<string, 'new' | 'in_progress' | 'resolved' | 'archived'> = {
  'awaiting review': 'new',
  'pending': 'new',
  'in progress': 'in_progress',
  'processing': 'in_progress',
  'resolved': 'resolved',
  'done': 'resolved',
  'archive': 'archived',
  'archived': 'archived',
};

function normalizeStatus(value: string | undefined): 'new' | 'in_progress' | 'resolved' | 'archived' {
  if (!value) {
    return 'new';
  }
  const normalized = value.trim().toLowerCase();
  return STATUS_MAP[normalized] ?? 'new';
}

function parseLegacyMarkdown(filePath: string, filename: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const titleLine = lines.find((line) => line.trim().startsWith('#'));
    const title = titleLine ? titleLine.replace(/^#+\s*/, '').trim() || 'Feedback' : 'Feedback';

    const contactLine = lines.find((line) => line.trim().startsWith('**Contact:**') || line.trim().startsWith('**Контакт:**'));
    const contact = contactLine
      ? contactLine.replace(/\*\*(Contact|Контакт):\*\*\s*/i, '').trim().replace(/^(Not specified|Не указан)$/i, '')
      : '';

    const statusSectionIndex = lines.findIndex((line) => line.trim().toLowerCase() === '## status' || line.trim().toLowerCase() === '## статус');
    const resolutionSectionIndex = lines.findIndex((line) => line.trim().toLowerCase() === '## resolution' || line.trim().toLowerCase() === '## решение');
    const descriptionSectionIndex = lines.findIndex((line) => line.trim().toLowerCase() === '## description' || line.trim().toLowerCase() === '## описание');

    const descriptionStart = descriptionSectionIndex >= 0 ? descriptionSectionIndex + 1 : 1;
    const descriptionEnd = statusSectionIndex > descriptionStart ? statusSectionIndex : lines.length;
    const description = lines
      .slice(descriptionStart, descriptionEnd)
      .join('\n')
      .trim();

    const statusLine =
      statusSectionIndex >= 0 && statusSectionIndex + 1 < lines.length
        ? lines[statusSectionIndex + 1]?.trim()
        : '';
    const resolutionLines =
      resolutionSectionIndex >= 0
        ? lines.slice(resolutionSectionIndex + 1).join('\n').trim()
        : '';

    const typeFromName = filename.replace(/\.md$/i, '').split('-').pop();
    const type =
      typeFromName === 'problem'
        ? 'problem'
        : typeFromName === 'suggestion' || typeFromName === 'improvement'
        ? 'suggestion'
        : 'unknown';

    let createdAtIso = '';
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(\d{6})-/);
    if (match) {
      const [, datePart, timePart] = match;
      const hours = timePart.slice(0, 2);
      const minutes = timePart.slice(2, 4);
      const seconds = timePart.slice(4, 6);
      const candidate = new Date(`${datePart}T${hours}:${minutes}:${seconds}`);
      if (!Number.isNaN(candidate.getTime())) {
        createdAtIso = candidate.toISOString();
      }
    }

    if (!createdAtIso) {
      const stat = fs.statSync(filePath);
      createdAtIso = stat.mtime.toISOString();
    }

    return {
      feedback_id: filename.replace(/\.md$/i, ''),
      type,
      title,
      description: description || 'No description provided.',
      status: normalizeStatus(statusLine),
      contact: contact || null,
      resolution: resolutionLines || null,
      source: filename,
      created_at: createdAtIso,
      updated_at: createdAtIso,
      meta_json: JSON.stringify({ source: 'legacy-markdown', filename }),
    };
  } catch (error) {
    log.error({ err: error }, '`[migration:${MIGRATION_ID}] Failed to parse legacy feedback ${filename}:`');
    return null;
  }
}

export const createFeedbackEntriesMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create feedback entries table and import markdown feedback',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_entries (
        feedback_id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('problem', 'suggestion', 'unknown')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('new', 'in_progress', 'resolved', 'archived')),
        contact TEXT,
        resolution TEXT,
        source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        meta_json TEXT
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_entries_status ON feedback_entries(status);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_entries_created_at ON feedback_entries(datetime(created_at) DESC);
    `);

    const feedbackDir = path.resolve(process.cwd(), 'feedback');
    if (!fs.existsSync(feedbackDir)) {
      return;
    }

    const files = fs.readdirSync(feedbackDir).filter((file) => file.endsWith('.md'));
    if (files.length === 0) {
      return;
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO feedback_entries (
        feedback_id,
        type,
        title,
        description,
        status,
        contact,
        resolution,
        source,
        created_at,
        updated_at,
        meta_json
      ) VALUES (
        @feedback_id,
        @type,
        @title,
        @description,
        @status,
        @contact,
        @resolution,
        @source,
        @created_at,
        @updated_at,
        @meta_json
      );
    `);

    for (const file of files) {
      const filePath = path.join(feedbackDir, file);
      const parsed = parseLegacyMarkdown(filePath, file);
      if (!parsed) {
        continue;
      }

      try {
        insert.run(parsed);
      } catch (error) {
        log.error({ err: error }, '`[migration:${MIGRATION_ID}] Failed to import feedback ${file}:`');
      }
    }
  },
};

