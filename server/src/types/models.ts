/**
 * Model information types for AI integrations
 */

export interface ModelInputParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'image' | 'video' | 'audio' | 'file' | 'array' | 'object';
  required: boolean;
  description: string;
  default?: any;
  enum?: string[];
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface ModelLimits {
  context_tokens?: number;
  output_tokens?: number;
  rate_limit?: string;
}

export interface ModelInfo {
  name: string;
  description: string;
  version?: string;
  provider: 'replicate' | 'openai' | 'google' | 'anthropic' | 'midjourney';
  
  limits: ModelLimits;
  
  inputs: ModelInputParameter[];
  
  file_format: 'url' | 'base64' | 'both';
  documentation_url?: string;
}
