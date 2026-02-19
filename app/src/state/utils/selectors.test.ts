import { describe, it, expect } from 'vitest';
import {
  selectNodeById,
  buildNodeMap,
  findPreviousNodes,
  findNextNodes,
} from './selectors';
import type { ProjectFlow, FlowNode } from '../api';

function makeNode(id: string, title?: string): FlowNode {
  return {
    node_id: id,
    type: 'text',
    title: title ?? id,
    content: '',
    ui: { color: '#6B7280', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
    ai_visible: true,
    connections: { incoming: [], outgoing: [] },
  };
}

function makeProject(
  nodes: FlowNode[],
  edges: Array<{ from: string; to: string }> = [],
): ProjectFlow {
  return {
    project_id: 'test-project',
    title: 'Test Project',
    description: '',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    settings: {},
    nodes,
    edges,
    schemas: {},
  };
}

describe('selectNodeById', () => {
  it('returns null for null project', () => {
    expect(selectNodeById(null, 'n1')).toBeNull();
  });

  it('returns null for null nodeId', () => {
    const project = makeProject([makeNode('n1')]);
    expect(selectNodeById(project, null)).toBeNull();
  });

  it('returns null for undefined nodeId', () => {
    const project = makeProject([makeNode('n1')]);
    expect(selectNodeById(project, undefined)).toBeNull();
  });

  it('returns the matching node', () => {
    const node = makeNode('n1_text', 'My Node');
    const project = makeProject([node, makeNode('n2_data')]);
    const result = selectNodeById(project, 'n1_text');
    expect(result).toBe(node);
  });

  it('returns null for non-existent nodeId', () => {
    const project = makeProject([makeNode('n1')]);
    expect(selectNodeById(project, 'missing')).toBeNull();
  });
});

describe('buildNodeMap', () => {
  it('returns empty map for null project', () => {
    const map = buildNodeMap(null);
    expect(map.size).toBe(0);
  });

  it('builds a map keyed by node_id', () => {
    const nodeA = makeNode('a');
    const nodeB = makeNode('b');
    const project = makeProject([nodeA, nodeB]);
    const map = buildNodeMap(project);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(nodeA);
    expect(map.get('b')).toBe(nodeB);
  });
});

describe('findPreviousNodes', () => {
  it('returns empty array for null project', () => {
    expect(findPreviousNodes(null, 'n1')).toEqual([]);
  });

  it('returns empty array for node with no incoming edges', () => {
    const project = makeProject([makeNode('n1'), makeNode('n2')], []);
    expect(findPreviousNodes(project, 'n1')).toEqual([]);
  });

  it('finds direct ancestors', () => {
    const nodeA = makeNode('a');
    const nodeB = makeNode('b');
    const nodeC = makeNode('c');
    const project = makeProject(
      [nodeA, nodeB, nodeC],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    );
    const ancestors = findPreviousNodes(project, 'c');
    const ids = ancestors.map((n) => n.node_id);
    expect(ids).toContain('b');
    expect(ids).toContain('a');
  });

  it('handles multiple upstream paths', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ];
    const project = makeProject(nodes, edges);
    const ancestors = findPreviousNodes(project, 'd');
    const ids = ancestors.map((n) => n.node_id);
    expect(ids).toContain('c');
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('does not visit nodes twice (handles cycles)', () => {
    // Cycle: a -> b -> a -> c
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
      { from: 'c', to: 'a' },
    ];
    const project = makeProject(nodes, edges);
    const ancestors = findPreviousNodes(project, 'b');
    // Should find 'a' and 'c' (traversing reverse: b <- a <- c), each visited once
    const ids = ancestors.map((n) => n.node_id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    // No duplicates
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('findNextNodes', () => {
  it('returns empty array for null project', () => {
    expect(findNextNodes(null, 'n1')).toEqual([]);
  });

  it('returns empty array for node with no outgoing edges', () => {
    const project = makeProject([makeNode('n1')], []);
    expect(findNextNodes(project, 'n1')).toEqual([]);
  });

  it('finds direct downstream nodes', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ];
    const project = makeProject(nodes, edges);
    const next = findNextNodes(project, 'a');
    const ids = next.map((n) => n.node_id);
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(next).toHaveLength(2);
  });

  it('only returns direct children, not grandchildren', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const project = makeProject(nodes, edges);
    const next = findNextNodes(project, 'a');
    expect(next).toHaveLength(1);
    expect(next[0].node_id).toBe('b');
  });
});
