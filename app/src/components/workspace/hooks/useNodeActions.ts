import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchProject, fetchNodeLogs, runNode, rerunNode, deleteNode, updateNode,
  fetchMidjourneyStatus, moveNodeToFolder, removeNodeFromFolder, splitTextNode,
  type NodeUpdatePayload, type EdgeNotification, type NodeUI, type FlowNode,
} from '../../../state/api';
import { selectNodeById } from '../../../state/store';
import { DEFAULT_NODE_BBOX, NODE_DEFAULT_COLOR } from '../../../constants/nodeDefaults';
import type { TextOperation } from '../../../utils/textOperations';
import type { TextSplitterConfig } from '../../../features/nodes/FlowNodeCard';
import type { WorkspaceState } from './useWorkspaceState';

/**
 * Node-level action callbacks: CRUD, run, regenerate, move, UI updates.
 */
export function useNodeActions(ws: WorkspaceState) {
  // ---- Edge notification helper ----

  const showEdgeNotification = useCallback(
    (notification?: EdgeNotification) => {
      if (!notification || !notification.message) return;
      const severity = notification.severity ?? 'info';
      if (severity === 'warning') {
        ws.setValidation({ status: 'warning', message: notification.message });
      } else if (severity === 'error') {
        ws.setValidation({ status: 'error', message: notification.message });
      } else {
        ws.setValidation({ status: 'success', message: notification.message });
      }
    },
    [ws.setValidation],
  );

  // ---- Persist node update ----

  const persistNodeUpdate = useCallback(
    async (
      nodeId: string,
      patch: NodeUpdatePayload,
      options?: { contentVersion?: number },
    ): Promise<FlowNode | null> => {
      if (!ws.project || !ws.canEditProject) return null;
      try {
        const updated = await updateNode(ws.project.project_id, nodeId, patch);
        if (options?.contentVersion !== undefined) {
          const latestVersion = ws.nodeContentVersionRef.current.get(nodeId) ?? 0;
          if (options.contentVersion < latestVersion) {
            const { content: _ignoredContent, ...rest } = updated as FlowNode & { content?: string | null };
            ws.upsertNodeContent(nodeId, rest as Partial<FlowNode>);
          } else {
            ws.upsertNodeContent(nodeId, updated);
            ws.nodeContentAckRef.current.set(nodeId, options.contentVersion);
          }
        } else {
          ws.upsertNodeContent(nodeId, updated);
        }
        ws.mergeProject({ updated_at: new Date().toISOString() });
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not found/i.test(message)) {
          console.warn('[Workspace] Skipping persist, node missing:', message);
          ws.removeNode(nodeId);
          return null;
        }
        ws.setError(message);
        console.error('[Workspace] Failed to persist node update:', err);
        return null;
      }
    },
    [ws.project, ws.canEditProject, ws.setError, ws.upsertNodeContent, ws.removeNode, ws.mergeProject],
  );

  // ---- Midjourney polling ----

  const stopMidjourneyPolling = useCallback((nodeId: string) => {
    const intervalId = ws.midjourneyPollersRef.current.get(nodeId);
    if (intervalId) {
      window.clearInterval(intervalId);
      ws.midjourneyPollersRef.current.delete(nodeId);
    }
  }, []);

  const scheduleMidjourneyStatus = useCallback(
    (nodeId: string, jobId: string) => {
      if (!ws.project) return;
      const projectId = ws.project.project_id;
      if (!projectId) return;

      const poll = async () => {
        try {
          const status = await fetchMidjourneyStatus(projectId, nodeId, jobId);
          const refreshedProject = await fetchProject(projectId);
          ws.setProject(refreshedProject);
          const normalizedStatus = String(status.status ?? '').toLowerCase();
          if (['completed', 'failed', 'error'].includes(normalizedStatus)) {
            stopMidjourneyPolling(nodeId);
          }
        } catch (error) {
          console.error('[Workspace] Midjourney polling failed:', error);
          stopMidjourneyPolling(nodeId);
        }
      };

      stopMidjourneyPolling(nodeId);
      poll();
      const intervalId = window.setInterval(poll, 15000);
      ws.midjourneyPollersRef.current.set(nodeId, intervalId);
    },
    [ws.project, stopMidjourneyPolling, ws.setProject],
  );

  // ---- Helper: refresh after provider run ----

  const refreshProjectAfterRun = useCallback(
    async (providerId: string, nodeId: string, responseContent?: string | null) => {
      if (!ws.project) return;
      if (providerId === 'midjourney_proxy') {
        let jobId: string | undefined;
        if (typeof responseContent === 'string') {
          try {
            const parsed = JSON.parse(responseContent);
            if (parsed && typeof parsed.job_id === 'string') jobId = parsed.job_id;
          } catch {
            // ignore parse error
          }
        }
        try {
          const refreshed = await fetchProject(ws.project.project_id);
          ws.setProject(refreshed);
        } catch (error) {
          console.error('[Workspace] Failed to refresh project after Midjourney:', error);
        }
        if (jobId) scheduleMidjourneyStatus(nodeId, jobId);
      } else if (providerId === 'replicate' || providerId === 'google_ai_studio') {
        try {
          const refreshed = await fetchProject(ws.project.project_id);
          ws.setProject(refreshed);
        } catch (error) {
          console.error(`[Workspace] Failed to refresh project after ${providerId}:`, error);
        }
      }
    },
    [ws.project, ws.setProject, scheduleMidjourneyStatus],
  );

  // ---- Run node ----

  const handleRunNode = useCallback(
    async (nodeId: string) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        stopMidjourneyPolling(nodeId);
        ws.markNodeRunning(nodeId, true);
        ws.selectNode(nodeId);
        const response = await runNode(ws.project.project_id, nodeId);

        const sourceNode = selectNodeById(ws.project, nodeId);
        const providerId =
          sourceNode && typeof (sourceNode.ai as Record<string, unknown> | undefined)?.provider === 'string'
            ? String((sourceNode.ai as Record<string, unknown>).provider)
            : '';
        const targetNodeId = response.targetNodeId ?? response.nodeId ?? nodeId;
        if (response.content !== undefined) {
          ws.upsertNodeContent(targetNodeId, {
            content: response.content ?? undefined,
            content_type: response.contentType ?? undefined,
          });
        }

        const logNodeId =
          sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved') ? nodeId : targetNodeId;
        const refreshedLogs = await fetchNodeLogs(ws.project.project_id, logNodeId);
        ws.setRuns(logNodeId, refreshedLogs);

        if (response.isMultiNodeResult || (response.createdNodes && response.createdNodes.length > 0)) {
          const refreshedProject = await fetchProject(ws.project.project_id);
          ws.setProject(refreshedProject);
          if (sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved')) {
            if (sourceNode.meta?.output_type !== 'folder') {
              handleUpdateNodeMeta(nodeId, { ...(sourceNode.meta || {}), output_type: 'mindmap' });
            }
          }
        }

        await refreshProjectAfterRun(providerId, nodeId, response.content);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not found/i.test(message)) {
          ws.removeNode(nodeId);
        } else {
          ws.setError(message);
        }
      } finally {
        ws.selectNode(null);
        ws.markNodeRunning(nodeId, false);
      }
    },
    [ws.project, ws.canEditProject, stopMidjourneyPolling, ws.markNodeRunning, ws.selectNode, ws.upsertNodeContent, ws.setRuns, ws.setProject, refreshProjectAfterRun, ws.removeNode, ws.setError],
  );

  // ---- Regenerate node ----

  const handleRegenerateNode = useCallback(
    async (nodeId: string) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        stopMidjourneyPolling(nodeId);
        ws.markNodeRunning(nodeId, true);
        ws.selectNode(nodeId);
        const response = await rerunNode(ws.project.project_id, nodeId, { clone: false });
        const targetNodeId = response.targetNodeId ?? response.nodeId;
        const sourceNode = selectNodeById(ws.project, nodeId);
        const providerId =
          sourceNode && typeof (sourceNode.ai as Record<string, unknown> | undefined)?.provider === 'string'
            ? String((sourceNode.ai as Record<string, unknown>).provider)
            : '';
        if (response.content !== undefined) {
          ws.upsertNodeContent(targetNodeId, {
            content: response.content ?? undefined,
            content_type: response.contentType ?? undefined,
          });
        }

        const logNodeId =
          sourceNode && (sourceNode.type === 'ai' || sourceNode.type === 'ai_improved') ? nodeId : targetNodeId;
        const refreshedLogs = await fetchNodeLogs(ws.project.project_id, logNodeId);
        ws.setRuns(logNodeId, refreshedLogs);

        if (response.isMultiNodeResult || (response.createdNodes && response.createdNodes.length > 0)) {
          const refreshedProject = await fetchProject(ws.project.project_id);
          ws.setProject(refreshedProject);
        }

        await refreshProjectAfterRun(providerId, nodeId, response.content);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not found/i.test(message)) {
          ws.removeNode(nodeId);
        } else {
          ws.setError(message);
        }
      } finally {
        ws.selectNode(null);
        ws.markNodeRunning(nodeId, false);
      }
    },
    [ws.project, ws.canEditProject, stopMidjourneyPolling, ws.markNodeRunning, ws.selectNode, ws.upsertNodeContent, ws.setRuns, ws.setProject, refreshProjectAfterRun, ws.removeNode, ws.setError],
  );

  // ---- Delete node ----

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        ws.removeNode(nodeId);
        if (ws.pendingUiTimersRef.current.has(nodeId)) {
          clearTimeout(ws.pendingUiTimersRef.current.get(nodeId));
          ws.pendingUiTimersRef.current.delete(nodeId);
        }
        ws.pendingUiRef.current.delete(nodeId);
        try {
          await deleteNode(ws.project.project_id, nodeId);
        } catch (apiError) {
          console.error('Failed to delete node on server:', apiError instanceof Error ? apiError.message : apiError);
        }
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      }
    },
    [ws.project, ws.canEditProject, ws.removeNode, ws.setError],
  );

  // ---- Split text node ----

  const handleSplitTextNode = useCallback(
    async (nodeId: string, config: TextSplitterConfig, options?: { content: string }) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        ws.setLoading(true);
        await splitTextNode(ws.project.project_id, nodeId, { content: options?.content, config });
        const refreshedProject = await fetchProject(ws.project.project_id);
        ws.setProject(refreshedProject);
      } catch (error) {
        ws.setError(error instanceof Error ? error.message : 'Failed to split text node');
      } finally {
        ws.setLoading(false);
      }
    },
    [ws.project, ws.canEditProject, ws.setLoading, ws.setProject, ws.setError],
  );

  // ---- Node meta / UI / content / title / AI ----

  const handleUpdateNodeMeta = useCallback(
    (nodeId: string, metaPatch: Record<string, unknown>) => {
      if (!ws.project || !ws.canEditProject) return;
      const node = selectNodeById(ws.project, nodeId);
      if (!node) return;
      const mergedMeta = { ...(node.meta ?? {}), ...metaPatch };

      if (node.type === 'image') ws.setPreserveViewport(true);

      flushSync(() => {
        ws.upsertNodeContent(nodeId, { meta: mergedMeta });
        ws.setHasUnsavedChanges(true);
        if (node.type !== 'image') ws.setForceUpdateTrigger((prev) => prev + 1);
      });

      void persistNodeUpdate(nodeId, { meta: mergedMeta });

      if (node.type === 'image') {
        setTimeout(() => ws.setPreserveViewport(false), 100);
      }
    },
    [ws.project, ws.canEditProject, ws.upsertNodeContent, persistNodeUpdate],
  );

  const handleViewportChange = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      ws.setSavedViewport((prev) => {
        if (
          prev &&
          Math.abs(prev.x - viewport.x) < 0.5 &&
          Math.abs(prev.y - viewport.y) < 0.5 &&
          Math.abs(prev.zoom - viewport.zoom) < 0.001
        ) {
          return prev;
        }
        return viewport;
      });
    },
    [],
  );

  const handleUpdateNodeUi = useCallback(
    (nodeId: string, patch: Partial<NodeUI>) => {
      try {
        if (!ws.project || !ws.canEditProject) return;
        const node = selectNodeById(ws.project, nodeId);
        if (!node) return;
        const current = node.ui ?? { color: NODE_DEFAULT_COLOR, bbox: { ...DEFAULT_NODE_BBOX } };
        const nextUi: NodeUI = {
          color: typeof patch.color === 'string' && patch.color.trim().length > 0 ? patch.color : current.color,
          bbox: patch.bbox
            ? {
                x1: patch.bbox.x1 ?? current.bbox.x1,
                y1: patch.bbox.y1 ?? current.bbox.y1,
                x2: patch.bbox.x2 ?? current.bbox.x2,
                y2: patch.bbox.y2 ?? current.bbox.y2,
              }
            : current.bbox,
        };

        if (nextUi.bbox && (isNaN(nextUi.bbox.x1) || isNaN(nextUi.bbox.y1) || isNaN(nextUi.bbox.x2) || isNaN(nextUi.bbox.y2))) {
          console.error('handleUpdateNodeUi: Invalid bbox values:', nextUi.bbox, patch);
          return;
        }

        ws.upsertNodeContent(nodeId, { ui: nextUi });
        ws.setHasUnsavedChanges(true);
        ws.pendingUiRef.current.set(nodeId, nextUi);
        const existingTimer = ws.pendingUiTimersRef.current.get(nodeId);
        if (existingTimer) window.clearTimeout(existingTimer);
        const timer = window.setTimeout(() => {
          ws.pendingUiTimersRef.current.delete(nodeId);
          const payload = ws.pendingUiRef.current.get(nodeId);
          if (!payload) return;
          ws.pendingUiRef.current.delete(nodeId);
          void persistNodeUpdate(nodeId, { ui: payload });
        }, 200);
        ws.pendingUiTimersRef.current.set(nodeId, timer);
      } catch (error) {
        console.error('handleUpdateNodeUi: Unexpected error:', error, { nodeId, patch });
      }
    },
    [ws.project, ws.canEditProject, ws.upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeContent = useCallback(
    (nodeId: string, content: string) => {
      if (!ws.canEditProject) return;
      ws.upsertNodeContent(nodeId, { content, content_type: 'text/markdown' });
      ws.setHasUnsavedChanges(true);
    },
    [ws.canEditProject, ws.upsertNodeContent],
  );

  const handleCommitNodeContent = useCallback(
    async (nodeId: string, content: string, options?: { operations?: TextOperation[] }) => {
      if (!ws.canEditProject) return;
      const payload: NodeUpdatePayload = { content, content_type: 'text/markdown' };
      if (options?.operations && options.operations.length > 0) payload.content_ops = options.operations;
      const nextVersion = (ws.nodeContentVersionRef.current.get(nodeId) ?? 0) + 1;
      ws.nodeContentVersionRef.current.set(nodeId, nextVersion);
      const result = await persistNodeUpdate(nodeId, payload, { contentVersion: nextVersion });
      if (!result) throw new Error('Failed to save node content');
    },
    [ws.canEditProject, persistNodeUpdate],
  );

  const handleUpdateNodeTitle = useCallback(
    async (nodeId: string, title: string) => {
      if (!ws.canEditProject) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      const previousTitle = selectNodeById(ws.project, nodeId)?.title;
      ws.upsertNodeContent(nodeId, { title: trimmed });
      ws.setHasUnsavedChanges(true);
      try {
        await persistNodeUpdate(nodeId, { title: trimmed });
      } catch {
        if (previousTitle !== undefined) ws.upsertNodeContent(nodeId, { title: previousTitle });
      }
    },
    [ws.project, ws.canEditProject, ws.upsertNodeContent, persistNodeUpdate],
  );

  const handleUpdateNodeAi = useCallback(
    (nodeId: string, aiPatch: Record<string, unknown>, options?: { replace?: boolean }) => {
      if (!ws.canEditProject) return;
      if (options?.replace) {
        ws.upsertNodeContent(nodeId, { ai: aiPatch });
        void persistNodeUpdate(nodeId, { ai: aiPatch });
        ws.setHasUnsavedChanges(true);
        return;
      }
      const current = selectNodeById(ws.project, nodeId)?.ai as Record<string, unknown> | undefined;
      const nextAi = { ...(current ?? {}), ...aiPatch };
      ws.upsertNodeContent(nodeId, { ai: nextAi });
      void persistNodeUpdate(nodeId, { ai: nextAi });
      ws.setHasUnsavedChanges(true);
    },
    [ws.project, ws.canEditProject, persistNodeUpdate, ws.upsertNodeContent],
  );

  // ---- Folder operations ----

  const handleMoveNodeToFolder = useCallback(
    async (nodeId: string, folderId: string, options?: { index?: number | null }) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        await moveNodeToFolder(ws.project.project_id, nodeId, folderId, options);
        const refreshedProject = await fetchProject(ws.project.project_id);
        ws.setProject(refreshedProject);
      } catch (error) {
        ws.setError(error instanceof Error ? error.message : 'Failed to move node');
      }
    },
    [ws.project, ws.canEditProject, ws.setProject, ws.setError],
  );

  const handleRemoveNodeFromFolder = useCallback(
    async (nodeId: string, folderId?: string, position?: { x: number; y: number }) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        await removeNodeFromFolder(ws.project.project_id, nodeId, folderId, position);
        const refreshedProject = await fetchProject(ws.project.project_id);
        ws.setProject(refreshedProject);
      } catch (error) {
        ws.setError(error instanceof Error ? error.message : 'Failed to remove node from folder');
      }
    },
    [ws.project, ws.canEditProject, ws.setProject, ws.setError],
  );

  return {
    showEdgeNotification,
    persistNodeUpdate,
    stopMidjourneyPolling,
    scheduleMidjourneyStatus,
    handleRunNode,
    handleRegenerateNode,
    handleDeleteNode,
    handleSplitTextNode,
    handleUpdateNodeMeta,
    handleViewportChange,
    handleUpdateNodeUi,
    handleUpdateNodeContent,
    handleCommitNodeContent,
    handleUpdateNodeTitle,
    handleUpdateNodeAi,
    handleMoveNodeToFolder,
    handleRemoveNodeFromFolder,
  };
}

export type NodeActions = ReturnType<typeof useNodeActions>;
