// Barrel export — re-exports everything for backward compatibility

export type {
  NodeSpec,
  CreatedNodeSummary,
  CreatedNodeSnapshot,
  TransformResult,
  TextSplitConfig,
  TextSplitManualTitle,
  TextSplitPreviewSegment,
  TextSplitPreviewResult,
  TextSplitResult,
} from './types';

export { TransformerService } from './pipeline';
