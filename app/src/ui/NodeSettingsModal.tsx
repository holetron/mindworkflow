
import { Fragment, useMemo, useState } from 'react';
import Modal from './Modal';
import { useConfirmDialog } from './ConfirmDialog';
import type { FlowNode, RunLog } from '../state/api';
import JsonViewer from './JsonViewer';
import { useProjectStore } from '../state/store';
import type { CreatedNodeLogEntry, PreviewItem, ReplicateHeaderData } from '../utils/runLogHelpers';
import {
  parseRunLogPayload,
  extractReplicateInfo as deriveReplicateInfo,
  buildPreviewItems,
  createReplicateHeaderData,
  safeStringify,
} from '../utils/runLogHelpers';

/**
 * Extract readable error message from node metadata
 */
function extractErrorMessage(node: FlowNode): string | null {
  const meta = node.meta || {};
  
  // Check for errors array
  if (meta.errors && Array.isArray(meta.errors) && meta.errors.length > 0) {
    return cleanErrorMessage(meta.errors[0]);
  }
  
  // Check for error string
  if (meta.error && typeof meta.error === 'string') {
    return cleanErrorMessage(meta.error);
  }
  
  return null;
}

/**
 * Clean and format error message for user display
 */
function cleanErrorMessage(rawError: string): string {
  let cleaned = rawError;
  
  // Remove "Execution failed after X attempts:" prefix
  cleaned = cleaned.replace(/^Execution failed after \d+ attempts?:\s*/i, '');
  
  // Remove stack trace (everything after newline + "at ")
  const stackTraceIndex = cleaned.indexOf('\n    at ');
  if (stackTraceIndex !== -1) {
    cleaned = cleaned.substring(0, stackTraceIndex);
  }
  
  // Limit length to 300 characters
  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 300) + '...';
  }
  
  return cleaned.trim();
}

interface NodeSettingsModalProps {
  node: FlowNode;
  onClose: () => void;
  onUpdateNodeMeta?: (nodeId: string, patch: Record<string, unknown>) => void;
  loading?: boolean;
}

export function NodeSettingsModal({ node, onClose, onUpdateNodeMeta, loading = false }: NodeSettingsModalProps) {
  const [localMeta, setLocalMeta] = useState<Record<string, unknown>>(node.meta || {});
  const [hasChanges, setHasChanges] = useState(false);
  const runs = useProjectStore((state) => state.runs[node.node_id] ?? []);
  const historyEntries = useMemo(() => runs.map(normalizeRunHistory), [runs]);

  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const handleSave = () => {
    if (onUpdateNodeMeta && hasChanges) {
      onUpdateNodeMeta(node.node_id, localMeta);
      setHasChanges(false);
    }
  };

  const handleClose = async () => {
    if (hasChanges) {
      const confirmed = await showConfirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes in node settings. Do you want to save them before closing?',
        confirmText: 'Save',
        cancelText: 'Don't save',
        type: 'warning'
      });
      
      if (confirmed) {
        handleSave();
      }
    }
    onClose();
  };

  const updateMeta = (key: string, value: unknown) => {
    setLocalMeta(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  return (
    <Modal
      title={`Node Settings: ${node.title}`}
      onClose={handleClose}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            onClick={handleClose}
          >
            Close
          </button>
          {hasChanges && (
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              onClick={handleSave}
              disabled={loading}
            >
              Save changes
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-6 max-h-[70vh] overflow-y-auto">
        {/* Node Information */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Node Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">ID:</span>
              <span className="font-mono text-slate-300">{node.node_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Type:</span>
              <span className="text-slate-300">{node.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Characters:</span>
              <span className="text-slate-300">{(node.content || '').length.toLocaleString()}</span>
            </div>
            {node.type === 'ai' && node.ai?.model && (
              <div className="flex justify-between">
                <span className="text-slate-400">Model:</span>
                <span className="text-slate-300">{String(node.ai.model)}</span>
              </div>
            )}
          </div>
        </div>
        {/* Node Metadata */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Node Metadata</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Short description
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={String(localMeta.short_description || '')}
                onChange={(e) => updateMeta('short_description', e.target.value)}
                placeholder="Short node description..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={String(localMeta.tags || '')}
                onChange={(e) => updateMeta('tags', e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-medium text-slate-300">Response History</h3>
          {historyEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No run history.</p>
          ) : (
            <div className="space-y-2">
              {historyEntries.map((entry) => {
                const headerSegments = buildHeaderSegments(entry);
                return (
                  <details
                    key={entry.runId}
                    className="rounded border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200"
                  >
                    <summary className="flex cursor-pointer flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        {entry.statusBadge ? (
                          <span className={`px-2 py-0.5 rounded-full border ${entry.statusBadge.className}`}>
                            {entry.statusBadge.label}
                          </span>
                        ) : (
                          <span>{entry.statusLabel}</span>
                        )}
                        <span className="text-slate-500">{entry.startedAtLabel}</span>
                        <span className="text-slate-600">Run ID: {entry.runId}</span>
                      </div>
                      {headerSegments.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          {headerSegments.map((segment, idx) => (
                            <Fragment key={segment.key}>
                              {idx > 0 && <span className="text-slate-600">|</span>}
                              {segment.element}
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </summary>
                    <div className="mt-3 space-y-3 text-xs text-slate-300">
                      {entry.previewItems.length > 0 && (
                        <div>
                          <p className="mb-1 font-semibold text-slate-200">Preview</p>
                          <ul className="space-y-1 text-xs text-slate-300">
                            {entry.previewItems.map((item) => (
                              <li key={item.key} className="flex items-center gap-2">
                                <span>{item.icon}</span>
                                {item.href ? (
                                  <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-300 underline hover:text-blue-200"
                                  >
                                    {item.text}
                                  </a>
                                ) : (
                                  <span>{item.text}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    <div className="space-y-2">
                      {entry.predictionPayloadJson ? (
                        <JsonViewer
                          value={entry.predictionPayloadJson}
                          collapsible
                          collapsedLabel="Show API response (JSON)"
                          expandedLabel="Hide API response (JSON)"
                        />
                      ) : (
                        <>
                          {(() => {
                            const errorMsg = extractErrorMessage(node);
                            if (errorMsg) {
                              return (
                                <div className="text-red-600 bg-red-50 border border-red-200 rounded p-3">
                                  <div className="flex items-start gap-2">
                                    <span className="text-xl">❌</span>
                                    <div className="flex-1">
                                      <div className="font-semibold mb-1">Execution error:</div>
                                      <div className="text-sm whitespace-pre-wrap">{errorMsg}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <p className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-400">
                                  Response not saved, use the 'Metadata' section.
                                </p>
                              );
                            }
                          })()}
                        </>
                      )}
                      {entry.metadataJson ? (
                        <JsonViewer
                          value={entry.metadataJson}
                          collapsible
                          collapsedLabel="Show metadata (JSON)"
                          expandedLabel="Hide metadata (JSON)"
                        />
                      ) : null}
                      <JsonViewer
                        value={entry.logsJson}
                        collapsible
                        collapsedLabel="Show log (JSON)"
                        expandedLabel="Hide log (JSON)"
                      />
                    </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
        {/* Raw metadata view */}
        <div>
          <h3 className="mb-3 font-medium text-slate-300">All metadata (JSON)</h3>
          <pre className="text-xs bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-40">
            {JSON.stringify(localMeta, null, 2)}
          </pre>
        </div>
      </div>

  {/* Confirm Dialog */}
  <ConfirmDialog />
</Modal>
  );
}

type ReplicateHeaderInfo = ReplicateHeaderData;

type NormalizedRunHistory = {
  runId: string;
  startedAtLabel: string;
  statusLabel: string;
  statusBadge?: { label: string; className: string };
  replicateHeader?: ReplicateHeaderInfo;
  metadataJson?: string;
  predictionPayloadJson?: string;
  logsJson: string;
  createdNodes: CreatedNodeLogEntry[];
  previewItems: PreviewItem[];
  metadata?: Record<string, unknown> | null;
};

function normalizeRunHistory(run: RunLog): NormalizedRunHistory {
  const payload = parseRunLogPayload(run.logs);
  const metadata = payload.metadata ?? null;
  const replicateInfo = deriveReplicateInfo(metadata);
  const startedDate = new Date(run.started_at);
  const startedAtLabel = Number.isNaN(startedDate.getTime()) ? run.started_at : startedDate.toLocaleString();
  const logsJson = safeStringify(run.logs ?? []);
  const metadataJson = metadata ? safeStringify(metadata) : undefined;
  const predictionPayloadJson =
    payload.predictionPayload !== undefined ? safeStringify(payload.predictionPayload) : undefined;
  const previewItems = buildPreviewItems(payload.createdNodes, replicateInfo.outputUrl);
  const replicateHeader = createReplicateHeaderData(run.status, replicateInfo);
  const statusBadge = getRunStatusBadge(run.status);

  return {
    runId: run.run_id,
    startedAtLabel,
    statusLabel: run.status ? run.status.toUpperCase() : 'UNKNOWN',
    statusBadge,
    replicateHeader,
    metadataJson,
    predictionPayloadJson,
    logsJson,
    createdNodes: payload.createdNodes,
    previewItems,
    metadata,
  };
}
function getRunStatusBadge(status?: string | null): { label: string; className: string } | undefined {
  if (!status) {
    return undefined;
  }
  const normalized = status.toLowerCase();
  if (['success', 'succeeded', 'completed'].includes(normalized)) {
    return { label: 'SUCCESS', className: 'bg-green-900/30 text-green-300 border border-green-500/40' };
  }
  if (['failed', 'error', 'canceled'].includes(normalized)) {
    return { label: 'FAILED', className: 'bg-red-900/30 text-red-300 border border-red-500/40' };
  }
  if (['running', 'processing', 'queued', 'starting'].includes(normalized)) {
    return { label: normalized.toUpperCase(), className: 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/40' };
  }
  return { label: normalized.toUpperCase(), className: 'bg-slate-700 text-slate-200 border border-slate-600' };
}

function buildHeaderSegments(entry: NormalizedRunHistory): Array<{ key: string; element: JSX.Element }> {
  if (!entry.replicateHeader) {
    return [];
  }

  const header = entry.replicateHeader;
  const segments: Array<{ key: string; element: JSX.Element }> = [
    { key: 'label', element: <span>🤖 Replicate</span> },
  ];
  if (header.model) {
    segments.push({ key: 'model', element: <span>{header.model}</span> });
  }
  if (header.version) {
    segments.push({ key: 'version', element: <span>v{header.version}</span> });
  }
  if (header.predictionId) {
    segments.push({ key: 'id', element: <span>ID: {header.predictionId}</span> });
  }
  if (header.updatedAt) {
    segments.push({ key: 'updated', element: <span>Updated: {header.updatedAt}</span> });
  }
  if (header.predictionUrl) {
    segments.push({
      key: 'prediction',
      element: (
        <a
          href={header.predictionUrl}
          target="_blank"
          rel="noreferrer"
          className="text-blue-300 hover:text-blue-200 underline"
        >
          🌐 Prediction
        </a>
      ),
    });
  }
  // API link hidden by request
  if (header.outputUrl) {
    segments.push({
      key: 'output',
      element: (
        <a
          href={header.outputUrl}
          target="_blank"
          rel="noreferrer"
          className="text-blue-300 hover:text-blue-200 underline"
        >
          🔗 Output
        </a>
      ),
    });
  }
  return segments;

}
