import { ProjectNode } from '../db';

export interface MultiNodeResponse {
  nodes?: Array<{
    type: string;
    title: string;
    content?: string;
    x?: number;
    y?: number;
    meta?: Record<string, unknown>;
    ai?: Record<string, unknown>;
  }>;
}

export interface ProcessedMultiNodes {
  isMultiNode: boolean;
  nodes: Array<{
    type: string;
    slug: string;
    title: string;
    content?: string;
    x: number;
    y: number;
    meta?: Record<string, unknown>;
    ai?: Record<string, unknown>;
  }>;
}

/**
 * Проверяет и обрабатывает ответ AI на предмет создания множественных нод
 */
export function processMultiNodeResponse(
  content: string,
  sourceNode: ProjectNode,
  baseX: number = 400,
  baseY: number = 200
): ProcessedMultiNodes {
  try {
    // Сначала попробуем распарсить как JSON
    const parsed = JSON.parse(content);
    
    // Проверяем наличие массива нод
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      const processedNodes = parsed.nodes.map((nodeData: any, index: number) => {
        // Валидируем обязательные поля
        if (!nodeData.type || !nodeData.title) {
          throw new Error(`Нода ${index} не содержит обязательные поля type и title`);
        }
        
        // Определяем slug для типа ноды
        const slug = getSlugForNodeType(nodeData.type);
        
        return {
          type: nodeData.type,
          slug,
          title: nodeData.title,
          content: nodeData.content || '',
          x: nodeData.x ?? (baseX + (index % 3) * 300), // Размещаем в сетке
          y: nodeData.y ?? (baseY + Math.floor(index / 3) * 200),
          meta: nodeData.meta || {},
          ai: nodeData.ai || {}
        };
      });
      
      return {
        isMultiNode: true,
        nodes: processedNodes
      };
    }
  } catch (error) {
    // Если не JSON или не содержит нод - возвращаем как обычный ответ
  }
  
  return {
    isMultiNode: false,
    nodes: []
  };
}

/**
 * Возвращает slug для типа ноды
 */
function getSlugForNodeType(type: string): string {
  const typeToSlug: Record<string, string> = {
    'text': 'text',
    'ai': 'ai',
    'ai_improved': 'ai_improved', 
    'image': 'image',
    'video': 'video',
    'audio': 'audio',
    'html': 'html',
    'json': 'json',
    'markdown': 'markdown',
    'file': 'file',
    'python': 'python',
    'router': 'router'
  };
  
  return typeToSlug[type] || 'text';
}

/**
 * Генерирует пример формата для агента-планировщика
 */
export function generatePlannerExampleFormat(): string {
  return JSON.stringify({
    nodes: [
      {
        type: "text",
        title: "Анализ данных",
        content: "Проведем анализ предоставленных данных...",
        x: 400,
        y: 200
      },
      {
        type: "ai",
        title: "Генерация отчета", 
        content: "Создай подробный отчет на основе анализа",
        x: 700,
        y: 200,
        ai: {
          system_prompt: "Ты - эксперт по анализу данных. Создавай детальные отчеты.",
          model: "gpt-4",
          temperature: 0.7
        }
      },
      {
        type: "markdown",
        title: "Итоговый документ",
        content: "# Итоги\n\nРезультаты анализа будут представлены здесь...",
        x: 1000,
        y: 200
      }
    ]
  }, null, 2);
}

/**
 * Генерирует системный промпт для агента-планировщика
 */
export function generatePlannerSystemPrompt(): string {
  return `Ты - агент-планировщик workflow. Твоя задача создавать структурированные планы в виде множественных нод.

ДОСТУПНЫЕ ТИПЫ НОД:
- text: Текстовый контент
- ai: AI-агент для генерации
- ai_improved: Улучшенный AI-агент  
- image: Изображение
- video: Видео
- audio: Аудио
- html: HTML контент
- json: JSON данные
- markdown: Markdown документ
- file: Файл
- python: Python код
- router: Маршрутизатор

ФОРМАТ ОТВЕТА:
Всегда отвечай JSON объектом с массивом "nodes". Каждая нода должна содержать:
- type: тип ноды (обязательно)
- title: заголовок (обязательно)
- content: содержимое (опционально)
- x, y: координаты (опционально, будут назначены автоматически)
- meta: дополнительные метаданные (опционально)
- ai: конфигурация AI для AI-нод (опционально)

ПРИМЕР:
{
  "nodes": [
    {
      "type": "text",
      "title": "Постановка задачи", 
      "content": "Описание задачи..."
    },
    {
      "type": "ai",
      "title": "Анализ данных",
      "content": "Проанализируй данные и выдай рекомендации",
      "ai": {
        "system_prompt": "Ты эксперт по анализу данных"
      }
    }
  ]
}

Создавай логичные workflow с последовательностью операций.`;
}