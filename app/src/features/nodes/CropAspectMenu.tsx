import { useEffect, useRef } from 'react';

const OPTIONS: Array<{ label: string; ratio: number | null }> = [
  { label: 'Исходное', ratio: null },
  { label: '1 : 1', ratio: 1 },
  { label: '4 : 3', ratio: 4 / 3 },
  { label: '3 : 4', ratio: 3 / 4 },
  { label: '16 : 9', ratio: 16 / 9 },
  { label: '9 : 16', ratio: 9 / 16 },
];

type CropAspectMenuProps = {
  onSelect: (ratio: number | null) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
};

export function CropAspectMenu({ onSelect, onClose, anchorRef }: CropAspectMenuProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        popoverRef.current &&
        anchorRef.current &&
        target &&
        !popoverRef.current.contains(target) &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-20 mt-2 w-44 rounded-lg border border-white/10 bg-slate-900/95 p-3 shadow-lg"
      role="dialog"
      aria-label="Настройки обрезки"
    >
      <div className="mb-2 text-xs uppercase tracking-wide text-white/50">Обрезка</div>
      <div className="flex flex-col gap-2 text-sm text-white/80">
        {OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-left text-xs transition hover:border-sky-400/70 hover:bg-sky-500/20 hover:text-sky-100"
            onClick={() => {
              onSelect(option.ratio);
              onClose();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
