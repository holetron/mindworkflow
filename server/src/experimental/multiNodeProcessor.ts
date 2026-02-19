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
        title: "1. Планирование проекта",
        content: "Определение целей и общей стратегии проекта",
        children: [
          {
            type: "ai",
            title: "1.1. Анализ требований",
            content: "Детальный анализ требований к проекту",
            ai: {
              system_prompt: "Проанализируй требования проекта и выдели ключевые задачи",
              model: "gpt-4",
              temperature: 0.3
            },
            children: [
              {
                type: "text",
                title: "1.1.1. Сбор данных о требованиях",
                content: "Интервью с заказчиком и сбор технических требований"
              },
              {
                type: "text", 
                title: "1.1.2. Документирование требований",
                content: "Создание спецификации требований"
              }
            ]
          },
          {
            type: "python",
            title: "1.2. Расчет ресурсов",
            content: "# Расчет времени и бюджета проекта\nbudget = calculate_project_budget()\ntime_estimate = estimate_timeline()",
            children: [
              {
                type: "ai",
                title: "1.2.1. Оценка трудозатрат", 
                content: "ИИ-агент для автоматической оценки времени выполнения задач",
                ai: {
                  system_prompt: "Оцени трудозатраты для каждого этапа проекта на основе исторических данных",
                  model: "gpt-4",
                  temperature: 0.2
                }
              }
            ]
          }
        ]
      },
      {
        type: "text",
        title: "2. Реализация",
        content: "Этап выполнения проекта",
        children: [
          {
            type: "ai",
            title: "2.1. Разработка архитектуры",
            content: "Создание технической архитектуры решения",
            ai: {
              system_prompt: "Спроектируй архитектуру системы с учетом масштабируемости и производительности",
              model: "gpt-4", 
              temperature: 0.4
            }
          },
          {
            type: "image",
            title: "2.2. Создание диаграмм",
            content: "Визуализация архитектуры и процессов"
          }
        ]
      },
      {
        type: "markdown",
        title: "3. Итоговый отчет",
        content: "# Отчет по проекту\n\n## Основные результаты\n\n- Достигнутые цели\n- Метрики производительности\n\n## Рекомендации\n\nПредложения по дальнейшему развитию..."
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
• text - Текстовый контент, заметки, описания
• ai - AI-агент для генерации контента (используй для задач требующих ИИ)
• ai_improved - Улучшенный AI-агент с расширенными возможностями  
• image - Изображения, картинки, визуализации
• video - Видео контент, демонстрации
• audio - Аудио контент, подкасты, записи
• html - HTML страницы, веб-контент
• json - Структурированные данные в JSON формате
• markdown - Документы в формате Markdown
• file - Файлы, документы, ресурсы
• python - Python код, скрипты, вычисления
• router - Условная логика, маршрутизация между нодами

ЦВЕТОВАЯ СХЕМА НОД (для создания визуально понятной карты):
• text: #64748b (серый) - нейтральный цвет для заметок
• ai: #8b5cf6 (фиолетовый) - умный фиолетовый для ИИ 
• ai_improved: #8b5cf6 (фиолетовый) - тот же цвет что и ai
• image: #ec4899 (розовый) - яркий для визуального контента
• video: #06b6d4 (голубой) - водный цвет для видео
• audio: #84cc16 (лайм) - энергичный для аудио
• html: #f97316 (оранжевый) - веб-цвет для HTML
• json: #6b7280 (темно-серый) - структурированные данные
• markdown: #6b7280 (темно-серый) - документация
• file: #f59e0b (янтарный) - файловый цвет
• python: #6b7280 (темно-серый) - нейтральный для кода
• router: #6b7280 (темно-серый) - логический цвет

ПРАВИЛА СОЗДАНИЯ НОД:
1. Всегда указывай type и title (обязательно!)
2. Добавляй content с описанием того, что должна делать нода
3. Для AI-нод добавляй ai конфигурацию с system_prompt
4. Создавай логическую последовательность - от постановки задачи к результату
5. Используй разные типы нод для разнообразия workflow
6. Подбирай типы так, чтобы получалась красивая цветовая карта
7. СОЗДАВАЙ ИЕРАРХИЮ: используй поле "children" для создания вложенных нод
8. Стройте многоуровневые деревья: основные этапы → подэтапы → детальные задачи

ФОРМАТ ОТВЕТА С ИЕРАРХИЕЙ (строго JSON):
{
  "nodes": [
    {
      "type": "тип_ноды",
      "title": "Основной этап", 
      "content": "Описание основного этапа",
      "children": [
        {
          "type": "тип_ноды",
          "title": "Подэтап 1",
          "content": "Описание подэтапа",
          "children": [
            {
              "type": "тип_ноды",
              "title": "Детальная задача",
              "content": "Конкретная задача",
              "ai": {
                "system_prompt": "Инструкции для ИИ",
                "model": "gpt-4",
                "temperature": 0.7
              }
            }
          ]
        }
      ]
    }
  ]
}

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ТИПОВ:
- text: для описаний, планов, заметок (серый)
- ai: для генерации контента, анализа, обработки (фиолетовый) 
- python: для вычислений, обработки данных (серый)
- image: для создания диаграмм, схем (розовый)
- video: для демонстраций, обучающих роликов (голубой)
- audio: для подкастов, записей интервью (лайм)
- html: для веб-страниц, интерфейсов (оранжевый)
- markdown: для отчетов, документации (серый)
- json: для структурированных результатов (серый)
- file: для документов, ресурсов (янтарный)

Создавай практичные и полезные workflow с красивой цветовой схемой!`;
}