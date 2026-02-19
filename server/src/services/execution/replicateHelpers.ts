/**
 * Replicate-specific helper functions: artifact normalization,
 * output candidate collection, text aggregation, etc.
 * Split from helpers.ts to keep files under 500 lines.
 */

import type { ReplicateArtifact } from './types';
import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/replicateHelpers' });
import {
  isLikelyUrl,
  isDataUri,
  detectAssetKindFromUrl,
  pickString,
} from './helpers';

// ============================================================
// Normalize Replicate artifacts from raw output
// ============================================================

export function normalizeReplicateArtifacts(raw: unknown): ReplicateArtifact[] {
  log.info('[DEBUG] normalizeReplicateArtifacts - input type %s', typeof raw);
  if (typeof raw === 'string') {
    log.info('[DEBUG] normalizeReplicateArtifacts - string input %s', raw.slice(0, 150));
  } else if (raw && typeof raw === 'object') {
    log.info('[DEBUG] normalizeReplicateArtifacts - object input keys %s', Object.keys(raw as Record<string, unknown>));
  }

  const artifacts: ReplicateArtifact[] = [];
  const seenUrls = new Set<string>();
  const seenObjects = new WeakSet<Record<string, unknown>>();
  const urlKeys = ['output', 'url', 'uri', 'image', 'image_url', 'video', 'video_url', 'audio', 'href'];
  const textKeys = ['text', 'content', 'value', 'result', 'message'];

  const parseJsonIfPossible = (value: string): unknown | null => {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  };

  const addArtifact = (kind: 'text' | 'image' | 'video', value: string, title?: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (kind !== 'text') {
      if (seenUrls.has(trimmed)) {
        return;
      }
      seenUrls.add(trimmed);
    }
    log.info({ data: { kind, value: trimmed.slice(0, 100), title } }, '[DEBUG] normalizeReplicateArtifacts - adding artifact');
    artifacts.push({ kind, value: trimmed, title });
  };

  const visit = (value: unknown, titleHint?: string): void => {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === 'string') {
      considerString(value, titleHint);
      return;
    }
    if (Array.isArray(value)) {
      const allStrings = value.every(item => typeof item === 'string');
      const hasUrls = allStrings && value.some((item: string) => isLikelyUrl(item));

      if (allStrings && !hasUrls && value.length > 0) {
        const aggregatedText = value.join('');
        log.info(`[DEBUG] normalizeReplicateArtifacts - detected streaming text array with ${value.length} tokens, aggregating into single output`);
        considerString(aggregatedText, titleHint);
        return;
      }

      value.forEach((item) => visit(item, titleHint));
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (seenObjects.has(record)) {
        return;
      }
      seenObjects.add(record);
      const derivedTitle =
        titleHint || pickString(record, ['title', 'label', 'name', 'id']) || undefined;

      for (const key of urlKeys) {
        if (key in record) {
          visit(record[key], derivedTitle);
        }
      }

      for (const key of textKeys) {
        if (typeof record[key] === 'string') {
          considerString(record[key] as string, derivedTitle);
        }
      }

      for (const [key, entry] of Object.entries(record)) {
        if (urlKeys.includes(key) || textKeys.includes(key)) {
          continue;
        }
        visit(entry, derivedTitle);
      }
    }
  };

  const considerString = (value: string, title?: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    log.info('[DEBUG] normalizeReplicateArtifacts - considerString %s', trimmed.slice(0, 100));

    const parsed = parseJsonIfPossible(trimmed);
    if (parsed !== null) {
      log.info('[DEBUG] normalizeReplicateArtifacts - parsed JSON, visiting recursively');
      visit(parsed, title);
      return;
    }
    if (isLikelyUrl(trimmed)) {
      const kind = detectAssetKindFromUrl(trimmed);
      log.info({ kind, url: trimmed.slice(0, 100) }, 'normalizeReplicateArtifacts detected URL kind');
      addArtifact(kind, trimmed, title);
      return;
    }
    log.info('[DEBUG] normalizeReplicateArtifacts - adding as text artifact');
    addArtifact('text', trimmed, title);
  };

  visit(raw);
  log.info('[DEBUG] normalizeReplicateArtifacts - total artifacts %s', artifacts.length);
  return artifacts;
}

// ============================================================
// Normalize aggregated Replicate text
// ============================================================

export function normalizeAggregatedReplicateText(value: string): string | null {
  if (!value) {
    return null;
  }
  let normalized = value.replace(/\s+$/u, '');
  if (!normalized) {
    return null;
  }
  const firstMatch = normalized.match(/^\s*([\p{L}\p{N}_-]+)/u);
  if (firstMatch) {
    const firstWord = firstMatch[1];
    const trailingPattern = new RegExp(`(?:[\\s\\u00A0]+|\\s*\\n+)${firstWord}$`, 'iu');
    if (trailingPattern.test(normalized) && normalized.length > firstWord.length) {
      const candidate = normalized.replace(trailingPattern, '').trimEnd();
      if (candidate.length > 0) {
        normalized = candidate;
      }
    }
  }
  return normalized;
}

// ============================================================
// Extract primary Replicate output from nested structures
// ============================================================

export function extractPrimaryReplicateOutput(output: unknown, depth = 0): string {
  if (depth > 5 || output === null || output === undefined) {
    return '';
  }
  if (typeof output === 'string') {
    return output.trim();
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const candidate = extractPrimaryReplicateOutput(item, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }
  if (typeof output === 'object') {
    const record = output as Record<string, unknown>;
    if (typeof record.output === 'string' && record.output.trim()) {
      return record.output.trim();
    }
    if (record.output !== undefined) {
      const nested = extractPrimaryReplicateOutput(record.output, depth + 1);
      if (nested) {
        return nested;
      }
    }
    for (const value of Object.values(record)) {
      const candidate = extractPrimaryReplicateOutput(value, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
  }
  return '';
}

// ============================================================
// Collect Replicate output candidates
// ============================================================

export function collectReplicateOutputCandidates(
  result: {
    output: string;
    rawOutput?: unknown;
    predictionPayload?: unknown;
  },
  parsedOutput: unknown,
): unknown[] {
  log.info('[DEBUG] collectReplicateOutputCandidates - input result.output %s', result.output);
  log.info('[DEBUG] collectReplicateOutputCandidates - input parsedOutput %s', parsedOutput);
  log.info('[DEBUG] collectReplicateOutputCandidates - input result.rawOutput %s', result.rawOutput);
  log.info('[DEBUG] collectReplicateOutputCandidates - input result.predictionPayload %s', result.predictionPayload);

  const candidates: unknown[] = [];
  const stringSeen = new Set<string>();
  const objectSeen = new WeakSet<Record<string, unknown>>();

  const register = (value: unknown): void => {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || stringSeen.has(trimmed)) {
        return;
      }
      stringSeen.add(trimmed);
      candidates.push(trimmed);
      log.info('[DEBUG] collectReplicateOutputCandidates - registered string %s', trimmed.slice(0, 100));
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (objectSeen.has(record)) {
        return;
      }
      objectSeen.add(record);
      candidates.push(record);
      log.info('[DEBUG] collectReplicateOutputCandidates - registered object with keys %s', Object.keys(record));
      return;
    }
    candidates.push(value);
  };

  const hasParsedOutput = parsedOutput !== undefined && parsedOutput !== null &&
    (typeof parsedOutput === 'object' || typeof parsedOutput === 'string' && parsedOutput.trim().length > 0);

  log.info('[DEBUG] collectReplicateOutputCandidates - hasParsedOutput %s', hasParsedOutput);

  if (hasParsedOutput) {
    register(parsedOutput);
  }
  register(result.predictionPayload);
  register(result.rawOutput);
  if (!hasParsedOutput) {
    log.info('[DEBUG] collectReplicateOutputCandidates - no parsedOutput, registering result.output');
    register(result.output);
  } else {
    log.info('[DEBUG] collectReplicateOutputCandidates - parsedOutput exists, skipping result.output');
  }

  const primary = extractPrimaryReplicateOutput(candidates);
  log.info('[DEBUG] collectReplicateOutputCandidates - primary output %s', primary);
  if (primary && !stringSeen.has(primary)) {
    stringSeen.add(primary);
    candidates.push(primary);
  }

  log.info('[DEBUG] collectReplicateOutputCandidates - total candidates %s', candidates.length);
  return candidates;
}
