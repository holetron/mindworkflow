import GraphCanvas from '../../features/graph/GraphCanvas';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';

interface WorkspaceCanvasProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function WorkspaceCanvas({ ws, actions }: WorkspaceCanvasProps) {
  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 0, width: '100%', height: '100%' }}
    >
      <GraphCanvas
        key={ws.preserveViewport ? 'graph-canvas-stable' : `graph-canvas-${ws.forceUpdateTrigger}`}
        project={ws.project}
        selectedNodeId={ws.selectedNodeId}
        onSelectNode={ws.selectNode}
        onRunNode={actions.handleRunNode}
        onRegenerateNode={actions.handleRegenerateNode}
        onDeleteNode={actions.handleDeleteNode}
        onChangeNodeMeta={actions.handleUpdateNodeMeta}
        onChangeNodeContent={actions.handleUpdateNodeContent}
        onCommitNodeContent={actions.handleCommitNodeContent}
        onChangeNodeTitle={actions.handleUpdateNodeTitle}
        onChangeNodeAi={actions.handleUpdateNodeAi}
        onChangeNodeUi={actions.handleUpdateNodeUi}
        onAddNodeFromPalette={actions.handlePaletteDrop}
        onCopyNode={ws.canEditProject ? actions.handleNodeCopy : undefined}
        onCreateEdge={actions.handleConnectEdge}
        onRemoveEdges={actions.handleRemoveEdges}
        providerOptions={ws.providerOptions}
        loading={ws.loading}
        sidebarCollapsed={true}
        sidebarWidth={0}
        defaultViewport={ws.savedViewport || undefined}
        onViewportChange={actions.handleViewportChange}
        readOnly={!ws.canEditProject}
        generatingNodes={ws.generatingNodeSet}
        onMoveNodeToFolder={actions.handleMoveNodeToFolder}
        onRemoveNodeFromFolder={actions.handleRemoveNodeFromFolder}
        onRemoveInvalidPorts={actions.handleRemoveInvalidPorts}
        onImportFilesToFolder={actions.handleImportFilesToFolder}
        onSplitTextNode={ws.canEditProject ? actions.handleSplitTextNode : undefined}
      />
    </div>
  );
}
