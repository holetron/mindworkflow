import { useEffect } from 'react';
import {
  fetchProject,
  fetchNodeLogs,
  fetchWorkflowUiSettings,
  fetchProjectShare,
  type ProjectFlow,
} from '../../../state/api';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type { WorkspaceState } from './useWorkspaceState';

/**
 * All side-effects (useEffect hooks) extracted from WorkspacePage.
 * Receives the full workspace state so each effect can read what it needs.
 */
export function useWorkspaceEffects(ws: WorkspaceState) {
  // Reset content version refs when project changes
  useEffect(() => {
    ws.nodeContentVersionRef.current.clear();
    ws.nodeContentAckRef.current.clear();
  }, [ws.project?.project_id]);

  // Load workflow UI settings
  useEffect(() => {
    let cancelled = false;
    const pid = ws.project?.project_id;
    if (!pid) {
      ws.setUiSettings(DEFAULT_UI_SETTINGS);
      return () => {
        cancelled = true;
      };
    }

    const loadUiSettings = async () => {
      try {
        const settings = await fetchWorkflowUiSettings(pid);
        if (!cancelled) {
          ws.setUiSettings(settings);
        }
      } catch (error) {
        console.error('Failed to load workflow UI settings', error);
        if (!cancelled) {
          ws.setUiSettings(DEFAULT_UI_SETTINGS);
        }
      }
    };

    void loadUiSettings();

    return () => {
      cancelled = true;
    };
  }, [ws.project?.project_id, ws.setUiSettings]);

  // Warn about unsaved changes before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ws.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          '\u0423 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F. \u0412\u044B \u0443\u0432\u0435\u0440\u0435\u043D\u044B, \u0447\u0442\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u043A\u0438\u043D\u0443\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [ws.hasUnsavedChanges]);

  // Responsive: collapse sidebar/palette on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1000px)');
    const applyCollapse = (matches: boolean) => {
      ws.setIsMobile(matches);
      if (matches) {
        ws.setSidebarCollapsed(true);
        ws.setPaletteCollapsed(true);
      }
    };
    applyCollapse(mq.matches);
    const listener = (event: MediaQueryListEvent) => {
      ws.setIsMobile(event.matches);
      if (event.matches) {
        ws.setSidebarCollapsed(true);
        ws.setPaletteCollapsed(true);
      }
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  // Cleanup timers / pollers on unmount
  useEffect(() => {
    return () => {
      ws.pendingUiTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      ws.pendingUiTimersRef.current.clear();
      ws.pendingUiRef.current.clear();
      ws.midjourneyPollersRef.current.forEach((timer) => {
        window.clearInterval(timer);
      });
      ws.midjourneyPollersRef.current.clear();
      ws.clearProject();
    };
  }, [ws.clearProject]);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!ws.menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (ws.menuRef.current && !ws.menuRef.current.contains(event.target as Node)) {
        ws.setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ws.setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ws.menuOpen]);

  // Fetch global integrations on mount
  useEffect(() => {
    ws.fetchIntegrations();
  }, [ws.fetchIntegrations]);

  // Load project
  useEffect(() => {
    if (!ws.projectId) return;
    const load = async () => {
      try {
        ws.setLoading(true);
        ws.setError(null);
        ws.setLocalError(null);
        const projectFlow = await fetchProject(ws.projectId!);

        // Validate edges
        const validatedProject = validateProjectEdges(projectFlow);
        ws.setProject(validatedProject);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ws.setError(message);
        ws.setLocalError(message);
      } finally {
        ws.setLoading(false);
      }
    };

    load().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      ws.setError(message);
      ws.setLocalError(message);
    });
  }, [ws.projectId, ws.setProject, ws.setError, ws.setLoading]);

  // Clear error after 5s
  useEffect(() => {
    if (!ws.error) return;
    const timer = window.setTimeout(() => {
      ws.setError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [ws.error, ws.setError]);

  // Clear validation after 5s
  useEffect(() => {
    if (ws.validation.status === 'idle') return;
    const timer = window.setTimeout(() => {
      ws.setValidation({ status: 'idle' });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [ws.validation]);

  // Load run logs when selected node changes
  useEffect(() => {
    const loadRuns = async () => {
      if (!ws.project || !ws.selectedNode) return;
      try {
        const logs = await fetchNodeLogs(ws.project.project_id, ws.selectedNode.node_id);
        ws.setRuns(ws.selectedNode.node_id, logs);
      } catch (err) {
        console.error(err);
      }
    };
    loadRuns();
  }, [ws.project, ws.selectedNode, ws.setRuns]);

  // Update editIsPublic when project changes
  useEffect(() => {
    if (ws.project) {
      ws.setEditIsPublic(ws.project.is_public || false);
    }
  }, [ws.project?.is_public]);

  // Load share info when modal opens
  useEffect(() => {
    if (!ws.showShareModal || !ws.project) {
      ws.setShareInfo(null);
      ws.setShareError(null);
      ws.setShareFetching(false);
      ws.setShareSaving(false);
      return;
    }

    const loadShare = async () => {
      try {
        ws.setShareFetching(true);
        ws.setShareError(null);
        const info = await fetchProjectShare(ws.project!.project_id);
        ws.setShareInfo(info);
      } catch (err) {
        ws.setShareError(err instanceof Error ? err.message : String(err));
      } finally {
        ws.setShareFetching(false);
      }
    };

    loadShare().catch((err) =>
      ws.setShareError(err instanceof Error ? err.message : String(err)),
    );
  }, [ws.showShareModal, ws.project]);
}

// ---- Helpers ----

function validateProjectEdges(projectFlow: ProjectFlow): ProjectFlow {
  const { nodes, edges } = projectFlow;
  const nodeIds = new Set(nodes.map((n) => n.node_id));

  const validEdges = edges.filter((edge) => {
    const fromExists = nodeIds.has(edge.from);
    const toExists = nodeIds.has(edge.to);

    if (!fromExists || !toExists) {
      console.warn(
        `[WorkspacePage] Removing invalid edge: ${edge.id} (from: ${edge.from} exists: ${fromExists}, to: ${edge.to} exists: ${toExists})`,
      );
      return false;
    }
    return true;
  });

  if (validEdges.length < edges.length) {
    console.log(
      `[WorkspacePage] Cleaned up ${edges.length - validEdges.length} invalid edges`,
    );
    return { ...projectFlow, edges: validEdges };
  }

  return projectFlow;
}
