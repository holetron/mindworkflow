import type { AdminFeedbackStatus } from '../../state/api';
import type { PromptPresetCategory } from '../../state/api';

export const PROMPT_CATEGORY_OPTIONS: Array<{ value: PromptPresetCategory; label: string }> = [
  { value: 'system_prompt', label: 'System prompts' },
  { value: 'output_example', label: 'Output examples' },
];

export const FEEDBACK_TYPE_LABELS: Record<'problem' | 'suggestion' | 'unknown', string> = {
  problem: 'Problem',
  suggestion: 'Suggestion',
  unknown: 'Other',
};

export const FEEDBACK_STATUS_ORDER: AdminFeedbackStatus[] = ['new', 'in_progress', 'resolved', 'archived'];

export const FEEDBACK_STATUS_LABELS: Record<AdminFeedbackStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  archived: 'Archive',
};

export const FEEDBACK_STATUS_BADGE_CLASSES: Record<AdminFeedbackStatus, string> = {
  new: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  in_progress: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  resolved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  archived: 'border-slate-600/60 bg-slate-800/80 text-slate-300',
};

export const FEEDBACK_STATUS_BUTTON_CLASSES: Record<AdminFeedbackStatus, string> = {
  new: 'ring-sky-500/30',
  in_progress: 'ring-amber-500/30',
  resolved: 'ring-emerald-500/30',
  archived: 'ring-slate-500/30',
};

export const ADMIN_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'projects', label: 'Projects' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'settings', label: 'Settings' },
] as const;

// --------------- Utility Functions ---------------

export const formatDateTime = (value: string): string => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
};

export const formatDate = (value: string): string => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
};

export function buildFeedbackExcerpt(description: string): string {
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (!normalized.length) {
    return '—';
  }
  if (normalized.length <= 280) {
    return normalized;
  }
  return `${normalized.slice(0, 277)}...`;
}
