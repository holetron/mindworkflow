const API_BASE = '';

type HeadersRecord = Record<string, string>;

function normalizeHeaders(headersInit?: HeadersInit): HeadersRecord {
  if (!headersInit) {
    return {};
  }
  if (typeof Headers !== 'undefined' && headersInit instanceof Headers) {
    const result: HeadersRecord = {};
    headersInit.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headersInit)) {
    return headersInit.reduce<HeadersRecord>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return { ...(headersInit as HeadersRecord) };
}

export async function throwApiError(response: Response): Promise<never> {
  let message = '';
  try {
    message = await response.text();
  } catch {
    message = '';
  }
  throw new Error(message || response.statusText);
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = normalizeHeaders(options.headers);
  try {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // localStorage might not be available (e.g. SSR); ignore gracefully.
  }
  if (!headers.Accept) {
    headers.Accept = 'application/json';
  }
  return fetch(`${API_BASE}${url}`, { ...options, headers });
}

export function isAdminAccessError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (!rawMessage) {
    return false;
  }
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error.toLowerCase().includes('admin access required');
    }
  } catch {
    // Not a JSON payload, fall back to plain string check
  }
  return rawMessage.toLowerCase().includes('admin access required');
}
