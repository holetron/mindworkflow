import type {
  FlowNode,
  NodeUI,
  IntegrationFieldConfig,
  PromptPreset,
  AutoPort,
  ModelSchemaInput,
  CreateNodePayload,
} from '../../../state/api';
import type { TextOperation } from '../../../utils/textOperations';

export interface AiProviderOption {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  available: boolean;
  description?: string;
  reason?: string;
  config?: Record<string, unknown>;
  systemPromptTemplate?: string;
  inputFields?: IntegrationFieldConfig[];
  supportsFiles?: boolean;
  supportedFileTypes?: string[];
  modelFamilies?: Array<{
    id: string;
    label: string;
    defaultModel: string;
    models: Array<{ id: string; label: string }>;
  }>;
}

export interface FlowNodeCardData {
  node: FlowNode;
  projectId?: string;
  onRun: (nodeId: string) => void;
  onRegenerate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onChangeContent: (nodeId: string, content: string) => void;
  onCommitContent?: (
    nodeId: string,
    content: string,
    options?: { operations?: TextOperation[] },
  ) => Promise<void> | void;
  onChangeTitle: (nodeId: string, title: string) => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onChangeUi?: (nodeId: string, patch: Partial<NodeUI>) => void;
  onOpenSettings?: (nodeId: string) => void;
  onOpenConnections?: (nodeId: string) => void;
  providers?: AiProviderOption[];
  sources?: Array<{ node_id: string; title: string; type: string }>;
  targets?: Array<{ node_id: string; title: string; type: string }>;
  allNodes?: FlowNode[];
  disabled?: boolean;
  isGenerating?: boolean;
  onRemoveNodeFromFolder?: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => void | Promise<void>;
  onRemoveInvalidPorts?: (nodeId: string, invalidPorts: string[]) => void | Promise<void>;
  onSplitText?: (nodeId: string, config: TextSplitterConfig, options?: { content: string }) => void | Promise<void>;
}

export interface TextSplitterConfig {
  separator: string;
  subSeparator: string;
  namingMode: 'auto' | 'manual';
}

export interface NodeFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'range';
  visible: boolean;
  order: number;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface NodeRoutingConfig {
  inputPorts: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    multiple: boolean;
  }>;
  outputPorts: Array<{
    id: string;
    label: string;
    type: string;
    condition?: string;
  }>;
  routingRules: Array<{
    id: string;
    condition: string;
    outputPort: string;
    description: string;
  }>;
}

export type { FlowNode, NodeUI, AutoPort, ModelSchemaInput, CreateNodePayload, PromptPreset };
