import { useMemo } from 'react';
import type {
  AdminFeedbackStatus,
  AdminFeedbackSummary,
  AdminProjectSummary,
  AdminUserSummary,
} from '../../../state/api';
import { PROVIDERS } from '../../../data/providers';
import { FEEDBACK_STATUS_LABELS } from '../constants';

export function useAdminComputed(
  users: AdminUserSummary[],
  projects: AdminProjectSummary[],
  feedback: AdminFeedbackSummary[],
  userSearch: string,
  projectSearch: string,
  feedbackSearch: string,
) {
  const providerMap = useMemo(
    () => new Map(PROVIDERS.map((provider) => [provider.id, provider])),
    [],
  );

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
    providerMap,
    filteredUsers,
    filteredProjects,
    filteredFeedback,
    totalUsers,
    totalAdmins,
    totalProjects,
    orphanProjects,
    totalCollaborators,
    totalFeedback,
    totalProblems,
    totalSuggestions,
    feedbackStatusCounts,
    avgProjectsPerOwner,
    avgCollaboratorsPerProject,
  };
}
