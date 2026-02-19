export type IntegrationField = {
  id?: string;
  label: string;
  key: string;
  type?: 'text' | 'textarea';
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
};

export type IntegrationExampleRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type IntegrationExampleResponseMapping = {
  incoming?: Record<string, string>;
  outgoing?: Record<string, string>;
};

export interface IntegrationConfig {
  description: string;
  apiKey: string;
  baseUrl: string;
  organization: string;
  webhookContract: string;
  systemPrompt: string;
  inputFields: IntegrationField[];
  exampleRequest: IntegrationExampleRequest | null;
  exampleResponseMapping: IntegrationExampleResponseMapping | null;
  models: string[];
  modelsUpdatedAt: string | null;
  extra: Record<string, unknown>;
  // Midjourney Discord fields
  discordGuildId?: string;
  discordChannelId?: string;
}

export interface IntegrationRecord {
  id: string;
  userId: string;
  providerId: string;
  name: string;
  config: IntegrationConfig;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
