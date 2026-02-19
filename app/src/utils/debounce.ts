import { useEffect, useRef, useCallback } from 'react';

/**
 * Simple debounce helper for useCallback
 * Usage in useEffect for delayed execution
 */
export function useDebounce<T>(value: T, delay: number, callback: (value: T) => void) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutRef.current = window.setTimeout(() => {
      callback(value);
    }, delay);

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, callback]);
}

/**
 * ✅ Hook for debouncing updateNodeInternals calls
 * Prevents multiple updateNodeInternals calls in rapid succession
 * Used for React Flow optimization when changing ports/node sizes
 * 
 * @param updateNodeInternals Function from useUpdateNodeInternals()
 * @param nodeId Node ID to update
 * @param delay Delay in ms before call (default 50ms)
 * @returns Debounced function to call
 */
export function useDebouncedUpdateNodeInternals(
  updateNodeInternals: (nodeId: string) => void,
  nodeId: string,
  delay: number = 50
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<boolean>(false);

  // ✅ Return debounced function
  const debouncedUpdate = useCallback(() => {
    // ✅ Cancel previous timeout if exists
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // ✅ Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (!pendingRef.current) {
        pendingRef.current = true;
        console.log(`🔄 [updateNodeInternals] Calling for node: ${nodeId}`);
        updateNodeInternals(nodeId);
        pendingRef.current = false;
      }
    }, delay);
  }, [updateNodeInternals, nodeId, delay]);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedUpdate;
}

/**
 * Debounce wrapper for functions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}
