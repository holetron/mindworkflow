import { logger } from '../lib/logger';


const log = logger.child({ module: 'folder' });
import {
  addProjectEdge,
  getNode,
  listProjectEdges,
  removeProjectEdge,
  updateNode,
  updateNodeMetaSystem,
} from '../db';

export interface AssignToFolderArgs {
  projectId: string;
  nodeId: string;
  folderId: string;
  index?: number | null;
  userId?: string;
}

export interface RemoveFromFolderArgs {
  projectId: string;
  nodeId: string;
  folderId?: string | null;
  position?: { x: number; y: number };
  userId?: string;
}

function normalizeChildren(meta: Record<string, unknown>): string[] {
  if (Array.isArray(meta.folder_children)) {
    return (meta.folder_children as unknown[])
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  return [];
}

export function assignNodeToFolder(args: AssignToFolderArgs): { folderChildren: string[] } {
  const { projectId, nodeId, folderId, index, userId } = args;

  const node = getNode(projectId, nodeId);
  const folderNode = getNode(projectId, folderId);
  if (!node) {
    throw new Error('Node not found');
  }
  if (!folderNode || folderNode.type !== 'folder') {
    throw new Error('Target folder not found');
  }

  const nodeMeta = (node.meta ?? {}) as Record<string, unknown>;
  const previousFolderId = typeof nodeMeta.parent_folder_id === 'string' ? nodeMeta.parent_folder_id : null;

  const edges = listProjectEdges(projectId);
  for (const edge of edges) {
    if (edge.from_node === nodeId || edge.to_node === nodeId) {
      removeProjectEdge(projectId, edge.from_node, edge.to_node, userId);
    }
  }

  nodeMeta.parent_folder_id = folderId;
  nodeMeta.parent_folder_assigned_at = new Date().toISOString();
  updateNodeMetaSystem(projectId, nodeId, nodeMeta);

  const folderMeta = (folderNode.meta ?? {}) as Record<string, unknown>;
  const children = normalizeChildren(folderMeta).filter((id) => id !== nodeId);
  let insertion = typeof index === 'number' && Number.isFinite(index) ? Math.trunc(index) : children.length;
  if (insertion < 0) insertion = 0;
  if (insertion > children.length) insertion = children.length;
  children.splice(insertion, 0, nodeId);
  folderMeta.folder_children = children;
  folderMeta.updated_at = new Date().toISOString();
  updateNodeMetaSystem(projectId, folderId, folderMeta);

  if (previousFolderId && previousFolderId !== folderId) {
    const previousFolder = getNode(projectId, previousFolderId);
    if (previousFolder && previousFolder.type === 'folder') {
      const prevMeta = (previousFolder.meta ?? {}) as Record<string, unknown>;
      if (Array.isArray(prevMeta.folder_children)) {
        prevMeta.folder_children = (prevMeta.folder_children as unknown[])
          .filter((id): id is string => typeof id === 'string' && id !== nodeId);
        prevMeta.updated_at = new Date().toISOString();
        updateNodeMetaSystem(projectId, previousFolderId, prevMeta);
      }
    }
  }

  return { folderChildren: children };
}

export function removeNodeFromFolder(args: RemoveFromFolderArgs): { folderId: string; folderChildren: string[] } {
  const { projectId, nodeId, folderId, position, userId } = args;

  log.info({ data: {
    projectId,
    nodeId,
    folderId,
    position,
    userId,
  } }, '[removeNodeFromFolder] Called with');

  const node = getNode(projectId, nodeId);
  if (!node) {
    throw new Error('Node not found');
  }
  
  log.info({ data: {
    nodeId: node.node_id,
    nodeType: node.type,
  } }, '[removeNodeFromFolder] Node found');

  const nodeMeta = (node.meta ?? {}) as Record<string, unknown>;
  const sourceFolderId = folderId && folderId.trim().length > 0
    ? folderId
    : typeof nodeMeta.parent_folder_id === 'string'
      ? nodeMeta.parent_folder_id
      : null;

  if (!sourceFolderId) {
    throw new Error('Node is not assigned to a folder');
  }

  const folderNode = getNode(projectId, sourceFolderId);
  if (!folderNode) {
    log.error(`[Folder Service] Folder node not found: ${sourceFolderId}, project: ${projectId}`);
    throw new Error(`Folder node not found: ${sourceFolderId}`);
  }
  
  if (folderNode.type !== 'folder') {
    log.error(`[Folder Service] Node is not a folder: ${sourceFolderId}, type: ${folderNode.type}`);
    throw new Error(`Node ${sourceFolderId} is not a folder (type: ${folderNode.type})`);
  }

  const folderMeta = (folderNode.meta ?? {}) as Record<string, unknown>;
  const children = normalizeChildren(folderMeta).filter((id) => id !== nodeId);
  folderMeta.folder_children = children;
  folderMeta.updated_at = new Date().toISOString();
  updateNodeMetaSystem(projectId, sourceFolderId, folderMeta);

  delete nodeMeta.parent_folder_id;
  nodeMeta.removed_from_folder_at = new Date().toISOString();
  updateNodeMetaSystem(projectId, nodeId, nodeMeta);

  if (position) {
    const bbox = node.ui?.bbox;
    const width = bbox ? bbox.x2 - bbox.x1 : 240;
    const height = bbox ? bbox.y2 - bbox.y1 : 160;
    updateNode(
      projectId,
      nodeId,
      {
        ui: {
          bbox: {
            x1: Math.round(position.x),
            y1: Math.round(position.y),
            x2: Math.round(position.x + width),
            y2: Math.round(position.y + height),
          },
        },
      },
      userId,
    );
  }

  const edges = listProjectEdges(projectId);
  const outgoing = edges.filter((edge) => edge.from_node === sourceFolderId);
  const incoming = edges.filter((edge) => edge.to_node === sourceFolderId);

  for (const edge of outgoing) {
    try {
      addProjectEdge(
        projectId,
        { from: nodeId, to: edge.to_node, label: edge.label ?? undefined },
        userId,
      );
    } catch (error) {
      if (!((error as { status?: number }).status === 409)) {
        log.warn({ err: error }, '[Folder] Failed to replicate outgoing edge');
      }
    }
  }

  for (const edge of incoming) {
    try {
      addProjectEdge(
        projectId,
        { from: edge.from_node, to: nodeId, label: edge.label ?? undefined },
        userId,
      );
    } catch (error) {
      if (!((error as { status?: number }).status === 409)) {
        log.warn({ err: error }, '[Folder] Failed to replicate incoming edge');
      }
    }
  }

  return { folderId: sourceFolderId, folderChildren: children };
}
