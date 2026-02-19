import type { UiSettings } from '../../state/api';
import { DEFAULT_UI_SETTINGS } from '../../constants/uiSettings';

interface WorkflowSettingsProps {
  workflowSettings: UiSettings;
  workflowSettingsLoading: boolean;
  workflowSettingsSaving: boolean;
  workflowSettingsError: string | null;
  workflowSettingsSuccess: string | null;
  onWorkflowMarkdownChange: (field: string, value: number | string) => void;
  onWorkflowFontScalingChange: (field: string, value: unknown) => void;
  onWorkflowSettingsSave: () => Promise<void>;
  onWorkflowSettingsReset: () => void;
  setWorkflowSettings: React.Dispatch<React.SetStateAction<UiSettings>>;
}

export function WorkflowSettings({
  workflowSettings,
  workflowSettingsLoading,
  workflowSettingsSaving,
  workflowSettingsError,
  workflowSettingsSuccess,
  onWorkflowMarkdownChange,
  onWorkflowFontScalingChange,
  onWorkflowSettingsSave,
  onWorkflowSettingsReset,
}: WorkflowSettingsProps) {
  return (
    <section className="space-y-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Глобальные настройки Workflow</h1>
          <p className="text-sm text-slate-400 mt-2">
            Эти настройки применяются ко всем новым проектам
          </p>
        </div>

        {workflowSettingsError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {workflowSettingsError}
          </div>
        )}

        {workflowSettingsSuccess && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {workflowSettingsSuccess}
          </div>
        )}

        {workflowSettingsLoading ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-slate-400">Загрузка настроек...</p>
          </div>
        ) : (
          <>
            {/* Markdown Preview Settings */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <h2 className="text-xl font-semibold">Настройки Markdown предпросмотра</h2>
              <p className="text-sm text-slate-400">
                Эти настройки применяются ко всем текстовым нодам с Markdown.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Интерлиньяж (line-height)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    value={workflowSettings.markdownPreview.lineHeight}
                    onChange={(e) => onWorkflowMarkdownChange('lineHeight', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Расстояние между строками (1.0 - 3.0)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Отступ между параграфами (em)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={workflowSettings.markdownPreview.paragraphSpacing}
                    onChange={(e) => onWorkflowMarkdownChange('paragraphSpacing', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Вертикальный отступ (0.0 - 2.0 em)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Отступ для &lt;br&gt; (em)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={workflowSettings.markdownPreview.breakSpacing}
                    onChange={(e) => onWorkflowMarkdownChange('breakSpacing', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Отступ после разрыва строки (0.0 - 1.0 em)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Padding блоков кода (Y, em)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.25"
                    value={workflowSettings.markdownPreview.codeBlockPaddingY}
                    onChange={(e) => onWorkflowMarkdownChange('codeBlockPaddingY', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Вертикальный отступ (0.0 - 2.0 em)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Padding блоков кода (X, em)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="3"
                    step="0.25"
                    value={workflowSettings.markdownPreview.codeBlockPaddingX}
                    onChange={(e) => onWorkflowMarkdownChange('codeBlockPaddingX', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Горизонтальный отступ (0.0 - 3.0 em)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Цвет фона
                  </label>
                  <input
                    type="color"
                    value={workflowSettings.markdownPreview.backgroundColor}
                    onChange={(e) => onWorkflowMarkdownChange('backgroundColor', e.target.value)}
                    className="w-full h-10 rounded border border-slate-700 bg-slate-900 cursor-pointer"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Фон блоков Markdown</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Цвет границ
                  </label>
                  <input
                    type="text"
                    value={workflowSettings.markdownPreview.borderColor}
                    onChange={(e) => onWorkflowMarkdownChange('borderColor', e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="rgba(148, 163, 184, 0.2)"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">CSS цвет границ (rgba, hex, и т.д.)</p>
                </div>
              </div>
            </div>

            {/* Font Scaling Settings */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
              <h2 className="text-xl font-semibold">Настройки масштабирования шрифта</h2>
              <p className="text-sm text-slate-400">
                Автоматическое изменение размера шрифта в зависимости от длины текста.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Базовый размер шрифта (px)
                  </label>
                  <input
                    type="number"
                    min="8"
                    max="24"
                    value={workflowSettings.textNodeFontScaling.baseFontSize}
                    onChange={(e) => onWorkflowFontScalingChange('baseFontSize', parseInt(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Минимальный размер шрифта (8-24px)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Множитель масштаба
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={workflowSettings.textNodeFontScaling.scaleMultiplier}
                    onChange={(e) => onWorkflowFontScalingChange('scaleMultiplier', parseFloat(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    disabled={workflowSettingsSaving}
                  />
                  <p className="text-xs text-slate-500 mt-1">Общий коэффициент увеличения (0.5 - 2.0)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Типы нод для применения
                </label>
                <div className="flex flex-wrap gap-2">
                  {['text', 'ai', 'ai_improved', 'sticky-note'].map((type) => (
                    <label key={type} className="flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-900 cursor-pointer hover:border-slate-600">
                      <input
                        type="checkbox"
                        checked={workflowSettings.textNodeFontScaling.targetNodeTypes.includes(type)}
                        onChange={(e) => {
                          const newTypes = e.target.checked
                            ? [...workflowSettings.textNodeFontScaling.targetNodeTypes, type]
                            : workflowSettings.textNodeFontScaling.targetNodeTypes.filter(t => t !== type);
                          onWorkflowFontScalingChange('targetNodeTypes', newTypes);
                        }}
                        className="rounded border-slate-600 text-primary focus:ring-primary focus:ring-offset-slate-900"
                        disabled={workflowSettingsSaving}
                      />
                      <span className="text-sm text-slate-300">{type}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">Выберите типы нод, к которым применяется автомасштабирование</p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onWorkflowSettingsReset}
                className="px-6 py-2 rounded-full border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100 transition"
                disabled={workflowSettingsSaving}
              >
                Сбросить
              </button>
              <button
                onClick={onWorkflowSettingsSave}
                disabled={workflowSettingsSaving}
                className="px-6 py-2 rounded-full bg-primary text-white hover:bg-primary/90 transition disabled:bg-slate-700 disabled:cursor-not-allowed"
              >
                {workflowSettingsSaving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
