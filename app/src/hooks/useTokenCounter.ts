import { useMemo } from 'react';
import type { ProjectFlow } from '../state/api';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface TokenLimits {
  [provider: string]: {
    daily_limit: number;
    monthly_limit: number;
    cost_per_1k_tokens: number;
  };
}

// Примерные лимиты для различных провайдеров
const DEFAULT_LIMITS: TokenLimits = {
  'openai': {
    daily_limit: 100000,
    monthly_limit: 2000000,
    cost_per_1k_tokens: 0.002,
  },
  'anthropic': {
    daily_limit: 80000,
    monthly_limit: 1500000,
    cost_per_1k_tokens: 0.008,
  },
  'gemini': {
    daily_limit: 150000,
    monthly_limit: 3000000,
    cost_per_1k_tokens: 0.001,
  },
};

// Приблизительный подсчет токенов для текста (1 токен ≈ 4 символа)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function useTokenCounter(project: ProjectFlow | null) {
  const tokenUsage = useMemo(() => {
    if (!project?.nodes) {
      return {
        total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        byProvider: {} as Record<string, TokenUsage>,
        estimatedCost: 0,
        warnings: [] as string[],
      };
    }

    const byProvider: Record<string, TokenUsage> = {};
    const warnings: string[] = [];
    let totalEstimatedCost = 0;

    // Подсчитываем токены для всех AI нод
    project.nodes.forEach((node) => {
      if (node.type === 'ai' && node.ai?.provider) {
        const provider = node.ai.provider as string;
        
        if (!byProvider[provider]) {
          byProvider[provider] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        }

        // Оценка токенов из контента
        const promptTokens = estimateTokens(node.content || '');
        
        // Добавляем токены из контекста (предыдущие ноды)
        const contextTokens = project.nodes
          .filter(n => n.node_id !== node.node_id)
          .reduce((sum, n) => sum + estimateTokens(n.content || ''), 0);

        // Примерная оценка ответа (обычно меньше промпта)
        const estimatedCompletionTokens = Math.max(500, promptTokens * 0.3);

        const nodePromptTokens = promptTokens + contextTokens;
        const nodeCompletionTokens = estimatedCompletionTokens;
        const nodeTotalTokens = nodePromptTokens + nodeCompletionTokens;

        byProvider[provider].prompt_tokens += nodePromptTokens;
        byProvider[provider].completion_tokens += nodeCompletionTokens;
        byProvider[provider].total_tokens += nodeTotalTokens;

        // Подсчет стоимости
        const limits = DEFAULT_LIMITS[provider];
        if (limits) {
          const cost = (nodeTotalTokens / 1000) * limits.cost_per_1k_tokens;
          totalEstimatedCost += cost;

          // Проверка лимитов
          if (byProvider[provider].total_tokens > limits.daily_limit) {
            warnings.push(`Превышен дневной лимит для ${provider}`);
          }
        }
      }
    });

    // Общий подсчет
    const total = Object.values(byProvider).reduce(
      (acc, usage) => ({
        prompt_tokens: acc.prompt_tokens + usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + usage.completion_tokens,
        total_tokens: acc.total_tokens + usage.total_tokens,
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );

    return {
      total,
      byProvider,
      estimatedCost: totalEstimatedCost,
      warnings,
    };
  }, [project]);

  return tokenUsage;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}