/**
 * Tooltip component for Model Info button
 */

import React from 'react';

interface ModelInfoTooltipProps {
  modelName: string;
  description: string;
  contextTokens?: number;
  outputTokens?: number;
}

export function ModelInfoTooltip({
  modelName,
  description,
  contextTokens,
  outputTokens
}: ModelInfoTooltipProps) {
  // Truncate description to 200 characters
  const shortDesc = description.length > 200 
    ? description.substring(0, 200) + '...' 
    : description;

  return (
    <div className="bg-black text-white p-4 rounded-lg shadow-lg max-w-md">
      <div className="font-semibold text-lg mb-2">{modelName}</div>
      <div className="text-sm mb-3 text-gray-300">{shortDesc}</div>
      {(contextTokens || outputTokens) && (
        <div className="text-xs text-gray-400 space-y-1">
          {contextTokens && (
            <div>
              <span className="font-medium">Context:</span> {formatTokens(contextTokens)} tokens
            </div>
          )}
          {outputTokens && (
            <div>
              <span className="font-medium">Output:</span> {formatTokens(outputTokens)} tokens
            </div>
          )}
        </div>
      )}
    </div>
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
