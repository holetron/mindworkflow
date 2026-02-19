const inputCls = 'rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-white focus:outline-none focus:ring focus:ring-sky-400/40';

interface VideoCropControlsProps {
  cropWidthInput: string;
  cropHeightInput: string;
  cropPreset: string;
  videoNaturalWidth: number;
  videoNaturalHeight: number;
  onCropWidthChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCropHeightChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCropWidthBlur: () => void;
  onCropHeightBlur: () => void;
  onCropPresetChange: (preset: string) => void;
}

export function VideoCropControls({
  cropWidthInput, cropHeightInput, cropPreset,
  videoNaturalWidth, videoNaturalHeight,
  onCropWidthChange, onCropHeightChange, onCropWidthBlur, onCropHeightBlur,
  onCropPresetChange,
}: VideoCropControlsProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <span className="mb-4 block text-xs uppercase tracking-wide text-white/40">VIDEO FRAMING</span>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Width</span>
          <input type="text" inputMode="numeric" min="50" max={videoNaturalWidth}
            value={cropWidthInput} onChange={onCropWidthChange} onBlur={onCropWidthBlur} className={inputCls} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Height</span>
          <input type="text" inputMode="numeric" min="50" max={videoNaturalHeight}
            value={cropHeightInput} onChange={onCropHeightChange} onBlur={onCropHeightBlur} className={inputCls} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-white/40">Preset</span>
          <select value={cropPreset} onChange={(e) => onCropPresetChange(e.target.value)} className={inputCls}>
            <option value="free">free</option>
            <option value="original">original</option>
            <option value="16:9">16:9</option>
            <option value="4:3">4:3</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
      </div>
      <p className="sm:col-span-3 mt-3 text-xs leading-relaxed text-white/40">
        Values are limited by original dimensions. Scale determines how many images fit in the frame.
      </p>
    </div>
  );
}
