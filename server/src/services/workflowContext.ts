/**
 * Workflow Context Generation Service
 * 
 * Генерирует текстовое представление workflow для AI агента чата.
 * Поддерживает 3 режима: agent (полный доступ), edit (только контент), ask (read-only).
 */

import { db } from '../db';
import type { ProjectNode, ProjectEdge } from '../db';

export type AgentMode = 'agent' | 'edit' | 'ask';
export type ContextLevel = 0 | 1 | 2 | 3 | 4 | 5;

interface WorkflowContextOptions {
  mode: AgentMode;
  maxTokens?: number; // Лимит токенов (приблизительно 1 токен = 4 символа)
  depth?: number; // DEPRECATED, use context_level
  context_level?: ContextLevel; // 0=нет, 1=описание, 2=clean, 3=simple, 4=simple_json, 5=full_json
}

/**
 * Главная функция генерации контекста workflow
 */
export function generateWorkflowContext(
  projectId: string,
  options: WorkflowContextOptions = { mode: 'ask', maxTokens: 8000, depth: 2 }
): string {
  if (!projectId) {
    return 'No workflow context available (project not specified).';
  }

  const { 
    mode, 
    maxTokens = 8000, 
    depth = 2, 
    context_level
  } = options;
  
  // Use context_level if provided, otherwise fallback to depth
  const rawLevel = context_level !== undefined ? context_level : (depth > 5 ? 5 : depth);
  const level = Math.min(Math.max(0, rawLevel), 5) as ContextLevel;

  // Level 0 = no context
  if (level === 0) {
    return 'No workflow context (level 0).';
  }

  // Загружаем ноды и связи из БД
  const nodes = db.prepare('SELECT * FROM nodes WHERE project_id = ?').all(projectId) as ProjectNode[];
  const edges = db.prepare('SELECT * FROM edges WHERE project_id = ?').all(projectId) as ProjectEdge[];

  if (nodes.length === 0) {
    return 'No workflow nodes found in this project.';
  }

    // Level 1 = Project description only (from projects table)
  if (level === 1) {
    const project = db.prepare('SELECT description FROM projects WHERE project_id = ?').get(projectId) as any;
    if (project?.description?.trim()) {
      return project.description.trim();
    }
    return '';
  }

  // Levels 2-5: Full workflow with varying detail
  let context = '';
  
  switch (mode) {
    case 'agent':
      context = serializeFullWorkflow(nodes, edges, level);
      break;
    case 'edit':
      context = serializeNodesContentOnly(nodes, level);
      break;
    case 'ask':
      context = serializeReadOnlyContext(nodes, level);
      break;
    default:
      context = serializeReadOnlyContext(nodes, level);
  }

  // Обрезаем если превышает лимит токенов (приблизительно 1 токен = 4 символа)
  const maxChars = maxTokens * 4;
  if (context.length > maxChars) {
    context = context.substring(0, maxChars) + '\n\n... (context truncated due to token limit)';
  }

  return context;
}

/**
 * CLEAN MODE: Компактный вывод через разделитель " ; "
 */
function serializeCleanWorkflow(nodes: ProjectNode[], edges: ProjectEdge[], level: ContextLevel): string {
  const parts: string[] = [];
  
  for (const node of nodes) {
    try {
      const data = typeof node.data === 'string' ? JSON.parse(node.data) : (node.data || {});
      const title = data.label || data.title || node.title || 'Untitled';
      const content = getNodeContent(node);
      
      if (level >= 5) {
        // Level 5 = Full JSON
        parts.push(`${title}: ${JSON.stringify({ type: node.type, content, data })}`);
      } else if (level >= 4) {
        // Level 4 = Detailed with metadata
        parts.push(`${title} (${node.type}): ${content || '(empty)'}`);
      } else if (level >= 3) {
        // Level 3 = Extended with type
        parts.push(`${title} [${node.type}]: ${content ? content.substring(0, 200) : '(empty)'}`);
      } else {
        // Level 2 = Basic
        parts.push(`${title}: ${content ? content.substring(0, 100) : '(empty)'}`);
      }
    } catch (error) {
      parts.push(`${node.node_id}: (error)`);
    }
  }
  
  return parts.join(' ; ');
}

/**
 * AGENT MODE: Полный контекст - все ноды + связи + метаданные
 * 
 * Уровни контекста:
 * 0 - Нет контекста
 * 1 - Только описание проекта
 * 2 - Clean context (компактный текст)
 * 3 - Простой текст (расширенный)
 * 4 - JSON упрощенный
 * 5 - JSON полный
 */
function serializeFullWorkflow(nodes: ProjectNode[], edges: ProjectEdge[], level: ContextLevel): string {
  // Level 0: No context
  if (level === 0) {
    return '';
  }

  // Level 1: Project description only (handled in generateWorkflowContext)
  if (level === 1) {
    return ''; // Will be handled at higher level
  }

  // Level 2: Clean context (compact text)
  if (level === 2) {
    return serializeCleanWorkflow(nodes, edges, level);
  }

  // Level 3: Simple text (extended)
  if (level === 3) {
    let context = '=== WORKFLOW CONTEXT ===\n\n';
    context += `Total nodes: ${nodes.length}\n`;
    context += `Total edges: ${edges.length}\n\n`;

    const sortedNodes = [...nodes].sort((a, b) => {
      const aTime = (a.updated_at || a.created_at) as string;
      const bTime = (b.updated_at || b.created_at) as string;
      return bTime.localeCompare(aTime);
    });

    context += '--- Nodes ---\n\n';
    for (const node of sortedNodes) {
      const title = getNodeTitle(node);
      const content = getNodeContent(node);
      context += `**${title}** (${node.type})\n`;
      context += `${content || '(empty)'}\n\n`;
    }

    return context;
  }

  // Level 4: Simple JSON
  if (level === 4) {
    const result = {
      nodes: nodes.map(n => ({
        id: n.node_id,
        type: n.type,
        title: getNodeTitle(n),
        content: getNodeContent(n),
      })),
      edges: edges.map(e => ({
        from: e.from,
        to: e.to,
        label: e.label,
      })),
    };
    return JSON.stringify(result, null, 2);
  }

  // Level 5: Full JSON
  if (level === 5) {
    const result = {
      nodes: nodes.map(n => ({
        id: n.node_id,
        type: n.type,
        title: getNodeTitle(n),
        content: getNodeContent(n),
        position: { x: n.x, y: n.y },
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
        ai: n.ai,
      })),
      edges: edges.map(e => ({
        from: e.from,
        to: e.to,
        label: e.label,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    };
    return JSON.stringify(result, null, 2);
  }

  // Default: return empty (shouldn't reach here)
  return '';
}

/**
 * EDIT MODE: Только контент нод без структуры
 * 
 * Уровни контекста:
 * 0 - Нет контекста
 * 1 - Только описание проекта
 * 2 - Clean context (компактный текст)
 * 3 - Простой текст (расширенный)
 * 4 - JSON упрощенный
 * 5 - JSON полный
 */
function serializeNodesContentOnly(nodes: ProjectNode[], level: ContextLevel): string {
  // Level 0: No context
  if (level === 0) {
    return '';
  }

  // Level 1: handled at higher level
  if (level === 1) {
    return '';
  }

  // Level 2: Clean context (compact text)
  if (level === 2) {
    const parts: string[] = [];
    for (const node of nodes) {
      const title = getNodeTitle(node);
      const content = getNodeContent(node);
      if (content) {
        const preview = content.length > 150 ? content.substring(0, 150) : content;
        parts.push(`${title}: ${preview}`);
      }
    }
    return parts.join(' ; ');
  }

  // Level 3: Simple text (extended)
  if (level === 3) {
    let context = '=== EDITABLE NODES ===\n\n';
    context += `Total nodes: ${nodes.length}\n\n`;

    const sortedNodes = [...nodes].sort((a, b) => {
      const aTime = (a.updated_at || a.created_at) as string;
      const bTime = (b.updated_at || b.created_at) as string;
      return bTime.localeCompare(aTime);
    });

    context += '--- Nodes ---\n\n';
    for (const node of sortedNodes) {
      const title = getNodeTitle(node);
      const content = getNodeContent(node);
      context += `**${title}** (${node.type})\n`;
      context += `${content || '(empty)'}\n\n`;
    }

    return context;
  }

  // Level 4: Simple JSON
  if (level === 4) {
    const result = {
      nodes: nodes.map(n => ({
        type: n.type,
        title: getNodeTitle(n),
        content: getNodeContent(n),
      })),
    };
    return JSON.stringify(result, null, 2);
  }

  // Level 5: Full JSON
  if (level === 5) {
    const result = {
      nodes: nodes.map(n => ({
        id: n.node_id,
        type: n.type,
        title: getNodeTitle(n),
        content: getNodeContent(n),
        position: { x: n.x, y: n.y },
        data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data,
      })),
    };
    return JSON.stringify(result, null, 2);
  }

  // Default: return empty
  return '';
}

/**
 * ASK MODE: Read-only контекст
 * 
 * Уровни контекста:
 * 0 - Нет контекста
 * 1 - Только описание проекта
 * 2 - Clean context (компактный текст)
 * 3 - Простой текст (расширенный)
 * 4 - JSON упрощенный
 * 5 - JSON полный
 */
function serializeReadOnlyContext(nodes: ProjectNode[], level: ContextLevel): string {
  // Level 0: No context
  if (level === 0) {
    return '';
  }

  // Level 1: Project description only (handled in generateWorkflowContext)
  if (level === 1) {
    return ''; // Will be handled at higher level
  }

  // Level 2: Clean context (compact text)
  if (level === 2) {
    const parts: string[] = [];
    for (const node of nodes) {
      const title = getNodeTitle(node);
      const content = getNodeContent(node);
      if (content) {
        const preview = content.length > 150 ? content.substring(0, 150) : content;
        parts.push(`${title}: ${preview}`);
      }
    }
    return parts.join(' ; ');
  }

  // Level 3: Simple text (extended)
  if (level === 3) {
    let context = '=== WORKFLOW INFORMATION ===\n\n';
    context += `Total nodes: ${nodes.length}\n\n`;

    const sortedNodes = [...nodes].sort((a, b) => {
      const aTime = (a.updated_at || a.created_at) as string;
      const bTime = (b.updated_at || b.created_at) as string;
      return bTime.localeCompare(aTime);
    });

    context += '--- Nodes ---\n\n';
    for (const node of sortedNodes) {
      const title = getNodeTitle(node);
      const content = getNodeContent(node);
      context += `**${title}** (${node.type})\n`;
      context += `${content || '(empty)'}\n\n`;
    }

    return context;
  }

  // Level 4: Simple JSON
  if (level === 4) {
    const result = {
      nodes: nodes.map(n => ({
        type: n.type,
        title: getNodeTitle(n),
        content: getNodeContent(n),
      })),
    };
    return JSON.stringify(result, null, 2);
  }

  // Level 5: Full JSON
  if (level === 5) {
    const result = {
      nodes: nodes.map(n => {
        const ai = typeof n.ai === 'string' ? JSON.parse(n.ai) : n.ai;
        const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
        return {
          id: n.node_id,
          type: n.type,
          title: getNodeTitle(n),
          content: getNodeContent(n),
          position: { x: n.x, y: n.y },
          data,
          ai: ai && Object.keys(ai).length > 0 ? ai : undefined,
        };
      }),
    };
    return JSON.stringify(result, null, 2);
  }

  // Default: return empty (shouldn't reach here)
  return '';
}

/**
 * Вспомогательные функции
 */

function getNodeContent(node: ProjectNode): string {
  // Прямой content
  if (node.content) {
    return typeof node.content === 'string' ? node.content : JSON.stringify(node.content);
  }

  // Из data
  try {
    const data = typeof node.data === 'string' ? JSON.parse(node.data) : (node.data || {});
    if (data.content) {
      return typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
    }
    if (data.text) {
      return typeof data.text === 'string' ? data.text : JSON.stringify(data.text);
    }
    if (data.description) {
      return typeof data.description === 'string' ? data.description : JSON.stringify(data.description);
    }
  } catch (error) {
    // Игнорируем ошибки парсинга
  }

  return '';
}

function getNodeTitle(node: ProjectNode | undefined): string {
  if (!node) return 'Unknown';
  
  try {
    const data = typeof node.data === 'string' ? JSON.parse(node.data) : (node.data || {});
    return data.label || data.title || node.title || node.node_id;
  } catch (error) {
    return node.title || node.node_id;
  }
}
