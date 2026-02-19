import { useState, useEffect, useCallback } from 'react';
import type { ChatSettings } from '../types';
import { isGenerationModel } from '../types';

interface ContextTabProps {
  localSettings: ChatSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
}

export function ContextTab({ localSettings, setLocalSettings }: ContextTabProps) {
  const [contextPreview, setContextPreview] = useState('');
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState<string | null>(null);

  const loadContextPreview = useCallback(async () => {
    if (!localSettings.project_id) {
      setContextPreview('');
      setContextPreviewError('Project ID not specified. Select a project to view context.');
      return;
    }

    setContextPreviewLoading(true);
    setContextPreviewError(null);

    try {
      const response = await fetch('/api/chats/preview-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: localSettings.project_id,
          mode: localSettings.agent_mode || 'ask',
          context_level: localSettings.context_level ?? 2,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setContextPreview(data.preview || '');
    } catch (error) {
      console.error('[ChatSettings] Failed to load context preview:', error);
      setContextPreviewError('Failed to load context preview');
      setContextPreview('');
    } finally {
      setContextPreviewLoading(false);
    }
  }, [localSettings.project_id, localSettings.agent_mode, localSettings.context_level]);

  useEffect(() => {
    if (localSettings.project_id) {
      loadContextPreview();
    }
  }, [localSettings.project_id, loadContextPreview, localSettings.context_level]);

  return (
    <div className="space-y-6">
      {/* Context Level Settings */}
      <div className="bg-slate-900 p-4 rounded border border-slate-700">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Context Level</h4>
        <p className="text-xs text-slate-400 mb-3">
          Detail level of project node information for AI
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Context Level (0=none, 1=description, 2=compact, 3=text, 4=json, 5=full json)
            </label>
            <select
              value={localSettings.context_level ?? 2}
              onChange={(e) => {
                const newLevel = Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5;
                setLocalSettings(prev => ({ ...prev, context_level: newLevel }));
              }}
              className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value={0}>0 - No context</option>
              <option value={1}>1 - Project description only</option>
              {!isGenerationModel(localSettings.model) && (
                <>
                  <option value={2}>2 - Clean (compact text)</option>
                  <option value={3}>3 - Simple (extended text)</option>
                  <option value={4}>4 - JSON simplified</option>
                  <option value={5}>5 - JSON full (all data)</option>
                </>
              )}
            </select>
            {isGenerationModel(localSettings.selected_model) && (
              <p className="text-xs text-amber-400 mt-2">
                For generation models (photo/video) only levels 0 and 1 are available
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Context Preview */}
      <div className="bg-slate-900 p-4 rounded border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-slate-300">Context for Agent</h4>
            <p className="text-xs text-slate-400 mt-1">
              Context is automatically updated when the display mode or content of incoming nodes changes.
            </p>
          </div>
          <button
            onClick={loadContextPreview}
            disabled={contextPreviewLoading || !localSettings.project_id}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {contextPreviewLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="bg-slate-900/50 border border-slate-700/50 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Context Preview</span>
            <span className="text-xs text-slate-400">
              <span className="font-mono">{contextPreview.length.toLocaleString()}</span> characters
            </span>
          </div>
          {contextPreviewError ? (
            <div className="bg-amber-900/20 border border-amber-700/50 rounded p-3 text-xs text-amber-300">
              {contextPreviewError}
            </div>
          ) : contextPreview ? (
            <div className="bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-96 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {contextPreview}
            </div>
          ) : (
            <div className="bg-slate-900 p-4 rounded border border-dashed border-slate-700 text-xs text-slate-500 text-center">
              No context -- select a project or click "Refresh"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
