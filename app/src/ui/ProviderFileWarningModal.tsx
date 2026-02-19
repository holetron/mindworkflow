import React from 'react';
import Modal from './Modal';

interface ProviderFileWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSwitchProvider: () => void;
  currentProvider: string;
  suggestedProvider: string;
  fileCount: number;
  fileTypes: string[];
}

export function ProviderFileWarningModal({
  isOpen,
  onClose,
  onContinue,
  onSwitchProvider,
  currentProvider,
  suggestedProvider,
  fileCount,
  fileTypes,
}: ProviderFileWarningModalProps) {
  const providerNames: Record<string, string> = {
    'openai_gpt': 'ChatGPT',
    'google_workspace': 'Google Gemini',
    'google_gemini': 'Google Gemini',
    'gemini': 'Google Gemini',
  };

  const currentProviderName = providerNames[currentProvider] || currentProvider;
  const suggestedProviderName = providerNames[suggestedProvider] || suggestedProvider;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚠️ Обнаружены файлы">
      <div className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-amber-400 font-medium mb-2">
            Внимание: Файлы не будут обработаны
          </h3>
          <p className="text-white/80 text-sm">
            Выбранный провайдер <strong>{currentProviderName}</strong> не поддерживает обработку файлов.
            Обнаружено файлов: <strong>{fileCount}</strong>
          </p>
          
          {fileTypes.length > 0 && (
            <div className="mt-2">
              <p className="text-white/60 text-xs">Типы файлов:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {fileTypes.map((type, index) => (
                  <span 
                    key={index}
                    className="px-2 py-1 bg-white/10 rounded text-xs text-white/70"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <h4 className="text-green-400 font-medium mb-2">
            💡 Рекомендация
          </h4>
          <p className="text-white/80 text-sm">
            Для обработки файлов рекомендуется использовать <strong>{suggestedProviderName}</strong> - 
            он поддерживает нативную обработку изображений, PDF и документов.
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm transition-colors"
          >
            Продолжить без файлов
          </button>
          <button
            onClick={onSwitchProvider}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
          >
            Заменить на {suggestedProviderName}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  );
}