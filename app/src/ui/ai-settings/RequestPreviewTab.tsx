import type { AiSettingsSharedState, FlowNode } from './types';
import { expandMediaValue, looksLikeMediaValue, summarizeScalar, pickImageCandidate } from './utilities';

interface RequestPreviewTabProps {
  state: AiSettingsSharedState;
}

export function RequestPreviewTab({ state }: RequestPreviewTabProps) {
  const {
    node, previewPayload, previewLoading, fetchPreviewPayload,
    viewMode, setViewMode, currentProvider, pendingAutoPorts,
    pendingEnabledPorts, systemPromptSource, outputExampleSource,
    outputExampleValue, temperatureSource, allNodes, sources,
    autoPortSourceIds, getPortDataList,
  } = state;

  return (
    <div className="space-y-6">
      {/* Preview payload from backend */}
      {previewLoading ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded p-4 flex items-center justify-center gap-3">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-sm text-slate-400">Loading request preview...</span>
        </div>
      ) : Object.keys(previewPayload).length > 0 ? (
        <FieldMappingPreview previewPayload={previewPayload} />
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-slate-300">API Request Preview</h3>
          <button
            type="button"
            onClick={() => fetchPreviewPayload()}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded"
          >
            Refresh preview
          </button>
        </div>
        <RequestPayloadView state={state} />
      </div>
    </div>
  );
}

// ========== Field Mapping Preview ==========

function FieldMappingPreview({ previewPayload }: { previewPayload: Record<string, any> }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-300">📤 Field configuration (field_mapping)</h4>
        <span className="text-xs text-slate-500">
          {previewPayload.provider && `Provider: ${previewPayload.provider}`}
        </span>
      </div>

      {/* AI Config summary */}
      <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3 mb-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-slate-500 font-semibold mb-1">System Prompt</div>
            <div className="flex gap-2 items-center text-slate-300">
              <span className="px-2 py-1 bg-slate-700/60 rounded">
                {previewPayload.ai_config?.system_prompt_source === 'port' ? '🔗 Port' : '✏️ Manual'}
              </span>
              <span className="text-slate-400">{'\u2192'} {previewPayload.ai_config?.system_prompt_target || 'prompt'}</span>
            </div>
            {previewPayload.ai_config?.system_prompt && (
              <div className="text-slate-500 mt-1 text-[11px] max-w-xs truncate">{previewPayload.ai_config.system_prompt}</div>
            )}
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Output Example</div>
            <div className="flex gap-2 items-center text-slate-300">
              <span className="px-2 py-1 bg-slate-700/60 rounded">
                {previewPayload.ai_config?.output_example_source === 'port' ? '🔗 Port' : '✏️ Manual'}
              </span>
              <span className="text-slate-400">{'\u2192'} {previewPayload.ai_config?.output_example_target || 'prompt'}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Temperature</div>
            <div className="flex gap-2 items-center text-slate-300">
              <span className="px-2 py-1 bg-slate-700/60 rounded">
                {previewPayload.ai_config?.temperature_source === 'port' ? '🔗 Port' : '✏️ Manual'}
              </span>
              <span className="text-slate-400">{previewPayload.ai_config?.temperature || 0.7}</span>
            </div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Model</div>
            <div className="text-slate-300 text-sm">{previewPayload.ai_config?.model || 'default'}</div>
          </div>
        </div>
      </div>

      {/* Additional fields */}
      {Object.keys(previewPayload.ai_config?.additional_fields || {}).length > 0 && (
        <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3">
          <div className="text-xs text-slate-500 font-semibold mb-2">Additional Fields</div>
          <div className="space-y-1">
            {Object.entries(previewPayload.ai_config?.additional_fields || {}).map(([key, val]: [string, any]) => (
              <div key={key} className="text-xs text-slate-400 flex justify-between gap-2">
                <span className="font-mono">{key}</span>
                <span className="text-slate-500">source: {val?.source || 'manual'} {'\u2192'} {val?.target || key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto ports info */}
      {previewPayload.ai_config?.auto_ports && Array.isArray(previewPayload.ai_config.auto_ports) && previewPayload.ai_config.auto_ports.length > 0 && (
        <div className="bg-slate-800/50 rounded border border-slate-700/50 p-3 mt-3">
          <div className="text-xs text-slate-500 font-semibold mb-2">Auto Ports ({previewPayload.ai_config.auto_ports.length})</div>
          <div className="space-y-1">
            {previewPayload.ai_config.auto_ports.map((port: any) => (
              <div key={port.id} className="text-xs text-slate-400">
                <span className="font-mono">{port.id}</span>
                <span className="text-slate-600 ml-2">({port.type})</span>
                {port.required && <span className="text-red-400 ml-2">*required</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== Request Payload View ==========

function RequestPayloadView({ state }: { state: AiSettingsSharedState }) {
  const {
    node, currentProvider, pendingAutoPorts, pendingEnabledPorts,
    systemPromptSource, outputExampleSource, outputExampleValue,
    temperatureSource, allNodes, sources, autoPortSourceIds,
    getPortDataList, viewMode, setViewMode, previewPayload,
  } = state;

  // SPECIAL PROCESSING FOR MIDJOURNEY
  const isMidjourney = String(node.ai?.provider || '') === 'midjourney';
  if (isMidjourney && previewPayload.midjourney) {
    return <MidjourneyPreview previewPayload={previewPayload} />;
  }

  const providerStr = String(node.ai?.provider || 'openai');
  const currentModel = String(node.ai?.model || 'gpt-4o-mini');
  const systemPrompt = String(node.ai?.system_prompt || '');
  const temperature = Number(node.ai?.temperature ?? 0.7);
  const contextMode = String(node.ai?.context_mode || 'simple');

  const filteredSources = (sources ?? []).filter(
    (src) => !autoPortSourceIds.has(src.node_id),
  );

  const primaryPrompt = (() => {
    const contentValue = typeof node.content === 'string' ? node.content.trim() : '';
    if (contentValue.length > 0) return contentValue;
    const template = typeof node.ai?.user_prompt_template === 'string' ? node.ai.user_prompt_template.trim() : '';
    if (template.length > 0) return template;
    return '';
  })();

  const { fullUserPrompt } = buildContextAndPrompt(filteredSources, allNodes, contextMode, primaryPrompt, outputExampleSource, outputExampleValue);

  const activeAutoPorts = pendingAutoPorts.filter((port) => {
    if (port.id === 'prompt') return false;
    return port.required || pendingEnabledPorts.includes(port.id);
  });

  const autoPortPayload = buildAutoPortPayload(activeAutoPorts, getPortDataList, providerStr, filteredSources, allNodes);

  const autoPortSummary = Object.entries(autoPortPayload).reduce<Record<string, string | string[]>>(
    (acc, [key, value]) => {
      if (Array.isArray(value)) {
        acc[key] = value.map((item) => summarizeScalar(String(item)));
      } else if (typeof value === 'string') {
        acc[key] = summarizeScalar(value);
      } else {
        acc[key] = JSON.stringify(value);
      }
      return acc;
    }, {},
  );

  const recordedPayload = (node.meta?.last_request_payload ?? null) as { request?: unknown } | Record<string, unknown> | null;
  const recordedRequest = recordedPayload && typeof recordedPayload === 'object'
    ? (recordedPayload as { request?: unknown }).request ?? recordedPayload : null;

  const simplePreview = buildSimplePreview(providerStr, currentModel, systemPrompt, temperature, fullUserPrompt,
    systemPromptSource, temperatureSource, pendingEnabledPorts, autoPortSummary, node, filteredSources, allNodes);

  const fullRequest = buildFullRequest(providerStr, currentModel, systemPrompt, temperature, fullUserPrompt,
    autoPortPayload, node, filteredSources, allNodes);

  const effectiveFullRequest = recordedRequest && providerStr === 'replicate' ? recordedRequest : fullRequest;
  const effectiveSimplePreview = recordedRequest && providerStr === 'replicate' ? recordedRequest : simplePreview;
  const displayedRequest = viewMode === 'simple' ? effectiveSimplePreview : effectiveFullRequest;

  const handleCopy = () => { navigator.clipboard.writeText(JSON.stringify(displayedRequest, null, 2)); };
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(displayedRequest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `request_${viewMode}_${node.node_id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-900 rounded-lg border border-slate-700 overflow-auto max-h-[500px]">
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
          {JSON.stringify(displayedRequest, null, 2)}
        </pre>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={() => setViewMode('simple')} className={`px-4 py-2 rounded-md transition ${viewMode === 'simple' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            📋 Simplified
          </button>
          <button onClick={() => setViewMode('full')} className={`px-4 py-2 rounded-md transition ${viewMode === 'full' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            📄 Full Request
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition flex items-center gap-2">
            📋 Copy JSON
          </button>
          <button onClick={handleDownload} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition flex items-center gap-2">
            💾 Download
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== Midjourney Preview ==========

function MidjourneyPreview({ previewPayload }: { previewPayload: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <div className="bg-slate-800 border border-slate-700 rounded p-3">
        <div className="text-xs text-slate-400 font-mono mb-2">POST /mj/submit/imagine</div>
        <div className="bg-slate-900 rounded p-3 font-mono text-sm text-slate-200 overflow-auto max-h-48">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify({ prompt: previewPayload.midjourney.prompt }, null, 2)}</pre>
        </div>
      </div>
      {previewPayload.midjourney.referenceImages && previewPayload.midjourney.referenceImages.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded p-3">
          <div className="text-xs text-slate-400 font-semibold mb-2">📎 Reference Images ({previewPayload.midjourney.referenceImages.length})</div>
          <div className="space-y-2">
            {previewPayload.midjourney.referenceImages.map((ref: any, idx: number) => (
              <div key={idx} className="text-xs bg-slate-900 rounded p-2">
                <div className="text-slate-400">{ref.purpose}</div>
                <div className="text-slate-500 font-mono truncate text-[11px]">{ref.url}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== Helper: build context and prompt ==========

function buildContextAndPrompt(
  filteredSources: Array<{ node_id: string; title: string; type: string }>,
  allNodes: FlowNode[], contextMode: string, primaryPrompt: string,
  outputExampleSource: string, outputExampleValue: string,
) {
  let contextBody = '';

  if (filteredSources.length > 0) {
    if (contextMode === 'full_json') {
      const data = filteredSources.map(src => { const n = allNodes?.find(x => x.node_id === src.node_id); return n ? { node_id: n.node_id, type: n.type, title: n.title, content: n.content, ai: n.ai } : null; }).filter(Boolean);
      contextBody = JSON.stringify(data, null, 2);
    } else if (contextMode === 'clean') {
      contextBody = filteredSources.map(src => { const n = allNodes?.find(x => x.node_id === src.node_id); return n && typeof n.content === 'string' ? n.content.trim() : ''; }).filter(c => c.trim().length > 0).join('; ');
    } else {
      const lines: string[] = [];
      filteredSources.forEach(src => { const n = allNodes?.find(x => x.node_id === src.node_id); if (n) { lines.push(`\u2022 **${n.title}** (${n.type})`); if (n.content) lines.push(String(n.content)); } });
      contextBody = lines.join('\n');
    }
  }

  const parts: string[] = [];
  if (primaryPrompt.length > 0) parts.push(primaryPrompt);
  if (contextBody.length > 0) {
    const label = contextMode === 'full_json' ? 'Context (Full JSON):' : 'Context:';
    parts.push(contextMode === 'clean' ? `${label}${contextBody}` : `${label}\n${contextBody}`);
  }
  if (outputExampleSource === 'manual' && outputExampleValue?.trim().length > 0) {
    parts.push(`Output Example:\n${outputExampleValue.trim()}`);
  }

  return { fullUserPrompt: parts.join('\n\n') };
}

// ========== Helper: build auto port payload ==========

function buildAutoPortPayload(
  activeAutoPorts: any[], getPortDataList: (id: string, type?: string) => string[],
  providerStr: string, filteredSources: any[], allNodes: FlowNode[],
) {
  const autoPortPayload: Record<string, unknown> = {};

  for (const port of activeAutoPorts) {
    const rawValueList = getPortDataList(port.id, port.type);
    if (!rawValueList || rawValueList.length === 0) continue;
    const normalizedPortType = (port.type || '').toLowerCase();
    const normalizedPortId = port.id.toLowerCase();
    const expectsMediaList = normalizedPortType === 'image' || normalizedPortType === 'video' || normalizedPortType === 'audio' || normalizedPortId === 'image_input' || /^image_input[\w-]*$/.test(normalizedPortId);

    if (expectsMediaList) {
      const allEntries: string[] = [];
      const seen = new Set<string>();
      for (const rawValue of rawValueList) {
        for (const entry of expandMediaValue(rawValue.trim())) {
          if (!seen.has(entry)) { seen.add(entry); allEntries.push(entry); }
        }
      }
      if (allEntries.length > 0) autoPortPayload[port.id] = allEntries;
    } else {
      autoPortPayload[port.id] = rawValueList[0].trim();
    }
  }

  // Fallback image for Replicate
  if (providerStr === 'replicate' && !('image_input' in autoPortPayload)) {
    const fallbackImages: string[] = [];
    const seen = new Set<string>();
    filteredSources.forEach(src => {
      const n = allNodes?.find(x => x.node_id === src.node_id);
      const candidate = pickImageCandidate(n);
      if (candidate) { for (const e of expandMediaValue(candidate)) { if (!seen.has(e)) { seen.add(e); fallbackImages.push(e); } } }
    });
    if (fallbackImages.length > 0) autoPortPayload.image_input = fallbackImages;
  }

  return autoPortPayload;
}

// ========== Helper: build simple preview ==========

function buildSimplePreview(
  providerStr: string, currentModel: string, systemPrompt: string,
  temperature: number, fullUserPrompt: string,
  systemPromptSource: string, temperatureSource: string,
  pendingEnabledPorts: string[], autoPortSummary: Record<string, string | string[]>,
  node: FlowNode, filteredSources: any[], allNodes: FlowNode[],
): unknown {
  const sysPromptSrc = systemPromptSource === 'port' ? '🔗 Port' : '📝 Manual';
  const hasPromptPort = pendingEnabledPorts.includes('prompt');
  const promptSrc = hasPromptPort ? '🔗 Port' : '📝 Manual';
  const tempSrc = temperatureSource === 'port' ? '🔗 Port' : '📝 Manual';

  if (providerStr === 'openai' || providerStr === 'openai_gpt') {
    return { model: currentModel, temperature: `${tempSrc} \u2022 ${temperature}`, messages: [
      { role: 'system', content: systemPrompt ? `${sysPromptSrc} \u2022 ${systemPrompt.substring(0, 50)}...` : 'Default system prompt' },
      { role: 'user', content: `${promptSrc} \u2022 <${fullUserPrompt.length} chars>` },
    ] };
  }
  if (providerStr === 'replicate') {
    const simpleInput: Record<string, string> = {};
    simpleInput.prompt = `${promptSrc} \u2022 <${fullUserPrompt.length} chars>`;
    if (systemPrompt?.trim().length > 0) simpleInput.system_prompt = `${sysPromptSrc} \u2022 <${systemPrompt.length} chars>`;
    simpleInput.temperature = `${tempSrc} \u2022 ${temperature}`;
    simpleInput.max_tokens = `📝 Manual \u2022 ${Number(node.ai?.max_tokens) || 2000}`;
    for (const [key, value] of Object.entries(autoPortSummary)) {
      if (Array.isArray(value)) {
        if (value.length === 0) simpleInput[key] = '🔗 Port \u2022 []';
        else if (value.length === 1) simpleInput[key] = `🔗 Port \u2022 ${value[0]}`;
        else { simpleInput[key] = `🔗 Port \u2022 array (${value.length} items)`; value.forEach((item, i) => { simpleInput[`${key}[${i}]`] = `  📤 ${item}`; }); }
      } else { simpleInput[key] = `🔗 Port \u2022 ${typeof value === 'string' ? value : JSON.stringify(value)}`; }
    }
    return { version: currentModel, input: simpleInput };
  }
  if (['gemini', 'google_gemini', 'google_ai_studio', 'google_workspace'].includes(providerStr)) {
    return { contents: [{ parts: [{ text: `${promptSrc} \u2022 <${fullUserPrompt.length} chars>` }] }], generationConfig: { temperature: `${tempSrc} \u2022 ${temperature}` } };
  }
  if (providerStr === 'anthropic') {
    return { model: currentModel, temperature: `${tempSrc} \u2022 ${temperature}`, messages: [{ role: 'user', content: `${promptSrc} \u2022 <${fullUserPrompt.length} chars>` }] };
  }
  if (providerStr === 'midjourney_mindworkflow_relay' || providerStr === 'midjourney') {
    const refImages = filteredSources.map(src => { const n = allNodes?.find(x => x.node_id === src.node_id); const c = pickImageCandidate(n); return c ? `🖼️ ${c.slice(0, 60)}...` : null; }).filter(Boolean);
    return { command: '/imagine', prompt: `📝 ${fullUserPrompt.substring(0, 60)}...`, references: refImages.length > 0 ? refImages : 'None', parameters: 'Default' };
  }
  return {};
}

// ========== Helper: build full request ==========

function buildFullRequest(
  providerStr: string, currentModel: string, systemPrompt: string,
  temperature: number, fullUserPrompt: string,
  autoPortPayload: Record<string, unknown>,
  node: FlowNode, filteredSources: any[], allNodes: FlowNode[],
): unknown {
  if (providerStr === 'openai' || providerStr === 'openai_gpt') {
    return { model: currentModel, temperature, messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful AI assistant' },
      { role: 'user', content: fullUserPrompt },
    ], max_tokens: Number(node.ai?.max_tokens) || undefined };
  }
  if (providerStr === 'replicate') {
    const input: Record<string, unknown> = { prompt: fullUserPrompt, max_tokens: Number(node.ai?.max_tokens) || 2000, temperature };
    if (systemPrompt?.trim().length > 0) input.system_prompt = systemPrompt.trim();
    Object.assign(input, autoPortPayload);
    if (node.ai && typeof node.ai.negative_prompt === 'string' && node.ai.negative_prompt.trim().length > 0) input.negative_prompt = node.ai.negative_prompt.trim();
    return { version: currentModel, input };
  }
  if (['gemini', 'google_gemini', 'google_ai_studio', 'google_workspace'].includes(providerStr)) {
    const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${fullUserPrompt}`.trim() : fullUserPrompt;
    return { contents: [{ parts: [{ text: combinedPrompt }] }], generationConfig: { temperature, maxOutputTokens: Number(node.ai?.max_tokens) || 2000, topP: 0.9 } };
  }
  if (providerStr === 'anthropic') {
    const req: Record<string, unknown> = { model: currentModel, temperature, messages: [{ role: 'user', content: fullUserPrompt }], max_tokens: Number(node.ai?.max_tokens) || 2000 };
    if (systemPrompt?.trim().length > 0) req.system = systemPrompt.trim();
    return req;
  }
  if (providerStr === 'midjourney_mindworkflow_relay' || providerStr === 'midjourney') {
    const imagePromptUrls: string[] = [];
    const styleRefUrls: string[] = [];
    const charRefUrls: string[] = [];
    filteredSources.forEach(src => {
      const n = allNodes?.find(x => x.node_id === src.node_id);
      const c = pickImageCandidate(n);
      if (c) {
        const t = n?.type || '';
        if (t === 'image' && n?.title?.toLowerCase().includes('character')) charRefUrls.push(c);
        else if (t === 'image' && n?.title?.toLowerCase().includes('style')) styleRefUrls.push(c);
        else if (t === 'image') imagePromptUrls.push(c);
      }
    });
    const flags: string[] = [];
    if (currentModel && currentModel !== 'default') { const m = currentModel.match(/v7|v6\.1|v6|v5\.2|v5\.1|v5|niji-6|niji-5|niji-4/); if (m) { const v = m[0]; flags.push(v.startsWith('niji-') ? `--${v.replace('-', ' ')}` : `--v ${v.substring(1)}`); } }
    if (node.ai?.mode === 'raw') flags.push('--style raw');
    if (node.ai?.aspect_ratio) { const arMap: Record<string, string> = { portrait: '2:3', square: '1:1', landscape: '3:2' }; if (arMap[node.ai.aspect_ratio as string]) flags.push(`--ar ${arMap[node.ai.aspect_ratio as string]}`); }
    if (node.ai?.stylization && Number(node.ai.stylization) !== 100) flags.push(`--s ${node.ai.stylization}`);
    if (node.ai?.weirdness && Number(node.ai.weirdness) > 0) flags.push(`--w ${node.ai.weirdness}`);
    if (node.ai?.variety && Number(node.ai.variety) > 0) flags.push(`--vary ${node.ai.variety}`);
    if (node.ai?.speed) flags.push(`--${node.ai.speed}`);
    if (charRefUrls.length > 0) { flags.push(`--cref ${charRefUrls.join(' ')}`); flags.push('--cw 80'); }
    const flagsStr = flags.length > 0 ? ' ' + flags.join(' ') : '';
    const discordPrompt = ['/imagine', ...imagePromptUrls, ...styleRefUrls, fullUserPrompt, flagsStr.trim()].filter(Boolean).join(' ');
    return { prompt: discordPrompt };
  }
  return {};
}
