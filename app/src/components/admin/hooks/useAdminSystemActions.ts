import { type ChangeEvent, useCallback } from 'react';
import {
  createAdminIntegration,
  createAdminPromptPreset,
  deleteAdminIntegration,
  deleteAdminPromptPreset,
  exportAdminPromptPresets,
  importAdminPromptPresets,
  testAdminEmailConfig,
  updateAdminEmailConfig,
  updateAdminIntegration,
  updateAdminPromptPreset,
  updateGlobalUiSettings,
  type AdminEmailConfigPayload,
  type AdminIntegration,
  type AdminIntegrationPayload,
  type PromptPreset,
  type PromptPresetCategory,
  type PromptPresetPayload,
  type PromptPresetUpdatePayload,
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type { AdminIntegrationFormState, PromptPresetFormState } from '../types';
import type { AdminStateResult } from './useAdminState';

export function useAdminSystemActions(s: AdminStateResult) {
  // ---- Integration helpers ----
  const integrationToFormState = useCallback(
    (integration: AdminIntegration): AdminIntegrationFormState => ({
      id: integration.id,
      userId: integration.user.id,
      providerId: integration.providerId,
      name: integration.name,
      description: integration.description ?? '',
      apiKey: '',
      apiKeyStored: integration.apiKeyStored ?? false,
      apiKeyPreview: integration.apiKeyPreview ?? null,
      apiKeyModified: false,
      baseUrl: integration.baseUrl ?? '',
      organization: integration.organization ?? '',
      webhookContract: integration.webhookContract ?? '',
      systemPrompt: integration.systemPrompt ?? '',
      enabled: integration.enabled,
    }),
    [],
  );

  const createEmptyIntegrationForm = useCallback(
    (): AdminIntegrationFormState => ({
      id: undefined,
      userId: s.users[0]?.user_id ?? '',
      providerId: PROVIDERS[0]?.id ?? (s.integrations[0]?.providerId ?? ''),
      name: '',
      description: '',
      apiKey: '',
      apiKeyStored: false,
      apiKeyPreview: null,
      apiKeyModified: false,
      baseUrl: '',
      organization: '',
      webhookContract: '',
      systemPrompt: '',
      enabled: true,
    }),
    [s.users, s.integrations],
  );

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

  // ---- Email / Settings ----
  const handleEmailFieldChange = useCallback(
    (field: 'gmailUser' | 'gmailAppPassword' | 'frontendUrl' | 'googleClientId' | 'googleClientSecret', value: string) => {
      s.setEmailForm((prev) => ({ ...prev, [field]: value }));
    },
    [s.setEmailForm],
  );

  const handleEmailSubmit = useCallback(async () => {
    const payload: AdminEmailConfigPayload = {
      gmailUser: s.emailForm.gmailUser.trim() || undefined,
      frontendUrl: s.emailForm.frontendUrl.trim() || undefined,
      googleClientId: s.emailForm.googleClientId.trim() || undefined,
      googleClientSecret: s.emailForm.googleClientSecret.trim() || undefined,
    };
    const trimmedPassword = s.emailForm.gmailAppPassword.replace(/\s+/g, '').trim();
    if (trimmedPassword) {
      payload.gmailAppPassword = trimmedPassword;
    }
    if (!payload.gmailUser) {
      s.setBanner({ type: 'error', message: 'Specify Gmail sender' });
      return;
    }
    s.setEmailTestBanner(null);
    s.setEmailSubmitting(true);
    try {
      const updated = await updateAdminEmailConfig(payload);
      s.setEmailConfig(updated);
      s.setEmailForm((prev) => ({
        ...prev,
        gmailUser: updated.gmailUser,
        frontendUrl: updated.frontendUrl,
        googleClientId: updated.googleClientId ?? '',
        gmailAppPassword: '',
        googleClientSecret: '',
      }));
      s.setBanner({ type: 'success', message: 'Email / OAuth settings updated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setEmailSubmitting(false);
    }
  }, [s.emailForm, s.setBanner, s.setEmailTestBanner, s.setEmailSubmitting, s.setEmailConfig, s.setEmailForm]);

  const handleEmailTest = useCallback(async () => {
    if (s.emailTesting) return;
    s.setEmailTestBanner(null);
    s.setEmailTesting(true);
    try {
      await testAdminEmailConfig();
      s.setEmailTestBanner({ type: 'success', message: 'SMTP connection confirmed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setEmailTestBanner({ type: 'error', message });
    } finally {
      s.setEmailTesting(false);
    }
  }, [s.emailTesting, s.setEmailTestBanner, s.setEmailTesting]);

  // ---- Prompts ----
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

  // ---- Integrations ----
  const handleSelectIntegration = useCallback(
    (integration: AdminIntegration) => {
      s.setSelectedIntegration(integration);
      s.setIntegrationForm(integrationToFormState(integration));
    },
    [integrationToFormState, s.setSelectedIntegration, s.setIntegrationForm],
  );

  const handleNewIntegration = useCallback(() => {
    const form = createEmptyIntegrationForm();
    s.setSelectedIntegration(null);
    s.setIntegrationForm(form);
  }, [createEmptyIntegrationForm, s.setSelectedIntegration, s.setIntegrationForm]);

  const handleIntegrationFormChange = useCallback(
    (field: keyof AdminIntegrationFormState, value: string | boolean) => {
      s.setIntegrationForm((prev) => {
        if (!prev) return prev;
        if (field === 'apiKey') {
          return {
            ...prev,
            apiKey: String(value),
            apiKeyModified: true,
            apiKeyStored: false,
            apiKeyPreview: null,
          };
        }
        return { ...prev, [field]: value };
      });
    },
    [s.setIntegrationForm],
  );

  const handleSaveIntegration = useCallback(async () => {
    if (!s.integrationForm) return;
    const trimmedName = s.integrationForm.name.trim();
    if (!s.integrationForm.userId) {
      s.setBanner({ type: 'error', message: 'Select user' });
      return;
    }
    if (!s.integrationForm.providerId) {
      s.setBanner({ type: 'error', message: 'Select provider' });
      return;
    }
    if (!trimmedName) {
      s.setBanner({ type: 'error', message: 'Enter integration name' });
      return;
    }

    const { apiKeyStored, apiKeyPreview, apiKeyModified, ...formWithoutMeta } = s.integrationForm;
    const basePayload: Partial<AdminIntegrationPayload> = {
      name: trimmedName,
      description: formWithoutMeta.description || undefined,
      apiKey: formWithoutMeta.apiKey || undefined,
      baseUrl: formWithoutMeta.baseUrl || undefined,
      organization: formWithoutMeta.organization || undefined,
      webhookContract: formWithoutMeta.webhookContract || undefined,
      systemPrompt: formWithoutMeta.systemPrompt || undefined,
      enabled: formWithoutMeta.enabled,
    };
    if (!apiKeyModified) {
      delete (basePayload as { apiKey?: string }).apiKey;
    }

    try {
      s.setIntegrationSubmitting(true);
      let saved: AdminIntegration;
      if (s.integrationForm.id) {
        saved = await updateAdminIntegration(s.integrationForm.id, basePayload);
      } else {
        saved = await createAdminIntegration({
          userId: s.integrationForm.userId,
          providerId: s.integrationForm.providerId,
          ...basePayload,
        });
      }

      await s.loadIntegrations({
        userId: s.integrationFilter.userId || undefined,
        providerId: s.integrationFilter.providerId || undefined,
      });
      s.setBanner({
        type: 'success',
        message: s.integrationForm.id ? 'Integration updated' : 'Integration created',
      });
      s.setSelectedIntegration(saved);
      s.setIntegrationForm(integrationToFormState(saved));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setIntegrationSubmitting(false);
    }
  }, [s.integrationForm, s.integrationFilter, s.loadIntegrations, integrationToFormState, s.setBanner, s.setIntegrationSubmitting, s.setSelectedIntegration, s.setIntegrationForm]);

  const handleDeleteIntegration = useCallback(
    async (integration: AdminIntegration) => {
      const confirmed = window.confirm('Delete integration? This action is irreversible.');
      if (!confirmed) return;
      try {
        s.setIntegrationSubmitting(true);
        await deleteAdminIntegration(integration.id);
        s.setBanner({ type: 'success', message: 'Integration deleted' });
        s.setIntegrationForm(null);
        s.setSelectedIntegration(null);
        await s.loadIntegrations({
          userId: s.integrationFilter.userId || undefined,
          providerId: s.integrationFilter.providerId || undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        s.setBanner({ type: 'error', message });
      } finally {
        s.setIntegrationSubmitting(false);
      }
    },
    [s.loadIntegrations, s.integrationFilter, s.setBanner, s.setIntegrationSubmitting, s.setIntegrationForm, s.setSelectedIntegration],
  );

  const handleRefreshIntegrations = useCallback(() => {
    void s.loadIntegrations({
      userId: s.integrationFilter.userId || undefined,
      providerId: s.integrationFilter.providerId || undefined,
    });
  }, [s.loadIntegrations, s.integrationFilter]);

  const handleCancelIntegrationEdit = useCallback(() => {
    s.setIntegrationForm(null);
    s.setSelectedIntegration(null);
  }, [s.setIntegrationForm, s.setSelectedIntegration]);

  // ---- Workflow settings ----
  const handleWorkflowMarkdownChange = useCallback(
    (field: string, value: number | string) => {
      s.setWorkflowSettings((prev) => ({
        ...prev,
        markdownPreview: {
          ...prev.markdownPreview,
          [field]: value,
        },
      }));
    },
    [s.setWorkflowSettings],
  );

  const handleWorkflowFontScalingChange = useCallback(
    (field: string, value: unknown) => {
      s.setWorkflowSettings((prev) => ({
        ...prev,
        textNodeFontScaling: {
          ...prev.textNodeFontScaling,
          [field]: value,
        },
      }));
    },
    [s.setWorkflowSettings],
  );

  const handleWorkflowSettingsSave = useCallback(async () => {
    try {
      s.setWorkflowSettingsSaving(true);
      s.setWorkflowSettingsSuccess(null);
      await updateGlobalUiSettings(s.workflowSettings);
      s.setWorkflowSettingsSuccess('Global settings saved');
      setTimeout(() => s.setWorkflowSettingsSuccess(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setWorkflowSettings((prev) => prev); // no-op to keep state
      // Set error through the state's workflow error
    } finally {
      s.setWorkflowSettingsSaving(false);
    }
  }, [s.workflowSettings, s.setWorkflowSettingsSaving, s.setWorkflowSettingsSuccess, s.setWorkflowSettings]);

  const handleWorkflowSettingsReset = useCallback(() => {
    s.setWorkflowSettings(DEFAULT_UI_SETTINGS);
  }, [s.setWorkflowSettings]);

  return {
    handleEmailFieldChange,
    handleEmailSubmit,
    handleEmailTest,
    handleOpenCreatePrompt,
    handleOpenEditPrompt,
    handleClosePromptModal,
    handlePromptFieldChange,
    handlePromptSubmit,
    handlePromptDelete,
    handleExportPrompts,
    handleTriggerPromptImport,
    handlePromptFileChange,
    handleSelectIntegration,
    handleNewIntegration,
    handleIntegrationFormChange,
    handleSaveIntegration,
    handleDeleteIntegration,
    handleRefreshIntegrations,
    handleCancelIntegrationEdit,
    handleWorkflowMarkdownChange,
    handleWorkflowFontScalingChange,
    handleWorkflowSettingsSave,
    handleWorkflowSettingsReset,
    setWorkflowSettings: s.setWorkflowSettings,
  };
}
