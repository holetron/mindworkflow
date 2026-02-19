import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { GoogleIdConfiguration } from './loginTypes';

export function useGoogleAuth() {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();

  // Fetch Google client config
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

  // Initialize Google Identity Services
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

  return {
    googleClientId,
    googleError,
    googleLoading,
    googleButtonRef,
  };
}
