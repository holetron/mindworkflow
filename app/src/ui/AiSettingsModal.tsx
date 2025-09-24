import { useState } from 'react';
import Modal from './Modal';
import { useConfirmDialog } from './ConfirmDialog';
import type { FlowNode } from '../state/api';

interface AiProviderOption {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  available: boolean;
  reason?: string;
}

interface AiSettingsModalProps {
  node: FlowNode;
  onClose: () => void;
  activeTab: 'settings' | 'ai_config' | 'routing';
  onTabChange: (tab: 'settings' | 'ai_config' | 'routing') => void;
  onChangeAi?: (nodeId: string, ai: Record<string, unknown>, options?: { replace?: boolean }) => void;
  onUpdateNodeMeta?: (nodeId: string, patch: Record<string, unknown>) => void;
  providers?: AiProviderOption[];
  loading?: boolean;
}

export function AiSettingsModal({ 
  node, 
  onClose, 
  activeTab, 
  onTabChange, 
  onChangeAi, 
  onUpdateNodeMeta,
  providers = [],
  loading = false 
}: AiSettingsModalProps) {
  const [systemPromptValue, setSystemPromptValue] = useState(String(node.ai?.system_prompt || ''));
  const [outputExampleValue, setOutputExampleValue] = useState(String(node.ai?.output_example || ''));
  const [outputType, setOutputType] = useState<'mindmap' | 'node' | 'folder'>((node.meta?.output_type as any) || 'node');
  const [hasChanges, setHasChanges] = useState(false);

  // Confirm dialog hook
  const { showConfirm, ConfirmDialog } = useConfirmDialog();

  const selectedProvider = providers.find(p => p.id === node.ai?.provider);

  const handleSave = () => {
    if (onChangeAi && hasChanges) {
      onChangeAi(node.node_id, {
        ...node.ai,
        system_prompt: systemPromptValue,
        output_example: outputExampleValue,
      });
      setHasChanges(false);
    }
  };

  const handleClose = async () => {
    if (hasChanges) {
      const confirmed = await showConfirm({
        title: 'Есть несохраненные изменения',
        message: 'У вас есть несохраненные изменения в настройках AI. Хотите сохранить их перед закрытием?',
        confirmText: 'Сохранить',
        cancelText: 'Не сохранять',
        type: 'warning'
      });
      
      if (confirmed) {
        handleSave();
      }
    }
    onClose();
  };

  const updateSystemPrompt = (value: string) => {
    setSystemPromptValue(value);
    setHasChanges(true);
  };

  const updateOutputExample = (value: string) => {
    setOutputExampleValue(value);
    setHasChanges(true);
  };

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider && onChangeAi) {
      const newAiConfig = { 
        ...node.ai, 
        provider: providerId, 
        model: provider.defaultModel 
      };
      onChangeAi(node.node_id, newAiConfig);
    }
  };

  const handleModelChange = (model: string) => {
    if (onChangeAi) {
      const newAiConfig = { ...node.ai, model };
      onChangeAi(node.node_id, newAiConfig);
    }
  };

  const handleTemperatureChange = (temperature: number) => {
    if (onChangeAi) {
      const newAiConfig = { ...node.ai, temperature };
      onChangeAi(node.node_id, newAiConfig);
    }
  };

  const handleSavePreset = () => {
    const preset = {
      provider: node.ai?.provider,
      model: node.ai?.model,
      temperature: node.ai?.temperature || 0.7,
      system_prompt: systemPromptValue,
      output_example: outputExampleValue,
      output_type: outputType
    };
    
    // Сохраняем пресет в localStorage
    const savedPresets = JSON.parse(localStorage.getItem('ai_presets') || '[]');
    const presetName = `Preset_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    savedPresets.push({ name: presetName, ...preset });
    localStorage.setItem('ai_presets', JSON.stringify(savedPresets));
    
    // Уведомляем пользователя
    alert(`Пресет сохранен как "${presetName}"`);
  };

  const handleOutputTypeChange = (type: 'mindmap' | 'node' | 'folder') => {
    setOutputType(type);
    if (onUpdateNodeMeta) {
      onUpdateNodeMeta(node.node_id, { output_type: type });
    }
  };

  const OutputExampleSection = () => (
    <div className="border-t border-slate-600 pt-4">
      <label className="block text-sm font-medium text-slate-300 mb-2">Пример выходных данных</label>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => {
            const exampleFormat = JSON.stringify({
              nodes: [
                {
                  type: "text",
                  title: "1. Подготовка к ремонту",
                  content: "Определение бюджета, создание плана работ и списка необходимых материалов",
                  children: [
                    {
                      type: "ai",
                      title: "1.1. Расчет бюджета",
                      content: "AI-агент для расчета стоимости материалов и работ",
                      ai: {
                        system_prompt: "Рассчитай примерный бюджет для ремонта санузла",
                        model: "gpt-4",
                        temperature: 0.7
                      }
                    },
                    {
                      type: "text",
                      title: "1.2. План работ",
                      content: "Последовательность выполнения ремонтных работ"
                    }
                  ]
                },
                {
                  type: "ai_improved", 
                  title: "2. Список покупок",
                  content: "AI-агент для создания детального списка покупок",
                  ai: {
                    system_prompt: "Создай подробный список покупок с брендами и моделями",
                    model: "gpt-4",
                    temperature: 0.5
                  },
                  children: [
                    {
                      type: "json",
                      title: "2.1. Структурированный список",
                      content: "Список в JSON формате для удобства"
                    }
                  ]
                },
                {
                  type: "markdown",
                  title: "3. Отчет по проекту",
                  content: "# План ремонта санузла\\n\\n## Основные этапы\\n\\n1. Демонтаж\\n2. Черновые работы\\n3. Чистовая отделка"
                }
              ]
            }, null, 2);
            updateOutputExample(exampleFormat);
          }}
          className="px-3 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
          disabled={loading}
        >
          Пример
        </button>
      </div>
      <textarea
        className="w-full h-32 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
        value={outputExampleValue}
        onChange={(e) => updateOutputExample(e.target.value)}
        placeholder='Например: {"nodes": [{"type": "text", "title": "...", "content": "..."}]}'
        disabled={loading}
      />
    </div>
  );

  return (
    <Modal
      title={`AI настройки: ${node.title}`}
      onClose={handleClose}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            onClick={handleClose}
          >
            Закрыть
          </button>
          {hasChanges && (
            <button
              type="button"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              onClick={handleSave}
              disabled={loading}
            >
              Сохранить изменения
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-6 max-h-[70vh] overflow-y-auto">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700">
          <button
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onTabChange('settings')}
          >
            ⚙️ Настройки
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === 'ai_config'
                ? 'border-b-2 border-purple-500 text-purple-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onTabChange('ai_config')}
          >
            🧠 Конфигурация ИИ
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === 'routing'
                ? 'border-b-2 border-green-500 text-green-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onTabChange('routing')}
          >
            🔀 Роутинг
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Системный промпт</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    const plannerPrompt = `Ты - агент-планировщик workflow. Твоя задача создавать структурированные планы в виде множественных нод.

ДОСТУПНЫЕ ТИПЫ НОД:
• text - Текстовый контент, заметки, описания
• ai - AI-агент для генерации контента (используй для задач требующих ИИ)
• ai_improved - Улучшенный AI-агент с расширенными возможностями
• image - Изображения, картинки, визуализации
• video - Видео контент, демонстрации
• audio - Аудио контент, подкасты, записи
• html - HTML страницы, веб-контент
• json - Структурированные данные в JSON формате
• markdown - Документы в формате Markdown
• file - Файлы, документы, ресурсы
• python - Python код, скрипты, вычисления
• router - Условная логика, маршрутизация между нодами

ПРАВИЛА СОЗДАНИЯ НОД:
1. Всегда указывай type и title (обязательно!)
2. Добавляй content с описанием того, что должна делать нода
3. Для AI-нод добавляй ai конфигурацию с system_prompt
4. Создавай логическую последовательность - от постановки задачи к результату
5. Используй разные типы нод для разнообразия workflow

ФОРМАТ ОТВЕТА (строго JSON):
{
  "nodes": [
    {
      "type": "тип_ноды",
      "title": "Название ноды",
      "content": "Описание задачи ноды",
      "ai": {
        "system_prompt": "Инструкции для ИИ",
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  ]
}

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ТИПОВ:
- text: для описаний, планов, заметок
- ai: для генерации контента, анализа, обработки
- python: для вычислений, обработки данных
- image: для создания диаграмм, схем
- markdown: для отчетов, документации
- json: для структурированных результатов

Создавай практичные и полезные workflow!`;
                    updateSystemPrompt(plannerPrompt);
                  }}
                  className="px-3 py-1 text-xs bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition"
                  disabled={loading}
                >
                  Планировщик
                </button>
              </div>
              <textarea
                className="w-full h-48 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical font-mono text-sm"
                value={systemPromptValue}
                onChange={(e) => updateSystemPrompt(e.target.value)}
                placeholder="Введите системный промпт для AI..."
                disabled={loading}
              />
            </div>
            
            {/* Output Example Section */}
            <OutputExampleSection />
            
            {/* Output Type and Preset Controls */}
            <div className="border-t border-slate-700 pt-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Тип вывода</label>
                  <select
                    value={outputType}
                    onChange={(e) => handleOutputTypeChange(e.target.value as 'mindmap' | 'node' | 'folder')}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={loading}
                  >
                    <option value="mindmap">Mindmap</option>
                    <option value="node">Node</option>
                    <option value="folder">Folder</option>
                  </select>
                  <div className="text-xs text-slate-400 mt-1">
                    Определяет как агент будет выводить результаты
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="px-4 py-2 bg-blue-600/20 border border-blue-500/50 text-blue-300 hover:bg-blue-600/30 rounded transition flex items-center gap-2"
                  disabled={loading}
                >
                  💾 Сохранить пресет
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai_config' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-medium text-slate-300">Конфигурация ИИ</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Провайдер
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    value={String(node.ai?.provider || '')}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    disabled={loading}
                  >
                    <option value="" disabled>Выберите провайдера</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.name} {!p.available && `(${p.reason || 'Недоступен'})`}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProvider && (
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Модель
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      value={String(node.ai?.model || selectedProvider.defaultModel)}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={loading}
                    >
                      {selectedProvider.models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Температура
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    value={Number(node.ai?.temperature || 0.7)}
                    onChange={(e) => handleTemperatureChange(parseFloat(e.target.value) || 0.7)}
                    disabled={loading}
                  />
                  <div className="text-xs text-slate-400 mt-1">От 0 (строго) до 2 (креативно). По умолчанию: 0.7</div>
                </div>
                
                {/* Дополнительная информация */}
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Текущая конфигурация</h4>
                  <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs font-mono">
                    <div className="space-y-1 text-slate-300">
                      <div><span className="text-slate-400">Провайдер:</span> {String(node.ai?.provider || 'Не задан')}</div>
                      <div><span className="text-slate-400">Модель:</span> {String(node.ai?.model || 'Не задана')}</div>
                      <div><span className="text-slate-400">Температура:</span> {String(node.ai?.temperature || 0.7)}</div>
                      <div><span className="text-slate-400">Доступны провайдеры:</span> {providers.filter(p => p.available).length}/{providers.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Output Example Section */}
            <OutputExampleSection />
          </div>
        )}

        {activeTab === 'routing' && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-medium text-slate-300">Конфигурация роутинга</h3>
              <div className="space-y-4">
                <div className="text-slate-400 text-sm">
                  <p className="mb-2">Настройки роутинга определяют как данные поступают и выходят из ноды.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-3 rounded border border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Входные порты</h4>
                    <div className="text-xs text-slate-400">
                      Количество: {(node.routing as any)?.inputPorts?.length || 0}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Определяют откуда нода получает данные
                    </div>
                  </div>
                  
                  <div className="bg-slate-900 p-3 rounded border border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">Выходные порты</h4>
                    <div className="text-xs text-slate-400">
                      Количество: {(node.routing as any)?.outputPorts?.length || 0}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Определяют куда нода отправляет результаты
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Полная конфигурация роутинга</h4>
                  <div className="bg-slate-900 p-3 rounded border border-slate-700 overflow-auto max-h-60">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(node.routing || { message: "Роутинг не настроен" }, null, 2)}
                    </pre>
                  </div>
                </div>
                
                <div className="text-xs text-slate-500 p-3 bg-slate-900/50 border border-slate-700/50 rounded">
                  <strong className="text-slate-400">Справка:</strong> Роутинг настраивается автоматически при создании связей между нодами. 
                  В будущих версиях будет доступно ручное редактирование конфигурации роутинга.
                </div>
              </div>
            </div>
            
            {/* Output Example Section */}
            <OutputExampleSection />
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </Modal>
  );
}