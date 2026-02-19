import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowNode } from '../../../state/api';
import { TYPE_ICONS } from '../components/nodeConstants';
import { clampPreviewText, getChildImagePreview, getChildPreviewText } from '../components/nodeUtils';

interface UseNodeFolderOptions {
  node: FlowNode;
  disabled: boolean;
  allNodes: FlowNode[];
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  onRemoveNodeFromFolder?: (nodeId: string, folderId?: string, position?: { x: number; y: number }) => void | Promise<void>;
}

export function useNodeFolder({
  node,
  disabled,
  allNodes,
  onChangeMeta,
  onRemoveNodeFromFolder,
}: UseNodeFolderOptions) {
  const [isFolderDropActive, setIsFolderDropActive] = useState(false);
  const [folderImportMessage, setFolderImportMessage] = useState<string>('');
  const folderImportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Folder notes (using short_description)
  const [folderFileNotes, setFolderFileNotes] = useState<string>(
    () => (typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : ''),
  );
  const [isEditingFolderFileNotes, setIsEditingFolderFileNotes] = useState(false);

  useEffect(() => {
    const nextValue = typeof node.meta?.short_description === 'string' ? String(node.meta.short_description) : '';
    setFolderFileNotes(nextValue);
  }, [node.meta?.short_description]);

  useEffect(() => {
    return () => {
      if (folderImportTimerRef.current !== null) clearTimeout(folderImportTimerRef.current);
    };
  }, []);

  const handleFolderFileNotesChange = useCallback((value: string) => setFolderFileNotes(value), []);
  const handleFolderFileNotesFocus = useCallback(() => setIsEditingFolderFileNotes(true), []);
  const handleFolderFileNotesBlur = useCallback(() => {
    setIsEditingFolderFileNotes(false);
    if (folderFileNotes !== node.meta?.short_description) {
      onChangeMeta(node.node_id, { short_description: folderFileNotes });
    }
  }, [node.node_id, folderFileNotes, node.meta?.short_description, onChangeMeta]);

  const folderChildrenIds = useMemo(() => {
    if (node.type !== 'folder') return [] as string[];
    if (Array.isArray(node.meta?.folder_children)) {
      return (node.meta.folder_children as unknown[]).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    if (Array.isArray(node.meta?.folder_items)) {
      return (node.meta.folder_items as unknown[]).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    return [] as string[];
  }, [node.meta?.folder_children, node.meta?.folder_items, node.type]);

  const folderChildNodes = useMemo(() => {
    if (node.type !== 'folder' || folderChildrenIds.length === 0) return [] as FlowNode[];
    const lookup = new Map(allNodes.map((item) => [item.node_id, item]));
    return folderChildrenIds.map((id) => lookup.get(id)).filter((child): child is FlowNode => Boolean(child));
  }, [allNodes, folderChildrenIds, node.type]);

  const folderDisplayMode = node.type === 'folder' && node.meta?.display_mode === 'grid' ? 'grid' : 'list';

  const folderContextLimit = useMemo(() => {
    if (node.type !== 'folder') return 6;
    const raw = node.meta?.folder_context_limit;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const normalized = Math.trunc(raw);
      if (normalized >= 1 && normalized <= 24) return normalized;
    }
    return 6;
  }, [node.meta?.folder_context_limit, node.type]);

  const handleFolderDisplayChange = useCallback(
    (mode: 'list' | 'grid') => {
      if (node.type !== 'folder') return;
      onChangeMeta(node.node_id, { display_mode: mode });
    },
    [node.node_id, node.type, onChangeMeta],
  );

  const handleFolderContextLimitChange = useCallback(
    (value: number) => {
      if (node.type !== 'folder') return;
      const numeric = Number.isFinite(value) ? value : folderContextLimit;
      const normalized = Math.max(1, Math.min(24, Math.trunc(numeric)));
      onChangeMeta(node.node_id, { folder_context_limit: normalized });
    },
    [folderContextLimit, node.node_id, node.type, onChangeMeta],
  );

  const shouldActivateFolderDropZone = useCallback(
    (event: React.DragEvent<HTMLElement>): boolean => {
      if (node.type !== 'folder') return false;
      const transfer = event.dataTransfer;
      if (!transfer) return false;
      if (transfer.files && transfer.files.length > 0) return true;
      const types = Array.from(transfer.types ?? []);
      if (types.includes('application/mwf-folder-node')) return false;
      if (types.some((type) => type.startsWith('application/reactflow'))) return true;
      if (types.includes('application/reactflow-node-copy')) return true;
      return types.length === 0;
    },
    [node.type],
  );

  const handleFolderDropZoneDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldActivateFolderDropZone(event)) return;
      event.preventDefault();
      setIsFolderDropActive(true);
    },
    [shouldActivateFolderDropZone],
  );

  const handleFolderDropZoneDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldActivateFolderDropZone(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = event.dataTransfer.files && event.dataTransfer.files.length > 0 ? 'copy' : 'move';
      }
      if (!isFolderDropActive) setIsFolderDropActive(true);
    },
    [isFolderDropActive, shouldActivateFolderDropZone],
  );

  const handleFolderDropZoneDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (node.type !== 'folder') return;
      const related = event.relatedTarget as Node | null;
      if (related && event.currentTarget.contains(related)) return;
      setIsFolderDropActive(false);
    },
    [node.type],
  );

  const handleFolderDropZoneDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (shouldActivateFolderDropZone(event)) event.preventDefault();
      setIsFolderDropActive(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        setFolderImportMessage(`Added ${files.length} file(s)`);
        if (folderImportTimerRef.current !== null) clearTimeout(folderImportTimerRef.current);
        folderImportTimerRef.current = setTimeout(() => {
          setFolderImportMessage('');
          folderImportTimerRef.current = null;
        }, 3000);
      }
    },
    [shouldActivateFolderDropZone],
  );

  return {
    folderFileNotes,
    isEditingFolderFileNotes,
    folderChildrenIds,
    folderChildNodes,
    folderDisplayMode,
    folderContextLimit,
    isFolderDropActive,
    folderImportMessage,
    handleFolderFileNotesChange,
    handleFolderFileNotesFocus,
    handleFolderFileNotesBlur,
    handleFolderDisplayChange,
    handleFolderContextLimitChange,
    handleFolderDropZoneDragEnter,
    handleFolderDropZoneDragOver,
    handleFolderDropZoneDragLeave,
    handleFolderDropZoneDrop,
    onRemoveNodeFromFolder,
  };
}
