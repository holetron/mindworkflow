import type {
  FlowNode,
  NodeUI,
  NodeUpdatePayload,
  ProjectFlow,
  ProjectRole,
  ShareResponse,
  SharePayload,
  EdgeListResponse,
  EdgeNotification,
} from '../../state/api';
import type { NodeTemplate } from '../../state/store';
import type { AiProviderOption, TextSplitterConfig } from '../../features/nodes/FlowNodeCard';
import type { TextOperation } from '../../utils/textOperations';

// --------------- Validation ---------------

export interface ValidationIdle {
  status: 'idle';
}

export interface ValidationSuccess {
  status: 'success';
  message: string;
}

export interface ValidationWarning {
  status: 'warning';
  message: string;
}

export interface ValidationError {
  status: 'error';
  message: string;
}

export type ValidationState =
  | ValidationIdle
  | ValidationSuccess
  | ValidationWarning
  | ValidationError;

// --------------- Resize Handle ---------------

export interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  ariaLabel: string;
}

// --------------- Workspace Actions (passed as props) ---------------

export interface WorkspaceNodeActions {
  handleRunNode: (nodeId: string) => Promise<void>;
  handleRegenerateNode: (nodeId: string) => Promise<void>;
  handleDeleteNode: (nodeId: string) => Promise<void>;
  handleUpdateNodeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  handleUpdateNodeContent: (nodeId: string, content: string) => void;
  handleCommitNodeContent: (nodeId: string, content: string, options?: { operations?: TextOperation[] }) => Promise<void>;
  handleUpdateNodeTitle: (nodeId: string, title: string) => Promise<void>;
  handleUpdateNodeAi: (nodeId: string, aiPatch: Record<string, unknown>, options?: { replace?: boolean }) => void;
  handleUpdateNodeUi: (nodeId: string, patch: Partial<NodeUI>) => void;
  handleNodeCopy: (node: FlowNode, position: { x: number; y: number }) => Promise<void>;
  handleMoveNodeToFolder: (nodeId: string, folderId: string, options?: { index?: number | null }) => Promise<void>;
  handleRemoveNodeFromFolder: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => Promise<void>;
  handleRemoveInvalidPorts: (nodeId: string, invalidPorts: string[]) => Promise<void>;
  handleImportFilesToFolder: (folderId: string, files: File[], dropPosition: { x: number; y: number }) => Promise<void>;
  handleSplitTextNode: (nodeId: string, config: TextSplitterConfig, options?: { content: string }) => Promise<void>;
}

export interface WorkspaceProjectActions {
  handleSaveWorkspace: () => Promise<void>;
  handleExportWorkspace: () => Promise<void>;
  handleImportWorkspace: () => void;
  handleDeleteWorkspace: () => Promise<void>;
  handleLogoutClick: () => void;
}

export interface WorkspaceTitleActions {
  handleStartEditTitle: () => void;
  handleSaveTitle: () => Promise<void>;
  handleCancelEditTitle: () => void;
  handleStartEditDescription: () => void;
  handleSaveDescription: () => Promise<void>;
  handleCancelEditDescription: () => void;
  handleSaveIsPublic: (nextValue: boolean, previousValue?: boolean) => Promise<void>;
}

export interface WorkspaceEdgeActions {
  handleConnectEdge: (params: { from: string; to: string; sourceHandle?: string | null; targetHandle?: string | null }) => Promise<void>;
  handleRemoveEdges: (edgesToRemove: Array<{ from: string; to: string }>) => Promise<void>;
}

export interface WorkspaceShareActions {
  handleOpenShareModal: () => void;
  handleCloseShareModal: () => void;
  handleShareSubmit: () => Promise<void>;
  handleShareRemove: (userId: string) => Promise<void>;
}

// --------------- Share Modal ---------------

export interface ShareModalProps {
  project: ProjectFlow;
  canEditProject: boolean;
  editIsPublic: boolean;
  setEditIsPublic: (value: boolean) => void;
  shareForm: SharePayload;
  setShareForm: React.Dispatch<React.SetStateAction<SharePayload>>;
  shareInfo: ShareResponse | null;
  shareFetching: boolean;
  shareSaving: boolean;
  shareError: string | null;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onSaveIsPublic: (nextValue: boolean, previousValue?: boolean) => Promise<void>;
}

// --------------- Node Modal ---------------

export interface NodeModalProps {
  project: ProjectFlow;
  nodeId: string;
  providerOptions: AiProviderOption[];
  loading: boolean;
  generatingNodes: Set<string>;
  onClose: () => void;
  onSelectOnCanvas: (nodeId: string) => void;
  onOpenAiSettings: (nodeId: string) => void;
  onNavigateToNode: (nodeId: string) => void;
  onColorChange: (nodeId: string, color: string) => void;
  onTitleChange: (nodeId: string, title: string) => void;
  onContentChange: (nodeId: string, content: string) => void;
  onMetaChange: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onAiChange: (nodeId: string, aiPatch: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onRunNode: (nodeId: string) => Promise<void>;
}

// --------------- Header ---------------

export interface WorkspaceHeaderProps {
  project: ProjectFlow | null;
  isMobile: boolean;
  canEditProject: boolean;
  showChatPanel: boolean;
  isEditingTitle: boolean;
  editTitle: string;
  setEditTitle: (value: string) => void;
  isEditingDescription: boolean;
  editDescription: string;
  setEditDescription: (value: string) => void;
  onNavigateHome: () => void;
  titleActions: WorkspaceTitleActions;
  projectTitleSubmitRef: React.MutableRefObject<boolean>;
  projectDescriptionSubmitRef: React.MutableRefObject<boolean>;
  menuContent: React.ReactNode;
}

// --------------- Menu ---------------

export interface WorkspaceMenuDropdownProps {
  project: ProjectFlow | null;
  isSaving: boolean;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onSave: () => void;
  onShare: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: () => void;
  onLogout: () => void;
}
