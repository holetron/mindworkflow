import type { AdminStateResult } from './useAdminState';
import { useAdminUserActions } from './useAdminUserActions';
import { useAdminSystemActions } from './useAdminSystemActions';

export function useAdminActions(s: AdminStateResult) {
  const userActions = useAdminUserActions(s);
  const systemActions = useAdminSystemActions(s);

  return {
    ...userActions,
    ...systemActions,
  };
}

export type AdminActionsResult = ReturnType<typeof useAdminActions>;
