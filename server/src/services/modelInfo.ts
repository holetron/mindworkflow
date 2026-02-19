/**
 * Service for retrieving model information from various AI providers
 */

import Replicate from 'replicate';
import { ModelInfo, ModelInputParameter } from '../types/models';
import { MODEL_SCHEMAS } from '../constants/modelSchemas';

/**
 * Get model information from Replicate API
 */
export async function getReplicateModelInfo(
  modelId: string,
  apiToken: string
): Promise<ModelInfo> {
  try {
    const replicate = new Replicate({ auth: apiToken });
    
    // Parse model ID (format: owner/name or owner/name:version)
    const [ownerName, version] = modelId.split(':');
    const [owner, name] = ownerName.split('/');
    
    if (!owner || !name) {
      throw new Error('Invalid Replicate model ID format. Expected: owner/name or owner/name:version');
    }

    // Get model info
    const model = await replicate.models.get(owner, name);
    
    // Get version info
    let versionInfo;
    if (version) {
      versionInfo = await replicate.models.versions.get(owner, name, version);
    } else {
      // Get latest version
      versionInfo = model.latest_version;
    }

    // Extract inputs from OpenAPI schema
    const inputs = extractReplicateInputs(versionInfo?.openapi_schema);
    
    // Detect file format
    const fileFormat = detectFileFormat(inputs);

    return {
      name: model.name || modelId,
      description: model.description || 'No description available',
      version: versionInfo?.id || 'latest',
      provider: 'replicate',
      limits: {
        // Replicate doesn't provide token limits via API, use reasonable defaults
        context_tokens: 32000,
        output_tokens: 4096,
        rate_limit: 'Varies by plan'
      },
      inputs,
      file_format: fileFormat,
      documentation_url: model.url || `https://replicate.com/${owner}/${name}`
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch Replicate model info: ${error.message}`);
  }
}

/**
 * Extract input parameters from Replicate OpenAPI schema
 */
function extractReplicateInputs(schema: any): ModelInputParameter[] {
  if (!schema?.components?.schemas?.Input?.properties) {
    return [];
  }

  const properties = schema.components.schemas.Input.properties;
  const required = schema.components.schemas.Input.required || [];

  return Object.entries(properties).map(([name, prop]: [string, any]) => {
    const type = mapSchemaType(prop.type, prop.format);
    
    return {
      name,
      type,
      required: required.includes(name),
      description: prop.description || prop.title || '',
      default: prop.default,
      enum: prop.enum,
      min: prop.minimum,
      max: prop.maximum
    };
  });
}

/**
 * Map JSON Schema types to our ModelInputParameter types
 */
function mapSchemaType(
  schemaType: string, 
  format?: string
): ModelInputParameter['type'] {
  if (format === 'uri') return 'image'; // Replicate uses URI for images
  
  switch (schemaType) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Detect file format based on input parameters
 */
export function detectFileFormat(inputs: ModelInputParameter[]): 'url' | 'base64' | 'both' {
  const hasImageInput = inputs.some(input => 
    input.type === 'image' || 
    input.name.toLowerCase().includes('image') ||
    input.description.toLowerCase().includes('image')
  );

  if (!hasImageInput) {
    return 'url'; // Default for text-only models
  }

  // Check if description mentions URL or base64
  const mentionsUrl = inputs.some(input => 
    input.description.toLowerCase().includes('url') ||
    input.description.toLowerCase().includes('http')
  );
  
  const mentionsBase64 = inputs.some(input => 
    input.description.toLowerCase().includes('base64')
  );

  if (mentionsUrl && mentionsBase64) return 'both';
  if (mentionsBase64) return 'base64';
  return 'url';
}

/**
 * Get model info from OpenAI (static schema with fallback for unknown models)
 */
export function getOpenAIModelInfo(modelId: string): ModelInfo {
  const schema = MODEL_SCHEMAS[modelId];
  
  if (schema) {
    return schema;
  }
  
  // Fallback: generate generic schema for unknown OpenAI models
  let contextTokens = 128000;  // Default to GPT-4o context
  
  if (modelId.includes('turbo')) {
    contextTokens = 128000;
  } else if (modelId.includes('3.5')) {
    contextTokens = 4096;
  }
  
  return {
    name: modelId,
    description: `OpenAI model: ${modelId}`,
    provider: 'openai',
    limits: {
      context_tokens: contextTokens,
      output_tokens: 4096,
      rate_limit: '10,000 RPM'
    },
    inputs: [
      {
        name: 'messages',
        type: 'array',
        required: true,
        description: 'Array of message objects with role and content'
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Sampling temperature between 0 and 2',
        default: 1,
        min: 0,
        max: 2
      },
      {
        name: 'max_tokens',
        type: 'number',
        required: false,
        description: 'Maximum number of tokens to generate'
      },
      {
        name: 'top_p',
        type: 'number',
        required: false,
        description: 'Nucleus sampling parameter',
        default: 1,
        min: 0,
        max: 1
      }
    ],
    file_format: 'url',
    documentation_url: `https://platform.openai.com/docs/models/${modelId}`
  };
}

/**
 * Get model info from Google Gemini (static schema with fallback for unknown models)
 */
export function getGoogleModelInfo(modelId: string): ModelInfo {
  const schema = MODEL_SCHEMAS[modelId];
  
  if (schema) {
    return schema;
  }
  
  // Fallback: generate generic schema for unknown Google models
  let contextTokens = 1000000;  // Default Gemini context is very large
  
  if (modelId.includes('2.5')) {
    contextTokens = 1000000;
  } else if (modelId.includes('2.0')) {
    contextTokens = 1000000;
  } else if (modelId.includes('1.5')) {
    contextTokens = 100000;
  }
  
  return {
    name: modelId,
    description: `Google Gemini model: ${modelId}`,
    provider: 'google',
    limits: {
      context_tokens: contextTokens,
      output_tokens: 4096,
      rate_limit: 'Varies by plan'
    },
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'The input text prompt'
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Sampling temperature between 0 and 2',
        default: 1,
        min: 0,
        max: 2
      },
      {
        name: 'max_output_tokens',
        type: 'number',
        required: false,
        description: 'Maximum number of tokens to generate'
      },
      {
        name: 'top_p',
        type: 'number',
        required: false,
        description: 'Nucleus sampling parameter',
        default: 1,
        min: 0,
        max: 1
      }
    ],
    file_format: 'url',
    documentation_url: `https://ai.google.dev/models/${modelId}`
  };
}

/**
 * Get model info from Anthropic (static schema)
 */
export function getAnthropicModelInfo(modelId: string): ModelInfo {
  const schema = MODEL_SCHEMAS[modelId];
  
  if (!schema) {
    throw new Error(`Unknown Anthropic model: ${modelId}`);
  }
  
  return schema;
}

export function getMidjourneyModelInfo(modelId: string): ModelInfo {
  const schema = MODEL_SCHEMAS[modelId];
  if (!schema || schema.provider !== 'midjourney') {
    throw new Error(`Unknown Midjourney model: ${modelId}`);
  }
  return schema;
}

/**
 * Main function to get model info by provider
 */
export async function getModelInfo(
  provider: 'replicate' | 'openai' | 'google' | 'anthropic' | 'midjourney',
  modelId: string,
  apiToken?: string
): Promise<ModelInfo> {
  switch (provider) {
    case 'replicate':
      if (!apiToken) {
        throw new Error('API token required for Replicate');
      }
      return await getReplicateModelInfo(modelId, apiToken);
    
    case 'openai':
      return getOpenAIModelInfo(modelId);
    
    case 'google':
      return getGoogleModelInfo(modelId);
    
    case 'anthropic':
      return getAnthropicModelInfo(modelId);
    
    case 'midjourney':
      return getMidjourneyModelInfo(modelId);
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
