import { useMemo } from 'react';
import type { ProjectFlow } from '../../state/api';

interface NodeSidebarProps {
  project: ProjectFlow | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  ai: '🤖',
  parser: '🧩',
  python: '🐍',
  file: '📁',
  image_gen: '🖼️',
  audio_gen: '🔊',
  video_gen: '🎬',
};
function NodeSidebar({ project, selectedNodeId, onSelectNode }: NodeSidebarProps) {
  const nodes = project?.nodes ?? [];

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => {
      const titleA = a.title || '';
      const titleB = b.title || '';
      return titleA.localeCompare(titleB, 'ru');
    }),
    [nodes],
  );

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
      <header>
        <h2 className="text-lg font-semibold">Ноды</h2>
        <p className="text-xs text-slate-400">{nodes.length} узлов</p>
      </header>
      <ul className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {sortedNodes.map((node) => {
          const icon = TYPE_ICONS[node.type] ?? '⚙️';
          const isSelected = node.node_id === selectedNodeId;
          return (
            <li key={node.node_id}>
              <button
                type="button"
                onClick={() => onSelectNode(node.node_id)}
                className={`flex w-full items-start justify-between rounded border px-3 py-2 text-left transition ${
                  isSelected
                    ? 'border-primary bg-slate-700'
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{node.title}</p>
                    <p className="text-[11px] text-slate-500">{node.node_id}</p>
                  </div>
                </div>
                {node.meta?.short_description && (
                  <p className="max-w-[140px] text-[11px] text-slate-400">
                    {String(node.meta.short_description)}
                  </p>
                )}
              </button>
            </li>
          );
        })}
        {sortedNodes.length === 0 && (
          <li className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-sm text-slate-400">
            Нет доступных нод.
          </li>
        )}
      </ul>
    </section>
  );
}

export default NodeSidebar;
