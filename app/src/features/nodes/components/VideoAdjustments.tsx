import { ADJUSTMENT_LABELS, ADJUSTMENT_LIMITS, type VideoColorAdjustments } from './videoUtils';

interface VideoAdjustmentsProps {
  adjustments: VideoColorAdjustments;
  onAdjustmentChange: (key: keyof VideoColorAdjustments, value: number) => void;
}

export function VideoAdjustments({ adjustments, onAdjustmentChange }: VideoAdjustmentsProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-white/40">FRAME COLOR CORRECTION</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(ADJUSTMENT_LABELS) as Array<keyof VideoColorAdjustments>).map((key) => {
          const limits = ADJUSTMENT_LIMITS[key];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/40">
                <span>{ADJUSTMENT_LABELS[key]}</span>
                <span className="text-white/70">{adjustments[key]}</span>
              </div>
              <input type="range" min={limits.min} max={limits.max} step={limits.step}
                value={adjustments[key]}
                onChange={(e) => onAdjustmentChange(key, parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
