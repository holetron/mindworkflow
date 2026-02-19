import { apiFetch, isAdminAccessError, throwApiError } from './apiClient';
import type {
  PromptPreset,
  PromptPresetCategory,
  SubmitFeedbackPayload,
} from './types';

export async function fetchQuickPromptPresets(category: PromptPresetCategory, limit = 8): Promise<PromptPreset[]> {
  try {
    // Use regular API instead of admin for access without admin rights
    const prompts = await searchPromptPresets({ category });
    const filtered = prompts
      .filter((preset) => preset.is_quick_access)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label));
    return filtered.slice(0, Math.max(1, limit));
  } catch (error) {
    if (isAdminAccessError(error)) {
      return [];
    }
    throw error;
  }
}

export async function searchPromptPresets(options: { category?: PromptPresetCategory; search?: string; limit?: number } = {}): Promise<PromptPreset[]> {
  try {
    // Use public /api/prompts endpoint instead of admin-only
    const params = new URLSearchParams();
    if (options.category) {
      params.set('category', options.category);
    }
    if (options.search && options.search.trim().length > 0) {
      params.set('search', options.search.trim());
    }
    if (options.limit && Number.isFinite(options.limit)) {
      params.set('limit', Math.max(1, Math.trunc(options.limit)).toString());
    }
    const query = params.toString();
    const response = await apiFetch(`/api/prompts${query ? `?${query}` : ''}`);
    if (!response.ok) {
      // If access denied, return empty array
      if (response.status === 403) {
        return [];
      }
      await throwApiError(response);
    }
    return response.json() as Promise<PromptPreset[]>;
  } catch (error) {
    if (isAdminAccessError(error)) {
      return [];
    }
    throw error;
  }
}

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<{ feedback_id: string }> {
  const response = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await throwApiError(response);
  }
  return response.json();
}
