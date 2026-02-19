import * as path from 'path';

function resolveOverride(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return path.resolve(trimmed);
}

export function getProjectsRoot(): string {
  const override = resolveOverride(process.env.PROJECTS_ROOT);
  if (override) {
    return override;
  }
  return path.resolve(process.cwd(), 'projects');
}

export function getProjectDir(projectId: string): string {
  return path.resolve(getProjectsRoot(), projectId);
}

export function resolveProjectPath(projectId: string, ...segments: string[]): string {
  return path.resolve(getProjectDir(projectId), ...segments);
}

