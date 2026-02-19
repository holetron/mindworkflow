import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  user_id: string;
  email: string;
  name: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (token: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    
    // In development, auto-get dev token if not logged in
    const isDev = (import.meta as any).env?.MODE === 'development';
    if (!token && isDev) {
      fetch('/api/auth/dev-token')
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            localStorage.setItem('authToken', data.token);
            setUser(data.user);
            setLoading(false);
          }
        })
        .catch(() => {
          setLoading(false);
        });
    } else if (token) {
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            setUser(data.user);
          }
        })
        .catch(() => {
          localStorage.removeItem('authToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(errorData.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('authToken', data.token);
    setUser(data.user);
  };

  const register = async (email: string, name: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(errorData.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('authToken', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const loginWithGoogle = async (token: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Google login failed' }));
      throw new Error(errorData.error || 'Google login failed');
    }
    const data = await res.json();
    localStorage.setItem('authToken', data.token);
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
