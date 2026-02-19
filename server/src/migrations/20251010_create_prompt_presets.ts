import * as crypto from 'crypto';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251010_create_prompt_presets';

const plannerPrompt = `Ты - агент-планировщик workflow. Твоя задача создавать структурированные планы в виде множественных нод.

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

ПРАВИЛА СОЗДАНИЯ НОД:
1. Всегда указывай type и title (обязательно!)
2. Добавляй content с описанием того, что должна делать нода
3. Для AI-нод добавляй ai конфигурацию с system_prompt
4. Создавай логическую последовательность - от постановки задачи к результату
5. Используй разные типы нод для разнообразия workflow

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
- text: для описаний, планов, заметок
- ai: для генерации контента, анализа, обработки
- python: для вычислений, обработки данных
- image: для создания диаграмм, схем
- markdown: для отчетов, документации
- json: для структурированных результатов

Создавай практичные и полезные workflow!`;

const mindmapExample = JSON.stringify(
  {
    nodes: [
      {
        type: 'text',
        title: '1. Подготовка к ремонту',
        content: 'Определение бюджета, создание плана работ и списка необходимых материалов',
        children: [
          {
            type: 'ai',
            title: '1.1. Расчет бюджета',
            content: 'AI-агент для расчета стоимости материалов и работ',
            ai: {
              system_prompt: 'Рассчитай примерный бюджет для ремонта санузла',
              model: 'gpt-4',
              temperature: 0.7,
            },
          },
          {
            type: 'text',
            title: '1.2. План работ',
            content: 'Последовательность выполнения ремонтных работ',
          },
        ],
      },
      {
        type: 'ai_improved',
        title: '2. Список покупок',
        content: 'AI-агент для создания детального списка покупок',
        ai: {
          system_prompt: 'Создай подробный список покупок с брендами и моделями',
          model: 'gpt-4',
          temperature: 0.5,
        },
        children: [
          {
            type: 'json',
            title: '2.1. Структурированный список',
            content: 'Список в JSON формате для удобства',
          },
        ],
      },
      {
        type: 'markdown',
        title: '3. Отчет по проекту',
        content: '# План ремонта санузла\n\n## Основные этапы\n\n1. Демонтаж\n2. Черновые работы\n3. Чистовая отделка',
      },
    ],
  },
  null,
  2,
);

export const createPromptPresetsMigration: Migration = {
  id: MIGRATION_ID,
  name: 'Create prompt_presets table',
  run: (db: BetterSqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_presets (
        preset_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        tags_json TEXT,
        is_quick_access INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_prompt_presets_category
      ON prompt_presets(category);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_prompt_presets_quick
      ON prompt_presets(category, is_quick_access, sort_order);
    `);

    const existing = db
      .prepare(`SELECT COUNT(*) as count FROM prompt_presets`)
      .get() as { count: number } | undefined;

    if (!existing || existing.count === 0) {
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO prompt_presets (
          preset_id,
          category,
          label,
          description,
          content,
          tags_json,
          is_quick_access,
          sort_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insert.run(
        crypto.randomUUID(),
        'system_prompt',
        'Планировщик',
        'Базовый системный промпт для генерации workflow планов',
        plannerPrompt,
        JSON.stringify(['workflow', 'planner', 'default']),
        1,
        1,
        now,
        now,
      );

      insert.run(
        crypto.randomUUID(),
        'output_example',
        'Mindmap',
        'Пример выходных данных в формате mindmap',
        mindmapExample,
        JSON.stringify(['mindmap', 'example', 'default']),
        1,
        1,
        now,
        now,
      );
    }
  },
};
