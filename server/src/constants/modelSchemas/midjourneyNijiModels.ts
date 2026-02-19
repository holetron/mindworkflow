/**
 * Midjourney Niji model schemas (anime/manga styles)
 */

import { ModelInfo } from '../../types/models';

export const MIDJOURNEY_NIJI_MODELS: Record<string, ModelInfo> = {
  'midjourney-niji-6': {
    name: 'Niji V6 (Anime)',
    description: 'Niji v6 - anime and manga style generation',
    version: 'niji-6',
    provider: 'midjourney',
    limits: {
      context_tokens: 4096,
      output_tokens: 0,
      rate_limit: 'Depends on relay configuration',
    },
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Primary prompt for anime/manga style',
      },
      {
        name: 'aspect_ratio',
        type: 'string',
        required: false,
        description: 'Image aspect ratio',
        default: 'square',
        options: [
          { value: 'portrait', label: 'Portrait (2:3)' },
          { value: 'square', label: 'Square (1:1)' },
          { value: 'landscape', label: 'Landscape (3:2)' },
        ],
      },
      {
        name: 'stylization',
        type: 'number',
        required: false,
        description: 'Stylization level (0-1000)',
        default: 100,
        min: 0,
        max: 1000,
      },
      {
        name: 'speed',
        type: 'string',
        required: false,
        description: 'Generation speed',
        default: 'fast',
        options: [
          { value: 'relax', label: 'Relax' },
          { value: 'fast', label: 'Fast' },
          { value: 'turbo', label: 'Turbo' },
        ],
      },
      {
        name: 'reference_image',
        type: 'image',
        required: false,
        description: 'Reference image URL',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/niji',
  },

  'midjourney-niji-5': {
    name: 'Niji V5 (Anime)',
    description: 'Niji v5 - anime and manga style',
    version: 'niji-5',
    provider: 'midjourney',
    limits: {
      context_tokens: 4096,
      output_tokens: 0,
      rate_limit: 'Depends on relay configuration',
    },
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Primary prompt for anime/manga style',
      },
      {
        name: 'aspect_ratio',
        type: 'string',
        required: false,
        description: 'Image aspect ratio',
        default: 'square',
        options: [
          { value: 'portrait', label: 'Portrait (2:3)' },
          { value: 'square', label: 'Square (1:1)' },
          { value: 'landscape', label: 'Landscape (3:2)' },
        ],
      },
      {
        name: 'stylization',
        type: 'number',
        required: false,
        description: 'Stylization level (0-1000)',
        default: 100,
        min: 0,
        max: 1000,
      },
      {
        name: 'speed',
        type: 'string',
        required: false,
        description: 'Generation speed',
        default: 'fast',
        options: [
          { value: 'relax', label: 'Relax' },
          { value: 'fast', label: 'Fast' },
          { value: 'turbo', label: 'Turbo' },
        ],
      },
      {
        name: 'reference_image',
        type: 'image',
        required: false,
        description: 'Reference image URL',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/niji',
  },

  'midjourney-niji-4': {
    name: 'Niji V4 (Anime)',
    description: 'Niji v4 - classic anime style',
    version: 'niji-4',
    provider: 'midjourney',
    limits: {
      context_tokens: 4096,
      output_tokens: 0,
      rate_limit: 'Depends on relay configuration',
    },
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Primary prompt for anime style',
      },
      {
        name: 'aspect_ratio',
        type: 'string',
        required: false,
        description: 'Image aspect ratio',
        default: 'square',
        options: [
          { value: 'portrait', label: 'Portrait (2:3)' },
          { value: 'square', label: 'Square (1:1)' },
          { value: 'landscape', label: 'Landscape (3:2)' },
        ],
      },
      {
        name: 'stylization',
        type: 'number',
        required: false,
        description: 'Stylization level (0-1000)',
        default: 100,
        min: 0,
        max: 1000,
      },
      {
        name: 'speed',
        type: 'string',
        required: false,
        description: 'Generation speed',
        default: 'fast',
        options: [
          { value: 'relax', label: 'Relax' },
          { value: 'fast', label: 'Fast' },
          { value: 'turbo', label: 'Turbo' },
        ],
      },
      {
        name: 'reference_image',
        type: 'image',
        required: false,
        description: 'Reference image URL',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/niji',
  },
};
