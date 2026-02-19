import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolKind } from './annotationTypes';
import { ANNOTATION_TOOLBAR_HEIGHT, ICON_BUTTON_BASE } from './annotationTypes';

interface AnnotationToolbarProps {
  isEditMode: boolean;
  activeTool: ToolKind;
  setActiveTool: (tool: ToolKind) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  hasUndoHistory: boolean;
  hasRedoHistory: boolean;
  canResetToOriginal: boolean;
  isSaving: boolean;
  sessionKey: number;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onResetToOriginal: () => void;
  onSave: () => void;
}

export function AnnotationToolbar({
  isEditMode,
  activeTool,
  setActiveTool,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  hasUndoHistory,
  hasRedoHistory,
  canResetToOriginal,
  isSaving,
  sessionKey,
  onUndo,
  onRedo,
  onClear,
  onResetToOriginal,
  onSave,
}: AnnotationToolbarProps) {
  const [showBrushPicker, setShowBrushPicker] = useState(false);
  const brushButtonRef = useRef<HTMLButtonElement | null>(null);
  const brushPopoverRef = useRef<HTMLDivElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  const handleColorButtonClick = useCallback(() => {
    if (!isEditMode) return;
    colorInputRef.current?.click();
  }, [isEditMode]);

  const handleColorChange = useCallback((value: string) => {
    setBrushColor(value);
    if (activeTool === 'eraser') setActiveTool('brush');
  }, [activeTool, setBrushColor, setActiveTool]);

  useEffect(() => {
    if (!isEditMode) setShowBrushPicker(false);
  }, [isEditMode]);

  useEffect(() => {
    if (!showBrushPicker) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (brushButtonRef.current && brushPopoverRef.current && target &&
        !brushButtonRef.current.contains(target) && !brushPopoverRef.current.contains(target)) {
        setShowBrushPicker(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowBrushPicker(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showBrushPicker]);

  const toolButton = (tool: ToolKind, icon: string, title: string, activeColor: string) => (
    <button type="button" onClick={() => setActiveTool(tool)} disabled={!isEditMode}
      className={`${ICON_BUTTON_BASE} ${activeTool === tool ? `border-${activeColor}-400/70 bg-${activeColor}-500/20 text-${activeColor}-100 shadow-inner shadow-${activeColor}-500/30` : ''}`}
      title={title} aria-label={title} aria-pressed={activeTool === tool}>
      {icon}
    </button>
  );

  return (
    <div className="relative flex flex-shrink-0 items-center gap-2 overflow-visible rounded-lg border border-white/10 bg-black/25 px-2 py-1"
      style={{ height: `${ANNOTATION_TOOLBAR_HEIGHT}px` }}>
      <div className="relative flex items-center gap-2">
        <span className="sr-only">Brush color</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={handleColorButtonClick}
          disabled={!isEditMode} className={`${ICON_BUTTON_BASE} ${isEditMode ? '' : 'border-white/20 bg-black/30'}`}
          aria-label="Select brush color" title="Brush color"
          style={isEditMode ? { backgroundColor: brushColor } : undefined}>
          {!isEditMode ? '\uD83C\uDFA8' : ''}
        </button>
        <input ref={colorInputRef} id={`annotation-color-${sessionKey}`} type="color" value={brushColor}
          onChange={(e) => handleColorChange(e.target.value)} disabled={!isEditMode}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-hidden tabIndex={-1} />
      </div>

      <div className="relative flex items-center gap-2">
        <span className="sr-only" id={`annotation-brush-size-label-${sessionKey}`}>Brush thickness</span>
        <button ref={brushButtonRef} type="button" onClick={() => { if (isEditMode) setShowBrushPicker(prev => !prev); }}
          disabled={!isEditMode}
          className={`${ICON_BUTTON_BASE} ${showBrushPicker ? 'border-sky-400/70 bg-sky-500/20 text-sky-100' : ''}`}
          title="Brush thickness" aria-label={`Brush thickness ${brushSize}px`}
          aria-expanded={showBrushPicker} aria-controls={`annotation-brush-size-popover-${sessionKey}`}>
          \uD83D\uDD8C\uFE0F
        </button>
        <span className="w-9 text-center font-mono text-[11px] text-white/60">{brushSize}px</span>
        {showBrushPicker && (
          <div ref={brushPopoverRef} id={`annotation-brush-size-popover-${sessionKey}`} role="dialog"
            aria-labelledby={`annotation-brush-size-label-${sessionKey}`}
            className="absolute left-0 top-full z-20 mt-2 w-40 rounded-lg border border-white/10 bg-slate-900/95 p-3 shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
              <span>Thickness</span>
              <span className="font-mono text-[11px] text-white/60">{brushSize}px</span>
            </div>
            <input type="range" min={1} max={24} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="h-1 w-full accent-sky-400" aria-label="Brush thickness" />
          </div>
        )}
      </div>

      <div className="h-5 w-px flex-shrink-0 rounded-full bg-white/10" />

      {toolButton('brush', '\u270F\uFE0F', 'Brush', 'sky')}
      {toolButton('eraser', '\uD83E\uDDFD', 'Eraser', 'amber')}
      {toolButton('rectangle', '\u25AD', 'Rectangle', 'purple')}
      {toolButton('circle', '\u25EF', 'Ellipse', 'emerald')}
      {toolButton('text', 'T', 'Text', 'pink')}

      <div className="h-5 w-px flex-shrink-0 rounded-full bg-white/10" />

      <button type="button" onClick={onUndo} disabled={!isEditMode || !hasUndoHistory}
        className={ICON_BUTTON_BASE} title="Undo step" aria-label="Undo step">{'\u21B6'}</button>
      <button type="button" onClick={onRedo} disabled={!isEditMode || !hasRedoHistory}
        className={ICON_BUTTON_BASE} title="Redo step" aria-label="Redo step">{'\u21B7'}</button>
      <button type="button" onClick={onClear} disabled={!isEditMode || !hasUndoHistory}
        className={ICON_BUTTON_BASE} title="Clear layer" aria-label="Clear layer">{'\uD83D\uDDD1\uFE0F'}</button>

      <div className="flex-1" />

      <button type="button" onClick={onResetToOriginal} disabled={!canResetToOriginal}
        className={ICON_BUTTON_BASE} title="Reset to original" aria-label="Reset to original">{'\u27F2'}</button>
      <button type="button" onClick={onSave} disabled={!isEditMode || isSaving}
        className={`${ICON_BUTTON_BASE} border-sky-400/70 bg-sky-500/25 text-sky-100 hover:bg-sky-500/30`}
        title="Save annotations" aria-label="Save annotations">
        {isSaving ? '\u23F3' : '\uD83D\uDCBE'}
      </button>
    </div>
  );
}
