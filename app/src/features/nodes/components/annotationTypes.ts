export type StrokePoint = { x: number; y: number };

export type BrushStroke = {
  kind: 'brush';
  color: string;
  size: number;
  points: StrokePoint[];
};

export type EraserStroke = {
  kind: 'eraser';
  size: number;
  points: StrokePoint[];
};

export type RectangleStroke = {
  kind: 'rectangle';
  color: string;
  size: number;
  start: StrokePoint;
  end: StrokePoint;
};

export type CircleStroke = {
  kind: 'circle';
  color: string;
  size: number;
  start: StrokePoint;
  end: StrokePoint;
};

export type TextStroke = {
  kind: 'text';
  color: string;
  fontSize: number;
  position: StrokePoint;
  text: string;
};

export type Stroke = BrushStroke | EraserStroke | RectangleStroke | CircleStroke | TextStroke;

export type ToolKind = Stroke['kind'];

export type PendingTextInput = {
  id: string;
  position: StrokePoint;
  color: string;
  fontSize: number;
};

export const DEFAULT_COLOR = '#f97316';
export const DEFAULT_BRUSH = 4;
export const ANNOTATION_TOOLBAR_HEIGHT = 40;
export const TEXTAREA_MIN_WIDTH = 140;
export const TEXTAREA_MAX_WIDTH = 320;
export const TEXTAREA_PADDING = 6;
export const TEXTAREA_LINE_HEIGHT = 1.25;
export const ICON_BUTTON_BASE =
  'inline-flex h-[26px] w-[26px] items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-white/70';
