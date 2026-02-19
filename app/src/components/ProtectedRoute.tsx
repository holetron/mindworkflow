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
        <div className="text-slate-100">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    // Сохраняем текущий путь чтобы редиректить туда после логина
    localStorage.setItem('loginReturnTo', location.pathname + location.search + location.hash);
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !user.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-200">
        <div className="rounded bg-slate-800 px-6 py-4 text-center shadow">
          <h1 className="text-xl font-semibold">Недостаточно прав</h1>
          <p className="mt-2 text-sm text-slate-400">У вас нет доступа к этому разделу.</p>
          <a href="/" className="mt-4 inline-block rounded bg-slate-700 px-4 py-1 text-sm text-white hover:bg-slate-600">
            Вернуться к проектам
          </a>
        </div>
      </div>
    );
  }

  // Если user существует и прошли все проверки, очищаем loginReturnTo и показываем контент
  localStorage.removeItem('loginReturnTo');
  return <>{children}</>;
};

export default ProtectedRoute;
