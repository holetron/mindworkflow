import fetch from 'node-fetch';

interface GoogleModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

export async function listGoogleAiStudioModels(apiKey: string, baseUrl?: string): Promise<GoogleModel[]> {
  const endpoint = `${(baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')}/v1beta/models`;
  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Google AI Studio API responded with ${response.status}`);
  }

  const payload = (await response.json()) as { models?: GoogleModel[] };
  const models = Array.isArray(payload.models) ? payload.models : [];
  return models.filter((model) => typeof model.name === 'string');
}

