import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchWorkflowUiSettings, updateWorkflowUiSettings, type UiSettings } from '../state/api';
import { DEFAULT_UI_SETTINGS } from '../constants/uiSettings';

export function WorkflowSettingsPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const [settings, setSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    
    loadSettings();
  }, [projectId]);

  const loadSettings = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWorkflowUiSettings(projectId);
      setSettings(data);
    } catch (err) {
      console.error('Failed to load workflow settings:', err);
      setError('Failed to load settings');
      setSettings(DEFAULT_UI_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      await updateWorkflowUiSettings(projectId, settings);
      setSuccessMessage('Settings saved');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkdownChange = (field: keyof typeof settings.markdownPreview, value: number | string) => {
    setSettings({
      ...settings,
      markdownPreview: {
        ...settings.markdownPreview,
        [field]: value
      }
    });
  };

  const handleFontScalingChange = (field: keyof typeof settings.textNodeFontScaling, value: any) => {
    setSettings({
      ...settings,
      textNodeFontScaling: {
        ...settings.textNodeFontScaling,
        [field]: value
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-slate-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Settings Workflow</h1>
          <p className="text-sm text-slate-400 mt-2">
            Project: {projectId ?? 'unknown'}
          </p>
        </div>

        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}

        {/* Markdown Preview Settings */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Markdown Preview Settings</h2>
          <p className="text-sm text-slate-400">
            These settings apply to all text nodes with Markdown in this project.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Line height
              </label>
              <input
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={settings.markdownPreview.lineHeight}
                onChange={(e) => handleMarkdownChange('lineHeight', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Line spacing (1.0 - 3.0)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Paragraph spacing (em)
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.markdownPreview.paragraphSpacing}
                onChange={(e) => handleMarkdownChange('paragraphSpacing', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Vertical spacing (0.0 - 2.0 em)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Break spacing (em)
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={settings.markdownPreview.breakSpacing}
                onChange={(e) => handleMarkdownChange('breakSpacing', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Spacing after line break (0.0 - 1.0 em)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Code block padding (Y, em)
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.25"
                value={settings.markdownPreview.codeBlockPaddingY}
                onChange={(e) => handleMarkdownChange('codeBlockPaddingY', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Vertical spacing (0.0 - 2.0 em)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Code block padding (X, em)
              </label>
              <input
                type="number"
                min="0"
                max="3"
                step="0.25"
                value={settings.markdownPreview.codeBlockPaddingX}
                onChange={(e) => handleMarkdownChange('codeBlockPaddingX', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Horizontal spacing (0.0 - 3.0 em)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Background color
              </label>
              <input
                type="color"
                value={settings.markdownPreview.backgroundColor}
                onChange={(e) => handleMarkdownChange('backgroundColor', e.target.value)}
                className="w-full h-10 rounded border border-slate-700 bg-slate-900 cursor-pointer"
              />
              <p className="text-xs text-slate-500 mt-1">Markdown block background</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Border color
              </label>
              <input
                type="text"
                value={settings.markdownPreview.borderColor}
                onChange={(e) => handleMarkdownChange('borderColor', e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                placeholder="rgba(148, 163, 184, 0.2)"
              />
              <p className="text-xs text-slate-500 mt-1">CSS border color (rgba, hex, etc.)</p>
            </div>
          </div>
        </div>

        {/* Font Scaling Settings */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Font Scaling Settings</h2>
          <p className="text-sm text-slate-400">
            Automatic font size adjustment based on text length.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Base font size (px)
              </label>
              <input
                type="number"
                min="8"
                max="24"
                value={settings.textNodeFontScaling.baseFontSize}
                onChange={(e) => handleFontScalingChange('baseFontSize', parseInt(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Minimum font size (8-24px)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Scale multiplier
              </label>
              <input
                type="number"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.textNodeFontScaling.scaleMultiplier}
                onChange={(e) => handleFontScalingChange('scaleMultiplier', parseFloat(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Overall scale factor (0.5 - 2.0)</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Node types to apply
            </label>
            <div className="flex flex-wrap gap-2">
              {['text', 'ai', 'ai_improved', 'sticky-note'].map((type) => (
                <label key={type} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-600">
                  <input
                    type="checkbox"
                    checked={settings.textNodeFontScaling.targetNodeTypes.includes(type)}
                    onChange={(e) => {
                      const newTypes = e.target.checked
                        ? [...settings.textNodeFontScaling.targetNodeTypes, type]
                        : settings.textNodeFontScaling.targetNodeTypes.filter(t => t !== type);
                      handleFontScalingChange('targetNodeTypes', newTypes);
                    }}
                    className="rounded border-slate-600 text-primary focus:ring-primary focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-300">{type}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Select node types to which auto-scaling applies</p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setSettings(DEFAULT_UI_SETTINGS)}
            className="px-6 py-2 rounded-full border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100 transition"
            disabled={saving}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 rounded-full bg-primary text-white hover:bg-primary/90 transition disabled:bg-slate-700 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
