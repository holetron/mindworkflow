/**
 * Google Gemini model schemas
 */

import { ModelInfo } from '../../types/models';

export const GEMINI_MODELS: Record<string, ModelInfo> = {
  'gemini-2.0-flash-exp': {
    name: 'Gemini 2.0 Flash',
    description: 'Google\'s fastest multimodal model with 1M token context',
    version: '2.0-flash-exp',
    provider: 'google',
    limits: {
      context_tokens: 1048576,
      output_tokens: 8192,
      rate_limit: '10 QPM (free), 1000 QPM (paid)'
    },
    inputs: [
      {
        name: 'contents',
        type: 'array',
        required: true,
        description: 'Array of content parts (text, images, etc.)'
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Controls randomness in generation',
        default: 1.0,
        min: 0,
        max: 2
      },
      {
        name: 'max_output_tokens',
        type: 'number',
        required: false,
        description: 'Maximum number of tokens in response',
        max: 8192
      },
      {
        name: 'top_p',
        type: 'number',
        required: false,
        description: 'Nucleus sampling parameter',
        default: 0.95
      },
      {
        name: 'top_k',
        type: 'number',
        required: false,
        description: 'Top-k sampling parameter',
        default: 40
      }
    ],
    file_format: 'both',
    documentation_url: 'https://ai.google.dev/gemini-api/docs'
  },

  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    description: 'Mid-size multimodal model optimized for scaling across a wide range of tasks',
    version: '1.5-pro',
    provider: 'google',
    limits: {
      context_tokens: 2097152,
      output_tokens: 8192,
      rate_limit: '2 QPM (free), 1000 QPM (paid)'
    },
    inputs: [
      {
        name: 'contents',
        type: 'array',
        required: true,
        description: 'Array of content parts (text, images, video, audio)'
      },
      {
        name: 'temperature',
        type: 'number',
        required: false,
        description: 'Controls randomness in generation',
        default: 1.0,
        min: 0,
        max: 2
      },
      {
        name: 'max_output_tokens',
        type: 'number',
        required: false,
        description: 'Maximum number of tokens in response',
        max: 8192
      }
    ],
    file_format: 'both',
    documentation_url: 'https://ai.google.dev/gemini-api/docs'
  },
};
