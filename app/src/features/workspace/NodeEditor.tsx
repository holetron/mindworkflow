import { useMemo, useState } from 'react';
import type { FlowNode, RunLog } from '../../state/api';
import JsonViewer from '../../ui/JsonViewer';

interface NodeEditorProps {
  node: FlowNode | null;
  projectId: string;
  runs?: RunLog[];
  loading: boolean;
}

const tabs = ['data', 'prompt', 'history', 'permissions'] as const;
type TabKey = (typeof tabs)[number];

function NodeEditor({ node, projectId, runs = [], loading }: NodeEditorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('data');

  const promptData = useMemo(() => {
    if (!node) return null;
    if (node.type === 'ai') {
      return {
        system: node.ai?.system_prompt,
        user: node.ai?.user_prompt_template,
        model: node.ai?.model,
      };
    }
    if (node.type === 'python') {
      return {
        code: node.python?.code,
        entry: node.python?.entry,
      };
    }
    if (node.type === 'parser') {
      return {
        selector: node.parser?.selector,
        schema: node.parser?.output_schema_ref,
      };
    }
    return null;
  }, [node]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-700 p-4">
        {node ? (
          <div>
            <h2 className="text-xl font-semibold">{node.title}</h2>
            <p className="text-xs uppercase tracking-wider text-slate-500">{node.type}</p>
            <p className="text-xs text-slate-500">{node.node_id}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Выберите узел в графе</p>
        )}
      </header>
      <nav className="flex gap-2 border-b border-slate-700 px-4 py-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`rounded px-3 py-1 text-sm capitalize ${
              activeTab === tab ? 'bg-primary text-white' : 'bg-slate-700 text-slate-200'
            }`}
            onClick={() => setActiveTab(tab)}
            disabled={!node}
          >
            {tab}
          </button>
        ))}
      </nav>
      <section className="flex-1 overflow-y-auto p-4 text-sm">
        {!node && <p className="text-slate-400">Нет данных</p>}
        {node && activeTab === 'data' && (
          <div className="space-y-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Content
              </h3>
              {node.content ? (
                node.content_type?.includes('json') || isJson(node.content) ? (
                  <JsonViewer value={node.content} collapsible />
                ) : (
                  <textarea
                    className="h-48 w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200"
                    value={node.content}
                    readOnly
                  />
                )
              ) : (
                <p className="text-slate-500">Контент отсутствует</p>
              )}
            </div>
            {node.meta && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Meta
                </h3>
                <JsonViewer value={JSON.stringify(node.meta, null, 2)} collapsible />
              </div>
            )}
          </div>
        )}
        {node && activeTab === 'prompt' && (
          <div className="space-y-3">
            {!promptData && <p className="text-slate-400">Нет данных для отображения</p>}
            {promptData?.system && (
              <FieldBlock label="System Prompt" value={promptData.system as string} />
            )}
            {promptData?.user && (
              <FieldBlock label="User Prompt" value={promptData.user as string} />
            )}
            {promptData?.model && (
              <FieldBlock label="Model" value={promptData.model as string} />
            )}
            {promptData?.code && <FieldBlock label="Python" value={promptData.code as string} />}
          </div>
        )}
        {node && activeTab === 'history' && (
          <div className="space-y-3">
            {loading && <p className="text-slate-400">Загрузка истории...</p>}
            {!loading && runs.length === 0 && <p className="text-slate-400">Нет запусков</p>}
            {runs.map((run) => (
              <article key={run.run_id} className="rounded border border-slate-700 p-2">
                <header className="flex items-center justify-between text-xs text-slate-400">
                  <span>{new Date(run.started_at).toLocaleString()}</span>
                  <span className={run.status === 'success' ? 'text-emerald-300' : 'text-amber-300'}>
                    {run.status}
                  </span>
                </header>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">Подробнее</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-xs">
                    {JSON.stringify(run.logs, null, 2)}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        )}
        {node && activeTab === 'permissions' && (
          <div className="space-y-3">
            <FieldBlock
              label="Project"
              value={`ID: ${projectId}\nVisibility: ${JSON.stringify(
                node.visibility_rules ?? {},
                null,
                2,
              )}`}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </h3>
      <pre className="max-h-60 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-200">
        {value}
      </pre>
    </div>
  );
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
}

export default NodeEditor;
