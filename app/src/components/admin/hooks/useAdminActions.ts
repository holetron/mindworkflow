import { type ChangeEvent, useCallback } from 'react';
import {
  changeProjectOwner,
  createAdminIntegration,
  createAdminPromptPreset,
  deleteAdminFeedback,
  deleteAdminIntegration,
  deleteAdminPromptPreset,
  deleteAdminUser,
  exportAdminPromptPresets,
  fetchAdminFeedbackDetails,
  fetchAdminProjects,
  importAdminPromptPresets,
  testAdminEmailConfig,
  updateAdminEmailConfig,
  updateAdminFeedback,
  updateAdminIntegration,
  updateAdminPromptPreset,
  updateAdminUser,
  updateGlobalUiSettings,
  type AdminEmailConfigPayload,
  type AdminFeedbackStatus,
  type AdminFeedbackSummary,
  type AdminFeedbackUpdatePayload,
  type AdminIntegration,
  type AdminIntegrationPayload,
  type AdminUserPatch,
  type AdminUserSummary,
  type PromptPreset,
  type PromptPresetCategory,
  type PromptPresetPayload,
  type PromptPresetUpdatePayload,
  type UiSettings,
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type { AdminIntegrationFormState, PromptPresetFormState } from '../types';
import { buildFeedbackExcerpt } from '../constants';
import type { AdminStateResult } from './useAdminState';

function summarizeFeedback(details: {
  feedback_id: string;
  type: string;
  title: string;
  status: AdminFeedbackStatus;
  contact?: string | null;
  created_at: string;
  updated_at: string;
  description: string;
  resolution?: string | null;
}) {
  return {
    feedback_id: details.feedback_id,
    type: details.type,
    title: details.title,
    status: details.status,
    contact: details.contact ?? null,
    created_at: details.created_at,
    updated_at: details.updated_at,
    excerpt: buildFeedbackExcerpt(details.description),
    has_resolution: Boolean(details.resolution && details.resolution.trim().length > 0),
  };
}

export function useAdminActions(s: AdminStateResult) {
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

  // ---- Global ----
  const handleRefresh = useCallback(async () => {
    s.setRefreshing(true);
    const [usersOk, projectsOk, feedbackOk, emailOk, integrationsOk] = await Promise.all([
      s.loadUsers(),
      s.loadProjects(),
      s.loadFeedback(),
      s.loadEmailConfig(),
      s.loadIntegrations({
        userId: s.integrationFilter.userId || undefined,
        providerId: s.integrationFilter.providerId || undefined,
      }),
    ]);
    if (usersOk && projectsOk && feedbackOk && emailOk && integrationsOk) {
      s.setBanner({ type: 'success', message: 'Данные успешно обновлены' });
    }
    s.setRefreshing(false);
  }, [s.loadUsers, s.loadProjects, s.loadFeedback, s.loadEmailConfig, s.loadIntegrations, s.integrationFilter, s.setBanner, s.setRefreshing]);

  // ---- Users ----
  const handleToggleAdmin = useCallback(async (user: AdminUserSummary) => {
    s.setProcessingUserId(user.user_id);
    try {
      const updated = await updateAdminUser(user.user_id, { is_admin: !user.is_admin });
      s.setUsers((prev) =>
        prev.map((item) =>
          item.user_id === user.user_id ? { ...item, is_admin: updated.is_admin } : item,
        ),
      );
      s.setSelectedUser((prev) =>
        prev && prev.user_id === user.user_id ? { ...prev, is_admin: updated.is_admin } : prev,
      );
      if (s.selectedUser && s.selectedUser.user_id === user.user_id) {
        s.setEditForm((prev) => ({ ...prev, is_admin: updated.is_admin }));
      }
      s.setBanner({
        type: 'success',
        message: updated.is_admin
          ? `Пользователь ${user.email} назначен администратором`
          : `Права администратора сняты с ${user.email}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setProcessingUserId(null);
    }
  }, [s.selectedUser, s.setProcessingUserId, s.setUsers, s.setSelectedUser, s.setEditForm, s.setBanner]);

  const handleOpenEdit = useCallback((user: AdminUserSummary) => {
    s.setSelectedUser(user);
    s.setEditForm({ email: user.email, name: user.name ?? '', is_admin: user.is_admin, password: '' });
  }, [s.setSelectedUser, s.setEditForm]);

  const closeEditModal = useCallback(() => {
    if (s.editSubmitting) return;
    s.setSelectedUser(null);
    s.setEditForm({ email: '', name: '', is_admin: false, password: '' });
  }, [s.editSubmitting, s.setSelectedUser, s.setEditForm]);

  const handleEditFieldChange = useCallback(
    (field: 'email' | 'name' | 'is_admin' | 'password', value: string | boolean) => {
      s.setEditForm((prev) => ({ ...prev, [field]: value }));
    },
    [s.setEditForm],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!s.selectedUser) return;
    const payload: AdminUserPatch = {
      email: s.editForm.email.trim(),
      name: s.editForm.name.trim(),
      is_admin: s.editForm.is_admin,
    };
    const trimmedPassword = s.editForm.password.trim();
    if (trimmedPassword) {
      if (trimmedPassword.length < 6) {
        s.setBanner({ type: 'error', message: 'Пароль должен содержать не менее 6 символов' });
        return;
      }
      payload.password = trimmedPassword;
    }
    if (!payload.email) {
      s.setBanner({ type: 'error', message: 'Email не может быть пустым' });
      return;
    }
    s.setEditSubmitting(true);
    try {
      const updated = await updateAdminUser(s.selectedUser.user_id, payload);
      s.setUsers((prev) =>
        prev.map((user) =>
          user.user_id === s.selectedUser!.user_id
            ? { ...user, email: updated.email, name: updated.name, is_admin: updated.is_admin }
            : user,
        ),
      );
      s.setBanner({
        type: 'success',
        message: s.editForm.password.trim()
          ? 'Профиль пользователя и пароль обновлены'
          : 'Профиль пользователя обновлен',
      });
      s.setEditForm({ email: '', name: '', is_admin: false, password: '' });
      s.setSelectedUser(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setEditSubmitting(false);
    }
  }, [s.selectedUser, s.editForm, s.setBanner, s.setEditSubmitting, s.setUsers, s.setEditForm, s.setSelectedUser]);

  const handleDeleteUser = useCallback(async (user: AdminUserSummary) => {
    const confirmed = window.confirm(
      `Удалить пользователя ${user.email}? Его проекты и связанные данные будут удалены без возможности восстановления.`,
    );
    if (!confirmed) return;
    s.setProcessingUserId(user.user_id);
    try {
      await deleteAdminUser(user.user_id);
      s.setUsers((prev) => prev.filter((item) => item.user_id !== user.user_id));
      s.setSelectedUser((prev) => (prev && prev.user_id === user.user_id ? null : prev));
      s.setBanner({ type: 'success', message: `Пользователь ${user.email} удален` });
      await s.loadProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setProcessingUserId(null);
    }
  }, [s.setProcessingUserId, s.setUsers, s.setSelectedUser, s.setBanner, s.loadProjects]);

  // ---- Projects ----
  const closeChangeOwnerModal = useCallback(() => {
    if (s.changeOwnerSubmitting) return;
    s.setSelectedProject(null);
    s.setSelectedOwnerUserId('');
  }, [s.changeOwnerSubmitting, s.setSelectedProject, s.setSelectedOwnerUserId]);

  const handleChangeOwner = useCallback(async (newOwnerId: string) => {
    if (!s.selectedProject || !newOwnerId) return;
    s.setChangeOwnerSubmitting(true);
    try {
      await changeProjectOwner(s.selectedProject.project_id, newOwnerId);
      const updatedProjects = await fetchAdminProjects();
      s.setProjects(updatedProjects);
      s.setBanner({ type: 'success', message: 'Владелец проекта изменен' });
      s.setSelectedOwnerUserId('');
      s.setSelectedProject(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setChangeOwnerSubmitting(false);
    }
  }, [s.selectedProject, s.setChangeOwnerSubmitting, s.setProjects, s.setBanner, s.setSelectedOwnerUserId, s.setSelectedProject]);

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
      s.setBanner({ type: 'error', message: 'Укажите Gmail-отправителя' });
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
      s.setBanner({ type: 'success', message: 'Email / OAuth настройки обновлены' });
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
      s.setEmailTestBanner({ type: 'success', message: 'SMTP подключение подтверждено' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setEmailTestBanner({ type: 'error', message });
    } finally {
      s.setEmailTesting(false);
    }
  }, [s.emailTesting, s.setEmailTestBanner, s.setEmailTesting]);

  // ---- Feedback ----
  const closeFeedbackModal = useCallback(() => {
    s.setFeedbackModalOpen(false);
    s.setSelectedFeedbackId(null);
    s.setFeedbackDetails(null);
    s.setFeedbackModalError(null);
    s.setFeedbackForm({ title: '', description: '', contact: '', resolution: '', status: 'new' });
  }, [s.setFeedbackModalOpen, s.setSelectedFeedbackId, s.setFeedbackDetails, s.setFeedbackModalError, s.setFeedbackForm]);

  const openFeedbackModal = useCallback(async (entry: AdminFeedbackSummary): Promise<void> => {
    if (!entry?.feedback_id) {
      s.setBanner({ type: 'error', message: 'Не удалось определить идентификатор фидбека' });
      return;
    }
    s.setSelectedFeedbackId(entry.feedback_id);
    s.setFeedbackModalOpen(true);
    s.setFeedbackModalError(null);
    s.setFeedbackDetails(null);
    s.setFeedbackForm({
      title: entry.title,
      description: '',
      contact: entry.contact ?? '',
      resolution: '',
      status: entry.status,
    });
    s.setFeedbackDetailsLoading(true);
    try {
      const details = await fetchAdminFeedbackDetails(entry.feedback_id);
      s.setFeedbackDetails(details);
      s.setFeedbackForm({
        title: details.title,
        description: details.description,
        contact: details.contact ?? '',
        resolution: details.resolution ?? '',
        status: details.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage =
        typeof message === 'string' && message.trim().startsWith('<')
          ? 'Не удалось загрузить запись.'
          : message;
      s.setFeedbackModalError(normalizedMessage);
    } finally {
      s.setFeedbackDetailsLoading(false);
    }
  }, [s.setBanner, s.setSelectedFeedbackId, s.setFeedbackModalOpen, s.setFeedbackModalError, s.setFeedbackDetails, s.setFeedbackForm, s.setFeedbackDetailsLoading]);

  const handleFeedbackFieldChange = useCallback(
    (field: 'title' | 'description' | 'contact' | 'resolution', value: string) => {
      s.setFeedbackForm((prev) => ({ ...prev, [field]: value }));
    },
    [s.setFeedbackForm],
  );

  const handleFeedbackStatusChange = useCallback((status: AdminFeedbackStatus) => {
    s.setFeedbackForm((prev) => ({ ...prev, status }));
  }, [s.setFeedbackForm]);

  const handleSaveFeedback = useCallback(async (): Promise<void> => {
    if (!s.selectedFeedbackId || !s.feedbackDetails) return;

    const trimmedContact = s.feedbackForm.contact.trim();
    const trimmedResolution = s.feedbackForm.resolution.trim();

    const payload: AdminFeedbackUpdatePayload = {
      title: s.feedbackForm.title,
      description: s.feedbackForm.description,
      status: s.feedbackForm.status,
      contact: trimmedContact.length > 0 ? trimmedContact : null,
      resolution: trimmedResolution.length > 0 ? trimmedResolution : null,
    };

    const isUnchanged =
      s.feedbackDetails.title === payload.title &&
      s.feedbackDetails.description === payload.description &&
      (s.feedbackDetails.contact ?? '') === (payload.contact ?? '') &&
      (s.feedbackDetails.resolution ?? '') === (payload.resolution ?? '') &&
      s.feedbackDetails.status === payload.status;

    if (isUnchanged) {
      s.setFeedbackModalError('Изменений не обнаружено');
      return;
    }

    s.setFeedbackSaving(true);
    s.setFeedbackModalError(null);
    try {
      const updated = await updateAdminFeedback(s.selectedFeedbackId, payload);
      s.setFeedbackDetails(updated);
      s.setFeedbackForm({
        title: updated.title,
        description: updated.description,
        contact: updated.contact ?? '',
        resolution: updated.resolution ?? '',
        status: updated.status,
      });
      s.setFeedback((prev) =>
        prev.map((item) => (item.feedback_id === updated.feedback_id ? summarizeFeedback(updated) : item)),
      );
      s.setBanner({ type: 'success', message: 'Фидбек обновлен' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setFeedbackModalError(message);
    } finally {
      s.setFeedbackSaving(false);
    }
  }, [s.feedbackDetails, s.feedbackForm, s.selectedFeedbackId, s.setBanner, s.setFeedbackDetails, s.setFeedbackForm, s.setFeedback, s.setFeedbackSaving, s.setFeedbackModalError]);

  const handleDeleteFeedback = useCallback(async (): Promise<void> => {
    if (!s.selectedFeedbackId) return;
    const confirmed = window.confirm('Удалить запись? Действие необратимо.');
    if (!confirmed) return;
    s.setFeedbackDeleting(true);
    s.setFeedbackModalError(null);
    try {
      await deleteAdminFeedback(s.selectedFeedbackId);
      s.setFeedback((prev) => prev.filter((item) => item.feedback_id !== s.selectedFeedbackId));
      s.setBanner({ type: 'success', message: 'Фидбек удален' });
      closeFeedbackModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setFeedbackModalError(message);
    } finally {
      s.setFeedbackDeleting(false);
    }
  }, [s.selectedFeedbackId, closeFeedbackModal, s.setBanner, s.setFeedback, s.setFeedbackDeleting, s.setFeedbackModalError]);

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
      s.setPromptsError('Укажите название промпта');
      s.setPromptSubmitting(false);
      return;
    }
    if (!s.promptForm.content.trim()) {
      s.setPromptsError('Содержимое промпта не может быть пустым');
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
    const confirmed = window.confirm(`Удалить промпт \u00AB${preset.label}\u00BB?`);
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
      s.setBanner({ type: 'success', message: `Экспортировано промптов: ${data.count}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setPromptsError(message);
      s.setBanner({ type: 'error', message: `Не удалось экспортировать промпты: ${message}` });
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
            throw new Error('Файл не содержит массив "prompts"');
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
            throw new Error('Некорректная структура одного из промптов');
          }

          const result = await importAdminPromptPresets({
            prompts,
            mode: s.promptImportMode,
          });

          s.setBanner({
            type: 'success',
            message: `Импортировано промптов: ${result.imported}`,
          });
          const { category, search } = s.resolvePromptFilters();
          await s.loadPrompts(category, search);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          s.setPromptsError(message);
          s.setBanner({ type: 'error', message: `Импорт не выполнен: ${message}` });
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
        s.setPromptsError('Не удалось прочитать файл');
        s.setBanner({ type: 'error', message: 'Не удалось прочитать файл при импорте' });
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
      s.setBanner({ type: 'error', message: 'Выберите пользователя' });
      return;
    }
    if (!s.integrationForm.providerId) {
      s.setBanner({ type: 'error', message: 'Выберите провайдера' });
      return;
    }
    if (!trimmedName) {
      s.setBanner({ type: 'error', message: 'Введите название интеграции' });
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
        message: s.integrationForm.id ? 'Интеграция обновлена' : 'Интеграция создана',
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
      const confirmed = window.confirm('Удалить интеграцию? Действие необратимо.');
      if (!confirmed) return;
      try {
        s.setIntegrationSubmitting(true);
        await deleteAdminIntegration(integration.id);
        s.setBanner({ type: 'success', message: 'Интеграция удалена' });
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
      s.setWorkflowSettingsSuccess('Глобальные настройки сохранены');
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
    handleRefresh,
    handleToggleAdmin,
    handleOpenEdit,
    closeEditModal,
    handleEditFieldChange,
    handleSaveEdit,
    handleDeleteUser,
    closeChangeOwnerModal,
    handleChangeOwner,
    handleEmailFieldChange,
    handleEmailSubmit,
    handleEmailTest,
    openFeedbackModal,
    closeFeedbackModal,
    handleFeedbackFieldChange,
    handleFeedbackStatusChange,
    handleSaveFeedback,
    handleDeleteFeedback,
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

export type AdminActionsResult = ReturnType<typeof useAdminActions>;
