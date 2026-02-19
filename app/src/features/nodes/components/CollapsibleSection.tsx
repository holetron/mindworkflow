import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  icon: string;
  defaultExpanded: boolean;
  disabled: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, icon, defaultExpanded, disabled, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-white/10 rounded bg-black/5">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => !disabled && setExpanded(!expanded)}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-medium text-white/80">{title}</span>
        </div>
        <span className="text-white/60 text-xs">
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </button>
      {expanded && (
        <div className="p-3 pt-0 border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}
