/**
 * Model Information Modal Component
 * Displays comprehensive information about AI models
 */

import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';

interface ModelInputParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
  enum?: string[];
  min?: number;
  max?: number;
}

interface ModelInfo {
  name: string;
  description: string;
  version?: string;
  provider: string;
  limits: {
    context_tokens?: number;
    output_tokens?: number;
    rate_limit?: string;
  };
  inputs: ModelInputParameter[];
  file_format: 'url' | 'base64' | 'both';
  documentation_url?: string;
}

interface ModelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: 'replicate' | 'openai' | 'google' | 'anthropic';
  modelId: string;
  nodeId?: string; // Optional now since mapping removed
  currentMappings?: Record<string, string>; // Unused but kept for compatibility
  onSaveMappings?: (mappings: Record<string, string>) => void; // Unused but kept for compatibility
  inline?: boolean; // If true, render as inline content without Modal wrapper
  enabledPorts?: string[]; // List of enabled port IDs
  onTogglePort?: (portId: string, enabled: boolean, portInfo: ModelInputParameter) => void; // Callback for toggling ports with full port info
  invalidPortsWithEdges?: string[]; // ⚠️ Порты с подключениями, но невалидные для текущей модели (красная подсветка)
}

export function ModelInfoModal({
  isOpen,
  onClose,
  provider,
  modelId,
  nodeId,
  currentMappings,
  onSaveMappings,
  inline = false,
  enabledPorts = [],
  onTogglePort,
  invalidPortsWithEdges = [] // ⚠️ Невалидные порты с подключениями
}: ModelInfoModalProps) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchModelInfo();
    }
  }, [isOpen, provider, modelId]);

  const fetchModelInfo = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get auth token
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // ✅ Normalize provider ID to match backend expectations
      // 'openai_gpt' -> 'openai', 'google_workspace' -> 'google', etc.
      let normalizedProvider = provider;
      if (provider.includes('openai')) normalizedProvider = 'openai';
      else if (provider.includes('google')) normalizedProvider = 'google';
      else if (provider.includes('anthropic')) normalizedProvider = 'anthropic';
      
      // Use query parameter to avoid URL encoding issues with modelId containing slashes
      // For Replicate, add test API token
      let url = `/api/integrations/models/${normalizedProvider}/info?modelId=${encodeURIComponent(modelId)}`;
      if (normalizedProvider === 'replicate') {
        url += '&apiToken=r8_Uu6iTMDO39VM0upvBO3ogKsZG6lSJdQ2YCKQ4';
      }
      
      console.log(`📡 Fetching model info: ${normalizedProvider}/${modelId}`);
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`❌ Backend returned ${response.status}`);
        throw new Error('Failed to fetch model information');
      }
      
      const data = await response.json();
      console.log(`✅ Got model info:`, data);
      setModelInfo(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load model information');
      console.error('Error fetching model info:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div className={`max-w-4xl space-y-6 ${inline ? '' : 'max-h-[80vh] overflow-y-auto'}`}>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {modelInfo && (
        <>
          {/* Section 1: General Information */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2">
              Общая информация
            </h3>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400">Название:</span>
                  <span className="col-span-2 text-slate-200 font-medium">{modelInfo.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400">Провайдер:</span>
                  <span className="col-span-2 text-slate-200">{modelInfo.provider}</span>
                </div>
                {modelInfo.version && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-400">Версия:</span>
                    <span className="col-span-2 text-slate-200 font-mono text-xs">{modelInfo.version}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-400">Описание:</span>
                  <span className="col-span-2 text-slate-300">{modelInfo.description}</span>
                </div>
                {modelInfo.documentation_url && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-400">Документация:</span>
                    <span className="col-span-2">
                      <a
                        href={modelInfo.documentation_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-400 underline"
                      >
                        Открыть →
                      </a>
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Section 2: Limits */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2">
                Лимиты
              </h3>
              <div className="space-y-2 text-sm">
                {modelInfo.limits.context_tokens && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-400">Контекст:</span>
                    <span className="col-span-2 text-slate-200 font-medium">
                      {formatTokens(modelInfo.limits.context_tokens)} tokens
                    </span>
                  </div>
                )}
                {modelInfo.limits.output_tokens && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-400">Вывод:</span>
                    <span className="col-span-2 text-slate-200 font-medium">
                      {formatTokens(modelInfo.limits.output_tokens)} tokens
                    </span>
                  </div>
                )}
                {modelInfo.limits.rate_limit && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-slate-400">Rate Limit:</span>
                    <span className="col-span-2 text-slate-200">{modelInfo.limits.rate_limit}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Section 3: Input Parameters */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-700 pb-2">
                Входные параметры
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-300 font-medium">Название</th>
                      <th className="px-3 py-2 text-left text-slate-300 font-medium">Тип</th>
                      <th className="px-3 py-2 text-left text-slate-300 font-medium">Обязательно</th>
                      <th className="px-3 py-2 text-left text-slate-300 font-medium w-1/3">Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {modelInfo.inputs.map((input, idx) => {
                      return (
                        <tr key={idx} className="hover:bg-slate-800/50">
                          <td className="px-3 py-2 text-slate-200 font-mono text-xs">{input.name}</td>
                          <td className="px-3 py-2 text-slate-300">
                            <span className="px-2 py-1 bg-slate-700 rounded text-xs">{input.type}</span>
                          </td>
                          <td className="px-3 py-2">
                            {input.required ? (
                              <span className="text-red-400 text-sm">✓ Да</span>
                            ) : (
                              <span className="text-slate-500 text-sm">Нет</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs max-w-xs">
                            <div className="whitespace-normal break-words">
                              {input.description || '—'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

          </>
        )}
      </div>
    );

  // Render inline or as modal
  if (inline) {
    return content;
  }

  return (
    <Modal onClose={onClose} title="Информация о модели">
      {content}
    </Modal>
  );
}

function formatTokens(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`;
  }
  return count.toString();
}
