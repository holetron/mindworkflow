import { useMemo, useState, useEffect, type DragEvent, type KeyboardEvent } from 'react';
import {
  NODE_PALETTE,
  AGENT_CATEGORIES,
  type AgentCategoryKey,
  type NodePaletteItem,
} from '../../data/nodePalette';
import { DEFAULT_TEXT_MARKDOWN_TEMPLATE } from '../../data/stickyNoteDefault';
import type { NodeTemplate } from '../../state/store';

interface AgentPreset {
  preset_id: string;
  title: string;
  description: string | null;
  icon: string;
  node_template: NodeTemplate;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

interface NodePaletteProps {
  onCreateNode: (template: NodeTemplate, slug: string) => void | Promise<void>;
  disabled?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const getNodeTypeColor = (type: string): string => {
  switch (type) {
    case 'input':
      return '#10b981';
    case 'output':
      return '#f59e0b';
    case 'ai':
      return '#8b5cf6';
    case 'ai_improved':
      return '#8b5cf6';
    case 'text':
      return '#64748b';
    case 'file':
      return '#f59e0b';
    case 'image':
      return '#ec4899';
    case 'pdf':
      return '#dc2626';
    case 'table':
      return '#8b5a3c';
    case 'video':
      return '#06b6d4';
    case 'audio':
      return '#84cc16';
    case 'html':
      return '#f97316';
    case 'html_editor':
      return '#fb7185';
    case 'transformer':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
};

const GROUPS: Array<{
  key: 'basic' | 'agents' | 'personal_agents';
  title: string;
  collapsible: boolean;
}> = [
  { key: 'basic', title: 'Basic nodes', collapsible: false },
  { key: 'agents', title: 'Built-in agents', collapsible: true },
  { key: 'personal_agents', title: 'Personal agents', collapsible: true },
];

function NodePalette({ onCreateNode, disabled, collapsed = false, onToggleCollapse }: NodePaletteProps) {
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedAgentGroups, setCollapsedAgentGroups] = useState<Record<AgentCategoryKey, boolean>>({
    basic: false,
    coding: true,
    analysis: true,
    creative: true,
  });
  const [personalAgents, setPersonalAgents] = useState<AgentPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);

  // Load personal agent presets on mount (favorites only)
  useEffect(() => {
    const loadPresets = async () => {
      setLoadingPresets(true);
      try {
        const response = await fetch('/api/agent-presets');
        if (response.ok) {
          const presets = await response.json();
          // Show only favorite agents
          const favoritePresets = presets.filter((p: AgentPreset) => p.is_favorite);
          setPersonalAgents(favoritePresets);
        }
      } catch (error) {
        console.error('Failed to load agent presets:', error);
      } finally {
        setLoadingPresets(false);
      }
    };

    loadPresets();
  }, []);

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
      basic: [],
      coding: [],
      analysis: [],
      creative: [],
    };
    filteredItems.forEach((item) => {
      if (item.category !== 'agents' || (item.agentType ?? 'built_in') !== 'built_in') return;
      const key = item.agentCategory ?? 'basic';
      if (base[key]) {
        base[key].push(item);
      }
    });
    return base;
  }, [filteredItems]);

  const groups = GROUPS.map((group) => {
    if (group.key === 'agents') {
      return {
        ...group,
        items: filteredItems.filter(
          (item) => (item.category ?? 'basic') === 'agents' && (item.agentType ?? 'built_in') === 'built_in',
        ),
      };
    }
    if (group.key === 'personal_agents') {
      return {
        ...group,
        items: filteredItems.filter(
          (item) => (item.category ?? 'basic') === 'agents' && (item.agentType ?? 'built_in') === 'personal',
        ),
      };
    }
    const items = filteredItems.filter((item) => (item.category ?? 'basic') === group.key);
    return { ...group, items };
  }).filter((group) => group.items.length > 0 || group.key === 'personal_agents');

  const handleDragStart = (event: DragEvent<HTMLElement>, item: NodePaletteItem) => {
    event.dataTransfer.setData('application/reactflow-node', item.slug);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item.slug);
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
      <div className="flex h-full w-12 flex-col rounded-lg bg-slate-800/90 backdrop-blur-sm border border-slate-600/50 shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 w-12 items-center justify-center rounded-t-lg bg-slate-800/90 backdrop-blur-sm border-b border-slate-600/50 text-slate-300 transition-all duration-200 hover:bg-slate-700/90 hover:text-white hover:border-slate-500 flex-shrink-0"
          title="Expand nodes palette"
        >
          ☰
        </button>
        
        {/* Basic nodes - no scroll */}
        <div className="flex-shrink-0 flex flex-col items-center py-1 gap-1 overflow-x-hidden">
          {filteredItems
            .filter(item => item.category !== 'agents')
            .map((item) => {
              const icon = item.icon || '⚙️';

              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => handleClick(item)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  className="relative flex items-center justify-center rounded-md border border-slate-600 bg-slate-700/50 text-xs text-white transition-all duration-200 hover:scale-105 hover:border-slate-500 hover:bg-slate-600/50 flex-shrink-0"
                  style={{
                    width: '32px',
                    height: '32px',
                  }}
                  title={item.title}
                  disabled={disabled}
                >
                  {icon}
                </button>
              );
            })}
        </div>

        {/* Separator */}
        {personalAgents.length > 0 && (
          <div className="flex-shrink-0 w-full border-t border-slate-600/50 my-1" />
        )}

        {/* Personal agents - with scroll */}
        {personalAgents.length > 0 && (
          <div className="flex-1 flex flex-col items-center py-1 gap-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {personalAgents.map((preset) => {
              const agentColor = (preset.node_template as any)?.ui?.color || '#8b5cf6';
              const agentSlug = `preset_${preset.preset_id}`;

              return (
                <button
                  key={preset.preset_id}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    void onCreateNode(preset.node_template, agentSlug);
                  }}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    if (disabled) return;
                    const nodeData = JSON.stringify(preset.node_template);
                    e.dataTransfer.setData('application/reactflow-node-copy', nodeData);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="relative flex items-center justify-center rounded-md border text-xs text-white transition-all duration-200 hover:scale-105 flex-shrink-0"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderColor: `${agentColor}60`,
                    backgroundColor: `${agentColor}20`,
                  }}
                  title={preset.title}
                  disabled={disabled}
                >
                  {preset.icon}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-slate-800 p-4 shadow">
      <header className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Node Store</h2>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 rounded transition bg-transparent border-0 p-0"
            style={{
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              boxShadow: 'none',
            }}
            title="Collapse panel"
          >
            ☰
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nodes..."
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-slate-400">Drag or click to add</p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1 text-sm">
        {groups.length === 0 && (
          <p className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-xs text-slate-400">
            Nothing found.
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
                  boxShadow: 'none',
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
                                boxShadow: 'none',
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
                              <div className="grid grid-cols-1 gap-2 bg-slate-900/80 px-3 pb-3 pt-2">
                                {agentBuckets[key].map((item) => renderItem(item))}
                              </div>
                            )}
                          </div>
                        );
                      })
                  ) : group.key === 'personal_agents' ? (
                    loadingPresets ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">
                        <div className="mb-2">⏳</div>
                        <div>Loading personal agents...</div>
                      </div>
                    ) : personalAgents.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400">
                        <div className="mb-2 text-slate-500">⭐</div>
                        <div>No favorite agents</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Open AI Settings and click "⭐ Save agent"
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {personalAgents.map((preset) => {
                          const agentColor = (preset.node_template as any)?.ui?.color || '#8b5cf6';
                          const agentSlug = `preset_${preset.preset_id}`;
                          
                          return (
                            <button
                              key={preset.preset_id}
                              type="button"
                              draggable={!disabled}
                              onDragStart={(e) => {
                                if (disabled) return;
                                // Using the same format as NodeSidebar for copying
                                const nodeData = JSON.stringify(preset.node_template);
                                e.dataTransfer.setData('application/reactflow-node-copy', nodeData);
                                e.dataTransfer.effectAllowed = 'copy';
                              }}
                              onClick={() => {
                                if (disabled) return;
                                // Creating a node from preset template
                                void onCreateNode(preset.node_template, agentSlug);
                              }}
                              className={`flex cursor-move items-start gap-3 rounded-lg p-3 transition h-20 w-full ${
                                disabled ? 'pointer-events-none opacity-40' : ''
                              }`}
                              style={{
                                border: `1px solid ${agentColor}40`,
                                backgroundColor: `${agentColor}10`,
                              }}
                              tabIndex={disabled ? -1 : 0}
                              disabled={disabled}
                            >
                              <div className="flex-1 min-w-0 flex flex-col justify-center h-full text-left">
                                <p className="font-semibold text-white text-sm truncate leading-tight mb-1">
                                  {preset.title}
                                </p>
                                <p className="text-xs opacity-70 line-clamp-2 overflow-hidden text-left leading-tight">
                                  {preset.description || 'Personal agent'}
                                </p>
                              </div>
                              <span className="text-xl flex-shrink-0 mt-1">{preset.icon}</span>
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {group.items.map((item) => renderItem(item))}
                    </div>
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
        : DEFAULT_TEXT_MARKDOWN_TEMPLATE,
    content_type: 'text/markdown',
  };
}

function renderPaletteItem(
  item: NodePaletteItem,
  disabled = false,
  handleClick?: (item: NodePaletteItem) => void,
  handleDragStart?: (event: DragEvent<HTMLElement>, item: NodePaletteItem) => void,
) {
  const onClick = handleClick ?? (() => {});
  const onDrag = handleDragStart ?? (() => {});
  return (
    <button
      key={item.slug}
      type="button"
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) return;
        onDrag(event, item);
      }}
      onClick={() => {
        if (disabled) return;
        onClick(item);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!disabled) {
            onClick(item);
          }
        }
      }}
      className={`flex cursor-move items-start gap-3 rounded-lg p-3 transition h-20 w-full border border-slate-600 bg-slate-700/30 hover:border-slate-500 hover:bg-slate-600/30 ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
      tabIndex={disabled ? -1 : 0}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full text-left">
        <p className="font-semibold text-white text-sm truncate leading-tight mb-1">{item.title}</p>
        <p className="text-xs opacity-70 line-clamp-2 overflow-hidden text-left leading-tight">
          {item.description}
        </p>
      </div>
      <span className="text-xl flex-shrink-0 mt-1">{item.icon}</span>
    </button>
  );
}
