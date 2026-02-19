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
 * Validates and processes AI response for multi-node creation
 */
export function processMultiNodeResponse(
  content: string,
  sourceNode: ProjectNode,
  baseX: number = 400,
  baseY: number = 200
): ProcessedMultiNodes {
  try {
    // First, try to parse as JSON
    const parsed = JSON.parse(content);
    
    // Check for the presence of a nodes array
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      const processedNodes = parsed.nodes.map((nodeData: any, index: number) => {
        // Validate required fields
        if (!nodeData.type || !nodeData.title) {
          throw new Error(`Node ${index} is missing required fields type and title`);
        }

        // Determine slug for node type
        const slug = getSlugForNodeType(nodeData.type);
        
        return {
          type: nodeData.type,
          slug,
          title: nodeData.title,
          content: nodeData.content || '',
          x: nodeData.x ?? (baseX + (index % 3) * 300), // Place in grid
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
    // If not JSON or does not contain nodes - return as a regular response
  }
  
  return {
    isMultiNode: false,
    nodes: []
  };
}

/**
 * Returns slug for a given node type
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
 * Generates an example format for the planner agent
 */
export function generatePlannerExampleFormat(): string {
  return JSON.stringify({
    nodes: [
      {
        type: "text",
        title: "1. Project Planning",
        content: "Defining goals and overall project strategy",
        children: [
          {
            type: "ai",
            title: "1.1. Requirements Analysis",
            content: "Detailed analysis of project requirements",
            ai: {
              system_prompt: "Analyze the project requirements and identify key tasks",
              model: "gpt-4",
              temperature: 0.3
            },
            children: [
              {
                type: "text",
                title: "1.1.1. Gathering Requirements Data",
                content: "Client interviews and collection of technical requirements"
              },
              {
                type: "text",
                title: "1.1.2. Documenting Requirements",
                content: "Creating a requirements specification"
              }
            ]
          },
          {
            type: "python",
            title: "1.2. Resource Estimation",
            content: "# Project time and budget estimation\nbudget = calculate_project_budget()\ntime_estimate = estimate_timeline()",
            children: [
              {
                type: "ai",
                title: "1.2.1. Effort Estimation",
                content: "AI agent for automatic estimation of task completion time",
                ai: {
                  system_prompt: "Estimate the effort for each project phase based on historical data",
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
        title: "2. Implementation",
        content: "Project execution phase",
        children: [
          {
            type: "ai",
            title: "2.1. Architecture Design",
            content: "Creating the technical architecture of the solution",
            ai: {
              system_prompt: "Design a system architecture considering scalability and performance",
              model: "gpt-4",
              temperature: 0.4
            }
          },
          {
            type: "image",
            title: "2.2. Diagram Creation",
            content: "Visualization of architecture and processes"
          }
        ]
      },
      {
        type: "markdown",
        title: "3. Final Report",
        content: "# Project Report\n\n## Key Results\n\n- Achieved goals\n- Performance metrics\n\n## Recommendations\n\nSuggestions for further development..."
      }
    ]
  }, null, 2);
}

/**
 * Generates a system prompt for the planner agent
 */
export function generatePlannerSystemPrompt(): string {
  return `You are a workflow planner agent. Your task is to create structured plans as multiple nodes.

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

NODE COLOR SCHEME (for creating a visually clear map):
• text: #64748b (gray) - neutral color for notes
• ai: #8b5cf6 (purple) - smart purple for AI
• ai_improved: #8b5cf6 (purple) - same color as ai
• image: #ec4899 (pink) - bright for visual content
• video: #06b6d4 (cyan) - aquatic color for video
• audio: #84cc16 (lime) - energetic for audio
• html: #f97316 (orange) - web color for HTML
• json: #6b7280 (dark gray) - structured data
• markdown: #6b7280 (dark gray) - documentation
• file: #f59e0b (amber) - file color
• python: #6b7280 (dark gray) - neutral for code
• router: #6b7280 (dark gray) - logic color

NODE CREATION RULES:
1. Always specify type and title (required!)
2. Add content with a description of what the node should do
3. For AI nodes, add ai configuration with system_prompt
4. Create a logical sequence - from problem statement to result
5. Use different node types for workflow diversity
6. Choose types to create a visually appealing color map
7. CREATE HIERARCHY: use the "children" field to create nested nodes
8. Build multi-level trees: main phases -> sub-phases -> detailed tasks

RESPONSE FORMAT WITH HIERARCHY (strict JSON):
{
  "nodes": [
    {
      "type": "node_type",
      "title": "Main Phase",
      "content": "Description of the main phase",
      "children": [
        {
          "type": "node_type",
          "title": "Sub-phase 1",
          "content": "Description of the sub-phase",
          "children": [
            {
              "type": "node_type",
              "title": "Detailed Task",
              "content": "Specific task",
              "ai": {
                "system_prompt": "Instructions for AI",
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

TYPE USAGE EXAMPLES:
- text: for descriptions, plans, notes (gray)
- ai: for content generation, analysis, processing (purple)
- python: for computations, data processing (gray)
- image: for creating diagrams, charts (pink)
- video: for demonstrations, tutorial videos (cyan)
- audio: for podcasts, interview recordings (lime)
- html: for web pages, interfaces (orange)
- markdown: for reports, documentation (gray)
- json: for structured results (gray)
- file: for documents, resources (amber)

Create practical and useful workflows with a beautiful color scheme!`;
}