import { Handle, Position } from 'reactflow';
import type { FlowNode, AutoPort } from './nodeTypes';

interface NodeHandlesProps {
  node: FlowNode;
  isAiNode: boolean;
  hasEditedVersion: boolean;
  effectiveImageOutput: 'annotated' | 'original';
}

export function NodeHandles({ node, isAiNode, hasEditedVersion, effectiveImageOutput }: NodeHandlesProps) {
  const handleStyle = { width: 14, height: 14, zIndex: 10 };
  const labelStyle = {
    color: 'rgba(226, 232, 240, 0.75)',
    border: '1px solid rgba(148, 163, 184, 0.08)',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  };

  // Input handles
  const renderInputHandles = () => {
    if (isAiNode && node.ai?.auto_ports && node.ai.auto_ports.length > 0) {
      const autoPorts = (node.ai.auto_ports as AutoPort[]).filter(port => port.id !== 'prompt');
      const invalidPortsList = (node.meta?.invalid_ports_with_edges || []) as string[];

      return (
        <>
          <Handle type="target" position={Position.Left} id="context" isConnectable={true} className="flow-node__handle flow-node__handle--target" style={{ ...handleStyle, background: '#3b82f6', border: '2px solid #fff', top: '60px', left: -7 }} title="Context - main input for prompt" />
          {autoPorts.map((port, index) => {
            const isInvalidPort = invalidPortsList.includes(port.id);
            return (
              <Handle
                key={port.id}
                type="target"
                position={Position.Left}
                id={port.id}
                isConnectable={true}
                className="flow-node__handle flow-node__handle--target"
                style={{
                  ...handleStyle,
                  background: port.required ? '#ef4444' : '#3b82f6',
                  border: isInvalidPort ? '3px solid #ef4444' : '2px solid #fff',
                  top: `${95 + index * 35}px`,
                  left: -7,
                  boxShadow: isInvalidPort ? '0 0 0 2px rgba(239, 68, 68, 0.3)' : undefined,
                }}
                title={isInvalidPort ? `\u26A0\uFE0F ${port.label} - port is no longer supported by the current model but has connections. Switch to another port.` : `${port.label}${port.required ? ' (required)' : ''}`}
              />
            );
          })}
          <div className="port-labels-layer" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 }}>
            <span className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap" style={{ position: 'absolute', right: 'calc(100% + 15px)', top: '75px', transform: 'translateY(-50%)', whiteSpace: 'nowrap', textAlign: 'right', ...labelStyle }}>context</span>
            {autoPorts.map((port, index) => (
              <span key={`label-${port.id}`} className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap" style={{ position: 'absolute', right: 'calc(100% + 15px)', top: `${110 + index * 35}px`, transform: 'translateY(-50%)', whiteSpace: 'nowrap', textAlign: 'right', ...labelStyle }}>
                {port.label}
                {port.required && <span className="text-red-400 ml-1">*</span>}
              </span>
            ))}
          </div>
        </>
      );
    }
    return (
      <Handle type="target" position={Position.Left} id="context" className="flow-node__handle flow-node__handle--target" style={{ ...handleStyle, background: '#3b82f6', border: '2px solid #fff', top: '60px', left: -7 }} />
    );
  };

  // Output handles
  const renderOutputHandles = () => {
    if (node.type === 'image') {
      return (
        <>
          <Handle id="image-original" type="source" position={Position.Right} className={`flow-node__handle flow-node__handle--source ${effectiveImageOutput === 'original' ? 'flow-node__handle--highlight' : ''}`} style={{ ...handleStyle, background: '#38bdf8', border: '2px solid #fff', top: '60px', right: -7 }} title="Original image" />
          {hasEditedVersion ? (
            <Handle id="image-annotated" type="source" position={Position.Right} className={`flow-node__handle flow-node__handle--source ${effectiveImageOutput === 'annotated' ? 'flow-node__handle--highlight' : ''}`} style={{ ...handleStyle, background: '#a855f7', border: '2px solid #fff', top: '96px', right: -7 }} title="Edited image" />
          ) : null}
          <div className="port-labels-layer" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 1000 }}>
            {hasEditedVersion ? (
              <>
                <span className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap" style={{ position: 'absolute', left: 'calc(100% + 15px)', top: '60px', transform: 'translateY(-50%)', color: 'rgba(226, 232, 240, 0.8)', border: '1px solid rgba(148, 163, 184, 0.12)', backgroundColor: 'rgba(15, 23, 42, 0.75)' }}>Original</span>
                <span className="text-xs font-medium text-white bg-slate-800/90 px-2 py-0.5 rounded whitespace-nowrap" style={{ position: 'absolute', left: 'calc(100% + 15px)', top: '96px', transform: 'translateY(-50%)', color: 'rgba(226, 232, 240, 0.8)', border: '1px solid rgba(148, 163, 184, 0.12)', backgroundColor: 'rgba(15, 23, 42, 0.75)' }}>Edited</span>
              </>
            ) : null}
          </div>
        </>
      );
    }
    return (
      <Handle type="source" position={Position.Right} className="flow-node__handle flow-node__handle--source" style={{ ...handleStyle, background: '#10b981', border: '2px solid #fff', top: '60px', right: -7 }} />
    );
  };

  return (
    <>
      {renderInputHandles()}
      {renderOutputHandles()}
    </>
  );
}
