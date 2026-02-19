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
    this.model = model || 'gemini-2.5-flash'; // Обновленная модель по умолчанию
    this.baseUrl =
      baseUrl && baseUrl.trim().length > 0
        ? baseUrl.trim().replace(/\/+$/, '')
        : 'https://generativelanguage.googleapis.com';

    // Инициализируем GoogleGenerativeAI
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(context: AiContext, options: GeminiGenerationOptions = {}): Promise<AiResult> {
    log.info(`[Gemini] Using model: ${this.model} via ${this.baseUrl}`);
    
    // Используем выбранную модель напрямую
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
        : 'Ты полезный ИИ-ассистент, который умеет работать с файлами и изображениями.';
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
      parts.push({ text: `Пользовательский запрос:\n${prompt}` });
    } else {
      parts.push({
        text: 'Сформируй ответ, следуя системным инструкциям и учитывая контекст проекта.',
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
            parts.push({ text: `\n\n[Изображение "${img.url}" недоступно]` });
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
          parts.push({ text: `\n\n[Ошибка загрузки изображения "${img.url}"]` });
        }
      }
    }

    // Файлы - Gemini поддерживает их нативно!
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
          'Верни JSON объект вида {"response": "..."} с финальным ответом.',
          'Поле response должно содержать готовый ответ в виде обычного текста без Markdown, HTML или дополнительных полей.',
          'Не добавляй комментарии, пояснения или дополнительные свойства.',
        ].join('\n'),
      };
    }
    if (normalized === 'PLAN_SCHEMA') {
      return {
        schema: PLAN_RESPONSE_SCHEMA,
        instructions: [
          'Верни JSON объект, строго соответствующий PLAN_SCHEMA с полями overview, phases и nodes.',
          'overview должен включать goal, target_audience, tone и duration_sec (целое число от 5 до 180 секунд).',
          'phases — массив объектов с name и массивом steps (минимум один шаг).',
          'nodes — массив из минимум трёх объектов. Каждый объект содержит node_id, type, title, description и массив outputs.',
          'Поле type допускает только значения: text, ai, parser, python, image_gen, audio_gen, video_gen.',
          'Поле outputs перечисляет создаваемые артефакты (например, ["structured_json"]).',
          'Не добавляй дополнительные поля, не используйте Markdown и не включай поясняющий текст вне JSON.',
        ].join('\n'),
      };
    }
    return null;
  }

  private buildSystemPrompt(basePrompt: string, schemaInstructions?: string | null): string {
    const segments = [
      basePrompt.trim(),
      'Всегда соблюдай системные требования и отвечай на русском языке, если пользователь не указал иное.',
    ];
    if (schemaInstructions && schemaInstructions.trim().length > 0) {
      segments.push(schemaInstructions.trim());
    }
    segments.push('Ответ должен строго соответствовать указанному формату без пояснений и вспомогательного текста.');
    return segments.join('\n\n');
  }

  private async processFileForGemini(file: { name: string; type: string; content: string; source_node_id?: string }, parts: any[]): Promise<void> {
    // Текстовые файлы
    if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('markdown')) {
      parts.push({ 
        text: `\n\nФайл "${file.name}" (${file.type}):\n${file.content}` 
      });
      return;
    }

    // Изображения - Gemini поддерживает нативно
    if (file.type.startsWith('image/')) {
      if (file.type === 'image/url') {
        // Для URL изображений нужно скачать и конвертировать
        parts.push({ 
          text: `\n\nИзображение "${file.name}": ${file.content}` 
        });
      } else if (file.type === 'image/base64') {
        // Base64 изображения Gemini принимает напрямую
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

    // PDF файлы - Gemini поддерживает через upload API
    if (file.type === 'application/pdf') {
      // TODO: Реализовать загрузку PDF через Files API
      parts.push({ 
        text: `\n\nPDF файл "${file.name}" требует специальной обработки.` 
      });
      return;
    }

    // Для других типов файлов - обрабатываем как текст
    parts.push({ 
      text: `\n\nФайл "${file.name}" (${file.type}):\n${file.content}` 
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
