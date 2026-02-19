// Chat related types

export type ChatMode = 'agent' | 'edit' | 'ask';

// ✅ NEW: Generation mode detection
export const GENERATION_MODELS = {
  image: ['dall-e-3', 'dall-e-2', 'midjourney-', 'stable-diffusion-'],
  video: ['midjourney-v7-video', 'replicate-video', 'replicate-'],
};

export function isGenerationModel(modelId: string | undefined): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return (
    GENERATION_MODELS.image.some(prefix => lower.includes(prefix)) ||
    GENERATION_MODELS.video.some(prefix => lower.includes(prefix))
  );
}

export function getGenerationModeType(modelId: string | undefined): 'image' | 'video' | null {
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  if (GENERATION_MODELS.video.some(prefix => lower.includes(prefix))) return 'video';
  if (GENERATION_MODELS.image.some(prefix => lower.includes(prefix))) return 'image';
  return null;
}

export interface Chat {
  id: string;
  title: string;
  created_at: number;
  settings?: ChatSettings;
  project_id?: string | null;
  agent_preset_id?: string | null; // NEW: link to agent
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
  attachments_json?: string | null;
  logs?: string[];
}

export interface ChatAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  hash?: string;
  uploadedAt: number;
}

export interface ChatSettings {
  provider: string;
  model: string;
  temperature: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  system_prompt: string;
  output_format?: string;
  // Agent mode for workflow integration
  agent_mode?: ChatMode; // 'agent' | 'edit' | 'ask'
  project_id?: string; // Project ID for workflow context
  // Context settings for workflow
  context_depth?: number; // How many levels of nodes to include
  context_max_tokens?: number; // Max tokens for context
  // Field mapping for advanced customization
  field_mapping?: {
    system_prompt?: { target: string };
    output_example?: { target: string };
    temperature?: { target: string };
    max_tokens?: { target: string };
    additional_fields?: Record<string, { target: string }>;
  };
  // Additional field values
  additional_fields_values?: Record<string, string>;
  
  // ✅ NEW: Chat configuration panel settings
  selected_model?: string;                           // e.g., "gpt-4", "gpt-4-turbo", "midjourney-v7"
  system_prompt_type?: 'default' | 'custom' | 'empty';  // Type of system prompt
  custom_system_prompt?: string;                    // Custom system prompt content
  context_level?: 0 | 1 | 2 | 3 | 4 | 5;           // Context level (0 = none, 5 = full JSON)
  context_mode?: 'simple' | 'clean' | 'simple_json' | 'full_json'; // How to format context
}

export const defaultChatSettings: ChatSettings = {
  provider: 'openai_gpt',
  model: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  stream: false,
  system_prompt: '',
  output_format: 'text',
  agent_mode: 'ask', // Default to read-only mode
  context_depth: 2, // Default: include 2 levels of nodes
  context_max_tokens: 8000, // Default: 8k tokens for context
  
  // ✅ NEW: Configuration panel defaults
  selected_model: 'gpt-4',
  system_prompt_type: 'default',
  context_level: 2,
  context_mode: 'simple', // Default display mode
};

// ✅ NEW: Agent chat specific types
export interface AgentInputField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string | number;
}

export interface AgentChatSettings extends ChatSettings {
  show_input_fields?: boolean;
  input_fields?: AgentInputField[];
}
