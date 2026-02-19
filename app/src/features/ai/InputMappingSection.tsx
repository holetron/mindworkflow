/**
 * Input mapping section for Model Info modal
 */

import React, { useState } from 'react';
import { useUpstreamNodes, type UpstreamNode } from '../../hooks/useUpstreamNodes';
import { calculateContextUsage, formatTokenCount, type ContextUsage } from '../../utils/contextCalculation';

interface InputMappingSectionProps {
  nodeId: string;
  modelInputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  contextLimit: number;
  currentMappings?: Record<string, string>;
  onSave: (mappings: Record<string, string>) => void;
}

export function InputMappingSection({
  nodeId,
  modelInputs,
  contextLimit,
  currentMappings = {},
  onSave
}: InputMappingSectionProps) {
  const upstreamNodes = useUpstreamNodes(nodeId);
  const [mappings, setMappings] = useState<Record<string, string>>(currentMappings);

  // Calculate context usage
  const contextUsage: ContextUsage = calculateContextUsage(
    upstreamNodes.map(node => ({
      content: node.content,
      type: node.type
    })),
    contextLimit
  );

  const handleMappingChange = (upstreamNodeId: string, paramName: string) => {
    setMappings(prev => ({
      ...prev,
      [upstreamNodeId]: paramName
    }));
  };

  const handleSave = () => {
    onSave(mappings);
  };

  if (upstreamNodes.length === 0) {
    return (
      <div className="text-slate-400 text-sm p-4 border border-slate-700 rounded">
        No incoming connections. Connect nodes to this AI node for parameter mapping.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-300">Context usage:</span>
          <span className={contextUsage.isOverLimit ? 'text-red-600 font-semibold' : 'text-slate-400'}>
            {formatTokenCount(contextUsage.used)} / {formatTokenCount(contextUsage.limit)} tokens ({contextUsage.percentage}%)
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all ${
              contextUsage.isOverLimit ? 'bg-red-600' : 'bg-green-600'
            }`}
            style={{ width: `${Math.min(contextUsage.percentage, 100)}%` }}
          />
        </div>
        {contextUsage.isOverLimit && (
          <div className="text-red-600 text-sm flex items-start gap-2">
            <span>⚠️</span>
            <span>Context limit exceeded! The model may not accept this request.</span>
          </div>
        )}
      </div>

      {/* Mapping table */}
      <div className="space-y-3">
        <h4 className="font-medium text-slate-300">Input port mapping:</h4>
        {upstreamNodes.map((upstreamNode) => (
          <div
            key={upstreamNode.id}
            className="flex items-center gap-3 p-3 bg-slate-800 rounded border border-slate-700"
          >
            <div className="flex-1">
              <div className="font-medium text-slate-200">{upstreamNode.label}</div>
              <div className="text-xs text-slate-400 mt-1">
                Type: {upstreamNode.type}
              </div>
              <div className="text-xs text-slate-500 mt-1 truncate max-w-xs">
                {upstreamNode.content.substring(0, 100)}...
              </div>
            </div>
            <div className="w-48">
              <select
                value={mappings[upstreamNode.id] || ''}
                onChange={(e) => handleMappingChange(upstreamNode.id, e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-200 text-sm"
              >
                <option value="">-- Not selected --</option>
                {modelInputs.map((input) => (
                  <option key={input.name} value={input.name}>
                    {input.name} {input.required ? '(required)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={contextUsage.isOverLimit}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            contextUsage.isOverLimit
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Save mapping
        </button>
      </div>
    </div>
  );
}
