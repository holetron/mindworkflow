import type { AdminStateResult } from './useAdminState';
import { useEmailActions } from './useEmailActions';
import { usePromptActions } from './usePromptActions';
import { useIntegrationActions } from './useIntegrationActions';
import { useWorkflowActions } from './useWorkflowActions';

export function useAdminSystemActions(s: AdminStateResult) {
  const emailActions = useEmailActions(s);
  const promptActions = usePromptActions(s);
  const integrationActions = useIntegrationActions(s);
  const workflowActions = useWorkflowActions(s);

  return {
    ...emailActions,
    ...promptActions,
    ...integrationActions,
    ...workflowActions,
  };
}
