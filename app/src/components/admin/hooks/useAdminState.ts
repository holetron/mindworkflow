import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAdminUsers,
  fetchAdminProjects,
  fetchAdminFeedback,
  fetchAdminEmailConfig,
  fetchAdminIntegrations,
  fetchAdminPromptPresets,
  fetchGlobalUiSettings,
  type AdminEmailConfig,
  type AdminFeedbackDetails,
  type AdminFeedbackStatus,
  type AdminFeedbackSummary,
  type AdminIntegration,
  type AdminProjectSummary,
  type AdminUserSummary,
  type PromptPreset,
  type PromptPresetCategory,
  type UiSettings,
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type {
  AdminIntegrationFormState,
  AdminTab,
  BannerState,
  EmailFormState,
  FeedbackFormState,
  PromptPresetFormState,
  UserEditFormState,
} from '../types';
import { FEEDBACK_STATUS_LABELS } from '../constants';

export function useAdminState() {
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

  // ---- Banner ----
  const [banner, setBanner] = useState<BannerState>(null);

  // ---- Tab ----
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // ---- Search ----
  const [userSearch, setUserSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [promptSearch, setPromptSearch] = useState('');

  // ---- Refreshing ----
  const [refreshing, setRefreshing] = useState(false);

  // ---- User management ----
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [editForm, setEditForm] = useState<UserEditFormState>({
    email: '',
    name: '',
    is_admin: false,
    password: '',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ---- Project management ----
  const [selectedProject, setSelectedProject] = useState<AdminProjectSummary | null>(null);
  const [selectedOwnerUserId, setSelectedOwnerUserId] = useState<string>('');
  const [changeOwnerSubmitting, setChangeOwnerSubmitting] = useState(false);

  // ---- Email / Settings ----
  const [emailForm, setEmailForm] = useState<EmailFormState>({
    gmailUser: '',
    gmailAppPassword: '',
    frontendUrl: '',
    googleClientId: '',
    googleClientSecret: '',
  });
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestBanner, setEmailTestBanner] = useState<BannerState>(null);

  // ---- Feedback ----
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [feedbackDetails, setFeedbackDetails] = useState<AdminFeedbackDetails | null>(null);
  const [feedbackDetailsLoading, setFeedbackDetailsLoading] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState<FeedbackFormState>({
    title: '',
    description: '',
    contact: '',
    resolution: '',
    status: 'new',
  });
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackDeleting, setFeedbackDeleting] = useState(false);
  const [feedbackModalError, setFeedbackModalError] = useState<string | null>(null);

  // ---- Prompts ----
  const [promptCategoryFilter, setPromptCategoryFilter] = useState<PromptPresetCategory | 'all'>('all');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptPreset | null>(null);
  const [promptForm, setPromptForm] = useState<PromptPresetFormState>({
    category: 'system_prompt',
    label: '',
    description: '',
    content: '',
    tags: '',
    is_quick_access: false,
    sort_order: 0,
  });
  const [promptExporting, setPromptExporting] = useState(false);
  const [promptImporting, setPromptImporting] = useState(false);
  const [promptImportMode, setPromptImportMode] = useState<'append' | 'replace'>('append');
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Integrations ----
  const [selectedIntegration, setSelectedIntegration] = useState<AdminIntegration | null>(null);
  const [integrationForm, setIntegrationForm] = useState<AdminIntegrationFormState | null>(null);
  const [integrationSubmitting, setIntegrationSubmitting] = useState(false);
  const [integrationFilter, setIntegrationFilter] = useState<{ userId: string; providerId: string }>({
    userId: '',
    providerId: '',
  });

  // ---- Workflow settings ----
  const [workflowSettingsSaving, setWorkflowSettingsSaving] = useState(false);
  const [workflowSettingsSuccess, setWorkflowSettingsSuccess] = useState<string | null>(null);

  // ---- Provider map ----
  const providerMap = useMemo(
    () => new Map(PROVIDERS.map((provider) => [provider.id, provider])),
    [],
  );

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

  const resolvePromptFilters = useCallback((): { category?: PromptPresetCategory; search?: string } => {
    const category = promptCategoryFilter === 'all' ? undefined : promptCategoryFilter;
    const searchValue = promptSearch.trim();
    return {
      category,
      search: searchValue.length > 0 ? searchValue : undefined,
    };
  }, [promptCategoryFilter, promptSearch]);

  // ---- Effects ----
  useEffect(() => {
    void loadUsers();
    void loadProjects();
    void loadFeedback();
    void loadEmailConfig();
    void loadIntegrations();
  }, [loadUsers, loadProjects, loadFeedback, loadEmailConfig, loadIntegrations]);

  useEffect(() => {
    if (activeTab !== 'prompts') return;
    const { category, search } = resolvePromptFilters();
    const handler = window.setTimeout(() => {
      void loadPrompts(category, search);
    }, 300);
    return () => window.clearTimeout(handler);
  }, [activeTab, resolvePromptFilters, loadPrompts]);

  useEffect(() => {
    if (activeTab !== 'workflow') return;
    void loadWorkflowSettings();
  }, [activeTab, loadWorkflowSettings]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!selectedUser) return;
    const latest = users.find((user) => user.user_id === selectedUser.user_id);
    if (!latest) {
      setSelectedUser(null);
      return;
    }
    if (
      latest.email !== selectedUser.email ||
      (latest.name ?? '') !== (selectedUser.name ?? '') ||
      latest.is_admin !== selectedUser.is_admin
    ) {
      setSelectedUser(latest);
      setEditForm({ email: latest.email, name: latest.name ?? '', is_admin: latest.is_admin, password: '' });
    }
  }, [users, selectedUser]);

  useEffect(() => {
    if (!selectedIntegration) return;
    const latest = integrations.find((i) => i.id === selectedIntegration.id);
    if (latest && latest !== selectedIntegration) {
      setSelectedIntegration(latest);
    }
  }, [integrations, selectedIntegration]);

  // ---- Computed ----
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const name = (user.name ?? '').toLowerCase();
      return (
        user.email.toLowerCase().includes(query) ||
        name.includes(query) ||
        user.user_id.toLowerCase().includes(query)
      );
    });
  }, [users, userSearch]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => {
      const title = (project.title ?? '').toLowerCase();
      const description = (project.description ?? '').toLowerCase();
      const ownerEmail = (project.owner_email ?? '').toLowerCase();
      const ownerId = (project.owner_id ?? '').toLowerCase();
      return (
        title.includes(query) ||
        description.includes(query) ||
        ownerEmail.includes(query) ||
        ownerId.includes(query) ||
        project.project_id.toLowerCase().includes(query)
      );
    });
  }, [projects, projectSearch]);

  const filteredFeedback = useMemo(() => {
    const query = feedbackSearch.trim().toLowerCase();
    if (!query) return feedback;
    return feedback.filter((item) => {
      const statusLabel = FEEDBACK_STATUS_LABELS[item.status].toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        (item.contact ?? '').toLowerCase().includes(query) ||
        item.excerpt.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        statusLabel.includes(query)
      );
    });
  }, [feedback, feedbackSearch]);

  const {
    title: feedbackTitle,
    description: feedbackDescription,
    contact: feedbackContact,
    resolution: feedbackResolution,
    status: feedbackStatus,
  } = feedbackForm;

  const feedbackDirty = useMemo(() => {
    if (!feedbackDetails) return false;
    return (
      feedbackTitle !== feedbackDetails.title ||
      feedbackDescription !== feedbackDetails.description ||
      feedbackContact.trim() !== (feedbackDetails.contact ?? '') ||
      feedbackResolution.trim() !== (feedbackDetails.resolution ?? '') ||
      feedbackStatus !== feedbackDetails.status
    );
  }, [feedbackDetails, feedbackContact, feedbackDescription, feedbackResolution, feedbackStatus, feedbackTitle]);

  const totalUsers = users.length;
  const totalAdmins = useMemo(() => users.filter((u) => u.is_admin).length, [users]);
  const totalProjects = projects.length;
  const orphanProjects = useMemo(() => projects.filter((p) => !p.owner_id).length, [projects]);
  const totalCollaborators = useMemo(() => projects.reduce((sum, p) => sum + p.collaborator_count, 0), [projects]);
  const totalFeedback = feedback.length;
  const totalProblems = useMemo(() => feedback.filter((i) => i.type === 'problem').length, [feedback]);
  const totalSuggestions = useMemo(() => feedback.filter((i) => i.type === 'suggestion').length, [feedback]);
  const feedbackStatusCounts = useMemo(
    () =>
      feedback.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { new: 0, in_progress: 0, resolved: 0, archived: 0 } as Record<AdminFeedbackStatus, number>,
      ),
    [feedback],
  );
  const avgProjectsPerOwner = totalUsers > 0 ? (totalProjects / totalUsers).toFixed(1) : '0';
  const avgCollaboratorsPerProject = totalProjects > 0 ? (totalCollaborators / totalProjects).toFixed(1) : '0';

  return {
    users, setUsers,
    projects, setProjects,
    feedback, setFeedback,
    emailConfig, setEmailConfig,
    promptPresets, setPromptPresets,
    integrations, setIntegrations,
    workflowSettings, setWorkflowSettings,

    usersLoading, projectsLoading, feedbackLoading, emailLoading,
    promptsLoading, integrationsLoading, workflowSettingsLoading,
    setPromptsError,

    usersError, projectsError, feedbackError, emailError,
    promptsError, integrationsError, workflowSettingsError,

    banner, setBanner,
    activeTab, setActiveTab,

    userSearch, setUserSearch,
    projectSearch, setProjectSearch,
    feedbackSearch, setFeedbackSearch,
    promptSearch, setPromptSearch,

    refreshing, setRefreshing,

    processingUserId, setProcessingUserId,
    selectedUser, setSelectedUser,
    editForm, setEditForm,
    editSubmitting, setEditSubmitting,

    selectedProject, setSelectedProject,
    selectedOwnerUserId, setSelectedOwnerUserId,
    changeOwnerSubmitting, setChangeOwnerSubmitting,

    emailForm, setEmailForm,
    emailSubmitting, setEmailSubmitting,
    emailTesting, setEmailTesting,
    emailTestBanner, setEmailTestBanner,

    selectedFeedbackId, setSelectedFeedbackId,
    feedbackDetails, setFeedbackDetails,
    feedbackDetailsLoading, setFeedbackDetailsLoading,
    feedbackModalOpen, setFeedbackModalOpen,
    feedbackForm, setFeedbackForm,
    feedbackSaving, setFeedbackSaving,
    feedbackDeleting, setFeedbackDeleting,
    feedbackModalError, setFeedbackModalError,
    feedbackDirty,

    promptCategoryFilter, setPromptCategoryFilter,
    promptModalOpen, setPromptModalOpen,
    promptSubmitting, setPromptSubmitting,
    editingPrompt, setEditingPrompt,
    promptForm, setPromptForm,
    promptExporting, setPromptExporting,
    promptImporting, setPromptImporting,
    promptImportMode, setPromptImportMode,
    importFileInputRef,

    selectedIntegration, setSelectedIntegration,
    integrationForm, setIntegrationForm,
    integrationSubmitting, setIntegrationSubmitting,
    integrationFilter, setIntegrationFilter,

    workflowSettingsSaving, setWorkflowSettingsSaving,
    workflowSettingsSuccess, setWorkflowSettingsSuccess,

    filteredUsers, filteredProjects, filteredFeedback,
    totalUsers, totalAdmins, totalProjects, orphanProjects,
    totalCollaborators, totalFeedback, totalProblems, totalSuggestions,
    feedbackStatusCounts, avgProjectsPerOwner, avgCollaboratorsPerProject,
    providerMap,

    loadUsers, loadProjects, loadFeedback, loadEmailConfig,
    loadIntegrations, loadPrompts, loadWorkflowSettings,
    resolvePromptFilters,
  };
}

export type AdminStateResult = ReturnType<typeof useAdminState>;
