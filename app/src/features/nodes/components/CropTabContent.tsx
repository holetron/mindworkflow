import type { CropPresetId } from '../imageProcessing';
import { MIN_CROP_DIMENSION } from './cropUtils';

interface PresetOption {
  value: CropPresetId;
  label: string;
}

interface CropTabContentProps {
  customWidthInput: string;
  customHeightInput: string;
  naturalWidth: number;
  naturalHeight: number;
  selectedPreset: CropPresetId;
  presetOptions: PresetOption[];
  onCustomWidthChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCustomWidthBlur: () => void;
  onCustomHeightChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCustomHeightBlur: () => void;
  onFocusFreeMode: () => void;
  onPresetChange: (preset: CropPresetId) => void;
}

const inputCls = 'rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40';

export function CropTabContent({
  customWidthInput, customHeightInput,
  naturalWidth, naturalHeight,
  selectedPreset, presetOptions,
  onCustomWidthChange, onCustomWidthBlur,
  onCustomHeightChange, onCustomHeightBlur,
  onFocusFreeMode, onPresetChange,
}: CropTabContentProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80 sm:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Width</span>
          <input type="text" inputMode="numeric" min={MIN_CROP_DIMENSION} max={naturalWidth}
            value={customWidthInput} onChange={onCustomWidthChange} onBlur={onCustomWidthBlur}
            onFocus={onFocusFreeMode} className={inputCls} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Height</span>
          <input type="text" inputMode="numeric" min={MIN_CROP_DIMENSION} max={naturalHeight}
            value={customHeightInput} onChange={onCustomHeightChange} onBlur={onCustomHeightBlur}
            onFocus={onFocusFreeMode} className={inputCls} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Preset</span>
          <select value={selectedPreset}
            onChange={(e) => onPresetChange(e.target.value as CropPresetId)}
            className={inputCls}>
            {presetOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <p className="sm:col-span-3 text-xs leading-relaxed text-white/40">
          Values are limited by original dimensions. Scale determines how many images fit in the frame.
        </p>
      </div>
      <p className="text-xs leading-relaxed text-white/40">
        Frame scales with mouse wheel. Shift for precise steps. Drag to move.
      </p>
    </>
  );
}
