import * as fs from 'fs';
import * as path from 'path';
import { getProjectSettings, updateProjectSettings } from '../db';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'uiSettings' });
export type FontScaleStep = {
  maxLength: number;
  multiplier: number;
};

export type TextNodeFontScalingSettings = {
  baseFontSize: number;
  steps: FontScaleStep[];
  targetNodeTypes: string[];
  scaleMultiplier: number;
};

export type MarkdownPreviewSettings = {
  lineHeight: number;
  paragraphSpacing: number;
  breakSpacing: number;
  codeBlockPaddingY: number;
  codeBlockPaddingX: number;
  backgroundColor: string;
  borderColor: string;
};

export type UiSettings = {
  textNodeFontScaling: TextNodeFontScalingSettings;
  markdownPreview: MarkdownPreviewSettings;
};

export type UiSettingsScope = 'global' | 'workflow';

type UiSettingsOptions = {
  scope?: UiSettingsScope;
  projectId?: string;
};

const MIN_SCALE_MULTIPLIER = 0.75;
const MAX_SCALE_MULTIPLIER = 1.5;
const MIN_LINE_HEIGHT = 0.6;
const MAX_LINE_HEIGHT = 2;
const MIN_SPACING = 0;
const MAX_SPACING = 4;
const MIN_PADDING = 0;
const MAX_PADDING = 4;

const DEFAULT_TEXT_NODE_FONT_SCALING: TextNodeFontScalingSettings = {
  baseFontSize: 13,
  targetNodeTypes: ['text', 'ai', 'ai_improved'],
  scaleMultiplier: 1,
  steps: [
    { maxLength: 20, multiplier: 6 },
    { maxLength: 40, multiplier: 5 },
    { maxLength: 60, multiplier: 4 },
    { maxLength: 80, multiplier: 3 },
    { maxLength: 100, multiplier: 2 },
    { maxLength: 120, multiplier: 1.5 },
    { maxLength: 1000, multiplier: 1 },
  ],
};

const DEFAULT_MARKDOWN_PREVIEW: MarkdownPreviewSettings = {
  lineHeight: 1.3,
  paragraphSpacing: 0.4,
  breakSpacing: 0.25,
  codeBlockPaddingY: 0.75,
  codeBlockPaddingX: 1.25,
  backgroundColor: '#0b1120',
  borderColor: 'rgba(148, 163, 184, 0.2)',
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
  textNodeFontScaling: DEFAULT_TEXT_NODE_FONT_SCALING,
  markdownPreview: DEFAULT_MARKDOWN_PREVIEW,
};

const CUSTOM_SETTINGS_PATH = process.env.MWF_UI_SETTINGS_PATH;
const GLOBAL_SETTINGS_PATH = CUSTOM_SETTINGS_PATH
  ? path.resolve(process.cwd(), CUSTOM_SETTINGS_PATH)
  : path.resolve(process.cwd(), 'data', 'ui-settings.json');

function ensureSettingsDir(): void {
  const dir = path.dirname(GLOBAL_SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeSteps(steps: FontScaleStep[]): FontScaleStep[] {
  const unique = new Map<number, number>();
  steps.forEach((step) => {
    if (!Number.isFinite(step.maxLength) || !Number.isFinite(step.multiplier)) {
      return;
    }
    const maxLength = Math.max(1, Math.trunc(step.maxLength));
    const multiplier = step.multiplier > 0 ? step.multiplier : 1;
    unique.set(maxLength, multiplier);
  });

  if (unique.size === 0) {
    DEFAULT_TEXT_NODE_FONT_SCALING.steps.forEach((step) => unique.set(step.maxLength, step.multiplier));
  }

  return Array.from(unique.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([maxLength, multiplier]) => ({
      maxLength,
      multiplier,
    }));
}

function normalizeFontScaling(settings?: Partial<TextNodeFontScalingSettings>): TextNodeFontScalingSettings {
  const baseFontSizeCandidate = settings?.baseFontSize;
  const baseFontSize =
    typeof baseFontSizeCandidate === 'number' && Number.isFinite(baseFontSizeCandidate) && baseFontSizeCandidate > 0
      ? Math.max(6, Math.min(64, Math.round(baseFontSizeCandidate)))
      : DEFAULT_TEXT_NODE_FONT_SCALING.baseFontSize;

  const steps = sanitizeSteps(settings?.steps ?? DEFAULT_TEXT_NODE_FONT_SCALING.steps);

  const targetNodeTypes = Array.isArray(settings?.targetNodeTypes)
    ? Array.from(
        new Set(
          settings.targetNodeTypes
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0),
        ),
      )
    : DEFAULT_TEXT_NODE_FONT_SCALING.targetNodeTypes;

  return {
    baseFontSize,
    steps,
    scaleMultiplier:
      typeof settings?.scaleMultiplier === 'number' && Number.isFinite(settings.scaleMultiplier)
        ? Math.max(MIN_SCALE_MULTIPLIER, Math.min(MAX_SCALE_MULTIPLIER, settings.scaleMultiplier))
        : DEFAULT_TEXT_NODE_FONT_SCALING.scaleMultiplier,
    targetNodeTypes: targetNodeTypes.length > 0 ? targetNodeTypes : DEFAULT_TEXT_NODE_FONT_SCALING.targetNodeTypes,
  };
}

function normalizeMarkdownPreview(settings?: Partial<MarkdownPreviewSettings>): MarkdownPreviewSettings {
  const clamp = (value: number, min: number, max: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  };

  const lineHeight = clamp(
    typeof settings?.lineHeight === 'number' ? settings.lineHeight : DEFAULT_MARKDOWN_PREVIEW.lineHeight,
    MIN_LINE_HEIGHT,
    MAX_LINE_HEIGHT,
    DEFAULT_MARKDOWN_PREVIEW.lineHeight,
  );

  const paragraphSpacing = clamp(
    typeof settings?.paragraphSpacing === 'number' ? settings.paragraphSpacing : DEFAULT_MARKDOWN_PREVIEW.paragraphSpacing,
    MIN_SPACING,
    MAX_SPACING,
    DEFAULT_MARKDOWN_PREVIEW.paragraphSpacing,
  );

  const breakSpacing = clamp(
    typeof settings?.breakSpacing === 'number' ? settings.breakSpacing : DEFAULT_MARKDOWN_PREVIEW.breakSpacing,
    MIN_SPACING,
    MAX_SPACING,
    DEFAULT_MARKDOWN_PREVIEW.breakSpacing,
  );

  const codeBlockPaddingY = clamp(
    typeof settings?.codeBlockPaddingY === 'number' ? settings.codeBlockPaddingY : DEFAULT_MARKDOWN_PREVIEW.codeBlockPaddingY,
    MIN_PADDING,
    MAX_PADDING,
    DEFAULT_MARKDOWN_PREVIEW.codeBlockPaddingY,
  );

  const codeBlockPaddingX = clamp(
    typeof settings?.codeBlockPaddingX === 'number' ? settings.codeBlockPaddingX : DEFAULT_MARKDOWN_PREVIEW.codeBlockPaddingX,
    MIN_PADDING,
    MAX_PADDING,
    DEFAULT_MARKDOWN_PREVIEW.codeBlockPaddingX,
  );

  const backgroundColor =
    typeof settings?.backgroundColor === 'string' && settings.backgroundColor.trim().length > 0
      ? settings.backgroundColor.trim()
      : DEFAULT_MARKDOWN_PREVIEW.backgroundColor;

  const borderColor =
    typeof settings?.borderColor === 'string' && settings.borderColor.trim().length > 0
      ? settings.borderColor.trim()
      : DEFAULT_MARKDOWN_PREVIEW.borderColor;

  return {
    lineHeight,
    paragraphSpacing,
    breakSpacing,
    codeBlockPaddingY,
    codeBlockPaddingX,
    backgroundColor,
    borderColor,
  };
}

function normalizeSettings(settings?: Partial<UiSettings>): UiSettings {
  if (!settings || typeof settings !== 'object') {
    return {
      ...DEFAULT_UI_SETTINGS,
      textNodeFontScaling: { ...DEFAULT_TEXT_NODE_FONT_SCALING },
      markdownPreview: { ...DEFAULT_MARKDOWN_PREVIEW },
    };
  }

  return {
    textNodeFontScaling: normalizeFontScaling(settings.textNodeFontScaling),
    markdownPreview: normalizeMarkdownPreview(settings.markdownPreview),
  };
}

function mergeSettings(current: UiSettings, patch: UiSettings): UiSettings {
  const merged: UiSettings = {
    textNodeFontScaling: normalizeFontScaling({
      ...current.textNodeFontScaling,
      ...patch.textNodeFontScaling,
    }),
    markdownPreview: normalizeMarkdownPreview({
      ...current.markdownPreview,
      ...patch.markdownPreview,
    }),
  };
  return merged;
}

function readGlobalUiSettings(): UiSettings {
  ensureSettingsDir();
  if (!fs.existsSync(GLOBAL_SETTINGS_PATH)) {
    return writeGlobalUiSettings(DEFAULT_UI_SETTINGS);
  }

  try {
    const raw = fs.readFileSync(GLOBAL_SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return normalizeSettings(parsed);
  } catch (error) {
    log.error({ err: error }, '[UiSettings] Failed to read settings file, fallback to defaults');
    return writeGlobalUiSettings(DEFAULT_UI_SETTINGS);
  }
}

function writeGlobalUiSettings(settings: UiSettings): UiSettings {
  ensureSettingsDir();
  const normalized = normalizeSettings(settings);
  fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function readWorkflowUiSettings(projectId: string): UiSettings | null {
  if (!projectId) {
    return null;
  }
  try {
    const settings = getProjectSettings(projectId);
    const workflow =
      (settings?.['workflowSettings'] as unknown) ??
      (settings?.['uiSettings'] as unknown) ??
      (settings?.['workflow_settings'] as unknown) ??
      null;
    if (!workflow || typeof workflow !== 'object') {
      return null;
    }
    return normalizeSettings(workflow as Partial<UiSettings>);
  } catch (error) {
    log.error({ err: error }, '`[UiSettings] Failed to read workflow settings for project ${projectId}:`');
    return null;
  }
}

function writeWorkflowUiSettings(projectId: string, settings: UiSettings): UiSettings {
  if (!projectId) {
    throw new Error('[UiSettings] projectId is required to persist workflow settings');
  }
  const normalized = normalizeSettings(settings);
  updateProjectSettings(projectId, { workflowSettings: normalized });
  return normalized;
}

export function getUiSettings(options: UiSettingsOptions = {}): UiSettings {
  const scope = options.scope ?? 'global';
  if (scope === 'workflow') {
    const projectId = options.projectId;
    if (!projectId) {
      throw new Error('[UiSettings] projectId is required when requesting workflow settings');
    }
    const workflowSettings = readWorkflowUiSettings(projectId);
    if (workflowSettings) {
      return workflowSettings;
    }
    return getUiSettings({ scope: 'global' });
  }
  return readGlobalUiSettings();
}

export function updateUiSettings(patch: UiSettings, options: UiSettingsOptions = {}): UiSettings {
  const scope = options.scope ?? 'global';
  if (scope === 'workflow') {
    const projectId = options.projectId;
    if (!projectId) {
      throw new Error('[UiSettings] projectId is required when updating workflow settings');
    }
    const current = readWorkflowUiSettings(projectId) ?? readGlobalUiSettings();
    const merged = mergeSettings(current, patch);
    return writeWorkflowUiSettings(projectId, merged);
  }
  const current = readGlobalUiSettings();
  const merged = mergeSettings(current, patch);
  return writeGlobalUiSettings(merged);
}
