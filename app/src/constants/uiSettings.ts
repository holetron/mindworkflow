import type { UiSettings } from '../state/api';

export const DEFAULT_UI_SETTINGS: UiSettings = {
  textNodeFontScaling: {
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
  },
  markdownPreview: {
    lineHeight: 1.3,
    paragraphSpacing: 0.4,
    breakSpacing: 0.25,
    codeBlockPaddingY: 0.75,
    codeBlockPaddingX: 1.25,
    backgroundColor: '#0b1120',
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
};

export const DEFAULT_FONT_TARGET_NODE_TYPES = DEFAULT_UI_SETTINGS.textNodeFontScaling.targetNodeTypes;
