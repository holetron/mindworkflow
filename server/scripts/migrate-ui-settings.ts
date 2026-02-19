import { db, getProjectSettings } from '../src/db';
import { getUiSettings, updateUiSettings, type UiSettings } from '../src/services/uiSettings';

function isUiSettingsCandidate(value: unknown): value is UiSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.markdownPreview !== undefined && candidate.textNodeFontScaling !== undefined;
}

function main(): void {
  const globalSettings = getUiSettings({ scope: 'global' });
  const rows = db
    .prepare('SELECT project_id FROM projects')
    .all() as Array<{ project_id: string }>;

  if (rows.length === 0) {
    console.log('[migrate-ui-settings] No projects found, nothing to migrate.');
    return;
  }

  let copiedLegacy = 0;
  let syncedGlobal = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    const projectId = row.project_id;
    const settings = getProjectSettings(projectId);
    const workflowExisting = settings?.['workflowSettings'];
    if (workflowExisting && typeof workflowExisting === 'object') {
      skippedExisting += 1;
      continue;
    }

    const legacyCandidate =
      settings?.['uiSettings'] ?? settings?.['workflow_settings'] ?? null;

    if (isUiSettingsCandidate(legacyCandidate)) {
      updateUiSettings(legacyCandidate, { scope: 'workflow', projectId });
      copiedLegacy += 1;
      continue;
    }

    updateUiSettings(globalSettings, { scope: 'workflow', projectId });
    syncedGlobal += 1;
  }

  console.log(
    `[migrate-ui-settings] Completed. copiedLegacy=${copiedLegacy} syncedGlobal=${syncedGlobal} skippedExisting=${skippedExisting}`,
  );
}

main();
