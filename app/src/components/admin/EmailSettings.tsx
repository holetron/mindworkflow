import { Loader2 } from 'lucide-react';
import type { AdminEmailConfig } from '../../state/api';
import type { BannerState, EmailFormState } from './types';

interface EmailSettingsProps {
  emailError: string | null;
  emailLoading: boolean;
  emailConfig: AdminEmailConfig | null;
  emailForm: EmailFormState;
  emailSubmitting: boolean;
  emailTesting: boolean;
  emailTestBanner: BannerState;
  onEmailFieldChange: (
    field: 'gmailUser' | 'gmailAppPassword' | 'frontendUrl' | 'googleClientId' | 'googleClientSecret',
    value: string,
  ) => void;
  onEmailSubmit: () => Promise<void>;
  onEmailTest: () => Promise<void>;
}

export function EmailSettings({
  emailError,
  emailLoading,
  emailConfig,
  emailForm,
  emailSubmitting,
  emailTesting,
  emailTestBanner,
  onEmailFieldChange,
  onEmailSubmit,
  onEmailTest,
}: EmailSettingsProps) {
  return (
    <section className="space-y-4">
      {emailError && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          Failed to load settings: {emailError}
        </div>
      )}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-white">Mail and Google OAuth</h2>
          <p className="mt-1 text-sm text-slate-400">
            Used for sending emails and Google sign-in.
          </p>
        </header>
        {emailLoading && !emailConfig ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading current values...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Gmail sender</label>
                <input
                  type="email"
                  value={emailForm.gmailUser}
                  onChange={(event) => onEmailFieldChange('gmailUser', event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={emailLoading || emailSubmitting}
                  placeholder="no-reply@mindworkflow.com"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">App Password</label>
                <input
                  type="password"
                  value={emailForm.gmailAppPassword}
                  onChange={(event) => onEmailFieldChange('gmailAppPassword', event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={emailLoading || emailSubmitting}
                  placeholder="Enter new app password"
                />
                <p className="mt-1 text-xs text-slate-500">16 characters without spaces. Leave empty to keep current.</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Frontend URL</label>
                <input
                  type="url"
                  value={emailForm.frontendUrl}
                  onChange={(event) => onEmailFieldChange('frontendUrl', event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={emailLoading || emailSubmitting}
                  placeholder="https://mindworkflow.com"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Google Client ID</label>
                <input
                  type="text"
                  value={emailForm.googleClientId}
                  onChange={(event) => onEmailFieldChange('googleClientId', event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={emailLoading || emailSubmitting}
                  placeholder="your-client-id.apps.googleusercontent.com"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Google Client Secret</label>
                <input
                  type="text"
                  value={emailForm.googleClientSecret}
                  onChange={(event) => onEmailFieldChange('googleClientSecret', event.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  disabled={emailLoading || emailSubmitting}
                  placeholder="Enter only when updating the secret"
                />
              </div>
            </div>
            {emailConfig && (
              <div className="rounded border border-slate-800/60 bg-slate-950/40 p-3 text-xs text-slate-400">
                <div>
                  Status SMTP:{' '}
                  <span className={emailConfig.gmailConfigured ? 'text-emerald-300' : 'text-rose-300'}>
                    {emailConfig.gmailConfigured ? 'active' : 'not configured'}
                  </span>
                </div>
                <div className="mt-1">
                  Google OAuth:{' '}
                  <span className={emailConfig.googleClientConfigured ? 'text-emerald-300' : 'text-rose-300'}>
                    {emailConfig.googleClientConfigured ? 'configured' : 'not configured'}
                  </span>
                </div>
                {emailConfig.googleClientId && (
                  <div className="mt-1 break-all text-slate-500">Client ID: {emailConfig.googleClientId}</div>
                )}
              </div>
            )}
            {emailTestBanner && (
              <div
                className={`rounded border px-4 py-2 text-sm ${
                  emailTestBanner.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                }`}
              >
                {emailTestBanner.message}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onEmailTest}
                disabled={emailTesting || emailSubmitting || emailLoading}
                className="rounded-full border border-primary px-4 py-1 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {emailTesting ? 'Checking...' : 'Test SMTP'}
              </button>
              <button
                type="button"
                onClick={onEmailSubmit}
                disabled={emailSubmitting || emailLoading}
                className="rounded-full bg-primary px-4 py-1 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {emailSubmitting ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
