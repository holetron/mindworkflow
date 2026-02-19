// feedbackRepository.ts — Feedback operations
import * as crypto from 'crypto';
import { db, createHttpError } from '../connection';
import type {
  FeedbackType,
  FeedbackStatus,
  FeedbackRecord,
  FeedbackSummary,
  FeedbackCreateInput,
  FeedbackUpdateInput,
} from '../types';

// ---- Internal types ----------------------------------------------------------

type FeedbackRow = {
  feedback_id: string;
  type: string;
  title: string | null;
  description: string | null;
  status: string;
  contact: string | null;
  resolution: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Internal helpers --------------------------------------------------------

const FEEDBACK_TYPE_VALUES: FeedbackType[] = ['problem', 'suggestion', 'unknown'];
const FEEDBACK_STATUS_VALUES: FeedbackStatus[] = ['new', 'in_progress', 'resolved', 'archived'];

function normalizeFeedbackType(value: unknown): FeedbackType {
  if (typeof value !== 'string') {
    return 'unknown';
  }
  const normalized = value.trim().toLowerCase();
  if ((FEEDBACK_TYPE_VALUES as string[]).includes(normalized)) {
    return normalized as FeedbackType;
  }
  if (normalized === 'improvement') {
    return 'suggestion';
  }
  return 'unknown';
}

function normalizeFeedbackStatus(value: unknown, fallback: FeedbackStatus = 'new'): FeedbackStatus {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if ((FEEDBACK_STATUS_VALUES as string[]).includes(normalized)) {
    return normalized as FeedbackStatus;
  }
  if (normalized === 'inprogress' || normalized === 'in-progress') {
    return 'in_progress';
  }
  return fallback;
}

function feedbackDefaultTitle(type: FeedbackType): string {
  switch (type) {
    case 'problem':
      return 'Problem';
    case 'suggestion':
      return 'Improvement Suggestion';
    default:
      return 'Feedback';
  }
}

function sanitizeFeedbackTitle(value: unknown, type: FeedbackType): string {
  if (typeof value !== 'string') {
    return feedbackDefaultTitle(type);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return feedbackDefaultTitle(type);
  }
  return trimmed.slice(0, 240);
}

function sanitizeFeedbackDescription(value: unknown): string {
  if (typeof value !== 'string') {
    return 'No description provided.';
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : 'No description provided.';
}

function sanitizeFeedbackContact(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  // "не указан" is Russian for "not specified"
  if (normalized.length === 0 || /^(not specified|не указан)$/i.test(normalized)) {
    return null;
  }
  return normalized.slice(0, 200);
}

function sanitizeFeedbackResolution(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeFeedbackId(value?: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

function sanitizeFeedbackTimestamp(value?: string): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function mapFeedbackRow(row: FeedbackRow): FeedbackRecord {
  const type = normalizeFeedbackType(row.type);
  const status = normalizeFeedbackStatus(row.status, 'new');
  const title = sanitizeFeedbackTitle(row.title, type);
  const description = sanitizeFeedbackDescription(row.description);
  const contact = sanitizeFeedbackContact(row.contact);
  const resolution = sanitizeFeedbackResolution(row.resolution);
  const source =
    typeof row.source === 'string' && row.source.trim().length > 0 ? row.source.trim() : null;

  return {
    feedback_id: row.feedback_id,
    type,
    title,
    description,
    status,
    contact,
    resolution,
    source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function computeFeedbackExcerpt(description: string): string {
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '\u2014';
  }
  if (normalized.length <= 280) {
    return normalized;
  }
  return `${normalized.slice(0, 277)}\u2026`;
}

// ---- Public API --------------------------------------------------------------

export function listFeedbackEntries(): FeedbackSummary[] {
  const rows = db
    .prepare(
      `SELECT feedback_id, type, title, description, status, contact, resolution, source, created_at, updated_at
       FROM feedback_entries
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC`,
    )
    .all() as FeedbackRow[];

  return rows.map((row) => {
    const record = mapFeedbackRow(row);
    return {
      feedback_id: record.feedback_id,
      type: record.type,
      title: record.title,
      status: record.status,
      contact: record.contact,
      created_at: record.created_at,
      updated_at: record.updated_at,
      excerpt: computeFeedbackExcerpt(record.description),
      has_resolution: Boolean(record.resolution && record.resolution.trim().length > 0),
    };
  });
}

export function getFeedbackEntry(feedbackId: string): FeedbackRecord | undefined {
  const row = db
    .prepare(
      `SELECT feedback_id, type, title, description, status, contact, resolution, source, created_at, updated_at
       FROM feedback_entries
       WHERE feedback_id = ?`,
    )
    .get(feedbackId) as FeedbackRow | undefined;
  return row ? mapFeedbackRow(row) : undefined;
}

export function createFeedbackEntry(input: FeedbackCreateInput): FeedbackRecord {
  const type = normalizeFeedbackType(input.type);
  const feedbackId = sanitizeFeedbackId(input.feedback_id);
  const title = sanitizeFeedbackTitle(input.title, type);
  const description = sanitizeFeedbackDescription(input.description);
  const status = normalizeFeedbackStatus(input.status, 'new');
  const contact = sanitizeFeedbackContact(input.contact);
  const resolution = sanitizeFeedbackResolution(input.resolution);
  const source =
    typeof input.source === 'string' && input.source.trim().length > 0 ? input.source.trim() : null;
  const createdAt = sanitizeFeedbackTimestamp(input.created_at);
  const updatedAt = createdAt;

  try {
    db.prepare(
      `INSERT INTO feedback_entries (
        feedback_id,
        type,
        title,
        description,
        status,
        contact,
        resolution,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(feedbackId, type, title, description, status, contact, resolution, source, createdAt, updatedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof message === 'string' && message.includes('UNIQUE')) {
      throw createHttpError(409, `Feedback entry ${feedbackId} already exists`);
    }
    throw error;
  }

  const created = getFeedbackEntry(feedbackId);
  if (!created) {
    throw createHttpError(500, `Feedback entry ${feedbackId} was not created`);
  }
  return created;
}

export function updateFeedbackEntry(feedbackId: string, patch: FeedbackUpdateInput): FeedbackRecord {
  const current = getFeedbackEntry(feedbackId);
  if (!current) {
    throw createHttpError(404, `Feedback entry ${feedbackId} not found`);
  }

  const nextTitle =
    patch.title !== undefined ? sanitizeFeedbackTitle(patch.title, current.type) : current.title;
  const nextDescription =
    patch.description !== undefined
      ? sanitizeFeedbackDescription(patch.description)
      : current.description;
  const nextStatus =
    patch.status !== undefined ? normalizeFeedbackStatus(patch.status, current.status) : current.status;
  const nextContact =
    patch.contact !== undefined ? sanitizeFeedbackContact(patch.contact) : current.contact;
  const nextResolution =
    patch.resolution !== undefined ? sanitizeFeedbackResolution(patch.resolution) : current.resolution;
  const updatedAt = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE feedback_entries
       SET title = ?, description = ?, status = ?, contact = ?, resolution = ?, updated_at = ?
       WHERE feedback_id = ?`,
    )
    .run(nextTitle, nextDescription, nextStatus, nextContact, nextResolution, updatedAt, feedbackId);

  if (result.changes === 0) {
    throw createHttpError(500, `Feedback entry ${feedbackId} was not updated`);
  }

  const updated = getFeedbackEntry(feedbackId);
  if (!updated) {
    throw createHttpError(500, `Feedback entry ${feedbackId} disappeared after update`);
  }
  return updated;
}

export function deleteFeedbackEntry(feedbackId: string): void {
  const result = db.prepare('DELETE FROM feedback_entries WHERE feedback_id = ?').run(feedbackId);
  if (result.changes === 0) {
    throw createHttpError(404, `Feedback entry ${feedbackId} not found`);
  }
}
