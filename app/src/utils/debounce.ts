import { useEffect, useRef, useCallback } from 'react';

/**
 * Простой debounce хелпер для useCallback
 * Использование в useEffect для отложенного выполнения
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
 * ✅ Хук для дебаунса updateNodeInternals вызовов
 * Предотвращает множественные вызовы updateNodeInternals в быстрой последовательности
 * Используется для оптимизации React Flow при изменении портов/размеров нод
 * 
 * @param updateNodeInternals Функция из useUpdateNodeInternals()
 * @param nodeId ID ноды для обновления
 * @param delay Задержка в ms перед вызовом (по умолчанию 50ms)
 * @returns Дебаунсированная функция для вызова
 */
export function useDebouncedUpdateNodeInternals(
  updateNodeInternals: (nodeId: string) => void,
  nodeId: string,
  delay: number = 50
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<boolean>(false);

  // ✅ Вернуть дебаунсированную функцию
  const debouncedUpdate = useCallback(() => {
    // ✅ Отменить предыдущий timeout если он есть
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // ✅ Установить новый timeout
    timeoutRef.current = setTimeout(() => {
      if (!pendingRef.current) {
        pendingRef.current = true;
        console.log(`🔄 [updateNodeInternals] Calling for node: ${nodeId}`);
        updateNodeInternals(nodeId);
        pendingRef.current = false;
      }
    }, delay);
  }, [updateNodeInternals, nodeId, delay]);

  // ✅ Cleanup при unmount
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
 * Debounce wrapper для функций
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
