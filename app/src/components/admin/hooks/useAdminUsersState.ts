import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminUsers,
  fetchAdminProjects,
  fetchAdminFeedback,
  type AdminFeedbackDetails,
  type AdminFeedbackStatus,
  type AdminFeedbackSummary,
  type AdminProjectSummary,
  type AdminUserSummary,
} from '../../../state/api';
import { FEEDBACK_STATUS_LABELS } from '../constants';
import type {
  FeedbackFormState,
  UserEditFormState,
} from '../types';

export function useAdminUsersState() {
  // ---- Core data ----
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [projects, setProjects] = useState<AdminProjectSummary[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedbackSummary[]>([]);

  // ---- Loading ----
  const [usersLoading, setUsersLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // ---- Errors ----
  const [usersError, setUsersError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // ---- Search ----
  const [userSearch, setUserSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [feedbackSearch, setFeedbackSearch] = useState('');

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

  // ---- Effects ----
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

    usersLoading, projectsLoading, feedbackLoading,
    usersError, projectsError, feedbackError,

    userSearch, setUserSearch,
    projectSearch, setProjectSearch,
    feedbackSearch, setFeedbackSearch,

    processingUserId, setProcessingUserId,
    selectedUser, setSelectedUser,
    editForm, setEditForm,
    editSubmitting, setEditSubmitting,

    selectedProject, setSelectedProject,
    selectedOwnerUserId, setSelectedOwnerUserId,
    changeOwnerSubmitting, setChangeOwnerSubmitting,

    selectedFeedbackId, setSelectedFeedbackId,
    feedbackDetails, setFeedbackDetails,
    feedbackDetailsLoading, setFeedbackDetailsLoading,
    feedbackModalOpen, setFeedbackModalOpen,
    feedbackForm, setFeedbackForm,
    feedbackSaving, setFeedbackSaving,
    feedbackDeleting, setFeedbackDeleting,
    feedbackModalError, setFeedbackModalError,
    feedbackDirty,

    filteredUsers, filteredProjects, filteredFeedback,
    totalUsers, totalAdmins, totalProjects, orphanProjects,
    totalCollaborators, totalFeedback, totalProblems, totalSuggestions,
    feedbackStatusCounts, avgProjectsPerOwner, avgCollaboratorsPerProject,

    loadUsers, loadProjects, loadFeedback,
  };
}
