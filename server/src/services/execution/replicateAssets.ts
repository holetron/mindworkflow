/**
 * Replicate asset node creation: handling prediction outputs,
 * deduplication, and node creation for images/videos/text from Replicate.
 * Extracted from executor.ts as part of ADR-081 refactoring.
 */

import {
  StoredNode, listProjectEdges, listProjectNodes, getNode,
  withTransaction, createProjectNode, addProjectEdge,
} from '../../db';
import type { CreatedNodeSummary, CreatedNodeSnapshot } from '../transformerService';
import { autoDownloadMediaIfNeeded } from '../mediaDownloader';
import { computeAssetSignature, buildPublicAssetUrl } from '../../utils/assetUrls';
import { saveBase64Asset } from '../../utils/storage';
import type { ReplicateAssetNodesResult } from './types';
import {
  isDataUri, extractNodeMetaSnapshot, safeExtractUiPosition,
  deriveReplicateAssetPosition, describeArtifactPlural,
} from './helpers';
import { normalizeReplicateArtifacts, normalizeAggregatedReplicateText } from './replicateHelpers';

import { logger } from '../../lib/logger';

const log = logger.child({ module: 'execution/replicateAssets' });
// Guard against double-calling createReplicateAssetNodes
const processingPredictions = new Set<string>();
const processingPromises = new Map<string, Promise<ReplicateAssetNodesResult>>();
export { processingPredictions, processingPromises };

// Helper: create aggregated text node (dedup-safe, called twice in original code)
function maybeCreateAggregatedTextNode(ctx: {
  aggregatedText: string | null; projectId: string; sourceNode: StoredNode;
  predictionId?: string; predictionUrl?: string; timestamp: string;
  created: CreatedNodeSummary[]; snapshots: CreatedNodeSnapshot[]; logs: string[];
  existingSignatures: Set<string>; createdAssetIds: Set<string>;
  buildTitle: (a: { kind: 'text' | 'image' | 'video'; title?: string }, o: number) => string;
}): void {
  const { aggregatedText, projectId, sourceNode, predictionId, predictionUrl,
    timestamp, created, snapshots, logs, existingSignatures, createdAssetIds, buildTitle } = ctx;
  if (!aggregatedText) return;
  const textSignature = computeAssetSignature(aggregatedText);
  const signatureKey = `text:${aggregatedText}`;
  const hashedSignatureKey = `signature:${textSignature}`;
  if (existingSignatures.has(signatureKey) || existingSignatures.has(hashedSignatureKey)) {
    logs.push('Replicate: text segments match existing ones, new text node not created.');
    return;
  }
  const assetId = predictionId && predictionId.trim().length > 0
    ? `${predictionId}_text` : `${sourceNode.node_id}_text_${Date.now()}`;
  if (createdAssetIds.has(assetId)) {
    logs.push('Replicate: text artifact already created in current cycle, skipping.');
    return;
  }
  const position = deriveReplicateAssetPosition(sourceNode, created.length);
  const baseMeta: Record<string, unknown> = {
    replicate_asset_id: assetId, source_prediction_id: predictionId,
    source_prediction_url: predictionUrl, source_provider: 'replicate',
    source_node_id: sourceNode.node_id, source_node_title: sourceNode.title,
    source_artifact_kind: 'text', artifact_value_preview: aggregatedText.slice(0, 180),
    asset_index: created.length, created_at: timestamp,
    source_asset_signature: textSignature, text_origin: 'replicate_artifact',
  };
  const node = withTransaction(() => {
    const { node: cn } = createProjectNode(projectId, {
      type: 'text', title: buildTitle({ kind: 'text' }, created.length),
      content: aggregatedText, content_type: 'text/plain', meta: baseMeta,
    }, { position });
    addProjectEdge(projectId, { from: sourceNode.node_id, to: cn.node_id, label: 'asset' });
    return cn;
  });
  createdAssetIds.add(assetId);
  existingSignatures.add(signatureKey);
  existingSignatures.add(hashedSignatureKey);
  created.push({ node_id: node.node_id, type: node.type, title: node.title });
  snapshots.push({
    node_id: node.node_id, type: node.type, title: node.title,
    content_type: node.content_type ?? null, ui_position: safeExtractUiPosition(baseMeta),
    meta: extractNodeMetaSnapshot(baseMeta, 'text', aggregatedText),
  });
  logs.push(`Replicate: created text node "${node.title}" (${node.node_id}).`);
}

export async function createReplicateAssetNodes(
  projectId: string, sourceNode: StoredNode, rawOutputs: unknown[],
  predictionId?: string, predictionUrl?: string,
): Promise<ReplicateAssetNodesResult> {
  log.info({ rawOutputCount: rawOutputs.length, predictionId }, 'createReplicateAssetNodes called');

  if (predictionId) {
    const existing = processingPromises.get(predictionId);
    if (existing) {
      log.info('[DEBUG] WAIT: prediction already processing %s', predictionId);
      return existing;
    }
  }

  const mainPromise = (async (): Promise<ReplicateAssetNodesResult> => {
    try {
      const processedOutputs: unknown[] = [];
      for (const output of rawOutputs) {
        if (output && typeof output === 'object' && !Array.isArray(output)) {
          const rec = output as Record<string, unknown>;
          if (rec.status === 'succeeded' && typeof rec.output === 'string') {
            processedOutputs.push(rec.output);
          } else if (rec.output) {
            processedOutputs.push(rec.output);
          } else {
            processedOutputs.push(output);
          }
        } else {
          processedOutputs.push(output);
        }
      }

      const sources = processedOutputs
        .filter((v) => v !== null && v !== undefined)
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => (typeof v === 'string' ? v.length > 0 : true));

      const artifacts = sources.flatMap((v) => normalizeReplicateArtifacts(v));
      if (artifacts.length === 0) {
        return { createdNodes: [], nodeSnapshots: [], logs: [`Replicate output did not contain assets (sources inspected: ${sources.length}).`], aggregatedText: null };
      }

      const textArtifacts = artifacts.filter((a) => a.kind === 'text');
      const assetArtifacts = artifacts.filter((a) => a.kind !== 'text');

      const mergeTexts = (items: Array<{ value: string }>): string | null => {
        const parts: string[] = []; const seen = new Set<string>();
        for (const item of items) {
          const t = item?.value?.trim();
          if (!t || seen.has(t)) continue;
          seen.add(t); parts.push(t);
        }
        return parts.length > 0 ? parts.join('\n\n') : null;
      };

      const created: CreatedNodeSummary[] = [];
      const snapshots: CreatedNodeSnapshot[] = [];
      const logs: string[] = [];
      const timestamp = new Date().toISOString();

      let aggregatedText = mergeTexts(textArtifacts);
      if (aggregatedText) {
        aggregatedText = normalizeAggregatedReplicateText(aggregatedText) ?? aggregatedText.trimEnd();
        if (!aggregatedText.trim()) aggregatedText = null;
      }
      if (aggregatedText) logs.push(`Replicate: aggregated text segments (${textArtifacts.length} pcs.) without creating separate nodes.`);

      const downstreamTargetIds = new Set(listProjectEdges(projectId).filter((e) => e.from_node === sourceNode.node_id).map((e) => e.to_node));
      const downstreamNodes = listProjectNodes(projectId).filter((n) => downstreamTargetIds.has(n.node_id));

      const existingSignatures = new Set<string>();
      const regSig = (kind: string, val: string | null | undefined) => {
        if (typeof val === 'string' && val.trim()) existingSignatures.add(`${kind}:${val.trim()}`);
      };

      for (const dn of downstreamNodes) {
        const m = (dn.meta ?? {}) as Record<string, unknown>;
        if (predictionId && typeof m.source_prediction_id === 'string' && m.source_prediction_id !== predictionId) continue;
        if (typeof m.source_provider === 'string' && m.source_provider !== 'replicate') continue;
        if (typeof m.source_asset_signature === 'string' && m.source_asset_signature.trim()) existingSignatures.add(`signature:${m.source_asset_signature.trim()}`);
        switch (dn.type) {
        case 'image':
          for (const k of ['image_url', 'original_url', 'image_original', 'original_image', 'image_edited', 'edited_image', 'image_crop', 'crop_image', 'annotated_image', 'image_data'] as const) regSig('image', m[k] as string);
          regSig('image', dn.content); break;
        case 'video':
          for (const k of ['video_url', 'original_url', 'video_data'] as const) regSig('video', m[k] as string);
          regSig('video', dn.content); break;
        case 'text': regSig('text', dn.content); break;
        }
      }

      let duplicateCount = 0;
      const createdAssetIds = new Set<string>();
      const buildTitle = (a: { kind: 'text' | 'image' | 'video'; title?: string }, offset: number) => {
        if (a.title?.trim()) return a.title.trim();
        const names: Record<string, string> = { image: 'Replicate Image', video: 'Replicate Video', text: 'Replicate Text' };
        return `${names[a.kind]} ${offset + 1}`;
      };

      for (const [index, artifact] of assetArtifacts.entries()) {
        const rawValue = typeof artifact.value === 'string' ? artifact.value.trim() : '';
        if (!rawValue) { logs.push('Replicate: skipped empty artifact.'); continue; }

        const assetId = predictionId ? `${predictionId}_${index}` : `${sourceNode.node_id}_${index}_${Date.now()}`;

        // Dedup guards
        if (createdAssetIds.has(assetId)) { duplicateCount++; logs.push(`Replicate: skipping ${artifact.kind} artifact (duplicate in cycle).`); continue; }
        if (downstreamNodes.some((n) => ((n.meta ?? {}) as Record<string, unknown>).replicate_asset_id === assetId)) { duplicateCount++; logs.push(`Replicate: skipping ${artifact.kind} artifact (duplicate by asset_id).`); continue; }

        const artifactSignature = computeAssetSignature(rawValue);
        const signature = `${artifact.kind}:${rawValue}`;
        const hashedSigKey = `signature:${artifactSignature}`;
        if (existingSignatures.has(signature) || existingSignatures.has(hashedSigKey)) { duplicateCount++; logs.push(`Replicate: skipping ${artifact.kind} artifact, duplicate found.`); continue; }

        const existingNode = downstreamNodes.find((n) => {
          const nm = (n.meta ?? {}) as Record<string, unknown>;
          return nm.image_url === rawValue || nm.original_url === rawValue || nm.video_url === rawValue ||
            (typeof nm.source_asset_signature === 'string' && nm.source_asset_signature === artifactSignature) || n.content === rawValue;
        });
        if (existingNode) { duplicateCount++; logs.push(`Replicate: skipping ${artifact.kind} artifact (duplicate by URL).`); continue; }

        existingSignatures.add(signature); existingSignatures.add(hashedSigKey);
        const position = deriveReplicateAssetPosition(sourceNode, created.length);
        const baseMeta: Record<string, unknown> = {
          replicate_asset_id: assetId, source_prediction_id: predictionId, source_prediction_url: predictionUrl,
          source_provider: 'replicate', source_node_id: sourceNode.node_id, source_node_title: sourceNode.title,
          source_artifact_kind: artifact.kind, artifact_value_preview: rawValue.slice(0, 180),
          asset_index: created.length, created_at: timestamp, source_asset_signature: artifactSignature,
        };

        const title = buildTitle(artifact, created.length);
        const nodeInputMeta: Record<string, unknown> = { ...baseMeta };
        let content = '';
        let contentType: string | null = null;

        if (artifact.kind === 'image') {
          const isDU = isDataUri(rawValue);
          if (!isDU) { nodeInputMeta.image_url = rawValue; }
          else {
            const saved = await saveBase64Asset(projectId, rawValue, { subdir: 'images' });
            nodeInputMeta.image_path = saved.relativePath;
            nodeInputMeta.image_url = buildPublicAssetUrl(projectId, saved.relativePath);
            nodeInputMeta.display_mode = 'url';
          }
          nodeInputMeta.image_original = nodeInputMeta.image_url || rawValue;
          nodeInputMeta.original_image = nodeInputMeta.image_url || rawValue;
          nodeInputMeta.image_edited = nodeInputMeta.image_url || rawValue;
          nodeInputMeta.edited_image = nodeInputMeta.image_url || rawValue;
          nodeInputMeta.annotated_image = nodeInputMeta.image_url || rawValue;
          nodeInputMeta.image_crop = null; nodeInputMeta.crop_image = null;
          nodeInputMeta.image_crop_settings = null; nodeInputMeta.image_crop_expose_port = false;
          nodeInputMeta.view_mode = 'original'; nodeInputMeta.image_output_mode = 'original';
          contentType = isDU ? 'image/data-uri' : 'image/url';
        } else if (artifact.kind === 'video') {
          const isDU = isDataUri(rawValue);
          if (!isDU) { nodeInputMeta.video_url = rawValue; nodeInputMeta.display_mode = 'url'; }
          else {
            try {
              const saved = await saveBase64Asset(projectId, rawValue, { subdir: 'uploads/videos' });
              const publicUrl = buildPublicAssetUrl(projectId, saved.relativePath);
              nodeInputMeta.video_file = saved.filename; nodeInputMeta.video_path = saved.relativePath;
              nodeInputMeta.asset_relative_path = saved.relativePath; nodeInputMeta.video_url = publicUrl;
              nodeInputMeta.asset_public_url = publicUrl;
              nodeInputMeta.local_url = `/uploads/${projectId}/${saved.relativePath}`.replace(/\\/g, '/');
              nodeInputMeta.asset_mime_type = saved.mimeType; nodeInputMeta.file_size = saved.size;
              nodeInputMeta.display_mode = 'upload'; nodeInputMeta.asset_origin = 'replicate_artifact';
              nodeInputMeta.video_data = null;
            } catch { nodeInputMeta.video_data = rawValue; nodeInputMeta.display_mode = 'upload'; }
          }
          nodeInputMeta.controls = true;
          contentType = isDU ? 'video/data-uri' : 'video/url';
        } else {
          content = rawValue; contentType = 'text/plain'; nodeInputMeta.text_origin = 'replicate_artifact';
        }

        // Auto-download media files from Replicate to local storage
        let finalMeta = nodeInputMeta;
        if (artifact.kind === 'image' || artifact.kind === 'video') {
          try {
            const dl = await autoDownloadMediaIfNeeded(projectId, artifact.kind, nodeInputMeta);
            if (dl.updatedMeta) finalMeta = dl.updatedMeta;
            if (dl.downloaded) logs.push(`Replicate: file downloaded to server (${Math.round((finalMeta.file_size as number) / 1024)}KB)`);
            else if (finalMeta.auto_download_skipped) logs.push(`Replicate: download skipped (${finalMeta.skip_reason})`);
            else if (finalMeta.auto_download_failed) logs.push(`Replicate: download error (${finalMeta.download_error})`);
          } catch (error) {
            logs.push(`Replicate: download error (${error instanceof Error ? error.message : String(error)})`);
          }
        }

        const node = withTransaction(() => {
          const { node: cn } = createProjectNode(projectId, { type: artifact.kind, title, content, content_type: contentType, meta: finalMeta }, { position });
          addProjectEdge(projectId, { from: sourceNode.node_id, to: cn.node_id, label: 'asset' });
          return cn;
        });

        createdAssetIds.add(assetId); existingSignatures.add(signature);
        created.push({ node_id: node.node_id, type: node.type, title: node.title });
        snapshots.push({
          node_id: node.node_id, type: node.type, title: node.title,
          content_type: node.content_type ?? null,
          ui_position: safeExtractUiPosition(finalMeta),
          meta: extractNodeMetaSnapshot(finalMeta, artifact.kind, rawValue),
        });
        logs.push(`Replicate: created ${artifact.kind} node "${node.title}" (${node.node_id}).`);
      }

      // Create text node for aggregated text (before summary logs)
      maybeCreateAggregatedTextNode({ aggregatedText, projectId, sourceNode, predictionId, predictionUrl, timestamp, created, snapshots, logs, existingSignatures, createdAssetIds, buildTitle });

      if (duplicateCount > 0) logs.push(`Replicate: skipped ${duplicateCount} artifact(s) as duplicates.`);
      if (created.length > 0) {
        const byType = new Map<string, number>();
        created.forEach((n) => byType.set(n.type, (byType.get(n.type) ?? 0) + 1));
        logs.push(`Replicate: created ${created.length} nodes (${Array.from(byType.entries()).map(([t, c]) => `${c} ${describeArtifactPlural(t, c)}`).join(', ')}).`);
      } else if (duplicateCount === 0) { logs.push('Replicate: no new artifacts found.'); }

      if (predictionId) logs.push(`Replicate meta: prediction_id=${predictionId}`);
      if (predictionUrl) logs.push(`Replicate meta: prediction_url=${predictionUrl}`);
      const artOut = artifacts.filter((a) => a.kind === 'image' || a.kind === 'video').map((a) => a.value).filter((v, i, s) => s.indexOf(v) === i);
      if (artOut.length > 0) logs.push(`Replicate outputs: ${artOut.join(', ')}`);

      // Create text node for aggregated text (after summary — dedup against first)
      maybeCreateAggregatedTextNode({ aggregatedText, projectId, sourceNode, predictionId, predictionUrl, timestamp, created, snapshots, logs, existingSignatures, createdAssetIds, buildTitle });

      return { createdNodes: created, nodeSnapshots: snapshots, logs, aggregatedText };
    } finally {
      if (predictionId) {
        processingPromises.delete(predictionId); processingPredictions.delete(predictionId);
      }
    }
  })();

  if (predictionId) processingPromises.set(predictionId, mainPromise);
  return mainPromise;
}
