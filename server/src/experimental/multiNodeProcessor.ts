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
        title: "1. Постановка задачи",
        content: "Определяем цели и требования проекта"
      },
      {
        type: "python", 
        title: "2. Обработка данных",
        content: "import pandas as pd\n# Загрузка и очистка данных\ndata = pd.read_csv('input.csv')\nclean_data = data.dropna()"
      },
      {
        type: "ai",
        title: "3. Анализ результатов", 
        content: "Проанализируй обработанные данные и сделай выводы",
        ai: {
          system_prompt: "Ты - эксперт по анализу данных. Давай четкие и структурированные выводы на основе предоставленных данных.",
          model: "gpt-4",
          temperature: 0.3
        }
      },
      {
        type: "markdown",
        title: "4. Итоговый отчет",
        content: "# Отчет по анализу данных\n\n## Основные выводы\n\n- Ключевые находки из анализа\n- Статистические показатели\n\n## Рекомендации\n\nПредложения по дальнейшим действиям..."
      },
      {
        type: "image",
        title: "5. Визуализация",
        content: "Создание графиков и диаграмм для презентации результатов"
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

ФОРМАТ ОТВЕТА (строго JSON):
{
  "nodes": [
    {
      "type": "тип_ноды",
      "title": "Название ноды", 
      "content": "Описание задачи ноды",
      "ai": {
        "system_prompt": "Инструкции для ИИ",
        "model": "gpt-4",
        "temperature": 0.7
      }
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