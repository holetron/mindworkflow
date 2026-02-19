import { useState } from 'react';
import type { NodeRoutingConfig } from './nodeTypes';

interface RoutingConfiguratorProps {
  nodeId: string;
  nodeType: string;
  currentRouting: NodeRoutingConfig;
  availableNodes: Array<{ node_id: string; title: string; type: string }>;
  onRoutingChange: (routing: NodeRoutingConfig) => void;
  disabled: boolean;
}

function getDefaultRouting(type: string): NodeRoutingConfig {
  const baseRouting: NodeRoutingConfig = {
    inputPorts: [
      { id: 'main_input', label: 'Main Input', type: 'any', required: false, multiple: false },
    ],
    outputPorts: [
      { id: 'main_output', label: 'Main Output', type: 'any' },
    ],
    routingRules: [],
  };

  if (type === 'ai') {
    return {
      inputPorts: [
        { id: 'prompt_input', label: 'Prompt', type: 'text', required: true, multiple: false },
        { id: 'context_input', label: 'Context', type: 'any', required: false, multiple: true },
      ],
      outputPorts: [
        { id: 'success_output', label: 'Success Result', type: 'text' },
        { id: 'error_output', label: 'Error', type: 'error' },
      ],
      routingRules: [
        { id: 'success_rule', condition: 'success', outputPort: 'success_output', description: 'On successful execution' },
        { id: 'error_rule', condition: 'error', outputPort: 'error_output', description: 'On error' },
      ],
    };
  }

  return baseRouting;
}

export function RoutingConfigurator({ nodeId, nodeType, currentRouting, availableNodes, onRoutingChange, disabled }: RoutingConfiguratorProps) {
  const [routing, setRouting] = useState<NodeRoutingConfig>(currentRouting.inputPorts.length > 0 ? currentRouting : getDefaultRouting(nodeType));

  const addInputPort = () => {
    const newPort = { id: `input_${Date.now()}`, label: 'New Input', type: 'any', required: false, multiple: false };
    const updatedRouting = { ...routing, inputPorts: [...routing.inputPorts, newPort] };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const addOutputPort = () => {
    const newPort = { id: `output_${Date.now()}`, label: 'New Output', type: 'any' };
    const updatedRouting = { ...routing, outputPorts: [...routing.outputPorts, newPort] };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const removeInputPort = (portId: string) => {
    const updatedRouting = { ...routing, inputPorts: routing.inputPorts.filter(p => p.id !== portId) };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const removeOutputPort = (portId: string) => {
    const updatedRouting = {
      ...routing,
      outputPorts: routing.outputPorts.filter(p => p.id !== portId),
      routingRules: routing.routingRules.filter(r => r.outputPort !== portId),
    };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const updateInputPort = (portId: string, updates: Partial<typeof routing.inputPorts[0]>) => {
    const updatedRouting = { ...routing, inputPorts: routing.inputPorts.map(port => port.id === portId ? { ...port, ...updates } : port) };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const updateOutputPort = (portId: string, updates: Partial<typeof routing.outputPorts[0]>) => {
    const updatedRouting = { ...routing, outputPorts: routing.outputPorts.map(port => port.id === portId ? { ...port, ...updates } : port) };
    setRouting(updatedRouting);
    onRoutingChange(updatedRouting);
  };

  const portTypeOptions = ['any', 'text', 'number', 'json', 'image', 'file'];
  const outputTypeOptions = [...portTypeOptions, 'error'];

  return (
    <div className="space-y-4">
      {/* Input Ports */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-white/70">Input Ports</h4>
          <button type="button" className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors" onClick={addInputPort} disabled={disabled}>+ Input</button>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {routing.inputPorts.map((port) => (
            <div key={port.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
              <input type="text" value={port.label} onChange={(e) => updateInputPort(port.id, { label: e.target.value })} disabled={disabled} className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none" placeholder="Port Name" />
              <select value={port.type} onChange={(e) => updateInputPort(port.id, { type: e.target.value })} disabled={disabled} className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5">
                {portTypeOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={port.required} onChange={(e) => updateInputPort(port.id, { required: e.target.checked })} disabled={disabled} className="w-3 h-3" />
                <span className="text-xs text-white/60">Req.</span>
              </label>
              <button type="button" className="text-xs text-red-400 hover:text-red-300 p-1" onClick={() => removeInputPort(port.id)} disabled={disabled}>\u00D7</button>
            </div>
          ))}
        </div>
      </div>

      {/* Output Ports */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-white/70">Output Ports</h4>
          <button type="button" className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors" onClick={addOutputPort} disabled={disabled}>+ Output</button>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {routing.outputPorts.map((port) => (
            <div key={port.id} className="flex items-center gap-2 p-2 bg-black/10 rounded border border-white/5">
              <input type="text" value={port.label} onChange={(e) => updateOutputPort(port.id, { label: e.target.value })} disabled={disabled} className="flex-1 bg-transparent text-xs text-white/80 border-none outline-none" placeholder="Port Name" />
              <select value={port.type} onChange={(e) => updateOutputPort(port.id, { type: e.target.value })} disabled={disabled} className="text-xs bg-black/20 text-white/70 border border-white/10 rounded px-1 py-0.5">
                {outputTypeOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
              </select>
              <button type="button" className="text-xs text-red-400 hover:text-red-300 p-1" onClick={() => removeOutputPort(port.id)} disabled={disabled}>\u00D7</button>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Status */}
      <div className="p-2 bg-black/5 rounded border border-white/5">
        <div className="text-xs text-white/60 mb-1">Available connections:</div>
        <div className="text-xs text-white/50">
          {availableNodes.length > 0 ? `${availableNodes.length} nodes available for connection` : 'No nodes available for connection'}
        </div>
      </div>
    </div>
  );
}
