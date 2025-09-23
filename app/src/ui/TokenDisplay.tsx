import React from 'react';
import { useTokenCounter, formatTokens, formatCost } from '../hooks/useTokenCounter';
import type { ProjectFlow } from '../state/api';

interface TokenDisplayProps {
  project: ProjectFlow | null;
  className?: string;
  compact?: boolean;
}

export function TokenDisplay({ project, className = '', compact = false }: TokenDisplayProps) {
  const { total, byProvider, estimatedCost, warnings } = useTokenCounter(project);

  if (!project || total.total_tokens === 0) {
    return null;
  }

  const hasWarnings = warnings.length > 0;

  if (compact) {
    return (
      <div className={`flex items-center gap-6 text-sm ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-white">🧮 Использование токенов</span>
          <span className="text-white font-medium">{formatTokens(total.total_tokens)}</span>
        </div>
        <div className="text-slate-400">{formatCost(estimatedCost)}</div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Prompt: {formatTokens(total.prompt_tokens)}</span>
          <span>Completion: {formatTokens(total.completion_tokens)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800 rounded-lg border ${hasWarnings ? 'border-red-500' : 'border-slate-700'} ${className}`}>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            🧮 Использование токенов
            {hasWarnings && (
              <span className="text-red-400 text-xs bg-red-900/30 px-2 py-1 rounded">
                ⚠️ {warnings.length}
              </span>
            )}
          </h3>
          <div className="text-right">
            <div className="text-sm text-white">{formatTokens(total.total_tokens)}</div>
            <div className="text-xs text-slate-400">{formatCost(estimatedCost)}</div>
          </div>
        </div>

        {/* Детализация по провайдерам */}
        {Object.keys(byProvider).length > 1 && (
          <div className="space-y-1 mb-2">
            {Object.entries(byProvider).map(([provider, usage]) => (
              <div key={provider} className="flex justify-between text-xs">
                <span className="text-slate-300 capitalize">{provider}</span>
                <span className="text-slate-400">{formatTokens(usage.total_tokens)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Предупреждения */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((warning, index) => (
              <div key={index} className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                ⚠️ {warning}
              </div>
            ))}
          </div>
        )}

        {/* Детали использования */}
        <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700">
          <div className="flex justify-between">
            <span>Prompt:</span>
            <span>{formatTokens(total.prompt_tokens)}</span>
          </div>
          <div className="flex justify-between">
            <span>Completion:</span>
            <span>{formatTokens(total.completion_tokens)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TokenDisplay;