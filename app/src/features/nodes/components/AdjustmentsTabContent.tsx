import type { ImageColorAdjustments } from '../imageProcessing';
import { ADJUSTMENT_LABELS, ADJUSTMENT_LIMITS, type AdjustmentKey } from './cropUtils';

interface AdjustmentsTabContentProps {
  adjustments: ImageColorAdjustments;
  isAdjustmentsPristine: boolean;
  onSliderChange: (key: AdjustmentKey, value: number) => void;
  onReset: () => void;
}

export function AdjustmentsTabContent({
  adjustments, isAdjustmentsPristine, onSliderChange, onReset,
}: AdjustmentsTabContentProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/80 mb-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-white/40">FRAME COLOR CORRECTION</span>
        <button type="button" onClick={onReset} disabled={isAdjustmentsPristine}
          className="rounded-lg bg-sky-500/80 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50">
          Reset
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(ADJUSTMENT_LABELS) as AdjustmentKey[]).map((key) => {
          const limits = ADJUSTMENT_LIMITS[key];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
                <span>{ADJUSTMENT_LABELS[key]}</span>
                <span className="text-white/70">{adjustments[key]}%</span>
              </div>
              <input type="range" min={limits.min} max={limits.max} step={limits.step}
                value={adjustments[key]}
                onChange={(e) => onSliderChange(key, Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
