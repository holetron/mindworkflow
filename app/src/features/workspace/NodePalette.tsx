
import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  NODE_PALETTE,
  AGENT_CATEGORIES,
  type AgentCategoryKey,
  type NodePaletteItem,
} from '../../data/nodePalette';
import { DEFAULT_STICKY_NOTE } from '../../data/stickyNoteDefault';
import type { NodeTemplate } from '../../state/store';

interface NodePaletteProps {
  onCreateNode: (template: NodeTemplate, slug: string) => void | Promise<void>;
  disabled?: boolean;
}

// Цвета нод по типам (как на поле)
const getNodeTypeColor = (type: string): string => {
  switch (type) {
    case 'input': return '#10b981'; // green
    case 'output': return '#f59e0b'; // amber
    case 'ai': return '#8b5cf6'; // purple
    case 'ai_improved': return '#8b5cf6'; // purple
    case 'text': return '#64748b'; // slate
    case 'file': return '#f59e0b'; // amber
    case 'image': return '#ec4899'; // pink
    case 'video': return '#06b6d4'; // cyan
    case 'audio': return '#84cc16'; // lime
    case 'html': return '#f97316'; // orange
    default: return '#6b7280'; // gray
  }
};

interface NodePaletteProps {
  onCreateNode: (template: NodeTemplate, slug: string) => void | Promise<void>;
  disabled?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const GROUPS: Array<{
  key: 'basic' | 'agents';
  title: string;
  collapsible: boolean;
}> = [
  { key: 'basic', title: 'Базовые ноды', collapsible: false },
  { key: 'agents', title: 'Агенты', collapsible: true },
];

function NodePalette({ onCreateNode, disabled, collapsed = false, onToggleCollapse }: NodePaletteProps) {
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({ agents: true });
  const [collapsedAgentGroups, setCollapsedAgentGroups] = useState<Record<AgentCategoryKey, boolean>>({
    universal: false,
    text_to_text: false,
    voice_to_voice: true,
    text_to_voice: true,
    text_to_image: true,
    image_to_image: true,
  });

  const normalizedQuery = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return NODE_PALETTE;
    return NODE_PALETTE.filter((item) => {
      const haystack = `${item.slug} ${item.title} ${item.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const agentBuckets = useMemo(() => {
    const base: Record<AgentCategoryKey, NodePaletteItem[]> = {
      universal: [],
      text_to_text: [],
      voice_to_voice: [],
      text_to_voice: [],
      text_to_image: [],
      image_to_image: [],
    };
    filteredItems.forEach((item) => {
      if (item.category !== 'agents') return;
      const key = item.agentCategory ?? 'universal';
      base[key].push(item);
    });
    return base;
  }, [filteredItems]);

  const groups = GROUPS.map((group) => {
    if (group.key === 'agents') {
      return {
        ...group,
        items: filteredItems.filter((item) => (item.category ?? 'basic') === 'agents'),
      };
    }
    const items = filteredItems.filter((item) => (item.category ?? 'basic') === group.key);
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  const handleDragStart = (event: DragEvent<HTMLElement>, item: NodePaletteItem) => {
    event.dataTransfer.setData('application/reactflow-node', item.slug);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = (item: NodePaletteItem) => {
    void onCreateNode(applyTemplateDefaults(item), item.slug);
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAgentGroup = (key: AgentCategoryKey) => {
    setCollapsedAgentGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isSearching = normalizedQuery.length > 0;

  const renderItem = (item: NodePaletteItem) =>
    renderPaletteItem(item, Boolean(disabled), handleClick, handleDragStart);

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col bg-slate-800 rounded-lg shadow">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 w-12 items-center justify-center text-slate-300 hover:bg-slate-700 rounded-t-lg bg-transparent border-0 p-0"
          style={{ 
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            boxShadow: 'none'
          }}
          title="Развернуть палитру нод"
        >
          ⚒️
        </button>
        <div className="flex-1 flex flex-col items-center py-2 gap-1 overflow-y-auto">
          {filteredItems.slice(0, 10).map((item) => {
            const icon = item.icon || '⚙️';
            const nodeColor = getNodeTypeColor(item.template.type);
            
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => handleClick(item)}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                className="relative w-8 h-8 flex items-center justify-center rounded text-xs transition overflow-hidden bg-transparent border-0 p-0"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${nodeColor}40`,
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 2px 6px rgba(0,0,0,0.1)`,
                  backgroundImage: 'none'
                }}
                title={item.title}
                disabled={disabled}
              >
                <div 
                  className="flex items-center justify-center w-6 h-6 rounded text-xs"
                  style={{ 
                    backgroundColor: 'transparent',
                    color: 'white'
                  }}
                >
                  {icon}
                </div>
              </button>
            );
          })}
          {filteredItems.length > 10 && (
            <div className="text-xs text-slate-400 mt-1 transform rotate-90 origin-center">
              +{filteredItems.length - 10}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
      <header className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Магазин нод</h2>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded transition bg-transparent border-0 p-0"
            style={{ 
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              boxShadow: 'none'
            }}
            title="Свернуть панель"
          >
            ☰
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск нод..."
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-slate-400">Перетащите или кликните, чтобы добавить</p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1 text-sm">
        {groups.length === 0 && (
          <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
            Ничего не найдено.
          </p>
        )}
        {groups.map((group) => {
          const collapsed = group.collapsible && !isSearching && (collapsedGroups[group.key] ?? true);
          return (
            <div key={group.key} className="space-y-2">
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded bg-slate-900/70 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 border-0 ${
                  group.collapsible ? 'hover:bg-slate-900/90' : ''
                }`}
                style={{ 
                  backgroundColor: 'rgb(15 23 42 / 0.7)',
                  backgroundImage: 'none',
                  boxShadow: 'none'
                }}
                onClick={() => group.collapsible && !isSearching && toggleGroup(group.key)}
                disabled={!group.collapsible || isSearching}
              >
                <span>{group.title}</span>
                {group.collapsible && <span>{collapsed ? '▸' : '▾'}</span>}
              </button>
              {!collapsed && (
                <div className="space-y-2">
                  {group.key === 'agents' && !isSearching ? (
                    (Object.keys(AGENT_CATEGORIES) as AgentCategoryKey[])
                      .filter((key) => agentBuckets[key].length > 0)
                      .map((key) => {
                        const subCollapsed = collapsedAgentGroups[key] ?? false;
                        const meta = AGENT_CATEGORIES[key];
                        return (
                          <div
                            key={key}
                            className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/60"
                          >
                            <button
                              type="button"
                              className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white transition border-0 ${
                                subCollapsed ? 'bg-sky-700' : 'bg-sky-600'
                              } hover:bg-sky-500`}
                              style={{ 
                                backgroundColor: subCollapsed ? 'rgb(3 105 161)' : 'rgb(2 132 199)',
                                backgroundImage: 'none',
                                boxShadow: 'none'
                              }}
                              onClick={() => toggleAgentGroup(key)}
                            >
                              <span>
                                {meta.title}
                                <span className="block text-[10px] font-normal tracking-normal text-slate-100/80">
                                  {meta.description}
                                </span>
                              </span>
                              <span>{subCollapsed ? '▸' : '▾'}</span>
                            </button>
                            {!subCollapsed && (
                              <div className="space-y-2 bg-slate-900/80 px-3 pb-3 pt-2">
                                {agentBuckets[key].map((item) => renderItem(item))}
                              </div>
                            )}
                          </div>
                        );
                      })
                  ) : (
                    group.items.map((item) => renderItem(item))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default NodePalette;

function applyTemplateDefaults(item: NodePaletteItem): NodeTemplate {
  if (item.slug !== 'text') {
    return item.template;
  }
  return {
    ...item.template,
    content:
      item.template.content && item.template.content.length > 0
        ? item.template.content
        : DEFAULT_STICKY_NOTE,
    content_type: 'text/markdown',
  };
}

function renderPaletteItem(
  item: NodePaletteItem,
  disabled = false,
  handleClick?: (item: NodePaletteItem) => void,
  handleDragStart?: (event: DragEvent<HTMLDivElement>, item: NodePaletteItem) => void,
) {
  const onClick = handleClick ?? (() => {});
  const onDrag = handleDragStart ?? (() => {});
  return (
    <div
      key={item.slug}
      role="button"
      tabIndex={disabled ? -1 : 0}
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) return;
        onDrag(event, item);
      }}
      onClick={() => {
        if (disabled) return;
        onClick(item);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!disabled) {
            onClick(item);
          }
        }
      }}
      className={`flex cursor-move flex-col gap-2 rounded p-3 transition ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
      style={{
        border: `1px solid ${getNodeTypeColor(item.template.type)}40`,
        backgroundColor: `${getNodeTypeColor(item.template.type)}10`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{item.icon}</span>
        <div>
          <p className="font-semibold text-white">{item.title}</p>
          <p className="text-xs opacity-60">{item.slug}</p>
        </div>
      </div>
      <p className="text-xs opacity-80">{item.description}</p>
    </div>
  );
}
