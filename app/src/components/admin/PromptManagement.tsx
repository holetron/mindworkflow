import { type RefObject } from 'react';
import { Download, Edit3, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import Modal from '../../ui/Modal';
import type { PromptPreset, PromptPresetCategory } from '../../state/api';
import type { PromptPresetFormState } from './types';
import { PROMPT_CATEGORY_OPTIONS, formatDateTime } from './constants';

interface PromptManagementProps {
  promptPresets: PromptPreset[];
  promptsError: string | null;
  promptsLoading: boolean;
  promptSearch: string;

  // Filters
  promptCategoryFilter: PromptPresetCategory | 'all';
  setPromptCategoryFilter: (filter: PromptPresetCategory | 'all') => void;

  // Modal
  promptModalOpen: boolean;
  promptSubmitting: boolean;
  editingPrompt: PromptPreset | null;
  promptForm: PromptPresetFormState;

  // Import / Export
  promptExporting: boolean;
  promptImporting: boolean;
  promptImportMode: 'append' | 'replace';
  setPromptImportMode: (mode: 'append' | 'replace') => void;
  importFileInputRef: RefObject<HTMLInputElement | null>;

  // Actions
  onOpenCreatePrompt: () => void;
  onOpenEditPrompt: (preset: PromptPreset) => void;
  onClosePromptModal: () => void;
  onPromptFieldChange: (field: keyof PromptPresetFormState, value: string | number | boolean) => void;
  onPromptSubmit: () => Promise<void>;
  onPromptDelete: (preset: PromptPreset) => Promise<void>;
  onExportPrompts: () => Promise<void>;
  onTriggerPromptImport: () => void;
  onPromptFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PromptManagement({
  promptPresets,
  promptsError,
  promptsLoading,
  promptSearch,
  promptCategoryFilter,
  setPromptCategoryFilter,
  promptModalOpen,
  promptSubmitting,
  editingPrompt,
  promptForm,
  promptExporting,
  promptImporting,
  promptImportMode,
  setPromptImportMode,
  importFileInputRef,
  onOpenCreatePrompt,
  onOpenEditPrompt,
  onClosePromptModal,
  onPromptFieldChange,
  onPromptSubmit,
  onPromptDelete,
  onExportPrompts,
  onTriggerPromptImport,
  onPromptFileChange,
}: PromptManagementProps) {
  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPromptCategoryFilter('all')}
              className={`rounded-full px-3 py-1 text-sm transition ${promptCategoryFilter === 'all' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              All Categories
            </button>
            {PROMPT_CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPromptCategoryFilter(option.value)}
                className={`rounded-full px-3 py-1 text-sm transition ${promptCategoryFilter === option.value ? 'bg-primary text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-xs">
              <button
                type="button"
                onClick={() => setPromptImportMode('append')}
                className={`px-3 py-1 transition ${promptImportMode === 'append' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                disabled={promptImporting}
                title="Add new prompts without deleting existing ones"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setPromptImportMode('replace')}
                className={`px-3 py-1 transition ${promptImportMode === 'replace' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                disabled={promptImporting}
                title="Replace current library with imported list"
              >
                Replace
              </button>
            </div>
            <button
              type="button"
              onClick={onExportPrompts}
              disabled={promptExporting}
              className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            >
              {promptExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {promptExporting ? 'Exporting...' : 'Export JSON'}
            </button>
            <button
              type="button"
              onClick={onTriggerPromptImport}
              disabled={promptImporting}
              className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            >
              {promptImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {promptImporting ? 'Importing...' : 'Import JSON'}
            </button>
            <button
              type="button"
              onClick={onOpenCreatePrompt}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-1 text-sm font-medium text-white transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New prompt
            </button>
          </div>
        </div>
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onPromptFileChange}
        />
        {promptsError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            Failed to load prompt library: {promptsError}
          </div>
        )}
        {promptsLoading && !promptPresets.length ? (
          <div className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prompt library...
          </div>
        ) : promptPresets.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            {promptSearch.trim()
              ? `No prompts matching query \u00AB${promptSearch.trim()}\u00BB.`
              : 'No saved prompts yet. Add the first preset to use it in AI settings.'}
          </div>
        ) : (
          <div className="grid gap-4">
            {promptPresets.map((preset) => {
              const categoryLabel =
                PROMPT_CATEGORY_OPTIONS.find((option) => option.value === preset.category)?.label ??
                (preset.category === 'system_prompt' ? 'System prompts' : 'Output examples');
              return (
                <article
                  key={preset.preset_id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition hover:border-primary/60 hover:shadow-primary/10"
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{preset.label}</h2>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                          {categoryLabel}
                        </span>
                        {preset.is_quick_access && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-300">
                            Quick Access
                          </span>
                        )}
                      </div>
                      {preset.description && (
                        <p className="text-sm text-slate-300">{preset.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>Sort order: {preset.sort_order}</span>
                        <span>Updated: {formatDateTime(preset.updated_at)}</span>
                      </div>
                      {preset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[11px] uppercase tracking-wide text-slate-400">
                          {preset.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenEditPrompt(preset)}
                        className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200 transition hover:border-primary hover:text-primary"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onPromptDelete(preset)}
                        className="flex items-center gap-2 rounded-full border border-rose-500/40 px-3 py-1 text-sm text-rose-200 transition hover:border-rose-400 hover:text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </header>
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Content</div>
                    <pre className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-800 bg-black/40 p-3 text-xs text-slate-200">
                      {preset.content}
                    </pre>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Prompt create/edit modal */}
      {promptModalOpen && (
        <Modal
          title={editingPrompt ? `Editing prompt \u00AB${editingPrompt.label}\u00BB` : 'New prompt'}
          onClose={onClosePromptModal}
          actions={
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClosePromptModal}
                className="rounded-full border border-slate-700 px-4 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                disabled={promptSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onPromptSubmit}
                className="rounded-full bg-primary px-4 py-1 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
                disabled={promptSubmitting}
              >
                {promptSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Category</label>
                <select
                  value={promptForm.category}
                  onChange={(event) => onPromptFieldChange('category', event.target.value as PromptPresetCategory)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={promptSubmitting}
                >
                  {PROMPT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Order</label>
                <input
                  type="number"
                  value={promptForm.sort_order}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    onPromptFieldChange('sort_order', Number.isNaN(parsed) ? 0 : parsed);
                  }}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={promptSubmitting}
                  min={0}
                />
                <p className="mt-1 text-xs text-slate-500">Used for sorting quick access buttons.</p>
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <input
                type="text"
                value={promptForm.label}
                onChange={(event) => onPromptFieldChange('label', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={promptSubmitting}
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
              <textarea
                rows={2}
                value={promptForm.description}
                onChange={(event) => onPromptFieldChange('description', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={promptSubmitting}
                placeholder="Brief explanation of what this prompt is for"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Tags</label>
              <input
                type="text"
                value={promptForm.tags}
                onChange={(event) => onPromptFieldChange('tags', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={promptSubmitting}
                placeholder="e.g.: planner, sales, onboarding"
              />
              <p className="mt-1 text-xs text-slate-500">Comma-separated. Used for searching.</p>
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={promptForm.is_quick_access}
                onChange={(event) => onPromptFieldChange('is_quick_access', event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                disabled={promptSubmitting}
              />
              Show in quick access buttons
            </label>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Prompt Content</label>
              <textarea
                rows={10}
                value={promptForm.content}
                onChange={(event) => onPromptFieldChange('content', event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-200 focus:border-primary focus:outline-none"
                disabled={promptSubmitting}
                placeholder="Full prompt text"
                required
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
