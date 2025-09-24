import { createProjectNode, addProjectEdge, withTransaction } from '../db';

export interface NodeSpec {
  type: string;
  title: string;
  content?: string;
  slug?: string;
  meta?: Record<string, unknown>;
  ai?: Record<string, unknown>;
}

export interface TransformResult {
  createdNodes: Array<{ node_id: string; type: string; title: string }>;
  logs: string[];
}

// Функция определения цвета по типу ноды
function getNodeTypeColor(type: string): string {
  switch (type) {
    case 'input': return '#10b981'; // green
    case 'output': return '#f59e0b'; // amber
    case 'ai': return '#8b5cf6'; // purple
    case 'ai_improved': return '#8b5cf6'; // purple
    case 'text': return '#64748b'; // slate
    case 'file': return '#f59e0b'; // amber
    case 'image': return '#ec4899'; // pink
    case 'video': return '#06b6d4'; // cyan
    case 'audio': return '#84cc16'; // lime
    case 'html': return '#f97316'; // orange
    case 'transformer': return '#3b82f6'; // blue
    default: return '#6b7280'; // gray
  }
}

export class TransformerService {
  /**
   * Парсит JSON с нодами и создает красивое дерево нод слева направо
   */
  async transformJsonToNodes(
    projectId: string,
    sourceNodeId: string,
    jsonContent: string,
    startX: number,
    startY: number
  ): Promise<TransformResult> {
      const logs: string[] = [];
      try {
        logs.push(`Получен JSON от ИИ (первые 200 символов): ${jsonContent.substring(0, 200)}...`);
        console.log('[TransformerService] Full JSON content:', jsonContent);
        const parsed = JSON.parse(jsonContent);
        let nodes: NodeSpec[] = [];
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          nodes = parsed.nodes;
          logs.push(`Найдено поле nodes с ${nodes.length} элементами`);
        } else if (Array.isArray(parsed)) {
          nodes = parsed;
          logs.push(`JSON является массивом с ${nodes.length} элементами`);
        } else {
          logs.push(`Неверный формат JSON. Тип: ${typeof parsed}, содержимое: ${JSON.stringify(parsed, null, 2)}`);
          throw new Error('JSON должен содержать массив nodes или быть массивом нод');
        }
        logs.push(`Найдено ${nodes.length} нод для создания`);
        const createdNodes: Array<{ node_id: string; type: string; title: string }> = [];
        
        // Параметры для красивого mindmap с шахматным расположением
        const levelSpacing = 500; // расстояние между уровнями по горизонтали
        const nodeSpacing = 200; // базовое расстояние между нодами по вертикали
        const staggerOffset = 120; // смещение для шахматного порядка
        const verticalPadding = 50; // дополнительный отступ между группами

        // Рекурсивная функция для построения красивого дерева
        function createTree(nodeSpec: any, parentId: string, depth: number, x: number, baseY: number, siblingIndex: number = 0, totalSiblings: number = 1) {
          if (depth > 100) return; // ограничение по глубине
          
          // Вычисляем позицию с шахматным порядком для лучшей визуальной иерархии
          let y = baseY;
          if (totalSiblings > 1) {
            // Располагаем ноды в шахматном порядке с чередованием
            const isEven = siblingIndex % 2 === 0;
            const verticalOffset = Math.floor(siblingIndex / 2) * nodeSpacing;
            y = baseY + (isEven ? -verticalOffset - verticalPadding : verticalOffset + nodeSpacing + verticalPadding);
            
            // Добавляем дополнительное смещение для красивого staggered эффекта
            if (depth > 1) {
              const levelStagger = (depth % 2 === 0 ? staggerOffset : -staggerOffset);
              y += levelStagger;
            }
          }
          
          // Создаем ноду
          const { node } = createProjectNode(projectId, {
            type: nodeSpec.type || 'text',
            title: nodeSpec.title || `Нода`,
            content: nodeSpec.content || '',
            slug: nodeSpec.slug,
            meta: nodeSpec.meta,
            ai: nodeSpec.ai,
            ui: {
              color: getNodeTypeColor(nodeSpec.type || 'text')
            }
          }, {
            position: { x, y }
          });
          
          // Связь с родителем
          addProjectEdge(projectId, {
            from: parentId,
            to: node.node_id,
          });
          
          createdNodes.push({ node_id: node.node_id, type: node.type, title: node.title });
          logs.push(`Создана нода: ${node.title} (${node.type}) на уровне ${depth} в шахматной позиции (${x}, ${y})`);
          
          // Если есть дети — рекурсивно создаем их с красивым расположением
          if (Array.isArray(nodeSpec.children) && nodeSpec.children.length > 0) {
            const childrenCount = nodeSpec.children.length;
            const childX = x + levelSpacing;
            
            nodeSpec.children.forEach((child: any, idx: number) => {
              createTree(child, node.node_id, depth + 1, childX, y, idx, childrenCount);
            });
          }
        }

        return Promise.resolve(
          withTransaction(() => {
            // Корневые ноды тоже располагаем в шахматном порядке
            const rootCount = nodes.length;
            nodes.forEach((nodeSpec, idx) => {
              const x = startX + levelSpacing;
              
              // Для корневых нод применяем тот же алгоритм шахматного расположения
              let y = startY;
              if (rootCount > 1) {
                const isEven = idx % 2 === 0;
                const verticalOffset = Math.floor(idx / 2) * nodeSpacing;
                y = startY + (isEven ? -verticalOffset - verticalPadding : verticalOffset + nodeSpacing + verticalPadding);
              }
              
              createTree(nodeSpec, sourceNodeId, 1, x, y, idx, rootCount);
            });
            return { createdNodes, logs };
          })
        );
      } catch (err) {
        logs.push(`Ошибка: ${err}`);
        throw err;
      }
    }
  }