import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { diffToTextOperations } from '../../../utils/textOperations';

interface UseNodeContentOptions {
  nodeId: string;
  nodeContent: string | undefined;
  onChangeContent?: (nodeId: string, content: string) => void;
  onCommitContent?: (
    nodeId: string,
    content: string,
    options?: { operations: Array<{ type: string; position: number; text?: string; length?: number }> },
  ) => Promise<void>;
}

export function useNodeContent({
  nodeId,
  nodeContent,
  onChangeContent,
  onCommitContent,
}: UseNodeContentOptions) {
  const isUserEditingRef = useRef(false);
  const [contentValue, setContentValue] = useState(nodeContent || '');
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [isContentSaving, setIsContentSaving] = useState(false);
  const [contentSyncError, setContentSyncError] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState(false);

  const lastSavedContentRef = useRef(nodeContent || '');
  const pendingContentRef = useRef<string | null>(null);
  const contentCommitTimer = useRef<number | null>(null);
  const contentCommitPromiseRef = useRef<Promise<boolean> | null>(null);
  const recentlySavedTimerRef = useRef<number | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const nodeIdRef = useRef(nodeId);
  const onChangeContentRef = useRef<typeof onChangeContent>(onChangeContent);
  const commitContentNowRef = useRef<(() => Promise<boolean>) | null>(null);

  // Reset on node change
  useEffect(() => {
    const initialContent = nodeContent || '';
    lastSavedContentRef.current = initialContent;
    pendingContentRef.current = null;
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    contentCommitPromiseRef.current = null;
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
      recentlySavedTimerRef.current = null;
    }
    setContentValue(initialContent);
    setIsContentDirty(false);
    setIsContentSaving(false);
    setContentSyncError(null);
    setRecentlySaved(false);
  }, [nodeId]);

  // Sync incoming content
  useEffect(() => {
    if (isUserEditingRef.current) return;
    const incoming = nodeContent || '';
    if (pendingContentRef.current !== null && incoming === pendingContentRef.current) {
      setContentValue((prev) => (prev === incoming ? prev : incoming));
      return;
    }
    lastSavedContentRef.current = incoming;
    pendingContentRef.current = null;
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    setContentValue((prev) => (prev === incoming ? prev : incoming));
    setIsContentDirty(false);
    setIsContentSaving(false);
    setContentSyncError(null);
  }, [nodeContent]);

  useEffect(() => {
    onChangeContentRef.current = onChangeContent;
  }, [onChangeContent]);

  useEffect(() => {
    nodeIdRef.current = nodeId;
  }, [nodeId]);

  const clearRecentlySaved = useCallback(() => {
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
      recentlySavedTimerRef.current = null;
    }
    setRecentlySaved(false);
  }, []);

  const markRecentlySaved = useCallback(() => {
    if (recentlySavedTimerRef.current !== null) {
      window.clearTimeout(recentlySavedTimerRef.current);
    }
    setRecentlySaved(true);
    recentlySavedTimerRef.current = window.setTimeout(() => {
      setRecentlySaved(false);
      recentlySavedTimerRef.current = null;
    }, 2000);
  }, []);

  const commitContentNow = useCallback(async (): Promise<boolean> => {
    if (!isContentDirty && pendingContentRef.current === null) return true;
    const contentToPersist = pendingContentRef.current ?? contentValue;
    const baseContent = lastSavedContentRef.current ?? '';
    const operations = diffToTextOperations(baseContent, contentToPersist);
    const commitOptions = operations.length > 0 ? { operations } : undefined;
    if (contentToPersist === lastSavedContentRef.current) {
      pendingContentRef.current = null;
      setIsContentDirty(false);
      clearRecentlySaved();
      markRecentlySaved();
      return true;
    }
    if (!onCommitContent) {
      lastSavedContentRef.current = contentToPersist;
      pendingContentRef.current = null;
      setIsContentDirty(false);
      clearRecentlySaved();
      markRecentlySaved();
      return true;
    }
    if (contentCommitPromiseRef.current) {
      return contentCommitPromiseRef.current;
    }
    setIsContentSaving(true);
    setContentSyncError(null);
    const promise = (async () => {
      try {
        await onCommitContent(nodeId, contentToPersist, commitOptions);
        lastSavedContentRef.current = contentToPersist;
        pendingContentRef.current = null;
        setIsContentDirty(false);
        clearRecentlySaved();
        markRecentlySaved();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save changes';
        setContentSyncError(message);
        setIsContentDirty(true);
        return false;
      } finally {
        setIsContentSaving(false);
        contentCommitPromiseRef.current = null;
      }
    })();
    contentCommitPromiseRef.current = promise;
    return promise;
  }, [isContentDirty, onCommitContent, nodeId, contentValue, clearRecentlySaved, markRecentlySaved]);

  const scheduleContentCommit = useCallback(
    (delay = 800) => {
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
      }
      contentCommitTimer.current = window.setTimeout(() => {
        contentCommitTimer.current = null;
        void commitContentNow();
      }, delay);
    },
    [commitContentNow],
  );

  const startContentEditing = useCallback(
    (source?: HTMLTextAreaElement | FocusEvent<HTMLElement> | null) => {
      isUserEditingRef.current = true;
      let element: HTMLTextAreaElement | null = null;
      if (source instanceof HTMLTextAreaElement) {
        element = source;
      } else if (source && typeof (source as FocusEvent<HTMLElement>).currentTarget !== 'undefined') {
        const potential = (source as FocusEvent<HTMLElement>).currentTarget;
        if (potential instanceof HTMLTextAreaElement) {
          element = potential;
        }
      }
      if (element) {
        contentInputRef.current = element;
      }
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
        contentCommitTimer.current = null;
      }
    },
    [],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      clearRecentlySaved();
      setContentValue(content);
      pendingContentRef.current = content;
      setIsContentDirty(true);
      setContentSyncError(null);
      if (isUserEditingRef.current && contentInputRef.current) {
        const element = contentInputRef.current;
        if (element && document.activeElement !== element) {
          element.focus({ preventScroll: true });
          if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
            const caret = Math.min(content.length, element.selectionEnd);
            element.setSelectionRange(caret, caret);
          }
        }
      }
      if (!isUserEditingRef.current) {
        scheduleContentCommit();
        if (onChangeContent) {
          onChangeContent(nodeId, content);
        }
      }
    },
    [clearRecentlySaved, nodeId, onChangeContent, scheduleContentCommit],
  );

  const flushContent = useCallback(async (): Promise<boolean> => {
    if (contentCommitTimer.current !== null) {
      window.clearTimeout(contentCommitTimer.current);
      contentCommitTimer.current = null;
    }
    return commitContentNow();
  }, [commitContentNow]);

  const finishContentEditing = useCallback(() => {
    isUserEditingRef.current = false;
    contentInputRef.current = null;
    const latest = pendingContentRef.current ?? contentValue;
    if (onChangeContent) {
      onChangeContent(nodeId, latest);
    }
    void flushContent();
  }, [contentValue, flushContent, nodeId, onChangeContent]);

  useEffect(() => {
    commitContentNowRef.current = () => commitContentNow();
  }, [commitContentNow]);

  // Focus tracking
  useEffect(() => {
    if (!isUserEditingRef.current) return;
    const element = contentInputRef.current;
    if (element && document.activeElement !== element) {
      element.focus({ preventScroll: true });
      if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        const caret = element.value.length;
        element.setSelectionRange(caret, caret);
      }
    }
  }, [contentValue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (contentCommitTimer.current !== null) {
        window.clearTimeout(contentCommitTimer.current);
        contentCommitTimer.current = null;
      }
      if (recentlySavedTimerRef.current !== null) {
        window.clearTimeout(recentlySavedTimerRef.current);
        recentlySavedTimerRef.current = null;
      }
      if (pendingContentRef.current !== null) {
        const latest = pendingContentRef.current;
        const changeHandler = onChangeContentRef.current;
        const nid = nodeIdRef.current;
        if (changeHandler) changeHandler(nid, latest);
        if (commitContentNowRef.current) void commitContentNowRef.current();
      }
      contentInputRef.current = null;
      isUserEditingRef.current = false;
    };
  }, []);

  return {
    contentValue,
    setContentValue,
    isContentDirty,
    isContentSaving,
    contentSyncError,
    recentlySaved,
    contentInputRef,
    isUserEditingRef,
    pendingContentRef,
    handleContentChange,
    startContentEditing,
    finishContentEditing,
    flushContent,
    commitContentNow,
    scheduleContentCommit,
  };
}
