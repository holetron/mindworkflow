import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from './store';
import type { ProjectFlow, FlowNode, FlowEdge } from './api';

function makeNode(id: string, overrides?: Partial<FlowNode>): FlowNode {
  return {
    node_id: id,
    type: 'text',
    title: `Node ${id}`,
    content: `Content of ${id}`,
    ui: { color: '#6B7280', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
    ai_visible: true,
    connections: { incoming: [], outgoing: [] },
    ...overrides,
  };
}

function makeProject(
  nodes: FlowNode[] = [],
  edges: FlowEdge[] = [],
): ProjectFlow {
  return {
    project_id: 'proj-1',
    title: 'Test Project',
    description: 'A test project',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    settings: {},
    nodes,
    edges,
    schemas: {},
  };
}

describe('ProjectStore — combined slices', () => {
  beforeEach(() => {
    // Reset store to initial state
    useProjectStore.setState({
      project: null,
      loading: false,
      error: null,
      selectedNodeId: null,
      runs: {},
      uiSettings: null,
    });
  });

  // ===== Project Slice =====

  describe('ProjectSlice', () => {
    it('starts with null project', () => {
      expect(useProjectStore.getState().project).toBeNull();
    });

    it('setProject stores a project and selects first node', () => {
      const nodeA = makeNode('n1_text');
      const project = makeProject([nodeA]);
      useProjectStore.getState().setProject(project);

      const state = useProjectStore.getState();
      expect(state.project).toBeDefined();
      expect(state.project!.project_id).toBe('proj-1');
      expect(state.selectedNodeId).toBe('n1_text');
    });

    it('setProject with empty nodes selects null', () => {
      const project = makeProject([]);
      useProjectStore.getState().setProject(project);
      expect(useProjectStore.getState().selectedNodeId).toBeNull();
    });

    it('mergeProject merges partial data', () => {
      const project = makeProject([makeNode('n1')]);
      useProjectStore.getState().setProject(project);
      useProjectStore.getState().mergeProject({ title: 'Updated Title' });

      expect(useProjectStore.getState().project!.title).toBe('Updated Title');
      expect(useProjectStore.getState().project!.nodes).toHaveLength(1);
    });

    it('setLoading updates loading state', () => {
      useProjectStore.getState().setLoading(true);
      expect(useProjectStore.getState().loading).toBe(true);
      useProjectStore.getState().setLoading(false);
      expect(useProjectStore.getState().loading).toBe(false);
    });

    it('setError updates error state', () => {
      useProjectStore.getState().setError('Something went wrong');
      expect(useProjectStore.getState().error).toBe('Something went wrong');
      useProjectStore.getState().setError(null);
      expect(useProjectStore.getState().error).toBeNull();
    });

    it('updateProjectSettings deep-merges settings', () => {
      const project = makeProject();
      project.settings = { theme: { color: 'blue' } };
      useProjectStore.getState().setProject(project);

      useProjectStore.getState().updateProjectSettings(
        { theme: { font: 'mono' } },
        '2024-02-01T00:00:00Z',
      );

      const settings = useProjectStore.getState().project!.settings;
      expect(settings).toEqual({
        theme: { color: 'blue', font: 'mono' },
      });
      expect(useProjectStore.getState().project!.updated_at).toBe('2024-02-01T00:00:00Z');
    });

    it('clearProject resets all project-related state', () => {
      const project = makeProject([makeNode('n1')]);
      useProjectStore.getState().setProject(project);
      useProjectStore.getState().setRuns('n1', []);

      useProjectStore.getState().clearProject();

      const state = useProjectStore.getState();
      expect(state.project).toBeNull();
      expect(state.selectedNodeId).toBeNull();
      expect(state.runs).toEqual({});
    });
  });

  // ===== Node Slice =====

  describe('NodeSlice', () => {
    beforeEach(() => {
      const project = makeProject([
        makeNode('n1_text'),
        makeNode('n2_data'),
      ]);
      useProjectStore.getState().setProject(project);
    });

    it('selectNode updates selectedNodeId', () => {
      useProjectStore.getState().selectNode('n2_data');
      expect(useProjectStore.getState().selectedNodeId).toBe('n2_data');
    });

    it('selectNode with null deselects', () => {
      useProjectStore.getState().selectNode(null);
      expect(useProjectStore.getState().selectedNodeId).toBeNull();
    });

    it('upsertNodeContent updates a specific node', () => {
      useProjectStore.getState().upsertNodeContent('n1_text', { title: 'Updated' });

      const node = useProjectStore.getState().project!.nodes.find(
        (n) => n.node_id === 'n1_text',
      );
      expect(node!.title).toBe('Updated');
    });

    it('upsertNodeContent does not affect other nodes', () => {
      useProjectStore.getState().upsertNodeContent('n1_text', { title: 'Updated' });

      const other = useProjectStore.getState().project!.nodes.find(
        (n) => n.node_id === 'n2_data',
      );
      expect(other!.title).toBe('Node n2_data');
    });

    it('addNodeFromServer adds a new node', () => {
      const newNode = makeNode('n3_new', { title: 'From Server' });
      useProjectStore.getState().addNodeFromServer(newNode, '2024-03-01T00:00:00Z');

      const state = useProjectStore.getState();
      expect(state.project!.nodes).toHaveLength(3);
      expect(state.selectedNodeId).toBe('n3_new');
      expect(state.project!.updated_at).toBe('2024-03-01T00:00:00Z');
    });

    it('addNodeFromServer updates an existing node if same ID', () => {
      const updated = makeNode('n1_text', { title: 'Updated from server' });
      useProjectStore.getState().addNodeFromServer(updated);

      const state = useProjectStore.getState();
      expect(state.project!.nodes).toHaveLength(2); // no new node added
      const node = state.project!.nodes.find((n) => n.node_id === 'n1_text');
      expect(node!.title).toBe('Updated from server');
    });

    it('removeNode removes the node and related edges', () => {
      // Add an edge first
      const project = makeProject(
        [makeNode('n1_text'), makeNode('n2_data')],
        [{ from: 'n1_text', to: 'n2_data' }],
      );
      useProjectStore.getState().setProject(project);
      useProjectStore.getState().selectNode('n1_text');

      useProjectStore.getState().removeNode('n1_text');

      const state = useProjectStore.getState();
      expect(state.project!.nodes).toHaveLength(1);
      expect(state.project!.edges).toHaveLength(0);
      // Should select remaining node
      expect(state.selectedNodeId).toBe('n2_data');
    });

    it('removeNode selects null when last node is removed', () => {
      const project = makeProject([makeNode('only_node')]);
      useProjectStore.getState().setProject(project);

      useProjectStore.getState().removeNode('only_node');
      expect(useProjectStore.getState().selectedNodeId).toBeNull();
    });
  });

  // ===== Edge Slice =====

  describe('EdgeSlice', () => {
    beforeEach(() => {
      const project = makeProject(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [{ from: 'a', to: 'b' }],
      );
      useProjectStore.getState().setProject(project);
    });

    it('setEdges replaces all edges', () => {
      const newEdges: FlowEdge[] = [
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ];
      useProjectStore.getState().setEdges(newEdges, '2024-04-01T00:00:00Z');

      const state = useProjectStore.getState();
      expect(state.project!.edges).toHaveLength(2);
      expect(state.project!.updated_at).toBe('2024-04-01T00:00:00Z');
    });

    it('addEdge adds a new edge', () => {
      useProjectStore.getState().addEdge({ from: 'b', to: 'c' });

      const edges = useProjectStore.getState().project!.edges;
      expect(edges).toHaveLength(2);
      expect(edges[1]).toEqual({ from: 'b', to: 'c' });
    });

    it('addEdge does not add duplicate edge', () => {
      useProjectStore.getState().addEdge({ from: 'a', to: 'b' });
      expect(useProjectStore.getState().project!.edges).toHaveLength(1);
    });

    it('removeEdge removes matching edge', () => {
      useProjectStore.getState().removeEdge({ from: 'a', to: 'b' });
      expect(useProjectStore.getState().project!.edges).toHaveLength(0);
    });

    it('removeEdge does nothing for non-matching edge', () => {
      useProjectStore.getState().removeEdge({ from: 'x', to: 'y' });
      expect(useProjectStore.getState().project!.edges).toHaveLength(1);
    });
  });

  // ===== UI Slice =====

  describe('UiSlice', () => {
    it('starts with empty runs', () => {
      expect(useProjectStore.getState().runs).toEqual({});
    });

    it('setRuns stores run logs for a node', () => {
      const runs = [
        {
          run_id: 'run-1',
          project_id: 'proj-1',
          node_id: 'n1',
          started_at: '2024-01-01T00:00:00Z',
          finished_at: '2024-01-01T00:01:00Z',
          status: 'completed',
          input_hash: 'abc',
          output_hash: 'def',
          logs: {},
        },
      ];
      useProjectStore.getState().setRuns('n1', runs);
      expect(useProjectStore.getState().runs.n1).toHaveLength(1);
      expect(useProjectStore.getState().runs.n1[0].run_id).toBe('run-1');
    });

    it('setUiSettings stores UI settings', () => {
      const settings = {
        textNodeFontScaling: { enabled: true, scale: 1.2 },
        markdownPreview: { enabled: false },
      };
      useProjectStore.getState().setUiSettings(settings as ReturnType<typeof useProjectStore.getState>['uiSettings'] & object);
      expect(useProjectStore.getState().uiSettings).toBeDefined();
    });

    it('starts with null uiSettings', () => {
      expect(useProjectStore.getState().uiSettings).toBeNull();
    });
  });
});
