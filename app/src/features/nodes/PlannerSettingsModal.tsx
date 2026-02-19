import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FlowNode } from '../../state/api';

interface NodeTypeConfig {
  type: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  enabled: boolean;
}

interface PlannerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  currentPrompt?: string;
  onSave: (settings: { prompt: string; outputExample: string }) => void;
  triggerElementRef?: React.RefObject<HTMLButtonElement>;
}

const DEFAULT_NODE_TYPES: NodeTypeConfig[] = [
  { type: 'text', name: 'Text Nodes', description: 'For notes, descriptions, task definitions', color: '#64748b', icon: '📝', enabled: true },
  { type: 'ai', name: 'AI Agents', description: 'For content generation and data processing', color: '#8b5cf6', icon: '🤖', enabled: true },
  { type: 'ai_improved', name: 'Enhanced AI Agents', description: 'Extended AI capabilities', color: '#8b5cf6', icon: '🧠', enabled: true },
  { type: 'python', name: 'Python scripts', description: 'For computations and data processing', color: '#6b7280', icon: '🐍', enabled: true },
  { type: 'image', name: 'Images', description: 'For visualizations and diagrams', color: '#ec4899', icon: '🖼️', enabled: true },
  { type: 'video', name: 'Video Content', description: 'For demos and educational materials', color: '#06b6d4', icon: '🎬', enabled: true },
  { type: 'audio', name: 'Audio Content', description: 'For podcasts and recordings', color: '#84cc16', icon: '🔊', enabled: true },
  { type: 'html', name: 'HTML Pages', description: 'For web content and interfaces', color: '#f97316', icon: '🌐', enabled: true },
  { type: 'markdown', name: 'Markdown Documents', description: 'For reports and documentation', color: '#6b7280', icon: '📄', enabled: true },
  { type: 'json', name: 'JSON Data', description: 'For structured results', color: '#6b7280', icon: '📊', enabled: true },
  { type: 'file', name: 'Files', description: 'For documents and resources', color: '#f59e0b', icon: '📁', enabled: true },
  { type: 'router', name: 'Routers', description: 'For conditional logic and routing', color: '#6b7280', icon: '🔀', enabled: false },
];

export function PlannerSettingsModal({ 
  isOpen, 
  onClose, 
  nodeId, 
  currentPrompt = '', 
  onSave, 
  triggerElementRef 
}: PlannerSettingsModalProps) {
  const [nodeTypes, setNodeTypes] = useState<NodeTypeConfig[]>(DEFAULT_NODE_TYPES);
  const [outputExample, setOutputExample] = useState(() => {
    // Generate default example based on enabled node types
    return generateDefaultExample(nodeTypes.filter(nt => nt.enabled));
  });
  
  const [modalPosition, setModalPosition] = useState({ top: '5vh', left: '50%', transform: 'translateX(-50%)' });

  // Calculate modal position based on trigger button
  useEffect(() => {
    if (isOpen && triggerElementRef?.current) {
      const buttonRect = triggerElementRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const modalHeight = 600; // Approximate modal height

      // Check if there's enough space above the button
      const spaceAbove = buttonRect.top;
      const spaceBelow = viewportHeight - buttonRect.bottom;

      if (spaceAbove > modalHeight + 20) {
        // Position above the button
        setModalPosition({
          top: `${Math.max(20, buttonRect.top - modalHeight - 10)}px`,
          left: `${buttonRect.left + buttonRect.width / 2}px`,
          transform: 'translateX(-50%)'
        });
      } else if (spaceBelow > modalHeight + 20) {
        // Position below the button
        setModalPosition({
          top: `${buttonRect.bottom + 10}px`,
          left: `${buttonRect.left + buttonRect.width / 2}px`,
          transform: 'translateX(-50%)'
        });
      } else {
        // Center on screen if not enough space
        setModalPosition({
          top: '5vh',
          left: '50%',
          transform: 'translateX(-50%)'
        });
      }
    }
  }, [isOpen, triggerElementRef]);

  const handleNodeTypeToggle = (type: string) => {
    const updatedTypes = nodeTypes.map(nt =>
      nt.type === type ? { ...nt, enabled: !nt.enabled } : nt
    );
    setNodeTypes(updatedTypes);
    
    // Regenerate example with new selection
    const enabledTypes = updatedTypes.filter(nt => nt.enabled);
    setOutputExample(generateDefaultExample(enabledTypes));
  };

  const handleSave = () => {
    const enabledTypes = nodeTypes.filter(nt => nt.enabled);
    const generatedPrompt = generatePlannerPrompt(enabledTypes);
    
    onSave({
      prompt: generatedPrompt,
      outputExample
    });
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div 
        className="absolute bg-slate-800 rounded-xl border border-slate-600 w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl"
        style={modalPosition}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-600">
          <div>
            <h3 className="text-lg font-semibold text-white">Planner Settings</h3>
            <p className="text-sm text-slate-400 mt-1">
              Select node types that the agent can use for workflow creation
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-700 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex h-[65vh]">
          {/* Left Panel - Node Types */}
          <div className="w-1/2 p-6 border-r border-slate-600 overflow-y-auto">
            <h4 className="text-base font-medium text-white mb-4">Available Node Types</h4>
            <div className="space-y-2">
              {nodeTypes.map(nodeType => (
                <label
                  key={nodeType.type}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    nodeType.enabled
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-700/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={nodeType.enabled}
                    onChange={() => handleNodeTypeToggle(nodeType.type)}
                    className="w-4 h-4 rounded border-slate-400 text-blue-500 focus:ring-blue-500"
                  />
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                    style={{ backgroundColor: `${nodeType.color}20`, border: `1px solid ${nodeType.color}` }}
                  >
                    {nodeType.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{nodeType.name}</p>
                    <p className="text-xs text-slate-400 leading-tight">{nodeType.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <p className="text-sm text-slate-300 mb-2">
                <strong>Selected:</strong> {nodeTypes.filter(nt => nt.enabled).length} of {nodeTypes.length} types
              </p>
              <div className="flex flex-wrap gap-2">
                {nodeTypes.filter(nt => nt.enabled).map(nt => (
                  <span
                    key={nt.type}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-600 rounded text-xs text-white"
                    style={{ borderLeft: `3px solid ${nt.color}` }}
                  >
                    {nt.icon} {nt.type}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Example Output */}
          <div className="w-1/2 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-medium text-white">Output example for agent</h4>
              <button
                onClick={() => setOutputExample(generateDefaultExample(nodeTypes.filter(nt => nt.enabled)))}
                className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 rounded text-sm transition"
              >
                Refresh example
              </button>
            </div>
            
            <textarea
              value={outputExample}
              onChange={(e) => setOutputExample(e.target.value)}
              className="flex-1 p-4 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 resize-none font-mono"
              style={{ fontSize: '12px', lineHeight: '1.4' }}
              placeholder="JSON format for planner agent..."
            />

            <div className="mt-4 p-3 bg-amber-900/20 border border-amber-600/30 rounded-lg">
              <p className="text-xs text-amber-300">
                <strong>💡 Tip:</strong> The agent will only see selected node types and will be able to 
                create workflows only from them. Disable unnecessary types for more accurate results.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-600">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function generateDefaultExample(enabledTypes: NodeTypeConfig[]): string {
  if (enabledTypes.length === 0) {
    return JSON.stringify({ nodes: [] }, null, 2);
  }

  const exampleNodes = [];

  // Always start with text node if enabled
  if (enabledTypes.find(t => t.type === 'text')) {
    exampleNodes.push({
      type: "text",
      title: "1. Task Definition",
      content: "Define project goals and requirements"
    });
  }

  // Add Python if enabled
  if (enabledTypes.find(t => t.type === 'python')) {
    exampleNodes.push({
      type: "python",
      title: "2. Data Processing",
      content: "import pandas as pd\n# Loading and data analysis\ndata = pd.read_csv('input.csv')"
    });
  }

  // Add AI if enabled
  if (enabledTypes.find(t => t.type === 'ai')) {
    exampleNodes.push({
      type: "ai",
      title: "3. Results Analysis",
      content: "Analyze processed data and draw conclusions",
      ai: {
        system_prompt: "You are a data analysis expert",
        temperature: 0.3
      }
    });
  }

  // Add markdown if enabled
  if (enabledTypes.find(t => t.type === 'markdown')) {
    exampleNodes.push({
      type: "text",
      title: "4. Report",
      content_type: "text/markdown",
      content: "# Analysis Results\n\n## Key Findings\n- Key findings"
    });
  }

  // Add image if enabled
  if (enabledTypes.find(t => t.type === 'image')) {
    exampleNodes.push({
      type: "image",
      title: "5. Visualization",
      content: "Creating charts and diagrams to present results"
    });
  }

  return JSON.stringify({ nodes: exampleNodes }, null, 2);
}

// Basic example for simple agents (not planners)
export function generateSimpleExample(): string {
  return JSON.stringify({
    "nodes": [
      {
        "type": "text",
        "title": "Response",
        "content": "Your answer or task execution result will appear here"
      }
    ]
  }, null, 2);
}

export function generatePlannerPrompt(enabledTypes: NodeTypeConfig[]): string {
  const availableTypes = enabledTypes.map(nt => 
    `• ${nt.type} - ${nt.description} (${nt.color})`
  ).join('\n');

  const colorInfo = enabledTypes.map(nt =>
    `• ${nt.type}: ${nt.color} - ${nt.name.toLowerCase()}`
  ).join('\n');

  const examples = enabledTypes.slice(0, 5).map(nt => 
    `- ${nt.type}: ${nt.description.toLowerCase()} (${nt.icon})`
  ).join('\n');

  return `You are a workflow planner agent. Your task is to create structured plans as multiple nodes.

AVAILABLE NODE TYPES:
${availableTypes}

NODE COLOR SCHEME (for creating a visually clear map):
${colorInfo}

NODE CREATION RULES:
1. Always specify type and title (required!)
2. Add content describing what the node should do
3. For AI nodes add ai configuration with system_prompt
4. Create a logical sequence - from task definition to result
5. Use only node types from the list above
6. Choose types to create a visually appealing color map

RESPONSE FORMAT (strictly JSON):
{
  "nodes": [
    {
      "type": "node_type",
      "title": "Node Name", 
      "content": "Node task description",
      "ai": {
        "system_prompt": "Instructions for AI",
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  ]
}

EXAMPLES OF USING AVAILABLE TYPES:
${examples}

Create practical and useful workflows with a beautiful color scheme, using only allowed node types!`;
}