import { useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeHandleProps } from './types';

export function ResizeHandle({ orientation, onResize, ariaLabel }: ResizeHandleProps) {
  const isVertical = orientation === 'vertical';

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      let previous = isVertical ? event.clientX : event.clientY;

      const handleMove = (moveEvent: PointerEvent) => {
        const current = isVertical ? moveEvent.clientX : moveEvent.clientY;
        const delta = current - previous;
        if (delta !== 0) {
          onResize(delta);
          previous = current;
        }
      };

      const handleUp = () => {
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
        window.removeEventListener('pointermove', handleMove);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
      window.addEventListener('pointercancel', handleUp, { once: true });
    },
    [isVertical, onResize],
  );

  const baseClasses = isVertical
    ? 'w-3 cursor-ew-resize'
    : 'h-3 cursor-ns-resize';

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      className={`group relative flex flex-none items-center justify-center ${baseClasses}`}
      onPointerDown={handlePointerDown}
    >
      <span
        className={`pointer-events-none rounded-full bg-slate-600/40 transition group-hover:bg-slate-400/70 ${
          isVertical ? 'h-[70%] w-px' : 'h-px w-[70%]'
        }`}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100"
      >
        {isVertical ? '\u2194' : '\u2195'}
      </span>
    </div>
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
