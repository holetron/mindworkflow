import fetch from 'node-fetch';

export interface OpenAiModelSummary {
  id: string;
  created?: number;
  owned_by?: string;
}

export interface ListOpenAiModelsOptions {
  baseUrl?: string;
  organization?: string;
  signal?: AbortSignal;
}

export async function listOpenAiModels(
  apiKey: string,
  options: ListOpenAiModelsOptions = {},
): Promise<OpenAiModelSummary[]> {
  const endpoint = `${(options.baseUrl || 'https://api.openai.com').replace(/\/$/, '')}/v1/models`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (options.organization) {
    headers['OpenAI-Organization'] = options.organization;
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers,
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `OpenAI API responded with ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string; created?: number; owned_by?: string }>;
  };
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      created: typeof item.created === 'number' ? item.created : undefined,
      owned_by: typeof item.owned_by === 'string' ? item.owned_by : undefined,
    }))
    .filter((item) => item.id);
}
