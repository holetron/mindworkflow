import { findPreviousNodes, findNextNodes } from '../../state/store';
import { AiSettingsModal } from '../../ui/AiSettingsModal';
import type { WorkspaceState } from './hooks/useWorkspaceState';
import type { WorkspaceActions } from './hooks/useWorkspaceActions';

interface AiSettingsModalWrapperProps {
  ws: WorkspaceState;
  actions: WorkspaceActions;
}

export function AiSettingsModalWrapper({ ws, actions }: AiSettingsModalWrapperProps) {
  const { showNodeAiSettings, project, providerOptions, loading } = ws;

  if (!showNodeAiSettings || !project) return null;

  const aiNode = project.nodes.find((n) => n.node_id === showNodeAiSettings);
  if (!aiNode || (aiNode.type !== 'ai' && aiNode.type !== 'ai_improved')) return null;

  return (
    <AiSettingsModal
      node={aiNode}
      onClose={() => {
        const nodeId = showNodeAiSettings;
        ws.setShowNodeAiSettings(null);
        ws.setShowNodeModal(nodeId);
      }}
      activeTab="ai_config"
      onTabChange={() => {}}
      onChangeAi={actions.handleUpdateNodeAi}
      onUpdateNodeMeta={actions.handleUpdateNodeMeta}
      providers={providerOptions}
      loading={loading}
      dynamicModels={{}}
      loadingModels={{}}
      allNodes={project.nodes}
      edges={project.edges || []}
      sources={findPreviousNodes(project, showNodeAiSettings).map((node) => ({
        node_id: node.node_id,
        title: node.title,
        type: node.type,
      }))}
      targets={findNextNodes(project, showNodeAiSettings).map((node) => ({
        node_id: node.node_id,
        title: node.title,
        type: node.type,
      }))}
      onRemoveInvalidPorts={async (nodeId: string, invalidPorts: string[]) => {
        if (!project) return;

        console.log(
          `Redirecting edges from invalid ports [${invalidPorts.join(', ')}] to "context" port`,
        );

        const edgesToUpdate = project.edges.filter(
          (edge) =>
            (edge.target === nodeId && invalidPorts.includes(edge.targetHandle || '')) ||
            (edge.source === nodeId && invalidPorts.includes(edge.sourceHandle || '')),
        );

        if (edgesToUpdate.length === 0) {
          console.log('No edges connected to invalid ports');
          return;
        }

        console.log(`Found ${edgesToUpdate.length} edges to redirect to "context"`);

        const edgesToDelete = new Set<string>();

        edgesToUpdate.forEach((edge) => {
          if (edge.target === nodeId && invalidPorts.includes(edge.targetHandle || '')) {
            const existingContextEdge = project.edges.find(
              (e) =>
                e.id !== edge.id &&
                e.source === edge.source &&
                e.target === edge.target &&
                e.targetHandle === 'context',
            );
            if (existingContextEdge) {
              edgesToDelete.add(edge.id);
            }
          }
          if (edge.source === nodeId && invalidPorts.includes(edge.sourceHandle || '')) {
            const existingContextEdge = project.edges.find(
              (e) =>
                e.id !== edge.id &&
                e.source === edge.source &&
                e.target === edge.target &&
                e.sourceHandle === 'context',
            );
            if (existingContextEdge) {
              edgesToDelete.add(edge.id);
            }
          }
        });

        const updatedEdges = project.edges
          .filter((edge) => !edgesToDelete.has(edge.id))
          .map((edge) => {
            const shouldUpdate = edgesToUpdate.some((e) => e.id === edge.id);
            if (!shouldUpdate) return edge;
            if (edge.target === nodeId && invalidPorts.includes(edge.targetHandle || '')) {
              return { ...edge, targetHandle: 'context' };
            }
            if (edge.source === nodeId && invalidPorts.includes(edge.sourceHandle || '')) {
              return { ...edge, sourceHandle: 'context' };
            }
            return edge;
          });

        try {
          const response = await fetch(`/api/project/${project.project_id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            },
            body: JSON.stringify({ edges: updatedEdges }),
          });

          if (!response.ok) {
            throw new Error('Failed to update edges');
          }

          ws.setProject({ ...project, edges: updatedEdges });
          console.log('Edges successfully redirected to "context"');
        } catch (error) {
          console.error('Failed to redirect edges:', error);
        }
      }}
    />
  );
}
