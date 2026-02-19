import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './ui/ErrorBoundary';
import ProjectDashboard from './pages/ProjectDashboard';
import WorkspacePage from './pages/WorkspacePage';
import NewProjectPage from './pages/NewProjectPage';
import ImportProjectPage from './pages/ImportProjectPage';
import Login from './pages/Login';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { AdminPage } from './pages/AdminPage';
import { WorkflowSettingsPage } from './pages/WorkflowSettingsPage';
import { AgentsPage } from './pages/AgentsPage';
import { SettingsPage } from './pages/SettingsPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ProjectDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/new"
            element={
              <ProtectedRoute>
                <NewProjectPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/import"
            element={
              <ProtectedRoute>
                <ImportProjectPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <ProtectedRoute>
                <AgentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/settings"
            element={
              <ProtectedRoute>
                <WorkflowSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/*"
            element={
              <ProtectedRoute>
                <WorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
