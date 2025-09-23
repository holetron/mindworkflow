import Ajv from 'ajv';
import { StoredNode } from '../db';

export interface AiContext {
  projectId: string;
  node: StoredNode;
  previousNodes: StoredNode[];
  nextNodes: Array<{
    node_id: string;
    type: string;
    title: string;
    short_description: string;
    connection_labels: string[];
  }>;
  schemaRef: string;
  settings: Record<string, unknown>;
}

export interface AiResult {
  output: string;
  contentType: string;
  logs: string[];
}

interface ProviderFieldConfig {
  id?: string;
  label: string;
  key: string;
  type?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  default_value?: string;
}

interface ProviderFieldValuePersisted {
  value?: string;
  source_node_id?: string | null;
}

interface ResolvedProviderField {
  key: string;
  label: string;
  value: string;
  source_node_id?: string | null;
}

export class AiService {
  constructor(private readonly ajv: Ajv) {}

  async run(context: AiContext): Promise<AiResult> {
    const aiConfig = (context.node.config.ai ?? {}) as Record<string, unknown>;
    const providerId = typeof aiConfig.provider === 'string' ? aiConfig.provider : 'stub';

    if (providerId === 'openai') {
      return this.runOpenAi(context, aiConfig);
    }

    return this.generateStubPlan(context);
  }

  private async runOpenAi(context: AiContext, aiConfig: Record<string, unknown>): Promise<AiResult> {
    const integrations = (context.settings?.integrations ?? {}) as Record<string, unknown>;
    const openaiConfig = (integrations.openai ?? integrations.open_ai ?? integrations.openai_gpt ?? {}) as {
      api_key?: string;
      organization?: string;
      base_url?: string;
      input_fields?: ProviderFieldConfig[];
    };

    const apiKey = typeof openaiConfig.api_key === 'string' ? openaiConfig.api_key.trim() : '';
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured for this project.');
    }

    const baseUrl =
      typeof openaiConfig.base_url === 'string' && openaiConfig.base_url.trim().length > 0
        ? openaiConfig.base_url.trim().replace(/\/$/, '')
        : 'https://api.openai.com/v1';
    const endpoint = `${baseUrl}/chat/completions`;

    const model =
      typeof aiConfig.model === 'string' && aiConfig.model.trim().length > 0
        ? aiConfig.model.trim()
        : 'gpt-4.1-mini';
    const temperature = this.parseNumeric(aiConfig.temperature, 0.7);

    const schema = this.ajv.getSchema(context.schemaRef)?.schema ?? this.ajv.getSchema(context.schemaRef.toUpperCase())?.schema;
    const responseFormat = schema && typeof schema === 'object'
      ? {
          type: 'json_schema',
          json_schema: {
            name: `node_${context.node.node_id}`,
            schema,
          },
        }
      : undefined;

    const systemPrompt =
      typeof aiConfig.system_prompt === 'string' && aiConfig.system_prompt.trim().length > 0
        ? aiConfig.system_prompt.trim()
        : 'You are an assistant that produces JSON strictly matching the provided schema.';
    const providerFieldsConfig = Array.isArray(openaiConfig.input_fields)
      ? (openaiConfig.input_fields as ProviderFieldConfig[])
      : [];
    const storedProviderFields = this.parseProviderFields(
      ((context.node.config.ai ?? {}) as Record<string, unknown>).provider_fields,
    );
    const resolvedFields = this.resolveProviderFields(
      providerFieldsConfig,
      storedProviderFields,
      context.previousNodes,
    );

    const userPrompt = this.composeUserPrompt(aiConfig, context, schema, resolvedFields);

    const requestBody: Record<string, unknown> = {
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (responseFormat) {
      requestBody.response_format = responseFormat;
    }
    if (resolvedFields.length > 0) {
      requestBody.metadata = { provider_fields: resolvedFields };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (typeof openaiConfig.organization === 'string' && openaiConfig.organization.trim().length > 0) {
      headers['OpenAI-Organization'] = openaiConfig.organization.trim();
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorText}`.trim());
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const rawContent = payload?.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== 'string') {
      throw new Error('OpenAI returned an empty response.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      throw new Error(`OpenAI response is not valid JSON: ${(error as Error).message}`);
    }

    const validator = this.ajv.getSchema(context.schemaRef) ?? this.ajv.getSchema(context.schemaRef.toUpperCase());
    if (!validator) {
      throw new Error(`Unknown schema: ${context.schemaRef}`);
    }

    if (!validator(parsed)) {
      const message = this.ajv.errorsText(validator.errors, { dataVar: 'AI_RESPONSE' });
      throw new Error(`OpenAI response failed schema validation: ${message}`);
    }

    const normalized = JSON.stringify(parsed, null, 2);
    const logs = [
      `OpenAI model ${model} responded successfully`,
      `Prompt tokens: ${payload.usage?.prompt_tokens ?? 'n/a'}, completion tokens: ${payload.usage?.completion_tokens ?? 'n/a'}`,
      resolvedFields.length > 0
        ? `Provider fields used: ${resolvedFields.map((field) => `${field.key}`).join(', ')}`
        : 'Provider fields not supplied',
    ];

    return {
      output: normalized,
      contentType: 'application/json',
      logs,
    };
  }

  private generateStubPlan(context: AiContext): AiResult {
    const { previousNodes, schemaRef, nextNodes } = context;
    const promptSource = previousNodes[previousNodes.length - 1]?.content ?? '';
    const targetAudience = this.inferTargetAudience(promptSource);
    const goal = this.inferGoal(promptSource);
    const tone = this.inferTone(promptSource);

    const downstream = this.ensureMinimumNodes(nextNodes);

    const plan = {
      overview: {
        goal,
        target_audience: targetAudience,
        tone,
        duration_sec: 30,
      },
      phases: [
        {
          name: 'Идея',
          steps: ['Уточнение брифа', 'Формирование ключевых сообщений'],
        },
        {
          name: 'Производство',
          steps: ['Генерация сцен', 'Подготовка актёров', 'Сбор ассетов'],
        },
        {
          name: 'Пост-продакшн',
          steps: ['Сборка превью', 'Финальный контроль качества'],
        },
      ],
      nodes: downstream.map((node) => ({
        node_id: node.node_id,
        type: node.type,
        title: node.title,
        description: node.short_description,
        outputs: ['structured_json', 'summary_text'],
      })),
    };

    const validator = this.ajv.getSchema(schemaRef) ?? this.ajv.getSchema(schemaRef.toUpperCase());
    if (!validator) {
      throw new Error(`Unknown schema: ${schemaRef}`);
    }

    if (!validator(plan)) {
      const message = this.ajv.errorsText(validator.errors, { dataVar: 'AI_PLAN' });
      throw new Error(`AI stub produced invalid payload: ${message}`);
    }

    const logs = [
      `AI stub local-llm-7b-q5 executed for node ${context.node.node_id}`,
      `Detected target audience: ${targetAudience}`,
      `Generated ${plan.phases.length} phases and ${plan.nodes.length} downstream node descriptors`,
    ];

    return {
      output: JSON.stringify(plan, null, 2),
      contentType: 'application/json',
      logs,
    };
  }

  private composeUserPrompt(
    aiConfig: Record<string, unknown>,
    context: AiContext,
    schema: unknown,
    resolvedFields: ResolvedProviderField[],
  ): string {
    const template =
      typeof aiConfig.user_prompt_template === 'string' && aiConfig.user_prompt_template.trim().length > 0
        ? aiConfig.user_prompt_template.trim()
        : 'Generate a structured JSON response that satisfies the JSON schema and reflects the provided context.';

    const sections: string[] = [template];

    const upstreamSummary = this.buildContextSummary(context.previousNodes);
    if (upstreamSummary) {
      sections.push(`# Upstream Context\n${upstreamSummary}`);
    }

    const nextSummary = this.summarizeNextNodes(context.nextNodes);
    if (nextSummary) {
      sections.push(`# Downstream Targets\n${nextSummary}`);
    }

    if (resolvedFields.length > 0) {
      const fieldSummary = resolvedFields
        .map((field) => `- ${field.label}: ${field.value}`)
        .join('\n');
      sections.push(`# Формы и параметры\n${fieldSummary}`);
    }

    if (schema && typeof schema === 'object') {
      sections.push(`# JSON Schema\n${JSON.stringify(schema, null, 2)}`);
    }

    return sections.join('\n\n');
  }

  private buildContextSummary(nodes: StoredNode[]): string {
    if (nodes.length === 0) return '';
    return nodes
      .map((node) => {
        const snippet = typeof node.content === 'string' ? node.content.slice(0, 2000) : '';
        return `• ${node.title} (${node.node_id})\n${snippet}`;
      })
      .join('\n\n');
  }

  private summarizeNextNodes(nodes: AiContext['nextNodes']): string {
    if (nodes.length === 0) return '';
    return nodes
      .map((node) => `• ${node.title} [${node.type}] — ${node.short_description}`)
      .join('\n');
  }

  private parseNumeric(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

  private ensureMinimumNodes(nodes: AiContext['nextNodes']): AiContext['nextNodes'] {
    const result = [...nodes];
    const defaults: AiContext['nextNodes'] = [
      {
        node_id: 'default_briefing',
        type: 'text',
        title: 'Дополнительный бриф',
        short_description: 'Структурированный бриф по итогам планирования',
        connection_labels: ['auto'],
      },
      {
        node_id: 'default_storyboard',
        type: 'image_gen',
        title: 'Сториборд превью',
        short_description: 'Фиктивные кадры сториборда',
        connection_labels: ['auto'],
      },
      {
        node_id: 'default_voiceover',
        type: 'audio_gen',
        title: 'Голосовое сопровождение',
        short_description: 'Синтезированный текст для озвучки',
        connection_labels: ['auto'],
      },
    ];

    let index = 0;
    while (result.length < 3 && index < defaults.length) {
      result.push(defaults[index]);
      index += 1;
    }

    return result;
  }

  private inferTargetAudience(source: string): string {
    if (/школ/i.test(source)) return 'школьники 10-16 лет';
    if (/взросл/i.test(source)) return 'взрослая аудитория 25-45 лет';
    return 'широкая аудитория';
  }

  private inferGoal(source: string): string {
    if (!source) return 'Повысить узнаваемость бренда';
    return source.split(/[.!?]/)[0]?.trim() || 'Сформировать запоминающийся ролик';
  }

  private inferTone(source: string): string {
    if (/серьез/i.test(source)) return 'серьёзный';
    if (/весел/i.test(source) || /смешн/i.test(source)) return 'игривый';
    return 'динамичный';
  }

  private parseProviderFields(raw: unknown): Record<string, ProviderFieldValuePersisted> {
    if (!raw || typeof raw !== 'object') return {};
    const record: Record<string, ProviderFieldValuePersisted> = {};
    for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const typed = entry as Record<string, unknown>;
      record[key] = {
        value:
          typeof typed.value === 'string'
            ? typed.value
            : typeof typed.value === 'number'
              ? String(typed.value)
              : undefined,
        source_node_id: typeof typed.source_node_id === 'string' ? typed.source_node_id : null,
      };
    }
    return record;
  }

  private resolveProviderFields(
    defs: ProviderFieldConfig[],
    stored: Record<string, ProviderFieldValuePersisted>,
    previousNodes: StoredNode[],
  ): ResolvedProviderField[] {
    if (defs.length === 0) return [];
    const previousMap = new Map<string, StoredNode>();
    previousNodes.forEach((node) => previousMap.set(node.node_id, node));

    return defs.map((field) => {
      const storedValue = stored[field.key];
      if (storedValue?.source_node_id) {
        const upstream = previousMap.get(storedValue.source_node_id);
        const derived = typeof upstream?.content === 'string' ? upstream.content : '';
        return {
          key: field.key,
          label: field.label,
          value:
            derived && derived.trim().length > 0
              ? derived
              : storedValue?.value ?? field.default_value ?? '',
          source_node_id: storedValue.source_node_id,
        };
      }
      return {
        key: field.key,
        label: field.label,
        value: storedValue?.value ?? field.default_value ?? '',
      };
    });
  }
}
