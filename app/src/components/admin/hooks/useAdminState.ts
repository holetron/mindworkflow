import { useCallback, useEffect, useMemo } from 'react';
import type { PromptPresetCategory } from '../../../state/api';
import { useAdminDataLoaders } from './useAdminDataLoaders';
import { useAdminFormState } from './useAdminFormState';
import { useAdminComputed } from './useAdminComputed';

export function useAdminState() {
  const data = useAdminDataLoaders();
  const forms = useAdminFormState();

  const computed = useAdminComputed(
    data.users,
    data.projects,
    data.feedback,
    forms.userSearch,
    forms.projectSearch,
    forms.feedbackSearch,
  );

  // ---- Feedback dirty check ----
  const {
    title: feedbackTitle,
    description: feedbackDescription,
    contact: feedbackContact,
    resolution: feedbackResolution,
    status: feedbackStatus,
  } = forms.feedbackForm;

  const feedbackDirty = useMemo(() => {
    if (!forms.feedbackDetails) return false;
    return (
      feedbackTitle !== forms.feedbackDetails.title ||
      feedbackDescription !== forms.feedbackDetails.description ||
      feedbackContact.trim() !== (forms.feedbackDetails.contact ?? '') ||
      feedbackResolution.trim() !== (forms.feedbackDetails.resolution ?? '') ||
      feedbackStatus !== forms.feedbackDetails.status
    );
  }, [forms.feedbackDetails, feedbackContact, feedbackDescription, feedbackResolution, feedbackStatus, feedbackTitle]);

  // ---- Prompt filter resolver ----
  const resolvePromptFilters = useCallback((): { category?: PromptPresetCategory; search?: string } => {
    const category = forms.promptCategoryFilter === 'all' ? undefined : forms.promptCategoryFilter;
    const searchValue = forms.promptSearch.trim();
    return {
      category,
      search: searchValue.length > 0 ? searchValue : undefined,
    };
  }, [forms.promptCategoryFilter, forms.promptSearch]);

  // ---- Effects ----
  useEffect(() => {
    void data.loadUsers();
    void data.loadProjects();
    void data.loadFeedback();
    void data.loadEmailConfig();
    void data.loadIntegrations();
  }, [data.loadUsers, data.loadProjects, data.loadFeedback, data.loadEmailConfig, data.loadIntegrations]);

  useEffect(() => {
    if (forms.activeTab !== 'prompts') return;
    const { category, search } = resolvePromptFilters();
    const handler = window.setTimeout(() => {
      void data.loadPrompts(category, search);
    }, 300);
    return () => window.clearTimeout(handler);
  }, [forms.activeTab, resolvePromptFilters, data.loadPrompts]);

  useEffect(() => {
    if (forms.activeTab !== 'workflow') return;
    void data.loadWorkflowSettings();
  }, [forms.activeTab, data.loadWorkflowSettings]);

  useEffect(() => {
    if (!forms.banner) return;
    const timer = window.setTimeout(() => forms.setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [forms.banner]);

  useEffect(() => {
    if (!forms.selectedUser) return;
    const latest = data.users.find((user) => user.user_id === forms.selectedUser!.user_id);
    if (!latest) {
      forms.setSelectedUser(null);
      return;
    }
    if (
      latest.email !== forms.selectedUser.email ||
      (latest.name ?? '') !== (forms.selectedUser.name ?? '') ||
      latest.is_admin !== forms.selectedUser.is_admin
    ) {
      forms.setSelectedUser(latest);
      forms.setEditForm({ email: latest.email, name: latest.name ?? '', is_admin: latest.is_admin, password: '' });
    }
  }, [data.users, forms.selectedUser]);

  useEffect(() => {
    if (!forms.selectedIntegration) return;
    const latest = data.integrations.find((i) => i.id === forms.selectedIntegration!.id);
    if (latest && latest !== forms.selectedIntegration) {
      forms.setSelectedIntegration(latest);
    }
  }, [data.integrations, forms.selectedIntegration]);

  return {
    // Data loaders
    ...data,
    // Form state
    ...forms,
    // Computed values
    ...computed,
    // Derived
    feedbackDirty,
    resolvePromptFilters,
  };
}

export type AdminStateResult = ReturnType<typeof useAdminState>;
