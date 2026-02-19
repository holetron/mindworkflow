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
  updateAdminFeedback,
  updateAdminIntegration,
  updateAdminPromptPreset,
  updateAdminUser,
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
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
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

export function useAdminUserActions(s: AdminStateResult) {
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
      s.setBanner({ type: 'success', message: 'Data updated successfully' });
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
          ? `User ${user.email} has been made administrator`
          : `Admin rights revoked from ${user.email}`,
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
        s.setBanner({ type: 'error', message: 'Password must contain at least 6 characters' });
        return;
      }
      payload.password = trimmedPassword;
    }
    if (!payload.email) {
      s.setBanner({ type: 'error', message: 'Email cannot be empty' });
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
          ? 'User profile and password updated'
          : 'User profile updated',
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
      `Delete user ${user.email}? Their projects and related data will be deleted permanently.`,
    );
    if (!confirmed) return;
    s.setProcessingUserId(user.user_id);
    try {
      await deleteAdminUser(user.user_id);
      s.setUsers((prev) => prev.filter((item) => item.user_id !== user.user_id));
      s.setSelectedUser((prev) => (prev && prev.user_id === user.user_id ? null : prev));
      s.setBanner({ type: 'success', message: `User ${user.email} deleted` });
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
      s.setBanner({ type: 'success', message: 'Project owner changed' });
      s.setSelectedOwnerUserId('');
      s.setSelectedProject(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setChangeOwnerSubmitting(false);
    }
  }, [s.selectedProject, s.setChangeOwnerSubmitting, s.setProjects, s.setBanner, s.setSelectedOwnerUserId, s.setSelectedProject]);

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
      s.setBanner({ type: 'error', message: 'Failed to determine feedback identifier' });
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
          ? 'Failed to load record.'
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
      s.setFeedbackModalError('No changes detected');
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
      s.setBanner({ type: 'success', message: 'Feedback updated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setFeedbackModalError(message);
    } finally {
      s.setFeedbackSaving(false);
    }
  }, [s.feedbackDetails, s.feedbackForm, s.selectedFeedbackId, s.setBanner, s.setFeedbackDetails, s.setFeedbackForm, s.setFeedback, s.setFeedbackSaving, s.setFeedbackModalError]);

  const handleDeleteFeedback = useCallback(async (): Promise<void> => {
    if (!s.selectedFeedbackId) return;
    const confirmed = window.confirm('Delete record? This action is irreversible.');
    if (!confirmed) return;
    s.setFeedbackDeleting(true);
    s.setFeedbackModalError(null);
    try {
      await deleteAdminFeedback(s.selectedFeedbackId);
      s.setFeedback((prev) => prev.filter((item) => item.feedback_id !== s.selectedFeedbackId));
      s.setBanner({ type: 'success', message: 'Feedback deleted' });
      closeFeedbackModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setFeedbackModalError(message);
    } finally {
      s.setFeedbackDeleting(false);
    }
  }, [s.selectedFeedbackId, closeFeedbackModal, s.setBanner, s.setFeedback, s.setFeedbackDeleting, s.setFeedbackModalError]);

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
    openFeedbackModal,
    closeFeedbackModal,
    handleFeedbackFieldChange,
    handleFeedbackStatusChange,
    handleSaveFeedback,
    handleDeleteFeedback,
  };
}
