/**
 * Calculate context usage for AI models
 */

export interface ContextUsage {
  used: number;
  limit: number;
  percentage: number;
  isOverLimit: boolean;
}

/**
 * Estimate tokens for text content
 * Rough estimate: 1 token ≈ 4 characters
 */
function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for media content
 */
function estimateMediaTokens(type: string): number {
  switch (type.toLowerCase()) {
    case 'image':
      return 1000;
    case 'video':
      return 5000;
    case 'audio':
      return 2000;
    default:
      return 500;
  }
}

/**
 * Calculate total context usage from node contents
 */
export function calculateContextUsage(
  nodes: Array<{ content: string; type?: string }>,
  contextLimit: number
): ContextUsage {
  let totalTokens = 0;

  for (const node of nodes) {
    if (node.type && ['image', 'video', 'audio'].includes(node.type.toLowerCase())) {
      totalTokens += estimateMediaTokens(node.type);
    } else {
      totalTokens += estimateTextTokens(node.content || '');
    }
  }

  const percentage = Math.round((totalTokens / contextLimit) * 100);
  const isOverLimit = totalTokens > contextLimit;

  return {
    used: totalTokens,
    limit: contextLimit,
    percentage,
    isOverLimit
  };
}

/**
 * Format token count with K suffix
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
