/**
 * OpenAI model schemas (GPT-4o, GPT-4o Mini, O1)
 */

import { ModelInfo } from '../../types/models';

export const OPENAI_MODELS: Record<string, ModelInfo> = {
  'gpt-4o': {
    name: 'GPT-4o',
    description: 'Most advanced OpenAI model with vision capabilities, 128K context window',
    version: 'gpt-4o-2024-11-20',
    provider: 'openai',
    limits: {
      context_tokens: 128000,
      output_tokens: 16384,
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
        description: 'Maximum number of tokens to generate',
        max: 16384
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
    documentation_url: 'https://platform.openai.com/docs/models/gpt-4o'
  },

  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    description: 'Affordable and intelligent small model for fast, lightweight tasks',
    version: 'gpt-4o-mini-2024-07-18',
    provider: 'openai',
    limits: {
      context_tokens: 128000,
      output_tokens: 16384,
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
        description: 'Maximum number of tokens to generate',
        max: 16384
      }
    ],
    file_format: 'url',
    documentation_url: 'https://platform.openai.com/docs/models/gpt-4o-mini'
  },

  'o1': {
    name: 'O1',
    description: 'OpenAI reasoning model with advanced problem-solving capabilities',
    version: 'o1-2024-12-17',
    provider: 'openai',
    limits: {
      context_tokens: 200000,
      output_tokens: 100000,
      rate_limit: '500 RPM'
    },
    inputs: [
      {
        name: 'messages',
        type: 'array',
        required: true,
        description: 'Array of message objects with role and content'
      },
      {
        name: 'max_completion_tokens',
        type: 'number',
        required: false,
        description: 'Maximum number of tokens to generate',
        max: 100000
      }
    ],
    file_format: 'url',
    documentation_url: 'https://platform.openai.com/docs/models/o1'
  },
};
