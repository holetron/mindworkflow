import { useCallback, useState } from 'react';
import {
  fetchAdminUsers,
  fetchAdminProjects,
  fetchAdminFeedback,
  fetchAdminEmailConfig,
  fetchAdminIntegrations,
  fetchAdminPromptPresets,
  fetchGlobalUiSettings,
  type AdminEmailConfig,
  type AdminFeedbackSummary,
  type AdminIntegration,
  type AdminProjectSummary,
  type AdminUserSummary,
  type PromptPreset,
  type PromptPresetCategory,
  type UiSettings,
} from '../../../state/api';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type { EmailFormState } from '../types';

export function useAdminDataLoaders() {
  // ---- Core data ----
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [projects, setProjects] = useState<AdminProjectSummary[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedbackSummary[]>([]);
  const [emailConfig, setEmailConfig] = useState<AdminEmailConfig | null>(null);
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>([]);
  const [integrations, setIntegrations] = useState<AdminIntegration[]>([]);
  const [workflowSettings, setWorkflowSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);

  // ---- Loading ----
  const [usersLoading, setUsersLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [workflowSettingsLoading, setWorkflowSettingsLoading] = useState(false);

  // ---- Errors ----
  const [usersError, setUsersError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [workflowSettingsError, setWorkflowSettingsError] = useState<string | null>(null);

  // ---- Email form state (needs to be set during loadEmailConfig) ----
  const [emailForm, setEmailForm] = useState<EmailFormState>({
    gmailUser: '',
    gmailAppPassword: '',
    frontendUrl: '',
    googleClientId: '',
    googleClientSecret: '',
  });

  // ---- Integration filter (needs to be set during loadIntegrations) ----
  const [integrationFilter, setIntegrationFilter] = useState<{ userId: string; providerId: string }>({
    userId: '',
    providerId: '',
  });

  // ---- Loaders ----
  const loadUsers = useCallback(async (): Promise<boolean> => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUsersError(message);
      return false;
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async (): Promise<boolean> => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const data = await fetchAdminProjects();
      setProjects(data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProjectsError(message);
      return false;
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadFeedback = useCallback(async (): Promise<boolean> => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const data = await fetchAdminFeedback();
      setFeedback(data);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedbackError(message);
      return false;
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  const loadEmailConfig = useCallback(async (): Promise<boolean> => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const data = await fetchAdminEmailConfig();
      setEmailConfig(data);
      setEmailForm({
        gmailUser: data.gmailUser,
        gmailAppPassword: '',
        frontendUrl: data.frontendUrl,
        googleClientId: data.googleClientId ?? '',
        googleClientSecret: '',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmailError(message);
      return false;
    } finally {
      setEmailLoading(false);
    }
  }, []);

  const loadIntegrations = useCallback(
    async (filters?: { userId?: string; providerId?: string }): Promise<boolean> => {
      setIntegrationsLoading(true);
      setIntegrationsError(null);
      try {
        const data = await fetchAdminIntegrations(filters);
        setIntegrations(data);
        if (filters) {
          setIntegrationFilter({
            userId: filters.userId ?? '',
            providerId: filters.providerId ?? '',
          });
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setIntegrationsError(message);
        return false;
      } finally {
        setIntegrationsLoading(false);
      }
    },
    [],
  );

  const loadPrompts = useCallback(
    async (category?: PromptPresetCategory, search?: string): Promise<void> => {
      setPromptsLoading(true);
      setPromptsError(null);
      try {
        const data = await fetchAdminPromptPresets({ category, search });
        setPromptPresets(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPromptsError(message);
      } finally {
        setPromptsLoading(false);
      }
    },
    [],
  );

  const loadWorkflowSettings = useCallback(async () => {
    try {
      setWorkflowSettingsLoading(true);
      setWorkflowSettingsError(null);
      const data = await fetchGlobalUiSettings();
      setWorkflowSettings(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkflowSettingsError(message);
      setWorkflowSettings(DEFAULT_UI_SETTINGS);
    } finally {
      setWorkflowSettingsLoading(false);
    }
  }, []);

  return {
    // Data
    users, setUsers,
    projects, setProjects,
    feedback, setFeedback,
    emailConfig, setEmailConfig,
    promptPresets, setPromptPresets,
    integrations, setIntegrations,
    workflowSettings, setWorkflowSettings,

    // Loading
    usersLoading, projectsLoading, feedbackLoading, emailLoading,
    promptsLoading, integrationsLoading, workflowSettingsLoading,

    // Errors
    usersError, projectsError, feedbackError, emailError,
    promptsError, setPromptsError, integrationsError, workflowSettingsError,

    // Email form (set during load)
    emailForm, setEmailForm,

    // Integration filter (set during load)
    integrationFilter, setIntegrationFilter,

    // Loaders
    loadUsers, loadProjects, loadFeedback, loadEmailConfig,
    loadIntegrations, loadPrompts, loadWorkflowSettings,
  };
}
