import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthMode } from './loginTypes';
import { useGoogleAuth } from './useGoogleAuth';

const LoginForm: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [showResetPrompt, setShowResetPrompt] = useState(false);

  const navigate = useNavigate();
  const { login, register, user } = useAuth();
  const { googleClientId, googleError, googleLoading, googleButtonRef } = useGoogleAuth();

  const isRegisterMode = mode === 'register';

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const switchMode = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setInfo(null);
    setShowResetPrompt(false);
    setResetSubmitting(false);
    if (nextMode === 'register') setName('');
  }, []);

  const submitButtonLabel = useMemo(() => (isRegisterMode ? 'Sign Up' : 'Sign In'), [isRegisterMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const emailTrimmed = email.trim();
    try {
      if (isRegisterMode) {
        const nameTrimmed = name.trim();
        if (!nameTrimmed) throw new Error('Enter name');
        await register(emailTrimmed, nameTrimmed, password);
        navigate('/');
        return;
      }
      await login(emailTrimmed, password);
      const returnTo = localStorage.getItem('loginReturnTo') || '/';
      localStorage.removeItem('loginReturnTo');
      navigate(returnTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      if (/incorrect/i.test(message)) setShowResetPrompt(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setError('Please enter your email first to send a recovery link.');
      return;
    }
    setResetSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/auth/password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send email' }));
        throw new Error(data.error || 'Failed to send email');
      }
      setInfo('If the account exists, we will send a password recovery link.');
      setShowResetPrompt(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while sending the email');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl rounded-3xl border border-white/5 bg-slate-900/80 p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-lg">
      <header className="mb-6 sm:mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-primary">MindWorkFlow</h1>
        <p className="mt-2 text-sm text-slate-400">
          {isRegisterMode ? 'Create a new team account' : 'Sign in to continue'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5 text-center">
        {isRegisterMode && (
          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 text-center"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full sm:w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Your name"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 text-center"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full sm:w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400 text-center"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            className="w-full sm:w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 text-center">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 text-center">
            {info}
          </div>
        )}

        {showResetPrompt && !isRegisterMode && (
          <div className="mx-auto flex w-full sm:w-80 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200 text-center">
            <span>Wrong password? We can send a recovery email.</span>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetSubmitting}
              className="inline-flex w-full items-center justify-center rounded-md border border-primary px-3 py-1 text-xs font-semibold text-white transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {resetSubmitting ? 'Sending...' : 'Recover password'}
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-80 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60"
        >
          {submitting ? 'Please wait...' : submitButtonLabel}
        </button>
      </form>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
          <span className="h-px w-10 bg-slate-700" />
          <span>Or</span>
          <span className="h-px w-10 bg-slate-700" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div ref={googleButtonRef} className="flex w-full max-w-full sm:max-w-[320px] justify-center" />
          {googleLoading && <div className="text-xs text-slate-400">Signing in with Google…</div>}
          {googleError && <div className="text-xs text-rose-300 text-center">{googleError}</div>}
          {!googleClientId && !googleError && (
            <div className="text-xs text-slate-500">Loading Google sign-in parameters…</div>
          )}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 text-sm text-slate-400">
        {isRegisterMode ? (
          <>
            <span className="text-slate-500">Already have an account?</span>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-sm font-medium text-slate-300 underline-offset-4 transition hover:text-primary hover:underline"
            >
              Sign In
            </button>
          </>
        ) : (
          <>
            <span className="text-slate-500">Not with us yet?</span>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className="mx-auto w-full sm:w-80 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              Create Account
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginForm;
