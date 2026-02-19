// assetRepository.ts — Asset operations
import * as crypto from 'crypto';
import { db } from '../connection';
import type { AssetRecord } from '../types';

export function createAssetRecord(input: {
  projectId: string;
  nodeId?: string;
  path: string;
  meta?: Record<string, unknown>;
}): AssetRecord {
  const assetId = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const meta = input.meta ?? {};

  db.prepare(
    `INSERT INTO assets (asset_id, project_id, node_id, path, meta_json, created_at)
     VALUES (@asset_id, @project_id, @node_id, @path, @meta_json, @created_at)`,
  ).run({
    asset_id: assetId,
    project_id: input.projectId,
    node_id: input.nodeId ?? null,
    path: input.path,
    meta_json: JSON.stringify(meta),
    created_at,
  });

  return {
    asset_id: assetId,
    project_id: input.projectId,
    node_id: input.nodeId ?? null,
    path: input.path,
    meta,
    created_at,
  };
}
