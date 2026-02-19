/**
 * Result collection: building run metadata snapshots, resolving created node
 * log entries, and managing prediction payloads.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import {
  StoredNode,
  getNode,
  updateNodeMetaSystem,
} from '../../db';
import type { CreatedNodeSnapshot } from '../transformerService';
import type { ExecutionStepResult } from './types';
import {
  normalizeMetaRecord,
  sanitizeMetaSnapshot,
  extractNodeMetaSnapshot,
  safeExtractUiPosition,
  pickPrimaryLinkFromSnapshot,
  isDataUri,
  isLikelyUrl,
} from './helpers';

// ============================================================
// Build run metadata snapshot (for storeRun logs)
// ============================================================

export function buildRunMetadataSnapshot(
  node: StoredNode,
  result?: Partial<ExecutionStepResult>,
): Record<string, unknown> | null {
  const metaRecord = normalizeMetaRecord(node.meta);
  if (metaRecord.replicate && typeof metaRecord.replicate === 'object') {
    delete metaRecord.replicate;
  }
  if (metaRecord.metadata && typeof metaRecord.metadata === 'object' && !Array.isArray(metaRecord.metadata)) {
    const metadataRecord = { ...(metaRecord.metadata as Record<string, unknown>) };
    if (metadataRecord.replicate) {
      delete metadataRecord.replicate;
    }
    if (Object.keys(metadataRecord).length === 0) {
      delete metaRecord.metadata;
    } else {
      metaRecord.metadata = metadataRecord;
    }
  }

  const snapshot: Record<string, unknown> = {};
  const stringKeys = [
    'short_description',
    'output_type',
    'replicate_model',
    'replicate_version',
    'replicate_status',
    'replicate_prediction_id',
    'replicate_prediction_url',
    'replicate_prediction_api_url',
    'replicate_output',
  ];
  for (const key of stringKeys) {
    const value = metaRecord[key];
    if (typeof value === 'string' && value.trim()) {
      snapshot[key] = value.trim();
    }
  }

  if (typeof metaRecord.priority === 'string' && metaRecord.priority.trim()) {
    snapshot.priority = metaRecord.priority.trim();
  }
  if (typeof metaRecord.tags === 'string' && metaRecord.tags.trim()) {
    snapshot.tags = metaRecord.tags.trim();
  }
  if (metaRecord.replicate_last_run_at && typeof metaRecord.replicate_last_run_at === 'string') {
    snapshot.replicate_last_run_at = metaRecord.replicate_last_run_at;
  }
  if (metaRecord.ui_position && typeof metaRecord.ui_position === 'object' && !Array.isArray(metaRecord.ui_position)) {
    const pos = metaRecord.ui_position as Record<string, unknown>;
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      snapshot.ui_position = { x: Math.round(x), y: Math.round(y) };
    }
  }

  const createdEntries = resolveCreatedNodeLogEntries(node.project_id, node, result ?? {});
  if (createdEntries.length > 0) {
    snapshot.created_nodes = createdEntries;
  }

  const predictionPayload = resolvePredictionPayload(node, result ?? {});
  if (predictionPayload !== undefined) {
    snapshot.replicate_prediction_payload = predictionPayload;
  }

  if (result?.predictionUrl) {
    snapshot.prediction_url = result.predictionUrl;
  }
  if (result?.predictionId) {
    snapshot.prediction_id = result.predictionId;
  }
  if (result?.provider) {
    snapshot.provider = result.provider;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

// ============================================================
// Sanitize created node snapshot
// ============================================================

export function sanitizeCreatedNodeSnapshot(snapshot: CreatedNodeSnapshot): CreatedNodeSnapshot {
  const result: CreatedNodeSnapshot = {
    node_id: snapshot.node_id,
    type: snapshot.type,
    title: snapshot.title,
  };
  if (snapshot.content_type) {
    result.content_type = snapshot.content_type;
  }
  if (snapshot.ui_position) {
    result.ui_position = {
      x: Math.round(snapshot.ui_position.x),
      y: Math.round(snapshot.ui_position.y),
    };
  }
  if (snapshot.meta) {
    result.meta = sanitizeMetaSnapshot(snapshot.meta);
  }
  return result;
}

// ============================================================
// Build created node snapshot from stored node
// ============================================================

export function buildCreatedNodeSnapshotFromStored(stored: StoredNode): CreatedNodeSnapshot {
  const metaRecord = normalizeMetaRecord(stored.meta);
  const kind: 'text' | 'image' | 'video' =
    stored.type === 'image' || stored.type === 'video' ? (stored.type as 'image' | 'video') : 'text';
  const snapshotMeta = extractNodeMetaSnapshot(metaRecord, kind);
  return sanitizeCreatedNodeSnapshot({
    node_id: stored.node_id,
    type: stored.type,
    title: stored.title,
    content_type: stored.content_type ?? null,
    ui_position: safeExtractUiPosition(metaRecord),
    meta: snapshotMeta,
  });
}

// ============================================================
// Normalize meta-created node entry
// ============================================================

export function normalizeMetaCreatedNode(entry: unknown): CreatedNodeSnapshot | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const nodeId = typeof record.node_id === 'string' ? record.node_id : null;
  const type = typeof record.type === 'string' ? record.type : null;
  const title = typeof record.title === 'string' ? record.title : null;
  if (!nodeId || !type || !title) {
    return null;
  }
  const snapshot: CreatedNodeSnapshot = {
    node_id: nodeId,
    type,
    title,
  };
  if (typeof record.content_type === 'string') {
    snapshot.content_type = record.content_type;
  }
  if (record.ui_position && typeof record.ui_position === 'object' && !Array.isArray(record.ui_position)) {
    const x = Number((record.ui_position as Record<string, unknown>).x);
    const y = Number((record.ui_position as Record<string, unknown>).y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      snapshot.ui_position = { x: Math.round(x), y: Math.round(y) };
    }
  }
  if (record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)) {
    snapshot.meta = sanitizeMetaSnapshot(record.meta as Record<string, unknown>);
  }
  return snapshot;
}

// ============================================================
// Resolve created-node log entries
// ============================================================

export function resolveCreatedNodeLogEntries(
  projectId: string,
  node: StoredNode,
  result: Partial<ExecutionStepResult>,
): CreatedNodeSnapshot[] {
  if (result.createdNodeSnapshots && result.createdNodeSnapshots.length > 0) {
    return result.createdNodeSnapshots.map((snapshot) => sanitizeCreatedNodeSnapshot(snapshot));
  }
  if (result.createdNodes && result.createdNodes.length > 0) {
    const entries: CreatedNodeSnapshot[] = [];
    for (const summary of result.createdNodes) {
      const stored = getNode(projectId, summary.node_id);
      if (stored) {
        entries.push(buildCreatedNodeSnapshotFromStored(stored));
      } else {
        entries.push(
          sanitizeCreatedNodeSnapshot({
            node_id: summary.node_id,
            type: summary.type,
            title: summary.title,
          }),
        );
      }
    }
    return entries;
  }
  const meta = normalizeMetaRecord(node.meta);
  const createdFromMeta = Array.isArray(meta.created_nodes) ? meta.created_nodes : [];
  if (createdFromMeta.length > 0) {
    return createdFromMeta
      .map((entry) => normalizeMetaCreatedNode(entry))
      .filter((entry): entry is CreatedNodeSnapshot => entry !== null)
      .map((entry) => sanitizeCreatedNodeSnapshot(entry));
  }
  return [];
}

// ============================================================
// Resolve prediction payload
// ============================================================

export function resolvePredictionPayload(
  node: StoredNode,
  result: Partial<ExecutionStepResult>,
): unknown {
  if (result.predictionPayload !== undefined) {
    return result.predictionPayload;
  }
  const meta = normalizeMetaRecord(node.meta);
  if (meta.replicate_prediction_payload !== undefined) {
    return meta.replicate_prediction_payload;
  }
  return undefined;
}

// ============================================================
// Update last request payload in node meta
// ============================================================

export function updateLastRequestPayload(
  projectId: string,
  node: StoredNode,
  payload: unknown,
): void {
  if (payload === undefined) {
    return;
  }
  const currentMeta = normalizeMetaRecord(node.meta);
  const nextMeta: Record<string, unknown> = { ...currentMeta, last_request_payload: payload };
  updateNodeMetaSystem(projectId, node.node_id, nextMeta);
  node.meta = nextMeta;
}

// ============================================================
// Apply created nodes to meta (Replicate)
// ============================================================

export function applyCreatedNodesToMeta(
  projectId: string,
  node: StoredNode,
  createdSnapshots: CreatedNodeSnapshot[],
  options?: { predictionPayload?: unknown },
): void {
  const currentMeta = normalizeMetaRecord(node.meta);
  const nextMeta: Record<string, unknown> = { ...currentMeta };

  if (createdSnapshots.length > 0) {
    nextMeta.created_nodes = createdSnapshots.map((snapshot) => {
      const entry: Record<string, unknown> = {
        node_id: snapshot.node_id,
        type: snapshot.type,
        title: snapshot.title,
      };
      if (snapshot.content_type) {
        entry.content_type = snapshot.content_type;
      }
      if (snapshot.ui_position) {
        entry.ui_position = snapshot.ui_position;
      }
      if (snapshot.meta) {
        entry.meta = snapshot.meta;
      }
      return entry;
    });

    const primarySnapshot = createdSnapshots[0];
    if (
      typeof nextMeta.output_type !== 'string' ||
      !nextMeta.output_type ||
      nextMeta.output_type === 'node'
    ) {
      nextMeta.output_type = primarySnapshot?.type ?? 'node';
    }
    const primaryLink = pickPrimaryLinkFromSnapshot(primarySnapshot);
    if (primaryLink) {
      nextMeta.replicate_output = primaryLink;
    }
  }

  if (options?.predictionPayload !== undefined) {
    nextMeta.replicate_prediction_payload = options.predictionPayload;
  }

  updateNodeMetaSystem(projectId, node.node_id, nextMeta);
  node.meta = nextMeta;
}
