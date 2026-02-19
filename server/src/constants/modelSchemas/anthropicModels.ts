/**
 * Anthropic Claude model schemas
 */

import { ModelInfo } from '../../types/models';

export const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
  'claude-3-5-sonnet-20241022': {
    name: 'Claude 3.5 Sonnet',
    description: 'Most intelligent Claude model with best-in-class reasoning and vision',
    version: '3.5-sonnet-20241022',
    provider: 'anthropic',
    limits: {
      context_tokens: 200000,
      output_tokens: 8192,
      rate_limit: '50 RPM'
    },
    inputs: [
      {
        name: 'messages',
        type: 'array',
        required: true,
        description: 'Array of message objects with role and content'
      },
      {
        name: 'max_tokens',
        type: 'number',
        required: true,
        description: 'Maximum number of tokens to generate',
        max: 8192
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Amount of randomness (0-1)',
        default: 1,
        min: 0,
        max: 1
      },
      {
        name: 'top_p',
        type: 'number',
        required: false,
        description: 'Nucleus sampling parameter',
        min: 0,
        max: 1
      },
      {
        name: 'top_k',
        type: 'number',
        required: false,
        description: 'Only sample from top K options',
        min: 0
      }
    ],
    file_format: 'base64',
    documentation_url: 'https://docs.anthropic.com/claude/reference'
  },

  'claude-3-5-haiku-20241022': {
    name: 'Claude 3.5 Haiku',
    description: 'Fastest and most compact Claude model for near-instant responsiveness',
    version: '3.5-haiku-20241022',
    provider: 'anthropic',
    limits: {
      context_tokens: 200000,
      output_tokens: 8192,
      rate_limit: '50 RPM'
    },
    inputs: [
      {
        name: 'messages',
        type: 'array',
        required: true,
        description: 'Array of message objects with role and content'
      },
      {
        name: 'max_tokens',
        type: 'number',
        required: true,
        description: 'Maximum number of tokens to generate',
        max: 8192
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Amount of randomness (0-1)',
        default: 1,
        min: 0,
        max: 1
      }
    ],
    file_format: 'base64',
    documentation_url: 'https://docs.anthropic.com/claude/reference'
  }
};
