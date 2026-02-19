/**
 * AI-related types shared across all provider modules.
 * ADR-081 Phase 2 — extracted from the monolithic ai.ts.
 */

import type { StoredNode } from '../../db';

// ---------------------------------------------------------------------------
// Provider field configuration
// ---------------------------------------------------------------------------

export interface ProviderFieldConfig {
  id?: string;
  label: string;
  key: string;
  type?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  default_value?: string;
}

export interface ProviderFieldValuePersisted {
  value?: string;
  source_node_id?: string | null;
}

export interface ResolvedProviderField {
  key: string;
  label: string;
  value: string;
  source_node_id?: string | null;
}

// ---------------------------------------------------------------------------
// Normalized provider config (used after reading integrations)
// ---------------------------------------------------------------------------

export type NormalizedProviderConfig = {
  api_key?: string;
  organization?: string;
  base_url?: string;
  input_fields?: ProviderFieldConfig[];
  model?: string;
};

// ---------------------------------------------------------------------------
// AI Context & Result — the core contracts for every provider
// ---------------------------------------------------------------------------

export interface AiContext {
  projectId?: string;
  node: StoredNode;
  previousNodes: StoredNode[];
  nextNodes: Array<{
    node_id: string;
    type: string;
    title: string;
    short_description: string;
    connection_labels: string[];
  }>;
  schemaRef: string;
  settings: Record<string, unknown>;
  projectOwnerId?: string | null;
  actorUserId?: string | null;
  files?: Array<{
    name: string;
    type: string;
    content: string;
    source_node_id?: string;
  }>;
  contextMode?: 'simple' | 'full_json' | 'clean' | 'simple_json' | 'raw';
  edges?: Array<{
    from: string;
    to: string;
    targetHandle?: string;
  }>;
  imageAttachments?: Array<{
    url: string;
    mimetype: string;
  }>;
  overrideInputs?: Record<string, unknown>;
}

export interface AiResult {
  output: string;
  contentType: string;
  logs: string[];
  predictionUrl?: string;
  predictionId?: string;
  provider?: string;
  rawOutput?: unknown;
  predictionPayload?: unknown;
  requestPayload?: {
    provider: string;
    model: string;
    timestamp: string;
    request: unknown;
  };
}
