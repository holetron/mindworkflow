/**
 * Deep-merges two plain objects, recursing into nested plain objects.
 */
export function mergeSettings(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value)) {
      const current = result[key];
      if (isPlainObject(current)) {
        result[key] = mergeSettings(current, value);
      } else {
        result[key] = deepClone(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
