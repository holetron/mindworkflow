import * as crypto from 'crypto';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import type { Migration } from './index';

const MIGRATION_ID = '20251010_create_prompt_presets';

const plannerPrompt = `You are a workflow planner agent. Your task is to create structured plans as multiple nodes.

AVAILABLE NODE TYPES:
• text - Text content, notes, descriptions
• ai - AI agent for content generation (use for tasks requiring AI)
• ai_improved - Enhanced AI agent with extended capabilities
• image - Images, pictures, visualizations
• video - Video content, demonstrations
• audio - Audio content, podcasts, recordings
• html - HTML pages, web content
• json - Structured data in JSON format
• markdown - Documents in Markdown format
• file - Files, documents, resources
• python - Python code, scripts, computations
• router - Conditional logic, routing between nodes

NODE CREATION RULES:
1. Always specify type and title (required!)
2. Add content with a description of what the node should do
3. For AI nodes, add ai configuration with system_prompt
4. Create a logical sequence - from problem statement to result
5. Use different node types for workflow diversity

RESPONSE FORMAT (strict JSON):
{
  "nodes": [
    {
      "type": "node_type",
      "title": "Node Title",
      "content": "Description of the node task",
      "ai": {
        "system_prompt": "Instructions for AI",
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  ]
}

TYPE USAGE EXAMPLES:
- text: for descriptions, plans, notes
- ai: for content generation, analysis, processing
- python: for computations, data processing
- image: for creating diagrams, charts
- markdown: for reports, documentation
- json: for structured results

Create practical and useful workflows!`;

const mindmapExample = JSON.stringify(
  {
    nodes: [
      {
        type: 'text',
        title: '1. Renovation Preparation',
        content: 'Budget definition, work plan creation, and list of required materials',
        children: [
          {
            type: 'ai',
            title: '1.1. Budget Estimation',
            content: 'AI agent for calculating material and labor costs',
            ai: {
              system_prompt: 'Estimate an approximate budget for a bathroom renovation',
              model: 'gpt-4',
              temperature: 0.7,
            },
          },
          {
            type: 'text',
            title: '1.2. Work Plan',
            content: 'Sequence of renovation work execution',
          },
        ],
      },
      {
        type: 'ai_improved',
        title: '2. Shopping List',
        content: 'AI agent for creating a detailed shopping list',
        ai: {
          system_prompt: 'Create a detailed shopping list with brands and models',
          model: 'gpt-4',
          temperature: 0.5,
        },
        children: [
          {
            type: 'json',
            title: '2.1. Structured List',
            content: 'List in JSON format for convenience',
          },
        ],
      },
      {
        type: 'markdown',
        title: '3. Project Report',
        content: '# Bathroom Renovation Plan\n\n## Main Phases\n\n1. Demolition\n2. Rough Work\n3. Finish Work',
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
        'Planner',
        'Basic system prompt for generating workflow plans',
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
        'Example output data in mindmap format',
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
