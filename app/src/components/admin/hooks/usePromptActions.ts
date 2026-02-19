import { type ChangeEvent, useCallback } from 'react';
import {
  createAdminPromptPreset,
  deleteAdminPromptPreset,
  exportAdminPromptPresets,
  importAdminPromptPresets,
  updateAdminPromptPreset,
  type PromptPreset,
  type PromptPresetCategory,
  type PromptPresetPayload,
  type PromptPresetUpdatePayload,
} from '../../../state/api';
import type { PromptPresetFormState } from '../types';
import type { AdminStateResult } from './useAdminState';

export function usePromptActions(s: AdminStateResult) {
  const resetPromptForm = useCallback((categoryOverride?: PromptPresetCategory) => {
    s.setPromptForm({
      category: categoryOverride ?? 'system_prompt',
      label: '',
      description: '',
      content: '',
      tags: '',
      is_quick_access: false,
      sort_order: 0,
    });
    s.setEditingPrompt(null);
  }, [s.setPromptForm, s.setEditingPrompt]);

  const handleOpenCreatePrompt = useCallback(() => {
    const defaultCategory = s.promptCategoryFilter === 'all' ? 'system_prompt' : s.promptCategoryFilter;
    resetPromptForm(defaultCategory);
    s.setPromptModalOpen(true);
  }, [s.promptCategoryFilter, resetPromptForm, s.setPromptModalOpen]);

  const handleOpenEditPrompt = useCallback((preset: PromptPreset) => {
    s.setEditingPrompt(preset);
    s.setPromptForm({
      category: preset.category,
      label: preset.label,
      description: preset.description ?? '',
      content: preset.content,
      tags: preset.tags.join(', '),
      is_quick_access: preset.is_quick_access,
      sort_order: preset.sort_order ?? 0,
    });
    s.setPromptModalOpen(true);
  }, [s.setEditingPrompt, s.setPromptForm, s.setPromptModalOpen]);

  const handleClosePromptModal = useCallback(() => {
    s.setPromptModalOpen(false);
    s.setPromptSubmitting(false);
    const defaultCategory = s.promptCategoryFilter === 'all' ? undefined : s.promptCategoryFilter;
    resetPromptForm(defaultCategory);
  }, [s.promptCategoryFilter, resetPromptForm, s.setPromptModalOpen, s.setPromptSubmitting]);

  const handlePromptFieldChange = useCallback(
    (field: keyof PromptPresetFormState, value: string | number | boolean) => {
      s.setPromptForm((prev) => ({
        ...prev,
        [field]: value,
      }) as PromptPresetFormState);
    },
    [s.setPromptForm],
  );

  const handlePromptSubmit = useCallback(async () => {
    s.setPromptSubmitting(true);
    s.setPromptsError(null);
    if (!s.promptForm.label.trim()) {
      s.setPromptsError('Specify prompt name');
      s.setPromptSubmitting(false);
      return;
    }
    if (!s.promptForm.content.trim()) {
      s.setPromptsError('Prompt content cannot be empty');
      s.setPromptSubmitting(false);
      return;
    }
    const { category, search } = s.resolvePromptFilters();
    const tags = s.promptForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const descriptionValue = s.promptForm.description.trim();
    const sortOrderValue = Number.isFinite(s.promptForm.sort_order) ? s.promptForm.sort_order : 0;
    const payload: PromptPresetPayload = {
      category: s.promptForm.category,
      label: s.promptForm.label.trim(),
      content: s.promptForm.content,
      description: descriptionValue,
      tags,
      is_quick_access: s.promptForm.is_quick_access,
      sort_order: sortOrderValue,
    };

    try {
      if (s.editingPrompt) {
        const updatePayload: PromptPresetUpdatePayload = { ...payload };
        await updateAdminPromptPreset(s.editingPrompt.preset_id, updatePayload);
      } else {
        await createAdminPromptPreset(payload);
      }
      s.setPromptModalOpen(false);
      s.setPromptSubmitting(false);
      resetPromptForm(category);
      await s.loadPrompts(category, search);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setPromptsError(message);
      s.setPromptSubmitting(false);
    }
  }, [s.promptForm, s.editingPrompt, s.resolvePromptFilters, s.loadPrompts, resetPromptForm, s.setPromptSubmitting, s.setPromptsError, s.setPromptModalOpen]);

  const handlePromptDelete = useCallback(async (preset: PromptPreset) => {
    const confirmed = window.confirm(`Delete prompt \u00AB${preset.label}\u00BB?`);
    if (!confirmed) return;
    try {
      s.setPromptsError(null);
      await deleteAdminPromptPreset(preset.preset_id);
      const { category, search } = s.resolvePromptFilters();
      await s.loadPrompts(category, search);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setPromptsError(message);
    }
  }, [s.resolvePromptFilters, s.loadPrompts, s.setPromptsError]);

  const handleExportPrompts = useCallback(async () => {
    s.setPromptExporting(true);
    s.setPromptsError(null);
    try {
      const data = await exportAdminPromptPresets();
      const filename = `prompt-presets-${new Date().toISOString().replace(/[:]/g, '-')}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      s.setBanner({ type: 'success', message: `Prompts exported: ${data.count}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setPromptsError(message);
      s.setBanner({ type: 'error', message: `Failed to export prompts: ${message}` });
    } finally {
      s.setPromptExporting(false);
    }
  }, [s.setBanner, s.setPromptExporting, s.setPromptsError]);

  const handleTriggerPromptImport = useCallback(() => {
    if (s.promptImporting) return;
    s.importFileInputRef.current?.click();
  }, [s.promptImporting, s.importFileInputRef]);

  const handlePromptFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const inputElement = event.target;
      const file = inputElement.files?.[0];
      if (!file) return;
      s.setPromptImporting(true);
      s.setPromptsError(null);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = typeof reader.result === 'string' ? reader.result : '';
          const parsed = raw.length ? JSON.parse(raw) : {};
          const promptsRaw =
            Array.isArray(parsed)
              ? parsed
              : parsed && typeof parsed === 'object' && Array.isArray((parsed as { prompts?: unknown }).prompts)
                  ? (parsed as { prompts: unknown }).prompts
                  : null;

          if (promptsRaw === null) {
            throw new Error('File does not contain a "prompts" array');
          }

          const prompts = (promptsRaw as unknown[]).map((item) => item as PromptPreset);
          const invalid = prompts.some(
            (preset) =>
              !preset ||
              typeof preset !== 'object' ||
              typeof (preset as PromptPreset).category !== 'string' ||
              typeof (preset as PromptPreset).label !== 'string' ||
              typeof (preset as PromptPreset).content !== 'string',
          );
          if (invalid) {
            throw new Error('Invalid structure of one of the prompts');
          }

          const result = await importAdminPromptPresets({
            prompts,
            mode: s.promptImportMode,
          });

          s.setBanner({
            type: 'success',
            message: `Prompts imported: ${result.imported}`,
          });
          const { category, search } = s.resolvePromptFilters();
          await s.loadPrompts(category, search);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          s.setPromptsError(message);
          s.setBanner({ type: 'error', message: `Import failed: ${message}` });
        } finally {
          s.setPromptImporting(false);
          if (s.importFileInputRef.current) {
            s.importFileInputRef.current.value = '';
          }
          inputElement.value = '';
        }
      };
      reader.onerror = () => {
        s.setPromptImporting(false);
        s.setPromptsError('Failed to read file');
        s.setBanner({ type: 'error', message: 'Failed to read file during import' });
        if (s.importFileInputRef.current) {
          s.importFileInputRef.current.value = '';
        }
        inputElement.value = '';
      };
      reader.readAsText(file);
    },
    [s.promptImportMode, s.resolvePromptFilters, s.loadPrompts, s.setBanner, s.setPromptImporting, s.setPromptsError, s.importFileInputRef],
  );

  return {
    handleOpenCreatePrompt,
    handleOpenEditPrompt,
    handleClosePromptModal,
    handlePromptFieldChange,
    handlePromptSubmit,
    handlePromptDelete,
    handleExportPrompts,
    handleTriggerPromptImport,
    handlePromptFileChange,
  };
}
