import { useCallback } from 'react';
import {
  createAdminIntegration,
  deleteAdminIntegration,
  updateAdminIntegration,
  type AdminIntegration,
  type AdminIntegrationPayload,
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
import type { AdminIntegrationFormState } from '../types';
import type { AdminStateResult } from './useAdminState';

export function useIntegrationActions(s: AdminStateResult) {
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

  return {
    handleSelectIntegration,
    handleNewIntegration,
    handleIntegrationFormChange,
    handleSaveIntegration,
    handleDeleteIntegration,
    handleRefreshIntegrations,
    handleCancelIntegrationEdit,
  };
}
