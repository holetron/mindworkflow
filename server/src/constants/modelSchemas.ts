/**
 * Static model schemas for OpenAI, Google, and Anthropic
 */

import { ModelInfo } from '../types/models';

export const MODEL_SCHEMAS: Record<string, ModelInfo> = {
  // OpenAI Models
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

  // Google Gemini Models
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

  // Midjourney Models (Latest 2025)
  'midjourney-v7': {
    name: 'Midjourney V7 (Latest)',
    description: 'Latest Midjourney model with Standard and Draft modes',
    version: '7',
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
        description: 'Primary prompt with scene description and stylistic hints',
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: 'Generation mode',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'raw', label: 'Raw' },
        ],
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
        description: 'How much Midjourney\'s aesthetic style affects the image (0-1000)',
        default: 100,
        min: 0,
        max: 1000,
      },
      {
        name: 'weirdness',
        type: 'number',
        required: false,
        description: 'Explore unusual aesthetics (0-3000)',
        default: 0,
        min: 0,
        max: 3000,
      },
      {
        name: 'variety',
        type: 'number',
        required: false,
        description: 'Variation between image outputs (0-100)',
        default: 0,
        min: 0,
        max: 100,
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
        name: 'image_prompt',
        type: 'image',
        required: false,
        description: 'Image Prompts - Visual references to guide composition and palette',
      },
      {
        name: 'style_reference',
        type: 'image',
        required: false,
        description: 'Style References - Use the aesthetic of an image to guide generation',
      },
      {
        name: 'omni',
        type: 'image',
        required: false,
        description: 'Omni Reference - Ensure consistent character likeness across generations (replaces --cref in V7)',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

  'midjourney-v7-video': {
    name: 'Midjourney V7 Video',
    description: 'Midjourney V7 optimized for video generation',
    version: '7',
    provider: 'midjourney',
    limits: {
      context_tokens: 8192,
      output_tokens: 0,
      rate_limit: 'Depends on relay configuration',
    },
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Narrative prompt describing the motion and key beats',
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: 'Generation mode',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'raw', label: 'Raw' },
        ],
      },
      {
        name: 'stylization',
        type: 'number',
        required: false,
        description: 'How much Midjourney\'s aesthetic style affects the video (0-1000)',
        default: 100,
        min: 0,
        max: 1000,
      },
      {
        name: 'weirdness',
        type: 'number',
        required: false,
        description: 'Explore unusual aesthetics (0-3000)',
        default: 0,
        min: 0,
        max: 3000,
      },
      {
        name: 'variety',
        type: 'number',
        required: false,
        description: 'Variation between video outputs (0-100)',
        default: 0,
        min: 0,
        max: 100,
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
        name: 'video_resolution',
        type: 'string',
        required: false,
        description: 'Video quality',
        default: 'hd',
        options: [
          { value: 'sd', label: 'SD' },
          { value: 'hd', label: 'HD' },
        ],
      },
      {
        name: 'video_batch_size',
        type: 'string',
        required: false,
        description: 'Number of videos to generate',
        default: '4',
        options: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '4', label: '4' },
        ],
      },
      {
        name: 'first_frame_image',
        type: 'image',
        required: false,
        description: 'Optional first frame reference to anchor the opening scene',
      },
      {
        name: 'end_frame_image',
        type: 'image',
        required: false,
        description: 'Optional final frame reference for the closing shot',
      },
      {
        name: 'timeline_prompt',
        type: 'string',
        required: false,
        description: 'Storyboard-style prompt describing transitions and pacing',
      },
      {
        name: 'duration_seconds',
        type: 'number',
        required: false,
        description: 'Requested video duration in seconds',
      },
      {
        name: 'audio_track_url',
        type: 'audio',
        required: false,
        description: 'Optional soundtrack URL synchronized with the render',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/video-mode',
  },

  'midjourney-v6.1': {
    name: 'Midjourney V6.1',
    description: 'Version 6.1 with improved coherence and prompt following',
    version: '6.1',
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
        description: 'Primary prompt with scene description',
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: 'Generation mode',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'raw', label: 'Raw' },
        ],
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
        name: 'image_prompt',
        type: 'image',
        required: false,
        description: 'Image Prompts - Visual references to guide composition and palette',
      },
      {
        name: 'style_reference',
        type: 'image',
        required: false,
        description: 'Style References - Use the aesthetic of an image to guide generation',
      },
      {
        name: 'character_reference',
        type: 'image',
        required: false,
        description: 'Omni Reference - Ensure consistent character likeness across generations',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

  'midjourney-v6': {
    name: 'Midjourney V6',
    description: 'Version 6 with enhanced realism',
    version: '6',
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
        description: 'Primary prompt',
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: 'Generation mode',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'raw', label: 'Raw' },
        ],
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
        name: 'image_prompt',
        type: 'image',
        required: false,
        description: 'Image Prompts - Visual references to guide composition and palette',
      },
      {
        name: 'style_reference',
        type: 'image',
        required: false,
        description: 'Style References - Use the aesthetic of an image to guide generation',
      },
      {
        name: 'character_reference',
        type: 'image',
        required: false,
        description: 'Omni Reference - Ensure consistent character likeness across generations',
      },
    ],
    file_format: 'url',
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

  'midjourney-v5.2': {
    name: 'Midjourney V5.2',
    description: 'Version 5.2 - refined aesthetics',
    version: '5.2',
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
        description: 'Primary prompt',
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
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

  'midjourney-v5.1': {
    name: 'Midjourney V5.1',
    description: 'Version 5.1',
    version: '5.1',
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
        description: 'Primary prompt',
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
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

  'midjourney-v5': {
    name: 'Midjourney V5',
    description: 'Version 5',
    version: '5',
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
        description: 'Primary prompt',
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
    documentation_url: 'https://docs.midjourney.com/docs/quick-start',
  },

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

  // Anthropic Claude Models
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
