import type { AiProviderOption, TextSplitterConfig, PromptPreset } from './nodeTypes';
import { NODE_DEFAULT_COLOR } from '../../../constants/nodeDefaults';
import { defaultPlannerPrompt } from '../../../data/promptPresets';

// Screen width constants for HTML preview
export const SCREEN_WIDTHS = [
  { id: 'mobile', name: 'Mobile', width: '375px' },
  { id: 'tablet', name: 'Tablet', width: '768px' },
  { id: 'laptop', name: 'Laptop', width: '1024px' },
  { id: 'desktop', name: 'Desktop', width: '1440px' },
  { id: 'wide', name: 'Wide', width: '1920px' },
];

export const VIDEO_SCALE_OPTIONS = [0.5, 1, 1.5, 2] as const;
export const VIDEO_NOTES_MIN_LINES = 1;
export const VIDEO_NOTES_LINE_HEIGHT = 18;
export const VIDEO_NOTES_MIN_HEIGHT = VIDEO_NOTES_MIN_LINES * VIDEO_NOTES_LINE_HEIGHT + 16;
export const VIDEO_NOTES_VERTICAL_EXTRA = 32;
export const VIDEO_EXTRA_MIN_HEIGHT = 50;
export const DEFAULT_VIDEO_ASPECT = 16 / 9;
export const IMAGE_VIEWPORT_MIN_HEIGHT = 380;
export const IMAGE_NOTES_MIN_LINES = 3;
export const IMAGE_NOTES_LINE_HEIGHT = 20;
export const IMAGE_NOTES_MIN_HEIGHT = IMAGE_NOTES_MIN_LINES * IMAGE_NOTES_LINE_HEIGHT + 16;
export const IMAGE_CONTENT_VERTICAL_GAP = 24;
export const FILE_NOTES_MIN_LINES = 2;
export const FILE_NOTES_LINE_HEIGHT = 20;
export const FILE_NOTES_MIN_HEIGHT = FILE_NOTES_MIN_LINES * FILE_NOTES_LINE_HEIGHT + 16;
export const FOLDER_NOTES_MIN_LINES = 3;
export const FOLDER_NOTES_LINE_HEIGHT = 20;
export const FOLDER_NOTES_MIN_HEIGHT = FOLDER_NOTES_MIN_LINES * FOLDER_NOTES_LINE_HEIGHT + 16;

export const FALLBACK_SYSTEM_PRESETS: PromptPreset[] = [
  {
    preset_id: 'fallback-system-planner',
    category: 'system_prompt',
    label: 'Planner',
    description: 'Basic system prompt for workflow plan generation',
    content: defaultPlannerPrompt,
    tags: ['default', 'planner'],
    is_quick_access: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
];

export const TYPE_ICONS: Record<string, string> = {
  text: '\u{1F4DD}',
  ai: '\u{1F916}',
  parser: '\u{1F9E9}',
  python: '\u{1F40D}',
  file: '\u{1F4C1}',
  image: '\u{1F5BC}\uFE0F',
  pdf: '\u{1F4C4}',
  table: '\u{1F4CA}',
  video: '\u{1F3AC}',
  folder: '\u{1F4C2}',
  image_gen: '\u{1F5BC}\uFE0F',
  audio_gen: '\u{1F50A}',
  video_gen: '\u{1F3AC}',
  html: '\u{1F310}',
  html_editor: '\u2709\uFE0F',
};

export const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#84cc16', '#6b7280',
];

export const DEFAULT_COLOR = NODE_DEFAULT_COLOR;
export const DEFAULT_MODEL = 'gpt-4.1-mini';

export const DEFAULT_TEXT_SPLITTER_CONFIG: TextSplitterConfig = {
  separator: '---',
  subSeparator: '-----',
  namingMode: 'auto',
};

export const FALLBACK_PROVIDERS: AiProviderOption[] = [
  {
    id: 'stub',
    name: 'Local Stub',
    models: ['local-llm-7b-q5'],
    defaultModel: 'local-llm-7b-q5',
    available: true,
    description: 'Built-in offline engine for test runs.',
    inputFields: [],
    supportsFiles: false,
    supportedFileTypes: [],
  },
  {
    id: 'openai_gpt',
    name: 'OpenAI GPT',
    models: ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    available: true,
    description: 'OpenAI GPT models with structured output support.',
    inputFields: [],
    supportsFiles: false,
    supportedFileTypes: [],
  },
  {
    id: 'google_workspace',
    name: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'],
    defaultModel: 'gemini-2.5-flash',
    available: true,
    description: 'Google Gemini with native file and image support.',
    inputFields: [],
    supportsFiles: true,
    supportedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'],
  },
];

export const TOOLBAR_BUTTON_BASE_CLASSES =
  'inline-flex h-6 min-h-[24px] w-6 min-w-[24px] flex-shrink-0 items-center justify-center rounded border p-0.5 text-[10px] transition-colors align-bottom';

export const TOOLBAR_BUTTON_INACTIVE_CLASSES =
  'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-white/70';
