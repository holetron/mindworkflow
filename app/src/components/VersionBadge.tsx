import { APP_VERSION } from '../constants/version';

interface VersionBadgeProps {
  className?: string;
}

export function VersionBadge({ className }: VersionBadgeProps) {
  if (!APP_VERSION) {
    return null;
  }

  const mergedClassName = ['pointer-events-none select-none text-[10px] leading-none text-slate-500 opacity-80', className]
    .filter(Boolean)
    .join(' ');

  return <span className={mergedClassName}>v{APP_VERSION}</span>;
}

export default VersionBadge;
