import React from 'react';
import { Plus, Sparkles } from 'lucide-react';

interface AgentsEmptyStateProps {
  searchQuery: string;
  filterMode: 'all' | 'favorites';
  onCreateAgent: () => void;
}

/** Loading spinner shown while presets are being fetched. */
export function AgentsLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-purple-500" />
        <p className="text-slate-400">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0430\u0433\u0435\u043D\u0442\u043E\u0432...'}</p>
      </div>
    </div>
  );
}

/** Shown when no agents match the current search / filter. */
export function AgentsEmptyState({ searchQuery, filterMode, onCreateAgent }: AgentsEmptyStateProps) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
          <Sparkles size={32} className="text-slate-600" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-white">
          {searchQuery || filterMode === 'favorites'
            ? '\u0410\u0433\u0435\u043D\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B'
            : '\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0430\u0433\u0435\u043D\u0442\u043E\u0432'}
        </h3>
        <p className="mb-4 text-sm text-slate-400">
          {searchQuery || filterMode === 'favorites'
            ? '\u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u043F\u043E\u0438\u0441\u043A\u0430'
            : '\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0441\u0432\u043E\u0435\u0433\u043E \u043F\u0435\u0440\u0432\u043E\u0433\u043E AI-\u0430\u0433\u0435\u043D\u0442\u0430'}
        </p>
        {!searchQuery && filterMode === 'all' && (
          <button
            onClick={onCreateAgent}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
          >
            <Plus size={18} />
            {'\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430'}
          </button>
        )}
      </div>
    </div>
  );
}
