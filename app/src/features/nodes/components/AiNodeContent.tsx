/**
 * AiNodeContent - Renders the AI node content area with textarea, control panel, and settings panels.
 * Extracted from FlowNodeCard.tsx lines ~5716-6097.
 */
import React from 'react';
import type { FlowNode, AiProviderOption } from './nodeTypes';
import type { PromptPreset } from '../../../state/api';

interface AiNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  collapsed: boolean;
  contentValue: string;
  contentInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  handleContentChange: (content: string) => void;
  startContentEditing: (source?: any) => void;
  finishContentEditing: () => void;
  contentFontSizeStyle?: string;
  // AI-specific props
  pendingModelSelection: string | null;
  inlineModelValue: string;
  handleInlineModelChange: (model: string) => Promise<void>;
  providerModelOptions: string[];
  selectedProvider: AiProviderOption | null;
  forceRender: number;
  isSyncingProvider: boolean;
  syncProviderWithServer: () => Promise<void>;
  setActiveAiModalTab: (tab: any) => void;
  setShowAiSettingsModal: (show: boolean) => void;
  currentProviderLabel: string;
  outputType: 'mindmap' | 'node' | 'folder';
  handleOutputTypeChange: (type: 'mindmap' | 'node' | 'folder') => void;
  currentProvider: string;
  flushContent: () => Promise<boolean>;
  onRun: (nodeId: string) => void;
  activeAiTab: string;
  setActiveAiTab: (tab: string) => void;
  // Settings panel props
  systemPromptValue: string;
  handleSystemPromptChange: (value: string) => void;
  quickSystemPrompts: PromptPreset[];
  promptSearchTerm: string;
  setPromptSearchTerm: (term: string) => void;
  promptSearchResults: PromptPreset[];
  setPromptSearchResults: (results: PromptPreset[]) => void;
  promptSearchLoading: boolean;
  promptSearchError: string | null;
  setPromptSearchError: (error: string | null) => void;
  placeholderInfo: Array<{ name: string; resolvedValue?: string; reference?: string }>;
  placeholderInputs: Record<string, string>;
  handlePlaceholderInputChange: (name: string, value: string) => void;
  // Provider panel props
  providers: AiProviderOption[];
  handleProviderChange: (providerId: string) => void;
  hasFileInputs: boolean;
  getFileTypes: () => string[];
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  autoRenameFromSource: (source: string | undefined | null) => void;
  [key: string]: any;
}

export function AiNodeContent(props: AiNodeContentProps) {
  const {
    node, disabled, collapsed, contentValue, contentInputRef,
    handleContentChange, startContentEditing, finishContentEditing, contentFontSizeStyle,
    pendingModelSelection, inlineModelValue, handleInlineModelChange,
    providerModelOptions, selectedProvider, forceRender, isSyncingProvider,
    syncProviderWithServer, setActiveAiModalTab, setShowAiSettingsModal,
    currentProviderLabel, outputType, handleOutputTypeChange, currentProvider,
    flushContent, onRun, activeAiTab, setActiveAiTab,
    systemPromptValue, handleSystemPromptChange, quickSystemPrompts,
    promptSearchTerm, setPromptSearchTerm, promptSearchResults, setPromptSearchResults,
    promptSearchLoading, promptSearchError, setPromptSearchError,
    placeholderInfo, placeholderInputs, handlePlaceholderInputChange,
    providers, handleProviderChange, hasFileInputs, getFileTypes, onChangeAi,
  } = props;

  const isMidjourneyProvider = currentProvider === 'midjourney_proxy' || currentProvider === 'midjourney_mindworkflow_relay' || currentProvider === 'midjourney';

  return (
    <>
      {/* Main Input Area */}
      {!collapsed && (
        <div className="flex-1 min-h-0">
          <textarea
            ref={contentInputRef}
            value={contentValue}
            onChange={(e) => handleContentChange(e.target.value)}
            onFocus={(event) => { event.stopPropagation(); startContentEditing(event.currentTarget); }}
            onBlur={(event) => { event.stopPropagation(); finishContentEditing(); }}
            placeholder="Enter your prompt for the agent..."
            disabled={disabled}
            className="w-full h-full p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            draggable={false}
            data-nodrag="true"
            style={{ minHeight: '80px', resize: 'none', fontSize: contentFontSizeStyle ?? '13px', lineHeight: '1.4' }}
          />
        </div>
      )}

      {/* Control Panel */}
      <div className="mt-2" style={{ marginTop: '10px', flexShrink: 0 }}>
        <div className="flex items-center justify-end w-full">
          <select
            value={pendingModelSelection ?? inlineModelValue}
            onChange={(e) => { void handleInlineModelChange(e.target.value); }}
            disabled={disabled || providerModelOptions.length === 0}
            className="flex-1 min-w-[150px] max-w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition nodrag"
            title={selectedProvider ? `Model (${selectedProvider.name})` : 'Select operator in settings'}
            data-nodrag="true"
            key={`model-${forceRender}`}
            style={{ marginRight: '8px' }}
          >
            {providerModelOptions.length === 0 ? (
              <option value="" disabled>No available models</option>
            ) : (
              providerModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={async () => { await syncProviderWithServer(); setActiveAiModalTab('ai_config'); setShowAiSettingsModal(true); }}
            className="w-7 h-7 rounded border transition flex items-center justify-center bg-black/20 border-white/10 text-white/70 hover:bg-black/30 hover:text-white"
            title={isSyncingProvider ? 'Syncing\u2026' : `AI Settings (operator: ${currentProviderLabel})`}
            disabled={disabled || isSyncingProvider}
            style={{ marginRight: '8px' }}
          >
            {isSyncingProvider ? '\u23F3' : '\u2699\uFE0F'}
          </button>
          <select
            value={outputType}
            onChange={(e) => {
              const value = e.target.value as 'mindmap' | 'node' | 'folder';
              if (isMidjourneyProvider && value === 'mindmap') {
                handleOutputTypeChange('node');
              } else {
                handleOutputTypeChange(value);
              }
            }}
            className="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-300 hover:text-white hover:bg-slate-600 transition"
            title="Output type"
            disabled={disabled}
            style={{ marginRight: '5px' }}
          >
            {!isMidjourneyProvider && <option value="mindmap">Mindmap</option>}
            <option value="node">Node</option>
            <option value="folder">Folder</option>
          </select>
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault(); e.stopPropagation();
              const committed = await flushContent();
              if (!committed) return;
              await syncProviderWithServer();
              onRun(node.node_id);
            }}
            className="px-3 py-1.5 text-xs rounded border border-green-500/50 bg-green-600/20 text-green-300 hover:bg-green-600/30 transition"
            title={isSyncingProvider ? 'Syncing...' : 'Run generation'}
            disabled={disabled || isSyncingProvider}
          >
            {isSyncingProvider ? '\u23F3' : '\u25B6\uFE0F'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {activeAiTab === 'settings' && (
        <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
          <div>
            <label className="text-xs text-white/70 block mb-2">System Prompt</label>
            <div className="flex flex-wrap items-start gap-2 mb-2">
              <div className="flex flex-wrap gap-2">
                {quickSystemPrompts.map((preset) => (
                  <button
                    key={preset.preset_id}
                    type="button"
                    onClick={() => { handleSystemPromptChange(preset.content); setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); }}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="px-2 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                    disabled={disabled}
                    title={preset.description ?? undefined}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="search"
                  value={promptSearchTerm}
                  onChange={(event) => setPromptSearchTerm(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Escape') { setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); } }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Search prompt library..."
                  disabled={disabled}
                />
                {promptSearchTerm.trim().length >= 2 && (
                  <div className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-lg">
                    {promptSearchLoading && <div className="px-3 py-2 text-xs text-slate-400">Searching\u2026</div>}
                    {promptSearchError && !promptSearchLoading && <div className="px-3 py-2 text-xs text-rose-400">{promptSearchError}</div>}
                    {!promptSearchLoading && !promptSearchError && promptSearchResults.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">Nothing found</div>}
                    {!promptSearchLoading && promptSearchResults.map((preset) => (
                      <button
                        key={preset.preset_id}
                        type="button"
                        className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-700/60"
                        onClick={() => { handleSystemPromptChange(preset.content); setPromptSearchTerm(''); setPromptSearchResults([]); setPromptSearchError(null); }}
                        disabled={disabled}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <span className="text-xs font-medium text-slate-200">{preset.label}</span>
                        {preset.description && <span className="text-[11px] text-slate-400">{preset.description}</span>}
                        {preset.tags.length > 0 && <span className="text-[10px] uppercase tracking-wide text-slate-500">{preset.tags.join(' \u2022 ')}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea
              value={systemPromptValue}
              onChange={(e) => handleSystemPromptChange(e.target.value)}
              placeholder="E.g.: You are a helpful assistant."
              disabled={disabled}
              className="w-full p-3 bg-black/20 border border-white/10 rounded text-sm resize-none nodrag"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              draggable={false}
              data-nodrag="true"
              rows={4}
              style={{ minHeight: '80px', resize: 'none', fontSize: '13px', lineHeight: '1.4' }}
            />
            {placeholderInfo.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-semibold text-white/70">Prompt Variables</div>
                <div className="text-[11px] text-white/40">Fill in values manually or specify a node identifier.</div>
                {placeholderInfo.map((placeholder) => {
                  const currentVal = placeholderInputs[placeholder.name] ?? '';
                  const preview = placeholder.resolvedValue ?? placeholder.reference ?? '';
                  const previewText = preview.length > 80 ? `${preview.slice(0, 77)}\u2026` : preview;
                  return (
                    <div key={placeholder.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white/80">{placeholder.name}</span>
                        {preview && <span className="text-[11px] text-white/40">Auto: {previewText}</span>}
                      </div>
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(event) => handlePlaceholderInputChange(placeholder.name, event.target.value)}
                        placeholder={preview ? `Auto: ${previewText}` : 'Enter value or node_id'}
                        className="w-full rounded border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white/80 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        data-nodrag="true"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Config Panel */}
      {activeAiTab === 'ai_config' && (
        <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
          <div>
            <label className="text-xs text-white/70 block mb-2">Provider</label>
            <select
              value={String(node.ai?.provider || '')}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={disabled}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-sm nodrag"
              data-nodrag="true"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.name}{p.supportsFiles ? ' \u{1F5C2}\uFE0F' : ''}{!p.available ? ` (${p.reason || 'Unavailable'})` : ''}{hasFileInputs && !p.supportsFiles ? ' \u26A0\uFE0F Files not supported' : ''}
                </option>
              ))}
            </select>
            {hasFileInputs && selectedProvider && !selectedProvider.supportsFiles && (
              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
                {'\u26A0\uFE0F'} Current provider does not support files. Detected inputs: {getFileTypes().join(', ')}
              </div>
            )}
          </div>
          {selectedProvider && (
            <div>
              <label className="text-xs text-white/70 block mb-2">Model</label>
              <button
                onClick={() => setActiveAiTab('ai_config')}
                disabled={disabled}
                className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag text-left hover:bg-black/40 hover:border-white/20 transition-colors flex items-center justify-between group"
                data-nodrag="true"
                title="Click to change model"
              >
                <span className="text-white/80 truncate">{String(node.ai?.model || selectedProvider.defaultModel || 'Not selected')}</span>
                <span className="text-white/40 group-hover:text-white/60 transition-colors">{'\u2699\uFE0F'}</span>
              </button>
              <div className="text-xs text-white/50 mt-1">Click to change model</div>
            </div>
          )}
          <div>
            <label className="text-xs text-white/70 block mb-2">Temperature</label>
            <input
              type="number"
              min="0" max="2" step="0.1"
              value={Number(node.ai?.temperature) || 0.7}
              onChange={(e) => {
                const temp = parseFloat(e.target.value) || 0.7;
                onChangeAi?.(node.node_id, { ...node.ai, temperature: temp });
              }}
              disabled={disabled}
              className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
              data-nodrag="true"
            />
            <div className="text-xs text-white/50 mt-1">From 0 (strict) to 2 (creative)</div>
          </div>
          {selectedProvider?.inputFields && selectedProvider.inputFields.length > 0 && (
            <div>
              <label className="text-xs text-white/70 block mb-2">Provider Settings</label>
              {selectedProvider.inputFields.map((field: any) => (
                <div key={field.id} className="mb-2">
                  <label className="text-xs text-white/70 block mb-1">{field.label}</label>
                  <input
                    type="text"
                    value={(node.ai as any)?.[field.key] || ''}
                    onChange={(e) => { onChangeAi?.(node.node_id, { ...node.ai, [field.key]: e.target.value }); }}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    className="w-full p-2 bg-black/30 border border-white/10 rounded text-sm nodrag"
                    data-nodrag="true"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Routing Panel */}
      {activeAiTab === 'routing' && (
        <div className="mt-2 bg-black/20 border border-white/10 rounded p-3 space-y-3" style={{ flexShrink: 0 }}>
          <div className="text-xs text-white/70">
            <div className="mb-2">Output routing settings:</div>
            <div className="text-white/50 text-[10px]">
              Here you can configure input and output data types, number of I/O ports and processing rules.
            </div>
          </div>
          <div className="p-2 bg-black/20 border border-white/5 rounded text-xs text-white/50 text-center">
            Routing configuration will be added in future versions
          </div>
        </div>
      )}
    </>
  );
}
