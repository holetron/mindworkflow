import { useCallback } from 'react';
import {
  fetchProject, fetchProjectShare, deleteProject, createNode, createEdge, deleteEdge,
  syncProjectDrive, exportProjectArchive, upsertProjectShare, removeProjectShare,
  updateProjectMeta, moveNodeToFolder,
  type EdgeListResponse, type CreateNodePayload, type FlowNode,
} from '../../../state/api';
import { type NodeTemplate } from '../../../state/store';
import { NODE_DEFAULT_COLOR, NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH } from '../../../constants/nodeDefaults';
import { scaleImageToFit, calculateImageNodeDimensions } from '../../../constants/nodeSizes';
import type { WorkspaceState } from './useWorkspaceState';
import { useNodeActions } from './useNodeActions';

/**
 * All action callbacks: combines node-level actions with project/edge/share actions.
 */
export function useWorkspaceActions(ws: WorkspaceState) {
  const nodeActions = useNodeActions(ws);

  // ---- Node creation ----

  const createNodeFromTemplate = useCallback(
    async (template: NodeTemplate, slug: string, position?: { x: number; y: number }) => {
      if (!ws.project || !ws.canManageProject) return;
      const width = NODE_DEFAULT_WIDTH;
      const height = NODE_DEFAULT_HEIGHT;
      const x1 = position ? Math.round(position.x) : 0;
      const y1 = position ? Math.round(position.y) : 0;

      let aiConfig = template.ai;
      if (aiConfig && ws.globalIntegrations && ws.globalIntegrations.length > 0) {
        const defaultInt = ws.globalIntegrations.find(
          (int: Record<string, unknown>) =>
            (int as { isDefault?: boolean }).isDefault === true &&
            (int as { enabled?: boolean }).enabled !== false,
        );
        const selectedInt =
          defaultInt ||
          ws.globalIntegrations.find(
            (int: Record<string, unknown>) => (int as { enabled?: boolean }).enabled !== false,
          );

        if (selectedInt) {
          let providerSlug = (selectedInt as { providerId: string }).providerId;
          if (providerSlug === 'openai') providerSlug = 'openai_gpt';
          else if (providerSlug === 'google') providerSlug = 'google_gemini';

          aiConfig = {
            ...aiConfig,
            provider: providerSlug,
            model: (selectedInt as { models?: string[] }).models?.[0] || aiConfig.model,
          };
        }
      }

      const payload: CreateNodePayload = {
        slug,
        type: template.type,
        title: template.title,
        content_type: template.content_type,
        content: template.content,
        meta: template.meta,
        ai: aiConfig,
        parser: template.parser,
        python: template.python,
        visibility_rules: template.visibility_rules,
        position,
        ui: { color: NODE_DEFAULT_COLOR, bbox: { x1, y1, x2: x1 + width, y2: y1 + height } },
        ai_visible: true,
        connections: { incoming: [], outgoing: [] },
      };
      try {
        ws.setLoading(true);
        ws.setError(null);
        const response = await createNode(ws.project.project_id, payload);
        ws.addNodeFromServer(response.node, response.project_updated_at);

        if ((template.type === 'ai' || slug.includes('agent')) && ws.selectedNodeId) {
          try {
            const edgeResponse = await createEdge(ws.project.project_id, {
              from: ws.selectedNodeId,
              to: response.node.node_id,
              label: 'auto-connected',
            });
            ws.setEdges(edgeResponse.edges, edgeResponse.updated_at);
            nodeActions.showEdgeNotification(edgeResponse.notification);
          } catch (edgeErr) {
            console.warn('Failed to auto-connect nodes:', edgeErr);
          }
        }
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      } finally {
        ws.setLoading(false);
      }
    },
    [ws.project, ws.canManageProject, ws.selectedNodeId, ws.setLoading, ws.setError, ws.addNodeFromServer, ws.setEdges, ws.globalIntegrations, nodeActions.showEdgeNotification],
  );

  const handlePaletteCreate = useCallback(
    (template: NodeTemplate, slug: string) => {
      if (!ws.canEditProject) return;
      void createNodeFromTemplate(template, slug);
    },
    [ws.canEditProject, createNodeFromTemplate],
  );

  const handlePaletteDrop = useCallback(
    (slug: string, position: { x: number; y: number }) => {
      if (!ws.canEditProject) return;
      const template = ws.paletteMap.get(slug);
      if (!template) return;
      void createNodeFromTemplate(template, slug, position);
    },
    [ws.canEditProject, createNodeFromTemplate, ws.paletteMap],
  );

  // ---- Node copy ----

  const handleNodeCopy = useCallback(
    async (node: FlowNode, position: { x: number; y: number }) => {
      if (!ws.project || !ws.canEditProject) return;
      const copyPayload: CreateNodePayload = {
        type: node.type,
        title: `${node.title} (\u043A\u043E\u043F\u0438\u044F)`,
        content_type: node.content_type,
        content: node.content || '',
        meta: node.meta ? { ...node.meta } : undefined,
        ai: node.ai ? { ...node.ai } : undefined,
        parser: node.parser ? { ...node.parser } : undefined,
        python: node.python ? { ...node.python } : undefined,
        visibility_rules: node.visibility_rules,
        position,
        ui: {
          color: node.ui?.color || NODE_DEFAULT_COLOR,
          bbox: {
            x1: Math.round(position.x),
            y1: Math.round(position.y),
            x2: Math.round(position.x) + NODE_DEFAULT_WIDTH,
            y2: Math.round(position.y) + NODE_DEFAULT_HEIGHT,
          },
        },
        ai_visible: node.ai_visible,
        connections: { incoming: [], outgoing: [] },
      };
      try {
        ws.setLoading(true);
        ws.setError(null);
        const response = await createNode(ws.project.project_id, copyPayload);
        ws.addNodeFromServer(response.node, response.project_updated_at);
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      } finally {
        ws.setLoading(false);
      }
    },
    [ws.project, ws.canEditProject, ws.setLoading, ws.setError, ws.addNodeFromServer],
  );

  // ---- Chat to workflow ----

  const handleAddChatToWorkflow = useCallback(
    async (nodeId: string) => {
      if (!ws.project || !ws.canEditProject) return;
      try {
        const refreshedProject = await fetchProject(ws.project.project_id);
        ws.setProject(refreshedProject);
      } catch (error) {
        console.error('[Chat] Failed to reload project:', error);
      }
    },
    [ws.project, ws.canEditProject, ws.setProject],
  );

  // ---- Import files to folder ----

  const handleImportFilesToFolder = useCallback(
    async (folderId: string, files: File[], dropPosition: { x: number; y: number }) => {
      if (!ws.project || !ws.canEditProject || files.length === 0) return;

      const MAX_TEXT_CHARACTERS = 5000;
      const imageTemplate = ws.paletteMap.get('image');
      const textTemplate = ws.paletteMap.get('text');
      const unsupportedFiles: string[] = [];
      const oversizedTextFiles: string[] = [];
      const createdNodeIds: string[] = [];

      const readFileAsDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Failed to read'));
          reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
          reader.readAsDataURL(file);
        });

      const readFileAsText = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
          reader.readAsText(file);
        });

      const loadImageDimensions = (src: string): Promise<{ width: number; height: number }> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            w && h ? resolve({ width: w, height: h }) : reject(new Error('Zero dimensions'));
          };
          img.onerror = () => reject(new Error('Cannot load image'));
          img.src = src;
        });

      const cloneMeta = (meta?: NodeTemplate['meta']) =>
        meta ? (JSON.parse(JSON.stringify(meta)) as Record<string, unknown>) : ({} as Record<string, unknown>);

      ws.setLoading(true);
      ws.setError(null);

      try {
        let offsetCount = 0;
        for (const file of files) {
          if (!(file instanceof File)) continue;
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          const mime = (file.type || '').toLowerCase();
          const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext);
          const isText = mime === 'text/plain' || ext === 'txt';

          try {
            if (isImage) {
              const dataUrl = await readFileAsDataUrl(file);
              let nw = 1024, nh = 768;
              try { const d = await loadImageDimensions(dataUrl); nw = d.width; nh = d.height; } catch { /* fallback */ }
              const { width: dw, height: dh } = scaleImageToFit(nw, nh);
              const { width: tw, height: th } = calculateImageNodeDimensions(dw, dh, false);
              const offset = offsetCount * 28;
              const x1 = Math.round(dropPosition.x + offset);
              const y1 = Math.round(dropPosition.y + offset);
              const payload: CreateNodePayload = {
                type: 'image', title: file.name.replace(/\.[^.]+$/, '') || file.name,
                content_type: 'image/upload',
                meta: { ...cloneMeta(imageTemplate?.meta), image_original: dataUrl, original_image: dataUrl, image_edited: dataUrl, edited_image: dataUrl, annotated_image: dataUrl, image_crop: null, crop_image: null, image_crop_settings: null, image_crop_expose_port: false, image_file: file.name, file_size: file.size, file_type: file.type || 'image/*', view_mode: 'annotated', image_output_mode: 'annotated', display_mode: 'upload', image_url: null, natural_width: nw, natural_height: nh, display_width: dw, display_height: dh, display_scale: dh / (nh || 1) },
                position: { x: x1, y: y1 },
                ui: { color: NODE_DEFAULT_COLOR, bbox: { x1, y1, x2: x1 + tw, y2: y1 + th } },
                ai_visible: true, connections: { incoming: [], outgoing: [] },
              };
              const resp = await createNode(ws.project.project_id, payload);
              ws.addNodeFromServer(resp.node, resp.project_updated_at);
              await moveNodeToFolder(ws.project.project_id, resp.node.node_id, folderId);
              createdNodeIds.push(resp.node.node_id);
              offsetCount++; continue;
            }
            if (isText) {
              const textContent = await readFileAsText(file);
              if (textContent.length > MAX_TEXT_CHARACTERS) { oversizedTextFiles.push(file.name); continue; }
              const offset = offsetCount * 28;
              const x1 = Math.round(dropPosition.x + offset);
              const y1 = Math.round(dropPosition.y + offset);
              const payload: CreateNodePayload = {
                type: 'text', title: file.name.replace(/\.[^.]+$/, '') || file.name,
                content_type: 'text/markdown', content: textContent, meta: cloneMeta(textTemplate?.meta),
                position: { x: x1, y: y1 },
                ui: { color: NODE_DEFAULT_COLOR, bbox: { x1, y1, x2: x1 + NODE_DEFAULT_WIDTH, y2: y1 + NODE_DEFAULT_HEIGHT } },
                ai_visible: true, connections: { incoming: [], outgoing: [] },
              };
              const resp = await createNode(ws.project.project_id, payload);
              ws.addNodeFromServer(resp.node, resp.project_updated_at);
              await moveNodeToFolder(ws.project.project_id, resp.node.node_id, folderId);
              createdNodeIds.push(resp.node.node_id);
              offsetCount++; continue;
            }
            unsupportedFiles.push(file.name);
          } catch (error) {
            unsupportedFiles.push(`${file.name} (import error)`);
          }
        }
        if (createdNodeIds.length > 0) { const r = await fetchProject(ws.project.project_id); ws.setProject(r); }
        if (oversizedTextFiles.length || unsupportedFiles.length) {
          const problems: string[] = [];
          if (oversizedTextFiles.length) problems.push(`Text files exceed 5000 chars: ${oversizedTextFiles.join(', ')}`);
          if (unsupportedFiles.length) problems.push(`Could not import: ${unsupportedFiles.join(', ')}`);
          ws.setError(problems.join('. '));
        }
      } catch (error) {
        ws.setError(error instanceof Error ? error.message : 'Failed to import files');
      } finally {
        ws.setLoading(false);
      }
    },
    [ws.project, ws.canEditProject, ws.paletteMap, ws.setLoading, ws.setError, ws.addNodeFromServer, ws.setProject],
  );

  // ---- Edges ----

  const handleConnectEdge = useCallback(
    async ({ from, to, sourceHandle, targetHandle }: { from: string; to: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
      if (!ws.project || !ws.canEditProject) return;
      const existingEdge = ws.project.edges.find((e) => e.source === from && e.target === to);
      if (existingEdge) {
        try {
          const updatedEdges = ws.project.edges.map((edge) =>
            edge.id === existingEdge.id ? { ...edge, sourceHandle: sourceHandle || null, targetHandle: targetHandle || null } : edge,
          );
          const response = await fetch(`/api/project/${ws.project.project_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify({ edges: updatedEdges }),
          });
          if (!response.ok) throw new Error('Failed to update edge ports');
          ws.setProject({ ...ws.project, edges: updatedEdges });
        } catch (err) {
          ws.setError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      try {
        const response = await createEdge(ws.project.project_id, { from, to, sourceHandle, targetHandle });
        ws.setEdges(response.edges, response.updated_at);
        nodeActions.showEdgeNotification(response.notification);
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      }
    },
    [ws.project, ws.canEditProject, ws.setEdges, ws.setError, ws.setProject, nodeActions.showEdgeNotification],
  );

  const handleRemoveEdges = useCallback(
    async (edgesToRemove: Array<{ from: string; to: string }>) => {
      if (!ws.project || !ws.canEditProject || edgesToRemove.length === 0) return;
      try {
        let latest: EdgeListResponse | null = null;
        for (const edge of edgesToRemove) {
          latest = await deleteEdge(ws.project.project_id, edge.from, edge.to);
        }
        if (latest) ws.setEdges(latest.edges, latest.updated_at);
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      }
    },
    [ws.project, ws.canEditProject, ws.setEdges, ws.setError],
  );

  const handleRemoveInvalidPorts = useCallback(
    async (nodeId: string, invalidPorts: string[]) => {
      if (!ws.project || !ws.canEditProject || invalidPorts.length === 0) return;
      const projectEdges = Array.isArray(ws.project.edges) ? ws.project.edges : [];
      const invalidSet = new Set(invalidPorts);
      const edgesToMove = projectEdges.filter((e) => e.to === nodeId && e.targetHandle && invalidSet.has(e.targetHandle));
      if (edgesToMove.length === 0) return;

      const existingKeys = new Set(
        projectEdges.filter((e) => e.to === nodeId && e.targetHandle === 'context').map((e) => `${e.from}->${e.to}->context`),
      );
      try {
        let latestResponse: EdgeListResponse | null = null;
        for (const edge of edgesToMove) {
          latestResponse = await deleteEdge(ws.project.project_id, edge.from, edge.to);
          const key = `${edge.from}->${edge.to}->context`;
          if (!existingKeys.has(key)) {
            latestResponse = await createEdge(ws.project.project_id, { from: edge.from, to: edge.to, sourceHandle: edge.sourceHandle ?? null, targetHandle: 'context' });
            nodeActions.showEdgeNotification(latestResponse.notification);
            existingKeys.add(key);
          }
        }
        if (latestResponse) ws.setEdges(latestResponse.edges, latestResponse.updated_at);
      } catch (err) {
        ws.setError(err instanceof Error ? err.message : String(err));
      }
    },
    [ws.project, ws.canEditProject, ws.setEdges, ws.setError, nodeActions.showEdgeNotification],
  );

  // ---- Project-level actions ----

  const handleSaveWorkspace = useCallback(async () => {
    if (!ws.project || !ws.canManageProject) return;
    try {
      ws.setIsSaving(true);
      ws.setValidation({ status: 'idle' });
      await syncProjectDrive(ws.project.project_id);
      ws.setValidation({ status: 'success', message: '\u0412\u043E\u0440\u043A\u0444\u043B\u043E\u0443 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D' });
      ws.setHasUnsavedChanges(false);
      ws.setLastSavedTime(new Date());
    } catch (err) {
      ws.setValidation({ status: 'error', message: `Failed to save: ${err instanceof Error ? err.message : err}` });
    } finally {
      ws.setIsSaving(false);
    }
  }, [ws.project, ws.canManageProject]);

  const handleExportWorkspace = useCallback(async () => {
    if (!ws.project) { ws.setMenuOpen(false); return; }
    try {
      const blob = await exportProjectArchive(ws.project.project_id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${ws.project.project_id}.lcfz`;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      ws.setError(err instanceof Error ? err.message : String(err));
    } finally {
      ws.setMenuOpen(false);
    }
  }, [ws.project, ws.setError]);

  const handleImportWorkspace = useCallback(() => { ws.setMenuOpen(false); ws.navigate('/projects/import'); }, [ws.navigate]);
  const handleLogoutClick = useCallback(() => { ws.setMenuOpen(false); ws.logout(); ws.navigate('/login'); }, [ws.logout, ws.navigate]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!ws.project || !ws.canManageProject) return;
    if (!window.confirm('\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0435\u0441\u044C \u0432\u043E\u0440\u043A\u0441\u043F\u0435\u0439\u0441? \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043E\u0431\u0440\u0430\u0442\u0438\u043C\u043E.')) return;
    try { ws.setLoading(true); await deleteProject(ws.project.project_id); ws.clearProject(); ws.navigate('/'); }
    catch (err) { ws.setError(err instanceof Error ? err.message : String(err)); }
    finally { ws.setLoading(false); }
  }, [ws.project, ws.canManageProject, ws.setLoading, ws.clearProject, ws.navigate, ws.setError]);

  // ---- Title / description ----

  const handleStartEditTitle = useCallback(() => { if (!ws.project || !ws.canEditProject) return; ws.setEditTitle(ws.project.title || ''); ws.setIsEditingTitle(true); }, [ws.project, ws.canEditProject]);

  const handleSaveTitle = useCallback(async () => {
    if (!ws.project || !ws.canEditProject) return;
    const next = ws.editTitle.trim();
    if (!next || next === ws.project.title) { ws.setIsEditingTitle(false); ws.setEditTitle(ws.project.title ?? ''); return; }
    ws.projectTitleSubmitRef.current = true;
    try { const u = await updateProjectMeta(ws.project.project_id, { title: next }); ws.mergeProject(u); ws.setIsEditingTitle(false); ws.projectTitleSubmitRef.current = false; }
    catch (err) { ws.projectTitleSubmitRef.current = false; ws.setError(err instanceof Error ? err.message : String(err)); }
  }, [ws.project, ws.canEditProject, ws.editTitle, ws.mergeProject, ws.setError]);

  const handleCancelEditTitle = useCallback(() => { ws.setIsEditingTitle(false); ws.setEditTitle(''); ws.projectTitleSubmitRef.current = false; }, []);

  const handleStartEditDescription = useCallback(() => { if (!ws.project || !ws.canEditProject) return; ws.setEditDescription(ws.project.description || ''); ws.setIsEditingDescription(true); }, [ws.project, ws.canEditProject]);

  const handleSaveDescription = useCallback(async () => {
    if (!ws.project || !ws.canEditProject) return;
    try {
      const trimmed = ws.editDescription.trim();
      if (trimmed === (ws.project.description ?? '')) { ws.setIsEditingDescription(false); ws.setEditDescription(ws.project.description ?? ''); return; }
      ws.projectDescriptionSubmitRef.current = true;
      const u = await updateProjectMeta(ws.project.project_id, { description: trimmed });
      ws.mergeProject(u); ws.setIsEditingDescription(false); ws.projectDescriptionSubmitRef.current = false;
    } catch (err) { ws.projectDescriptionSubmitRef.current = false; ws.setError(err instanceof Error ? err.message : String(err)); }
  }, [ws.project, ws.canEditProject, ws.editDescription, ws.mergeProject, ws.setError]);

  const handleCancelEditDescription = useCallback(() => { ws.setIsEditingDescription(false); ws.setEditDescription(''); ws.projectDescriptionSubmitRef.current = false; }, []);

  const handleSaveIsPublic = useCallback(async (nextValue: boolean, previousValue?: boolean) => {
    if (!ws.project || !ws.canEditProject) return;
    try { const u = await updateProjectMeta(ws.project.project_id, { is_public: nextValue }); ws.mergeProject(u); }
    catch (err) { ws.setError(err instanceof Error ? err.message : String(err)); if (typeof previousValue === 'boolean') ws.setEditIsPublic(previousValue); }
  }, [ws.project, ws.canEditProject, ws.mergeProject, ws.setError]);

  // ---- Share ----

  const handleOpenShareModal = useCallback(() => { ws.setMenuOpen(false); ws.setShowShareModal(true); }, []);
  const handleCloseShareModal = useCallback(() => { ws.setShowShareModal(false); }, []);

  const handleShareSubmit = useCallback(async () => {
    if (!ws.project) return;
    const email = ws.shareForm.email?.trim();
    const userId = ws.shareForm.user_id?.trim();
    if (!email && !userId) { ws.setShareError('Specify user email to grant access.'); return; }
    try { ws.setShareSaving(true); ws.setShareFetching(true); ws.setShareError(null);
      await upsertProjectShare(ws.project.project_id, ws.shareForm);
      const info = await fetchProjectShare(ws.project.project_id); ws.setShareInfo(info); ws.setShareForm({ role: 'viewer' });
    } catch (err) { ws.setShareError(err instanceof Error ? err.message : String(err)); }
    finally { ws.setShareSaving(false); ws.setShareFetching(false); }
  }, [ws.project, ws.shareForm]);

  const handleShareRemove = useCallback(async (userId: string) => {
    if (!ws.project) return;
    try { ws.setShareSaving(true); ws.setShareFetching(true); ws.setShareError(null);
      await removeProjectShare(ws.project.project_id, userId);
      const info = await fetchProjectShare(ws.project.project_id); ws.setShareInfo(info);
    } catch (err) { ws.setShareError(err instanceof Error ? err.message : String(err)); }
    finally { ws.setShareSaving(false); ws.setShareFetching(false); }
  }, [ws.project]);

  return {
    ...nodeActions,
    handlePaletteCreate, handlePaletteDrop, createNodeFromTemplate, handleNodeCopy,
    handleAddChatToWorkflow, handleImportFilesToFolder,
    handleConnectEdge, handleRemoveEdges, handleRemoveInvalidPorts,
    handleSaveWorkspace, handleExportWorkspace, handleImportWorkspace, handleLogoutClick, handleDeleteWorkspace,
    handleStartEditTitle, handleSaveTitle, handleCancelEditTitle,
    handleStartEditDescription, handleSaveDescription, handleCancelEditDescription, handleSaveIsPublic,
    handleOpenShareModal, handleCloseShareModal, handleShareSubmit, handleShareRemove,
  };
}

export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;
