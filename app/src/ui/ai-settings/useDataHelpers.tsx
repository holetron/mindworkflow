/**
 * Data helpers for computing port data, node context, and related values.
 * Extracted from useAiSettingsState to keep files under 500 lines.
 */
import { useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import type { FlowNode, AutoPort } from './types';

interface DataHelpersParams {
  node: FlowNode;
  allNodes: FlowNode[];
  sources: Array<{ node_id: string; title: string; type: string }>;
  targets: Array<{ node_id: string; title: string; type: string }>;
  pendingAutoPorts: AutoPort[];
  pendingEnabledPorts: string[];
}

export function useDataHelpers(params: DataHelpersParams) {
  const { node, allNodes, sources, targets, pendingAutoPorts, pendingEnabledPorts } = params;
  const { getEdges } = useReactFlow();

  const incomingNodes = !sources || !allNodes ? [] : sources
    .map((source) => allNodes.find((n) => n.node_id === source.node_id))
    .filter((n): n is FlowNode => !!n);

  const outgoingNodes = !targets || !allNodes ? [] : targets
    .map((target) => allNodes.find((n) => n.node_id === target.node_id))
    .filter((n): n is FlowNode => !!n);

  const getNodeContentPreview = (n: FlowNode): React.ReactNode => {
    const MAX_LENGTH = 50;
    let content = '';
    if (n.type === 'text' && n.content) content = String(n.content);
    else if (n.type === 'image') { const meta = n.meta as any; content = meta?.image_url || meta?.original_image || ''; }
    else if (n.type === 'video') { const meta = n.meta as any; content = meta?.video_url || ''; }
    else if ((n.type === 'pdf' || n.type === 'file')) { const meta = n.meta as any; content = meta?.file_url || meta?.pdf_url || n.content || ''; }
    else if (n.type === 'code' && n.content) content = String(n.content);
    else if ((n.type === 'ai' || n.type === 'ai_improved')) content = n.content || '';
    else if (n.content) content = String(n.content);
    if (!content) return <span className="text-slate-500 italic">(no content)</span>;
    const trimmed = content.trim();
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (isUrl) { const displayUrl = trimmed.length <= MAX_LENGTH ? trimmed : trimmed.substring(0, MAX_LENGTH) + '...'; return <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all" title={trimmed}>{displayUrl}</a>; }
    if (trimmed.length <= MAX_LENGTH) return <span>{trimmed}</span>;
    return <span title={trimmed}>{trimmed.substring(0, MAX_LENGTH) + '...'}</span>;
  };

  const getNodesAtDepth = (targetDepth: number, direction: 'incoming' | 'outgoing'): FlowNode[] => {
    if (targetDepth <= 0 || !allNodes) return [];
    const result = new Set<string>();
    const visited = new Set<string>();
    let currentLevel = new Set<string>();
    if (direction === 'incoming' && sources) sources.forEach(s => currentLevel.add(s.node_id));
    else if (direction === 'outgoing' && targets) targets.forEach(t => currentLevel.add(t.node_id));
    const edgesArr = getEdges();
    for (let depth = 0; depth < targetDepth && currentLevel.size > 0; depth++) {
      const nextLevel = new Set<string>();
      for (const nodeId of currentLevel) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        result.add(nodeId);
        if (direction === 'incoming') {
          edgesArr.forEach(edge => { if (edge.target === nodeId && !visited.has(edge.source)) nextLevel.add(edge.source); });
        } else {
          edgesArr.forEach(edge => { if (edge.source === nodeId && !visited.has(edge.target)) nextLevel.add(edge.target); });
        }
      }
      currentLevel = nextLevel;
    }
    return Array.from(result).map(nodeId => allNodes.find(n => n.node_id === nodeId)).filter((n): n is FlowNode => !!n);
  };

  // Port data helpers
  const pickImageMetaValue = (meta: Record<string, unknown>) => {
    const candidates: Array<unknown> = [];
    const rawMode = typeof meta.image_output_mode === 'string' ? meta.image_output_mode.trim().toLowerCase() : '';
    if (rawMode === 'crop') candidates.push(meta.image_crop, meta.crop_image);
    else if (rawMode === 'annotated') candidates.push(meta.image_edited, meta.edited_image, meta.annotated_image);
    candidates.push(
      meta.image_url, meta.local_url, meta.image_original, meta.original_image,
      meta.image_edited, meta.edited_image, meta.image_crop, meta.crop_image, meta.annotated_image,
    );
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) return c.trim();
    }
    return null;
  };

  const getPortDataList = (portId: string, portType?: string): string[] => {
    const currentEdges = getEdges();
    const incomingEdges = currentEdges.filter((edge: any) =>
      edge.target === node.node_id && (edge.targetHandle === portId || (!edge.targetHandle && portId === 'prompt')),
    );
    if (incomingEdges.length === 0) return [];
    const results: string[] = [];
    for (const incomingEdge of incomingEdges) {
      const sourceNode = allNodes.find((n) => n.node_id === incomingEdge.source);
      if (!sourceNode) continue;
      const meta = (sourceNode.meta ?? {}) as Record<string, unknown>;
      const handle = incomingEdge.sourceHandle;
      const lowerPortId = portId.toLowerCase();
      const normalizedPortType = (portType || '').toLowerCase();
      const isImagePort = normalizedPortType === 'image' || sourceNode.type === 'image' || lowerPortId.includes('image');
      let portValue = '';
      if (!handle || handle === 'output') {
        if (isImagePort) {
          const url = pickImageMetaValue(meta) ?? String(sourceNode.content || '');
          portValue = String(url || '').trim();
        }
      } else {
        const metaValue = meta?.[handle];
        if (typeof metaValue === 'string' && metaValue.trim().length > 0) portValue = metaValue.trim();
        else portValue = pickImageMetaValue(meta) || String(sourceNode.content || '').trim();
      }
      if (portValue) results.push(portValue);
    }
    return results;
  };

  const getPortData = (portId: string, portType?: string): string => {
    const list = getPortDataList(portId, portType);
    return list.length > 0 ? list[0] : '';
  };

  const formatNodeForContext = (n: FlowNode, mode: 'simple' | 'full_json' | 'clean' | 'simple_json'): string => {
    if (mode === 'full_json') {
      const obj = { ...n };
      delete (obj as any).connections;
      return JSON.stringify(obj, null, 2);
    }
    if (mode === 'clean') {
      let content = '';
      if (n.type === 'text' && n.content) content = String(n.content).trim();
      else if (n.type === 'image') {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        content = typeof meta?.image_url === 'string' ? (meta.image_url as string).trim() : '';
      } else if (n.type === 'video') {
        const meta = (n.meta ?? {}) as Record<string, unknown>;
        content = typeof meta?.video_url === 'string' ? (meta.video_url as string).trim() : '';
      } else if (n.content) content = String(n.content).trim();
      return content;
    }
    if (mode === 'simple_json') {
      const obj: any = { type: n.type, title: n.title, content: n.content || undefined };
      if (n.ai && Object.keys(n.ai).length > 0) {
        obj.ai = { system_prompt: n.ai.system_prompt || undefined, model: n.ai.model || undefined };
      }
      return JSON.stringify(obj, null, 2);
    }
    const parts: string[] = [`Context from "${n.title || n.node_id}":`];
    if (n.content) parts.push(String(n.content));
    return parts.join('\n');
  };

  // Computed: edges, active auto port IDs, auto inputs preview
  const edgesToCurrentNode = getEdges().filter((edge: any) => edge.target === node.node_id);

  const activeAutoPortIdSet = new Set<string>();
  pendingAutoPorts.filter(p => p.id !== 'prompt').forEach(p => {
    if (p.required || pendingEnabledPorts.includes(p.id)) activeAutoPortIdSet.add(p.id);
  });

  const autoPortSourceIds = new Set<string>();
  edgesToCurrentNode.forEach((edge: any) => {
    if (edge.targetHandle && activeAutoPortIdSet.has(edge.targetHandle)) autoPortSourceIds.add(edge.source);
  });

  const autoInputsPreview = pendingAutoPorts
    .filter(p => p.id !== 'prompt' && (p.required || pendingEnabledPorts.includes(p.id)))
    .map(port => {
      const linkedEdge = edgesToCurrentNode.find(
        (edge: any) => edge.targetHandle === port.id || (!edge.targetHandle && port.id === 'prompt'),
      );
      const sourceNode = linkedEdge ? allNodes.find((n) => n.node_id === linkedEdge.source) : undefined;
      const rawValue = getPortData(port.id, port.type);
      const previewValue = rawValue.length > 0 ? (rawValue.length > 140 ? `${rawValue.slice(0, 137)}...` : rawValue) : '';
      return { port, sourceNode, value: previewValue, hasValue: rawValue.trim().length > 0 };
    });

  const { contextPreview, contextCharCount } = useMemo(() => {
    const mode = (node.ai?.context_mode as 'simple' | 'full_json' | 'clean' | 'simple_json') ?? 'simple';
    const contextParts: string[] = [];
    const processedNodeIds = new Set<string>();

    const filteredIncoming = getNodesAtDepth(Number(node.ai?.context_left_depth ?? 1), 'incoming');
    for (const n of filteredIncoming) {
      if (autoPortSourceIds.has(n.node_id) || processedNodeIds.has(n.node_id)) continue;
      processedNodeIds.add(n.node_id);
      const f = formatNodeForContext(n, mode);
      if (f.trim().length > 0) contextParts.push(f);
    }

    const filteredOutgoing = getNodesAtDepth(Number(node.ai?.context_right_depth ?? 0), 'outgoing');
    for (const n of filteredOutgoing) {
      if (autoPortSourceIds.has(n.node_id) || processedNodeIds.has(n.node_id)) continue;
      processedNodeIds.add(n.node_id);
      const f = formatNodeForContext(n, mode);
      if (f.trim().length > 0) contextParts.push(f);
    }

    const separator = mode === 'clean' ? ' ; ' : '\n\n---\n\n';
    const preview = contextParts.join(separator);
    return { contextPreview: preview, contextCharCount: preview.length };
  }, [node.ai?.context_left_depth, node.ai?.context_right_depth, node.ai?.context_mode, autoPortSourceIds]);

  return {
    incomingNodes,
    outgoingNodes,
    getNodeContentPreview,
    getNodesAtDepth,
    getPortData,
    getPortDataList,
    formatNodeForContext,
    autoPortSourceIds,
    autoInputsPreview,
    contextPreview,
    contextCharCount,
  };
}
