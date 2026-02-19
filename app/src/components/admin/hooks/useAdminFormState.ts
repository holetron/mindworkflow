import { useRef, useState } from 'react';
import type {
  AdminFeedbackDetails,
  AdminIntegration,
  PromptPreset,
  PromptPresetCategory,
} from '../../../state/api';
import type {
  AdminIntegrationFormState,
  AdminTab,
  BannerState,
  FeedbackFormState,
  PromptPresetFormState,
  UserEditFormState,
} from '../types';

export function useAdminFormState() {
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
  const [selectedUser, setSelectedUser] = useState<import('../../../state/api').AdminUserSummary | null>(null);
  const [editForm, setEditForm] = useState<UserEditFormState>({
    email: '',
    name: '',
    is_admin: false,
    password: '',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ---- Project management ----
  const [selectedProject, setSelectedProject] = useState<import('../../../state/api').AdminProjectSummary | null>(null);
  const [selectedOwnerUserId, setSelectedOwnerUserId] = useState<string>('');
  const [changeOwnerSubmitting, setChangeOwnerSubmitting] = useState(false);

  // ---- Email / Settings ----
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

  // ---- Workflow settings ----
  const [workflowSettingsSaving, setWorkflowSettingsSaving] = useState(false);
  const [workflowSettingsSuccess, setWorkflowSettingsSuccess] = useState<string | null>(null);

  return {
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

    workflowSettingsSaving, setWorkflowSettingsSaving,
    workflowSettingsSuccess, setWorkflowSettingsSuccess,
  };
}
