import type {
  AdminEmailConfig,
  AdminFeedbackDetails,
  AdminFeedbackStatus,
  AdminFeedbackSummary,
  AdminIntegration,
  AdminProjectSummary,
  AdminUserSummary,
  PromptPreset,
  PromptPresetCategory,
  UiSettings,
} from '../../state/api';

// --------------- Tab ---------------

export type AdminTab = 'users' | 'projects' | 'feedback' | 'settings' | 'prompts' | 'integrations' | 'workflow';

// --------------- Banner ---------------

export type BannerState = { type: 'success' | 'error'; message: string } | null;

// --------------- Forms ---------------

export interface PromptPresetFormState {
  category: PromptPresetCategory;
  label: string;
  description: string;
  content: string;
  tags: string;
  is_quick_access: boolean;
  sort_order: number;
}

export interface AdminIntegrationFormState {
  id?: string;
  userId: string;
  providerId: string;
  name: string;
  description: string;
  apiKey: string;
  apiKeyStored: boolean;
  apiKeyPreview: string | null;
  apiKeyModified: boolean;
  baseUrl: string;
  organization: string;
  webhookContract: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface UserEditFormState {
  email: string;
  name: string;
  is_admin: boolean;
  password: string;
}

export interface EmailFormState {
  gmailUser: string;
  gmailAppPassword: string;
  frontendUrl: string;
  googleClientId: string;
  googleClientSecret: string;
}

export interface FeedbackFormState {
  title: string;
  description: string;
  contact: string;
  resolution: string;
  status: AdminFeedbackStatus;
}

// --------------- Admin State (from hook) ---------------

export interface AdminState {
  // Data
  users: AdminUserSummary[];
  projects: AdminProjectSummary[];
  feedback: AdminFeedbackSummary[];
  emailConfig: AdminEmailConfig | null;
  promptPresets: PromptPreset[];
  integrations: AdminIntegration[];
  workflowSettings: UiSettings;

  // Loading
  usersLoading: boolean;
  projectsLoading: boolean;
  feedbackLoading: boolean;
  emailLoading: boolean;
  promptsLoading: boolean;
  integrationsLoading: boolean;
  workflowSettingsLoading: boolean;

  // Errors
  usersError: string | null;
  projectsError: string | null;
  feedbackError: string | null;
  emailError: string | null;
  promptsError: string | null;
  integrationsError: string | null;
  workflowSettingsError: string | null;

  // Banner
  banner: BannerState;
  setBanner: (banner: BannerState) => void;

  // Tab
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;

  // Search
  userSearch: string;
  setUserSearch: (value: string) => void;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  feedbackSearch: string;
  setFeedbackSearch: (value: string) => void;
  promptSearch: string;
  setPromptSearch: (value: string) => void;

  // Refreshing
  refreshing: boolean;

  // User management
  processingUserId: string | null;
  selectedUser: AdminUserSummary | null;
  setSelectedUser: (user: AdminUserSummary | null) => void;
  editForm: UserEditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<UserEditFormState>>;
  editSubmitting: boolean;

  // Project management
  selectedProject: AdminProjectSummary | null;
  setSelectedProject: (project: AdminProjectSummary | null) => void;
  selectedOwnerUserId: string;
  setSelectedOwnerUserId: (id: string) => void;
  changeOwnerSubmitting: boolean;

  // Email / Settings
  emailForm: EmailFormState;
  emailSubmitting: boolean;
  emailTesting: boolean;
  emailTestBanner: BannerState;

  // Feedback
  selectedFeedbackId: string | null;
  feedbackDetails: AdminFeedbackDetails | null;
  feedbackDetailsLoading: boolean;
  feedbackModalOpen: boolean;
  feedbackForm: FeedbackFormState;
  feedbackSaving: boolean;
  feedbackDeleting: boolean;
  feedbackModalError: string | null;
  feedbackDirty: boolean;

  // Prompts
  promptCategoryFilter: PromptPresetCategory | 'all';
  setPromptCategoryFilter: (filter: PromptPresetCategory | 'all') => void;
  promptModalOpen: boolean;
  promptSubmitting: boolean;
  editingPrompt: PromptPreset | null;
  promptForm: PromptPresetFormState;
  promptExporting: boolean;
  promptImporting: boolean;
  promptImportMode: 'append' | 'replace';
  setPromptImportMode: (mode: 'append' | 'replace') => void;
  importFileInputRef: React.RefObject<HTMLInputElement | null>;

  // Integrations
  selectedIntegration: AdminIntegration | null;
  integrationForm: AdminIntegrationFormState | null;
  integrationSubmitting: boolean;
  integrationFilter: { userId: string; providerId: string };

  // Workflow settings
  workflowSettingsSaving: boolean;
  workflowSettingsSuccess: string | null;

  // Computed
  filteredUsers: AdminUserSummary[];
  filteredProjects: AdminProjectSummary[];
  filteredFeedback: AdminFeedbackSummary[];
  totalUsers: number;
  totalAdmins: number;
  totalProjects: number;
  orphanProjects: number;
  totalCollaborators: number;
  totalFeedback: number;
  totalProblems: number;
  totalSuggestions: number;
  feedbackStatusCounts: Record<AdminFeedbackStatus, number>;
  avgProjectsPerOwner: string;
  avgCollaboratorsPerProject: string;
  providerMap: Map<string, { id: string; name: string; [key: string]: unknown }>;
}

// --------------- Admin Actions (from hook) ---------------

export interface AdminActions {
  // Global
  handleRefresh: () => Promise<void>;

  // Users
  handleToggleAdmin: (user: AdminUserSummary) => Promise<void>;
  handleOpenEdit: (user: AdminUserSummary) => void;
  closeEditModal: () => void;
  handleEditFieldChange: (field: 'email' | 'name' | 'is_admin' | 'password', value: string | boolean) => void;
  handleSaveEdit: () => Promise<void>;
  handleDeleteUser: (user: AdminUserSummary) => Promise<void>;

  // Projects
  closeChangeOwnerModal: () => void;
  handleChangeOwner: (newOwnerId: string) => Promise<void>;

  // Email / Settings
  handleEmailFieldChange: (
    field: 'gmailUser' | 'gmailAppPassword' | 'frontendUrl' | 'googleClientId' | 'googleClientSecret',
    value: string,
  ) => void;
  handleEmailSubmit: () => Promise<void>;
  handleEmailTest: () => Promise<void>;

  // Feedback
  openFeedbackModal: (entry: AdminFeedbackSummary) => Promise<void>;
  closeFeedbackModal: () => void;
  handleFeedbackFieldChange: (field: 'title' | 'description' | 'contact' | 'resolution', value: string) => void;
  handleFeedbackStatusChange: (status: AdminFeedbackStatus) => void;
  handleSaveFeedback: () => Promise<void>;
  handleDeleteFeedback: () => Promise<void>;

  // Prompts
  handleOpenCreatePrompt: () => void;
  handleOpenEditPrompt: (preset: PromptPreset) => void;
  handleClosePromptModal: () => void;
  handlePromptFieldChange: (field: keyof PromptPresetFormState, value: string | number | boolean) => void;
  handlePromptSubmit: () => Promise<void>;
  handlePromptDelete: (preset: PromptPreset) => Promise<void>;
  handleExportPrompts: () => Promise<void>;
  handleTriggerPromptImport: () => void;
  handlePromptFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

  // Integrations
  handleSelectIntegration: (integration: AdminIntegration) => void;
  handleNewIntegration: () => void;
  handleIntegrationFormChange: (field: keyof AdminIntegrationFormState, value: string | boolean) => void;
  handleSaveIntegration: () => Promise<void>;
  handleDeleteIntegration: (integration: AdminIntegration) => Promise<void>;
  handleRefreshIntegrations: () => void;
  handleCancelIntegrationEdit: () => void;

  // Workflow
  handleWorkflowMarkdownChange: (field: string, value: number | string) => void;
  handleWorkflowFontScalingChange: (field: string, value: unknown) => void;
  handleWorkflowSettingsSave: () => Promise<void>;
  handleWorkflowSettingsReset: () => void;
  setWorkflowSettings: React.Dispatch<React.SetStateAction<UiSettings>>;
}
