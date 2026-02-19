import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt?: (momentListener?: (notification: GooglePromptNotification) => void) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

type GoogleIdConfiguration = {
  client_id: string;
  callback: (response: { credential?: string }) => void;
  ux_mode?: 'popup' | 'redirect';
  auto_select?: boolean;
};

type GooglePromptNotification = {
  isNotDisplayed: () => boolean;
  getNotDisplayedReason: () => string;
  isSkippedMoment: () => boolean;
  getSkippedReason: () => string;
};

type AuthMode = 'login' | 'register';

const NODE_COLORS = ['#6366f1', '#38bdf8', '#22d3ee', '#f97316', '#22c55e', '#f43f5e', '#a855f7'];

type GraphPoint = {
  id: number;
  x: number;
  y: number;
  color: string;
  links: number[];
};

const randomColor = () => NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const LoginBackground: React.FC = () => {
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [size, setSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));

  const pointsRef = useRef<GraphPoint[]>([]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const regeneratePoints = useCallback(
    (width: number, height: number) => {
      if (!width || !height) return;
      const margin = Math.min(width, height) * 0.08;
      const count = Math.max(8, Math.min(18, Math.round(width / 150)));
      const base = Array.from({ length: count }, (_, index) => ({
        id: index,
        x: margin + Math.random() * (width - margin * 2),
        y: margin + Math.random() * (height - margin * 2),
        color: randomColor(),
      }));

      const adjacency = base.map(() => new Set<number>());
      base.forEach((point, index) => {
        const neighbours = base
          .filter((_, i) => i !== index)
          .map((other) => ({
            id: other.id,
            distance: Math.hypot(point.x - other.x, point.y - other.y),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, Math.min(3, base.length - 1));

        neighbours.forEach((entry) => {
          adjacency[index].add(entry.id);
          adjacency[entry.id].add(index);
        });
      });

      const pointsWithLinks: GraphPoint[] = base.map((point, index) => ({
        ...point,
        links: Array.from(adjacency[index]),
      }));
      setPoints(pointsWithLinks);
    },
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    regeneratePoints(size.width, size.height);
  }, [regeneratePoints, size.height, size.width]);

  const dragRef = useRef<{ id: number; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const handlePointClick = useCallback((id: number) => {
    setPoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, color: randomColor() } : point)),
    );
  }, []);

  const handlePointerDown = useCallback((id: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    const point = pointsRef.current.find((candidate) => candidate.id === id);
    if (!point) return;
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - point.x,
      offsetY: event.clientY - point.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }
      const { id, offsetX, offsetY } = dragRef.current;
      const nextX = clamp(event.clientX - offsetX, 0, size.width);
      const nextY = clamp(event.clientY - offsetY, 0, size.height);
      setPoints((prev) =>
        prev.map((point) =>
          point.id === id
            ? {
                ...point,
                x: nextX,
                y: nextY,
              }
            : point,
        ),
      );
    },
    [size.height, size.width],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ from: GraphPoint; to: GraphPoint }> = [];
    points.forEach((point) => {
      point.links.forEach((targetId) => {
        const key = point.id < targetId ? `${point.id}-${targetId}` : `${targetId}-${point.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const target = points.find((candidate) => candidate.id === targetId);
          if (target) {
            list.push({ from: point, to: target });
          }
        }
      });
    });
    return list;
  }, [points]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-b from-slate-900 to-blue-950">
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] bg-[size:26px_26px] opacity-60" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {edges.map((edge) => (
          <line
            key={`${edge.from.id}-${edge.to.id}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={edge.from.color}
            strokeWidth={2}
            strokeOpacity={0.4}
            strokeLinecap="round"
          />
        ))}
        {points.map((point) => (
          <g key={point.id} className="cursor-pointer" onClick={() => handlePointClick(point.id)}>
            <circle
              cx={point.x}
              cy={point.y}
              r={11}
              fill="#0f172a"
              stroke={point.color}
              strokeWidth={2}
              onPointerDown={handlePointerDown(point.id)}
            />
            <circle cx={point.x} cy={point.y} r={6} fill={point.color} />
          </g>
        ))}
      </svg>
    </div>
  );
};

const Login: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [showResetPrompt, setShowResetPrompt] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const { login, register, loginWithGoogle, user } = useAuth();

  const isRegisterMode = mode === 'register';

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    fetch('/api/auth/google/config', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to load Google configuration' }));
          throw new Error(data.error || 'Failed to load Google configuration');
        }
        return res.json();
      })
      .then((data: { clientId?: string | null }) => {
        if (!ignore && data?.clientId) {
          setGoogleClientId(data.clientId);
        }
      })
      .catch((err) => {
        if (!ignore) setGoogleError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

  const handleGoogleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) {
        setGoogleError('Failed to get Google token');
        setGoogleLoading(false);
        return;
      }
      setGoogleError(null);
      setGoogleLoading(true);
      try {
        await loginWithGoogle(response.credential);
        const returnTo = localStorage.getItem('loginReturnTo') || '/';
        localStorage.removeItem('loginReturnTo');
        navigate(returnTo);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to sign in with Google';
        setGoogleError(message);
      } finally {
        setGoogleLoading(false);
      }
    },
    [loginWithGoogle, navigate],
  );

  const renderGoogleButton = useCallback(() => {
    if (!window.google?.accounts?.id || !googleButtonRef.current) {
      return;
    }
    googleButtonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'center',
      width: 320,
    });
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    const initialize = () => {
      if (!window.google?.accounts?.id) {
        setGoogleError('Google Identity Services unavailable');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        ux_mode: 'popup',
        auto_select: false,
      } satisfies GoogleIdConfiguration);
      window.google.accounts.id.disableAutoSelect?.();
      renderGoogleButton();
    };
    if (window.google?.accounts?.id) {
      initialize();
      return;
    }
    const scriptId = 'google-identity-service';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script?.setAttribute('data-loaded', 'true');
        initialize();
      };
      script.onerror = () => setGoogleError('Failed to load Google Identity Services');
      document.body.appendChild(script);
    } else if (script && script.getAttribute('data-loaded') === 'true') {
      initialize();
    } else if (script) {
      const onLoad = () => {
        script?.setAttribute('data-loaded', 'true');
        script?.removeEventListener('load', onLoad);
        initialize();
      };
      script.addEventListener('load', onLoad);
    }
  }, [googleClientId, handleGoogleCredential, renderGoogleButton]);

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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <LoginBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
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
      </div>
    </div>
  );
};

export default Login;
