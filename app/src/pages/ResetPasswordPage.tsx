import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const token = useMemo(() => {
    const raw = searchParams.get('token');
    return raw ? raw.trim() : '';
  }, [searchParams]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('Recovery token missing. Please request a new link.');
      return;
    }
    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to update password' }));
        throw new Error(data.error || 'Failed to update password');
      }
      setInfo('Password updated. You can now log in with your new credentials.');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const tokenMissing = !token;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-2xl bg-slate-900/70 p-8 shadow-xl backdrop-blur">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-primary">Password Recovery</h1>
          <p className="text-sm text-slate-400">
            {tokenMissing
              ? 'The link is expired or invalid. Please request recovery again.'
              : 'Create a new password for your account.'}
          </p>
        </div>

        {tokenMissing ? (
          <div className="space-y-4 text-sm text-slate-300">
            <p>
              Go back to{' '}
              <Link to="/login" className="text-primary underline transition hover:text-primary/80">
                login page
              </Link>{' '}
              and request a new password recovery link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-slate-300">
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Confirm password"
              />
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            {info && (
              <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Reset password'}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-slate-500">
          <Link to="/login" className="text-primary hover:text-primary/80">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
