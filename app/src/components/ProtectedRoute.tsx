import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-100">Loading...</div>
      </div>
    );
  }

  if (!user) {
    // Save current path to redirect there after login
    localStorage.setItem('loginReturnTo', location.pathname + location.search + location.hash);
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !user.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-200">
        <div className="rounded bg-slate-800 px-6 py-4 text-center shadow">
          <h1 className="text-xl font-semibold">Insufficient permissions</h1>
          <p className="mt-2 text-sm text-slate-400">You do not have access to this section.</p>
          <a href="/" className="mt-4 inline-block rounded bg-slate-700 px-4 py-1 text-sm text-white hover:bg-slate-600">
            Back to projects
          </a>
        </div>
      </div>
    );
  }

  // If user exists and all checks passed, clear loginReturnTo and show content
  localStorage.removeItem('loginReturnTo');
  return <>{children}</>;
};

export default ProtectedRoute;
