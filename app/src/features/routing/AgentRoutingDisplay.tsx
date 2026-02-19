import { useMemo } from 'react';
import type { AgentRoutingConfig, OutputRoute } from './agentRouting';
import { getIconForOutputType } from './agentRouting';

interface AgentRoutingDisplayProps {
  config: AgentRoutingConfig;
  compact?: boolean;
  showLabels?: boolean;
}

export function AgentRoutingDisplay({ 
  config, 
  compact = false, 
  showLabels = true 
}: AgentRoutingDisplayProps) {
  const enabledRoutes = useMemo(() => 
    config.outputs.filter(route => route.enabled), 
    [config.outputs]
  );

  const defaultRoute = useMemo(() => 
    config.outputs.find(route => route.id === config.defaultOutput),
    [config.outputs, config.defaultOutput]
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500">Outputs:</span>
        <div className="flex gap-1">
          {enabledRoutes.map(route => (
            <span
              key={route.id}
              className={`text-xs px-1 rounded ${
                route.id === config.defaultOutput 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-600 text-slate-300'
              }`}
              title={route.description || route.label}
            >
              {getIconForOutputType(route.type)}
            </span>
          ))}
        </div>
        {config.autoRouting.enabled && (
          <span className="text-xs text-amber-400" title="Automatic routing enabled">
            🔀
          </span>
        )}
        {config.multiOutput.enabled && (
          <span className="text-xs text-green-400" title="Multiple outputs">
            ⭐
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-300">🔀 Agent routing</span>
        {config.autoRouting.enabled && (
          <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded">
            Auto
          </span>
        )}
        {config.multiOutput.enabled && (
          <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
            Multi
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs text-slate-500">
          Active outputs ({enabledRoutes.length}):
        </div>
        
        <div className="grid grid-cols-1 gap-1">
          {enabledRoutes.map(route => (
            <div
              key={route.id}
              className={`flex items-center gap-2 p-2 rounded text-xs ${
                route.id === config.defaultOutput
                  ? 'bg-blue-600/20 border border-blue-600/40'
                  : 'bg-slate-700/50'
              }`}
            >
              <span className="text-sm">{getIconForOutputType(route.type)}</span>
              
              {showLabels && (
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-300 truncate">
                    {route.label}
                  </div>
                  {route.description && (
                    <div className="text-slate-500 truncate">
                      {route.description}
                    </div>
                  )}
                </div>
              )}
              
              <div className="text-slate-400 text-xs">
                {route.type}
              </div>
              
              {route.id === config.defaultOutput && (
                <span className="text-blue-400 text-xs" title="Default output">
                  ⭐
                </span>
              )}
            </div>
          ))}
        </div>

        {config.autoRouting.enabled && (
          <div className="mt-2 p-2 bg-amber-600/10 border border-amber-600/20 rounded">
            <div className="text-xs text-amber-400 font-medium">Auto-routing rules:</div>
            <div className="text-xs text-slate-400 mt-1 space-y-1">
              {config.autoRouting.rules.detectJson && <div>✓ JSON content</div>}
              {config.autoRouting.rules.detectCode && <div>✓ Code and scripts</div>}
              {config.autoRouting.rules.detectMarkdown && <div>✓ Markdown formatting</div>}
              {config.autoRouting.rules.detectHtml && <div>✓ HTML markup</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RoutingStatusBadgeProps {
  config: AgentRoutingConfig;
  selectedRoute?: string;
}

export function RoutingStatusBadge({ config, selectedRoute }: RoutingStatusBadgeProps) {
  const route = config.outputs.find(r => r.id === selectedRoute) || 
                config.outputs.find(r => r.id === config.defaultOutput);

  if (!route) return null;

  return (
    <div className="inline-flex items-center gap-1 bg-slate-700 px-2 py-1 rounded text-xs">
      <span>{getIconForOutputType(route.type)}</span>
      <span className="text-slate-300">{route.label}</span>
      {config.autoRouting.enabled && <span className="text-amber-400">🔀</span>}
    </div>
  );
}