// collaboratorRepository.ts — Collaborator operations + admin project queries
import {
  db,
  createHttpError,
} from '../connection';
import type {
  ProjectRole,
  ProjectCollaborator,
  AdminProjectSummary,
  AdminProjectCollaborator,
} from '../types';

// ---- Collaborator operations -------------------------------------------------

export function getProjectRole(projectId: string, userId: string): ProjectRole | null {
  const ownerRow = db
    .prepare('SELECT user_id, is_public FROM projects WHERE project_id = ?')
    .get(projectId) as { user_id: string | null; is_public: number } | undefined;
  if (!ownerRow) {
    return null;
  }
  if (ownerRow.user_id && ownerRow.user_id === userId) {
    return 'owner';
  }
  // For ownerless public projects, fall back to viewer access only
  if (!ownerRow.user_id && ownerRow.is_public === 1) {
    return null;
  }
  // For ownerless private projects, keep legacy behaviour and allow edits
  if (!ownerRow.user_id && userId) {
    return 'owner';
  }

  const collaborator = db
    .prepare('SELECT role FROM project_collaborators WHERE project_id = ? AND user_id = ?')
    .get(projectId, userId) as { role: ProjectRole } | undefined;
  return collaborator?.role ?? null;
}

export function listProjectCollaborators(projectId: string): ProjectCollaborator[] {
  const rows = db
    .prepare(
      `SELECT pc.project_id, pc.user_id, pc.role, pc.added_at, u.email, u.name
       FROM project_collaborators pc
       LEFT JOIN users u ON u.user_id = pc.user_id
       WHERE pc.project_id = ?
       ORDER BY
         CASE pc.role WHEN 'editor' THEN 0 WHEN 'viewer' THEN 1 ELSE 2 END,
         LOWER(IFNULL(u.email, ''))`,
    )
    .all(projectId) as Array<{
      project_id: string;
      user_id: string;
      role: ProjectRole;
      added_at: string;
      email?: string;
      name?: string;
    }>;

  return rows.map((row) => ({
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role,
    email: row.email,
    name: row.name,
    added_at: row.added_at,
  }));
}

export function upsertProjectCollaborator(projectId: string, userId: string, role: ProjectRole): void {
  if (role === 'owner') {
    throw createHttpError(400, 'Use ownership transfer to assign an owner');
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO project_collaborators (project_id, user_id, role, created_at, updated_at, added_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, user_id)
     DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
  ).run(projectId, userId, role, now, now, now);
}

export function removeProjectCollaborator(projectId: string, userId: string): void {
  db.prepare('DELETE FROM project_collaborators WHERE project_id = ? AND user_id = ?').run(
    projectId,
    userId,
  );
}

export function getProjectOwnerId(projectId: string): string | null {
  const row = db
    .prepare('SELECT user_id FROM projects WHERE project_id = ?')
    .get(projectId) as { user_id: string | null } | undefined;
  return row?.user_id ?? null;
}

export function updateProjectOwner(projectId: string, newOwnerId: string): void {
  const row = db
    .prepare('SELECT user_id FROM projects WHERE project_id = ?')
    .get(projectId) as { user_id: string | null } | undefined;
  if (!row) {
    throw createHttpError(404, `Project ${projectId} not found`);
  }

  const ownerExists = db.prepare('SELECT 1 FROM users WHERE user_id = ?').get(newOwnerId);
  if (!ownerExists) {
    throw createHttpError(400, `User ${newOwnerId} not found`);
  }

  const previousOwner = row.user_id;
  if (previousOwner && previousOwner === newOwnerId) {
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE projects SET user_id = ?, updated_at = ? WHERE project_id = ?')
    .run(newOwnerId, now, projectId);

  if (result.changes === 0) {
    throw createHttpError(404, `Project ${projectId} not found`);
  }

  db.prepare('DELETE FROM project_collaborators WHERE project_id = ? AND user_id = ?').run(
    projectId,
    newOwnerId,
  );

  if (previousOwner && previousOwner !== newOwnerId) {
    upsertProjectCollaborator(projectId, previousOwner, 'viewer');
  }
}

// ---- Admin project queries ---------------------------------------------------

export function listAdminProjects(): AdminProjectSummary[] {
  const projects = db
    .prepare(
      `SELECT p.project_id, p.title, p.description, p.updated_at, p.user_id,
              u.email AS owner_email
       FROM projects p
       LEFT JOIN users u ON u.user_id = p.user_id
       ORDER BY datetime(p.updated_at) DESC`,
    )
    .all() as Array<{
      project_id: string;
      title: string;
      description: string | null;
      updated_at: string;
      user_id: string | null;
      owner_email: string | null;
    }>;

  const collaborators = db
    .prepare(
      `SELECT pc.project_id, pc.user_id, pc.role, pc.added_at,
              u.email, u.name
       FROM project_collaborators pc
       LEFT JOIN users u ON u.user_id = pc.user_id`,
    )
    .all() as Array<{
      project_id: string;
      user_id: string;
      role: ProjectRole;
      added_at: string | null;
      email: string | null;
      name: string | null;
    }>;

  const grouped = new Map<
    string,
    { editors: AdminProjectCollaborator[]; viewers: AdminProjectCollaborator[] }
  >();

  for (const entry of collaborators) {
    const bucket = grouped.get(entry.project_id) ?? { editors: [], viewers: [] };
    if (entry.role === 'editor') {
      bucket.editors.push({
        user_id: entry.user_id,
        email: entry.email,
        name: entry.name,
        role: entry.role,
        added_at: entry.added_at,
      });
    } else if (entry.role === 'viewer') {
      bucket.viewers.push({
        user_id: entry.user_id,
        email: entry.email,
        name: entry.name,
        role: entry.role,
        added_at: entry.added_at,
      });
    }
    grouped.set(entry.project_id, bucket);
  }

  return projects.map((project) => {
    const collab = grouped.get(project.project_id) ?? { editors: [], viewers: [] };
    return {
      project_id: project.project_id,
      title: project.title,
      description: project.description,
      owner_id: project.user_id,
      owner_email: project.owner_email,
      updated_at: project.updated_at,
      editors: collab.editors,
      viewers: collab.viewers,
      collaborator_count: collab.editors.length + collab.viewers.length,
    };
  });
}
