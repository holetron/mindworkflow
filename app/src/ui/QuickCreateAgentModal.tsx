import { useState } from 'react';

interface QuickCreateAgentModalProps {
  onSave: (data: {
    title: string;
    description: string;
    tags: string;
    color: string;
    icon: string;
    provider: string;
    model: string;
  }, openAiSettings?: boolean) => void;
  onCancel: () => void;
  providerOptions: Array<{ id: string; name: string; defaultModel: string; models: string[] }>;
  existingAgent?: {
    preset_id: string;
    title: string;
    description?: string;
    tags?: string[];
    icon?: string;
    node_template?: {
      ai?: {
        provider?: string;
        model?: string;
      };
      ui?: {
        color?: string;
      };
    };
  };
}

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1',
  '#14b8a6', '#f97316', '#84cc16', '#a855f7',
  '#f43f5e', '#eab308', '#22c55e', '#d946ef',
  '#0ea5e9', '#f472b6', '#fb923c', '#fbbf24',
  '#a78bfa', '#c084fc', '#e879f9', '#f0abfc',
  '#38bdf8', '#34d399', '#fcd34d', '#fca5a5',
  '#818cf8', '#94a3b8', '#64748b', '#475569',
];

const PRESET_ICONS = [
  '🤖', '🎯', '💡', '🚀', '⚡', '🎨', '📊', '🔬',
  '🎭', '🎪', '🎬', '🎸', '🎮', '🏆', '💎', '🔮',
  '🌟', '⭐', '✨', '💫', '🌈', '🦄', '🐉', '🦋',
  '🧠', '🎓', '📚', '🔧', '⚙️', '🛠️', '🔨', '⚔️',
  '🎲', '🎰', '🎳', '🎱', '🎯', '🎪', '🎡', '🎢',
  '🎠', '🎟️', '🎫', '🎖️', '🏅', '🥇', '🥈', '🥉',
  '🏀', '⚽', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
  '🎿', '🛷', '🥌', '🏒', '🏑', '🏏', '🥍', '🏓',
];

export function QuickCreateAgentModal({ 
  onSave, 
  onCancel, 
  providerOptions,
  existingAgent 
}: QuickCreateAgentModalProps) {
  const [title, setTitle] = useState(existingAgent?.title || 'AI Agent');
  const [description, setDescription] = useState(existingAgent?.description || 'AI agent');
  const [tags, setTags] = useState(existingAgent?.tags?.join(', ') || '');
  const [color, setColor] = useState(existingAgent?.node_template?.ui?.color || '#8b5cf6');
  const [icon, setIcon] = useState(existingAgent?.icon || PRESET_ICONS[0]);
  const [customIcon, setCustomIcon] = useState('');
  const [provider, setProvider] = useState(existingAgent?.node_template?.ai?.provider || providerOptions[0]?.id || 'replicate');
  const [model, setModel] = useState(existingAgent?.node_template?.ai?.model || providerOptions[0]?.defaultModel || '');
  const [colorOpen, setColorOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const currentProvider = providerOptions.find(p => p.id === provider);
  const availableModels = currentProvider?.models || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Enter agent name');
      return;
    }

    // Just save the agent without opening AI settings
    onSave({
      title: title.trim(),
      description: description.trim(),
      tags: tags.trim(),
      color,
      icon: customIcon || icon,
      provider,
      model,
    }, false); // Pass false - don't open AI settings
  };

  const handleOpenAiSettings = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    
    if (!title.trim()) {
      alert('Enter agent name');
      return;
    }

    // Save the agent with flag to open AI settings
    onSave({
      title: title.trim(),
      description: description.trim(),
      tags: tags.trim(),
      color,
      icon: customIcon || icon,
      provider,
      model,
    }, true); // Pass true to open AI settings
  };

  const handleProviderChange = (newProvider: string) => {
    const providerData = providerOptions.find(p => p.id === newProvider);
    setProvider(newProvider);
    setModel(providerData?.defaultModel || '');
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
      onClick={onCancel}
    >
      <div 
        className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl"
        style={{ maxWidth: '800px', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="border-b border-slate-800">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div 
                className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl"
                style={{ 
                  background: `linear-gradient(135deg, ${color}30, ${color}10)`,
                  boxShadow: `0 0 20px ${color}20`
                }}
              >
                {customIcon || icon}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {existingAgent ? 'Edit agent' : 'New AI Agent'}
                </h2>
                <div className="text-xs text-slate-400 mt-0.5">
                  {existingAgent ? 'Edit agent parameters' : 'Create new agent'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[calc(85vh-200px)] overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              {/* Name and Short description in one line */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Node Name
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    placeholder="Enter name..."
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Short description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    placeholder="Short node description..."
                  />
                </div>
              </div>

              {/* Icon, Color, Tags, Provider and Model */}
              <div className="flex gap-4">
                {/* Icon Picker */}
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Icon
                  </label>
                  <div className="relative flex-shrink-0">
                    <div
                      onClick={() => setIconPickerOpen(!iconPickerOpen)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 transition cursor-pointer"
                      title="Select icon"
                    >
                      <span className="text-xl">{customIcon || icon}</span>
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    
                    {iconPickerOpen && (
                      <div 
                        className="absolute left-0 top-full mt-2 p-2.5 rounded-lg border border-slate-700 bg-slate-800 shadow-2xl z-50"
                        style={{ width: '295px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto overflow-x-hidden pr-2">
                          {PRESET_ICONS.map((emoji, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                setIcon(emoji);
                                setCustomIcon('');
                                setIconPickerOpen(false);
                              }}
                              className="rounded p-1 text-xl transition hover:bg-slate-700 cursor-pointer text-center"
                            >
                              {emoji}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Color
                  </label>
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setColorOpen(!colorOpen)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 transition"
                      title="Select color"
                    >
                      <div
                        className="w-6 h-6 rounded-full border-2 border-slate-600"
                        style={{ backgroundColor: color }}
                      />
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {colorOpen && (
                      <div 
                        className="absolute left-0 top-full mt-2 p-2.5 rounded-lg border border-slate-700 bg-slate-800 shadow-2xl z-50"
                        style={{ minWidth: '280px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-8 gap-1.5">
                          {COLOR_PALETTE.map((colorOption) => (
                            <button
                              key={colorOption}
                              type="button"
                              onClick={() => {
                                setColor(colorOption);
                                setColorOpen(false);
                              }}
                              className={`w-7 h-7 rounded-full transition-all hover:scale-110 ${
                                color === colorOption
                                  ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-800'
                                  : ''
                              }`}
                              style={{ backgroundColor: colorOption }}
                              title={colorOption}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1" style={{ marginLeft: '10px' }}>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                    placeholder="tag1, tag2, tag3"
                  />
                </div>
                
                {/* Provider (operator) */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  >
                    {providerOptions.map((providerOption) => (
                      <option key={providerOption.id} value={providerOption.id}>
                        {providerOption.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Model */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  >
                    {availableModels.map((modelOption) => (
                      <option key={modelOption} value={modelOption}>
                        {modelOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Prompt
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-32 rounded-md border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition"
                  placeholder="Enter prompt for agent..."
                  spellCheck={false}
                />
                <div className="text-xs text-slate-500 mt-1">
                  {description.length} characters
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t border-slate-800 px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Save Button - only show when editing existing agent */}
              {existingAgent && (
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition"
                  >
                    Save
                  </button>
                </div>
              )}
              
              <div className={`flex items-center gap-3 ${!existingAgent ? 'ml-auto' : ''}`}>
                {/* Save & Open AI Settings Button */}
                <button
                  type="button"
                  onClick={handleOpenAiSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition"
                >
                  ⚙️ Save and configure
                </button>
              </div>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
