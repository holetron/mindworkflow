/**
 * Execution service — re-exports from all sub-modules.
 * This is the main entry point for the execution service.
 */

// Types
export type {
  ExecutionContext,
  ExecutionResult,
  ExecutionStepResult,
  RetryOutcome,
  ReplicateArtifact,
  ReplicateAssetNodesResult,
  CollectedFile,
  NextNodeMetadataEntry,
} from './types';
export {
  MAX_ATTEMPTS,
  BACKOFF,
  DEFAULT_MINDMAP_PROMPT,
  DEFAULT_MINDMAP_EXAMPLE,
} from './types';

// Main class
export { ExecutorService } from './workflowRunner';

// Context management
export {
  buildExecutionContext,
  topologicalSort,
  collectPreviousNodes,
  collectNextNodeMetadata,
  collectFilesFromPreviousNodes,
} from './contextManager';

// Node execution
export { executeNodeByType } from './nodeExecutor';

// AI node execution
export { executeAiNode } from './aiNodeExecutor';

// Result collection
export {
  buildRunMetadataSnapshot,
  sanitizeCreatedNodeSnapshot,
  buildCreatedNodeSnapshotFromStored,
  normalizeMetaCreatedNode,
  resolveCreatedNodeLogEntries,
  resolvePredictionPayload,
  updateLastRequestPayload,
  applyCreatedNodesToMeta,
} from './resultCollector';

// Replicate assets
export {
  createReplicateAssetNodes,
  processingPredictions,
  processingPromises,
} from './replicateAssets';

// Helpers (core utilities)
export {
  debugLog,
  getPackageInfo,
  selectRussianPlural,
  describeArtifactPlural,
  isLikelyUrl,
  isDataUri,
  detectAssetKindFromUrl,
  pickString,
  normalizeMetaRecord,
  sanitizeMetaSnapshot,
  buildShortDescription,
  normalizeContextDepthValue,
  formatNodeForContext,
  convertUrlToDataUriIfNeeded,
  extractNodeMetaSnapshot,
  safeExtractUiPosition,
  pickPrimaryLinkFromSnapshot,
  deriveReplicateAssetPosition,
} from './helpers';

// Helpers (Replicate-specific)
export {
  normalizeReplicateArtifacts,
  normalizeAggregatedReplicateText,
  extractPrimaryReplicateOutput,
  collectReplicateOutputCandidates,
} from './replicateHelpers';
