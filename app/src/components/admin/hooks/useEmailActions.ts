import { useCallback } from 'react';
import {
  testAdminEmailConfig,
  updateAdminEmailConfig,
  type AdminEmailConfigPayload,
} from '../../../state/api';
import type { AdminStateResult } from './useAdminState';

export function useEmailActions(s: AdminStateResult) {
  const handleEmailFieldChange = useCallback(
    (field: 'gmailUser' | 'gmailAppPassword' | 'frontendUrl' | 'googleClientId' | 'googleClientSecret', value: string) => {
      s.setEmailForm((prev) => ({ ...prev, [field]: value }));
    },
    [s.setEmailForm],
  );

  const handleEmailSubmit = useCallback(async () => {
    const payload: AdminEmailConfigPayload = {
      gmailUser: s.emailForm.gmailUser.trim() || undefined,
      frontendUrl: s.emailForm.frontendUrl.trim() || undefined,
      googleClientId: s.emailForm.googleClientId.trim() || undefined,
      googleClientSecret: s.emailForm.googleClientSecret.trim() || undefined,
    };
    const trimmedPassword = s.emailForm.gmailAppPassword.replace(/\s+/g, '').trim();
    if (trimmedPassword) {
      payload.gmailAppPassword = trimmedPassword;
    }
    if (!payload.gmailUser) {
      s.setBanner({ type: 'error', message: 'Specify Gmail sender' });
      return;
    }
    s.setEmailTestBanner(null);
    s.setEmailSubmitting(true);
    try {
      const updated = await updateAdminEmailConfig(payload);
      s.setEmailConfig(updated);
      s.setEmailForm((prev) => ({
        ...prev,
        gmailUser: updated.gmailUser,
        frontendUrl: updated.frontendUrl,
        googleClientId: updated.googleClientId ?? '',
        gmailAppPassword: '',
        googleClientSecret: '',
      }));
      s.setBanner({ type: 'success', message: 'Email / OAuth settings updated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setBanner({ type: 'error', message });
    } finally {
      s.setEmailSubmitting(false);
    }
  }, [s.emailForm, s.setBanner, s.setEmailTestBanner, s.setEmailSubmitting, s.setEmailConfig, s.setEmailForm]);

  const handleEmailTest = useCallback(async () => {
    if (s.emailTesting) return;
    s.setEmailTestBanner(null);
    s.setEmailTesting(true);
    try {
      await testAdminEmailConfig();
      s.setEmailTestBanner({ type: 'success', message: 'SMTP connection confirmed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      s.setEmailTestBanner({ type: 'error', message });
    } finally {
      s.setEmailTesting(false);
    }
  }, [s.emailTesting, s.setEmailTestBanner, s.setEmailTesting]);

  return {
    handleEmailFieldChange,
    handleEmailSubmit,
    handleEmailTest,
  };
}
