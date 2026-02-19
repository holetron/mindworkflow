import { useCallback } from 'react';
import { updateGlobalUiSettings } from '../../../state/api';
import { DEFAULT_UI_SETTINGS } from '../../../constants/uiSettings';
import type { AdminStateResult } from './useAdminState';

export function useWorkflowActions(s: AdminStateResult) {
  const handleWorkflowMarkdownChange = useCallback(
    (field: string, value: number | string) => {
      s.setWorkflowSettings((prev) => ({
        ...prev,
        markdownPreview: {
          ...prev.markdownPreview,
          [field]: value,
        },
      }));
    },
    [s.setWorkflowSettings],
  );

  const handleWorkflowFontScalingChange = useCallback(
    (field: string, value: unknown) => {
      s.setWorkflowSettings((prev) => ({
        ...prev,
        textNodeFontScaling: {
          ...prev.textNodeFontScaling,
          [field]: value,
        },
      }));
    },
    [s.setWorkflowSettings],
  );

  const handleWorkflowSettingsSave = useCallback(async () => {
    try {
      s.setWorkflowSettingsSaving(true);
      s.setWorkflowSettingsSuccess(null);
      await updateGlobalUiSettings(s.workflowSettings);
      s.setWorkflowSettingsSuccess('Global settings saved');
      setTimeout(() => s.setWorkflowSettingsSuccess(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setWorkflowSettings((prev) => prev); // no-op to keep state
      // Set error through the state's workflow error
    } finally {
      s.setWorkflowSettingsSaving(false);
    }
  }, [s.workflowSettings, s.setWorkflowSettingsSaving, s.setWorkflowSettingsSuccess, s.setWorkflowSettings]);

  const handleWorkflowSettingsReset = useCallback(() => {
    s.setWorkflowSettings(DEFAULT_UI_SETTINGS);
  }, [s.setWorkflowSettings]);

  return {
    handleWorkflowMarkdownChange,
    handleWorkflowFontScalingChange,
    handleWorkflowSettingsSave,
    handleWorkflowSettingsReset,
    setWorkflowSettings: s.setWorkflowSettings,
  };
}
