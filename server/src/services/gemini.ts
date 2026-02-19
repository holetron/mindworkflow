import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
} from '@google/generative-ai';
import { AiContext, AiResult } from './ai';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'gemini' });
interface GeminiGenerationOptions {
  systemPrompt?: string;
  schemaRef?: string | null;
}

type GeminiStructuredSchema = Record<string, unknown>;

const TEXT_RESPONSE_SCHEMA: GeminiStructuredSchema = {
  type: SchemaType.OBJECT,
  required: ['response'],
  properties: {
    response: { type: SchemaType.STRING },
  },
};

const PLAN_RESPONSE_SCHEMA: GeminiStructuredSchema = {
  type: SchemaType.OBJECT,
  required: ['overview', 'phases', 'nodes'],
  properties: {
    overview: {
      type: SchemaType.OBJECT,
      required: ['goal', 'target_audience', 'tone', 'duration_sec'],
      properties: {
        goal: { type: SchemaType.STRING },
        target_audience: { type: SchemaType.STRING },
        tone: { type: SchemaType.STRING },
        duration_sec: {
          type: SchemaType.INTEGER,
          minimum: 5,
          maximum: 180,
        },
      },
    },
    phases: {
      type: SchemaType.ARRAY,
      minItems: 1,
      items: {
        type: SchemaType.OBJECT,
        required: ['name', 'steps'],
        properties: {
          name: { type: SchemaType.STRING },
          steps: {
            type: SchemaType.ARRAY,
            minItems: 1,
            items: { type: SchemaType.STRING },
          },
        },
      },
    },
    nodes: {
      type: SchemaType.ARRAY,
      minItems: 3,
      items: {
        type: SchemaType.OBJECT,
        required: ['node_id', 'type', 'title', 'description', 'outputs'],
        properties: {
          node_id: { type: SchemaType.STRING },
          type: {
            type: SchemaType.STRING,
            enum: ['text', 'ai', 'parser', 'python', 'image_gen', 'audio_gen', 'video_gen'],
          },
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          outputs: {
            type: SchemaType.ARRAY,
            minItems: 1,
            items: { type: SchemaType.STRING },
          },
        },
      },
    },
  },
};

export class GeminiService {
  private apiKey: string;
  private baseUrl: string;
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-2.5-flash'; // Default model
    this.baseUrl =
      baseUrl && baseUrl.trim().length > 0
        ? baseUrl.trim().replace(/\/+$/, '')
        : 'https://generativelanguage.googleapis.com';

    // Initialize GoogleGenerativeAI
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(context: AiContext, options: GeminiGenerationOptions = {}): Promise<AiResult> {
    log.info(`[Gemini] Using model: ${this.model} via ${this.baseUrl}`);
    
    // Use the selected model directly
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      }
    ];

    const schemaInfo = this.resolveResponseSchema(options.schemaRef ?? context.schemaRef);
    const basePrompt =
      options.systemPrompt && options.systemPrompt.trim().length > 0
        ? options.systemPrompt.trim()
        : 'You are a helpful AI assistant capable of working with files and images.';
    const systemPrompt = this.buildSystemPrompt(basePrompt, schemaInfo?.instructions ?? null);
    const userParts = await this.buildUserParts(context);

    const generationConfig: Record<string, unknown> = {
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
    };

    if (schemaInfo) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = schemaInfo.schema;
    }

    try {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: userParts,
          },
        ],
        safetySettings,
        generationConfig,
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }],
        },
      });

      const response = await result.response;
      const text = response.text();

      const usage = response.usageMetadata;
      const usageLog = usage
        ? `Tokens - prompt: ${usage.promptTokenCount ?? 'n/a'}, candidates: ${usage.candidatesTokenCount ?? 'n/a'}, total: ${usage.totalTokenCount ?? 'n/a'}`
        : 'Tokens: n/a';
      const schemaLabelSource = schemaInfo
        ? options.schemaRef ?? context.schemaRef ?? 'UNKNOWN_SCHEMA'
        : 'PLAIN_TEXT';
      const normalizedSchemaLabel =
        typeof schemaLabelSource === 'string'
          ? schemaLabelSource.toUpperCase()
          : 'UNKNOWN_SCHEMA';
      const schemaLog = schemaInfo
        ? `Structured response generated for ${normalizedSchemaLabel}`
        : 'Plain text response generated';

      return {
        output: text,
        contentType: schemaInfo ? 'application/json' : 'text/plain',
        logs: [schemaLog, usageLog, `Generated ${text.length} characters`],
      };
    } catch (error: any) {
      log.error({ err: error }, 'Gemini API error');
      const rawMessage = typeof error?.message === 'string' ? error.message : '';
      if (/SERVICE_DISABLED/.test(rawMessage) || /Generative Language API has not been used/i.test(rawMessage)) {
        throw new Error('Gemini generation failed: Google Generative Language API is disabled for this project. Enable the API in Google Cloud Console (https://console.developers.google.com/apis/api/generativelanguage.googleapis.com) and retry.');
      }
      throw new Error(`Gemini generation failed: ${rawMessage || 'Unknown error'}`);
    }
  }

  private async buildUserParts(context: AiContext): Promise<any[]> {
    const parts: any[] = [];

    const prompt =
      typeof context.node.content === 'string' && context.node.content.trim().length > 0
        ? context.node.content.trim()
        : '';
    if (prompt) {
      parts.push({ text: `User request:\n${prompt}` });
    } else {
      parts.push({
        text: 'Generate a response following the system instructions and considering the project context.',
      });
    }

    // Multimodal support: Add chat image attachments
    if (context.imageAttachments && context.imageAttachments.length > 0) {
      log.info(`[Gemini] Processing ${context.imageAttachments.length} image attachments`);
      
      for (const img of context.imageAttachments) {
        try {
          // For Gemini, we need to fetch the image and convert to base64
          const imageUrl = img.url.startsWith('http') 
            ? img.url 
            : `http://localhost:6048${img.url}`; // Use full URL for fetch
          
          const response = await fetch(imageUrl);
          if (!response.ok) {
            log.error(`[Gemini] Failed to fetch image: ${imageUrl}`);
            parts.push({ text: `\n\n[Image "${img.url}" is unavailable]` });
            continue;
          }
          
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          
          parts.push({
            inlineData: {
              mimeType: img.mimetype,
              data: base64
            }
          });
          
          log.info(`[Gemini] Added image: ${img.url} (${img.mimetype})`);
        } catch (error) {
          log.error({ err: error }, '`[Gemini] Error processing image ${img.url}:`');
          parts.push({ text: `\n\n[Error loading image "${img.url}"]` });
        }
      }
    }

    // Files - Gemini supports them natively!
    if (context.files && context.files.length > 0) {
      for (const file of context.files) {
        await this.processFileForGemini(file, parts);
      }
    }

    return parts;
  }

  private resolveResponseSchema(schemaRef?: string | null): { schema: GeminiStructuredSchema; instructions: string } | null {
    if (!schemaRef || typeof schemaRef !== 'string') {
      return null;
    }
    const normalized = schemaRef.toUpperCase();
    if (normalized === 'TEXT_RESPONSE') {
      return {
        schema: TEXT_RESPONSE_SCHEMA,
        instructions: [
          'Return a JSON object of the form {"response": "..."} with the final answer.',
          'The response field must contain the completed answer as plain text without Markdown, HTML, or additional fields.',
          'Do not add comments, explanations, or extra properties.',
        ].join('\n'),
      };
    }
    if (normalized === 'PLAN_SCHEMA') {
      return {
        schema: PLAN_RESPONSE_SCHEMA,
        instructions: [
          'Return a JSON object strictly conforming to PLAN_SCHEMA with the fields overview, phases, and nodes.',
          'overview must include goal, target_audience, tone, and duration_sec (an integer from 5 to 180 seconds).',
          'phases is an array of objects with name and an array of steps (at least one step).',
          'nodes is an array of at least three objects. Each object contains node_id, type, title, description, and an outputs array.',
          'The type field only accepts the values: text, ai, parser, python, image_gen, audio_gen, video_gen.',
          'The outputs field lists the artifacts to be created (e.g., ["structured_json"]).',
          'Do not add extra fields, do not use Markdown, and do not include explanatory text outside the JSON.',
        ].join('\n'),
      };
    }
    return null;
  }

  private buildSystemPrompt(basePrompt: string, schemaInstructions?: string | null): string {
    const segments = [
      basePrompt.trim(),
      'Always follow the system requirements and respond in the language requested by the user.',
    ];
    if (schemaInstructions && schemaInstructions.trim().length > 0) {
      segments.push(schemaInstructions.trim());
    }
    segments.push('The response must strictly conform to the specified format without explanations or auxiliary text.');
    return segments.join('\n\n');
  }

  private async processFileForGemini(file: { name: string; type: string; content: string; source_node_id?: string }, parts: any[]): Promise<void> {
    // Text files
    if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('markdown')) {
      parts.push({
        text: `\n\nFile "${file.name}" (${file.type}):\n${file.content}`
      });
      return;
    }

    // Images - Gemini supports natively
    if (file.type.startsWith('image/')) {
      if (file.type === 'image/url') {
        // For image URLs we need to download and convert
        parts.push({
          text: `\n\nImage "${file.name}": ${file.content}`
        });
      } else if (file.type === 'image/base64') {
        // Gemini accepts Base64 images directly
        const base64Data = file.content.replace(/^data:image\/[a-z]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: this.getImageMimeType(file.content),
            data: base64Data
          }
        });
      }
      return;
    }

    // PDF files - Gemini supports via upload API
    if (file.type === 'application/pdf') {
      // TODO: Implement PDF upload via Files API
      parts.push({
        text: `\n\nPDF file "${file.name}" requires special processing.`
      });
      return;
    }

    // For other file types - process as text
    parts.push({
      text: `\n\nFile "${file.name}" (${file.type}):\n${file.content}`
    });
  }

  private getImageMimeType(base64String: string): string {
    if (base64String.startsWith('data:image/')) {
      const match = base64String.match(/data:(image\/[^;]+)/);
      return match ? match[1] : 'image/jpeg';
    }
    return 'image/jpeg'; // default
  }
}
