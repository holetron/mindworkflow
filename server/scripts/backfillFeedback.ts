import fs from 'fs';
import path from 'path';
import { createFeedbackEntry, getFeedbackEntry, updateFeedbackEntry } from '../src/db';

type FeedbackType = 'problem' | 'suggestion' | 'unknown';
type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

const STATUS_MAP: Record<string, FeedbackStatus> = {
  'awaiting review': 'new',
  pending: 'new',
  'in progress': 'in_progress',
  processing: 'in_progress',
  resolved: 'resolved',
  done: 'resolved',
  archive: 'archived',
  archived: 'archived',
  // Legacy Russian labels
  'ожидает рассмотрения': 'new',
  ожидание: 'new',
  'в работе': 'in_progress',
  'в процессе': 'in_progress',
  решено: 'resolved',
  готово: 'resolved',
  архив: 'archived',
  архивировано: 'archived',
};

function normalizeStatus(value: string | undefined): FeedbackStatus {
  if (!value) {
    return 'new';
  }
  const normalized = value.trim().toLowerCase();
  return STATUS_MAP[normalized] ?? 'new';
}

function detectTypeFromFilename(filename: string): FeedbackType {
  if (filename.endsWith('-problem.md')) {
    return 'problem';
  }
  if (filename.endsWith('-suggestion.md') || filename.endsWith('-improvement.md')) {
    return 'suggestion';
  }
  return 'unknown';
}

function parseMarkdownFeedback(filePath: string, filename: string) {
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
  const description = lines.slice(descriptionStart, descriptionEnd).join('\n').trim();

  const statusLine =
    statusSectionIndex >= 0 && statusSectionIndex + 1 < lines.length
      ? lines[statusSectionIndex + 1]?.trim()
      : '';
  const resolutionLines =
    resolutionSectionIndex >= 0 ? lines.slice(resolutionSectionIndex + 1).join('\n').trim() : '';

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
    type: detectTypeFromFilename(filename),
    title,
    description: description || 'No description provided.',
    status: normalizeStatus(statusLine),
    contact: contact || null,
    resolution: resolutionLines || null,
    created_at: createdAtIso,
    source: filename,
  };
}

function resolveFeedbackDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'feedback'),
    path.resolve(__dirname, '../feedback'),
    path.resolve(__dirname, '../../feedback'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function main(): void {
  const feedbackDir = resolveFeedbackDir();
  if (!feedbackDir) {
    console.log('[backfill-feedback] feedback directory not found, nothing to import.');
    return;
  }

  const files = fs.readdirSync(feedbackDir).filter((file) => file.endsWith('.md'));
  if (files.length === 0) {
    console.log('[backfill-feedback] no markdown feedback files detected.');
    return;
  }

  let created = 0;
  let updated = 0;

  for (const file of files) {
    const filePath = path.join(feedbackDir, file);
    try {
      const parsed = parseMarkdownFeedback(filePath, file);
      const existing = getFeedbackEntry(parsed.feedback_id);
      if (!existing) {
        createFeedbackEntry({
          feedback_id: parsed.feedback_id,
          type: parsed.type,
          title: parsed.title,
          description: parsed.description,
          status: parsed.status,
          contact: parsed.contact,
          resolution: parsed.resolution,
          source: parsed.source,
          created_at: parsed.created_at,
        });
        created += 1;
        continue;
      }

      updateFeedbackEntry(parsed.feedback_id, {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        contact: parsed.contact,
        resolution: parsed.resolution,
      });
      updated += 1;
    } catch (error) {
      console.error(`[backfill-feedback] Failed to process ${file}:`, error);
    }
  }

  console.log(`[backfill-feedback] Completed. created=${created}, updated=${updated}`);
}

main();
