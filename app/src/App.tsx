import { Navigate, Route, Routes } from 'react-router-dom';
import ProjectDashboard from './pages/ProjectDashboard';
import WorkspacePage from './pages/WorkspacePage';
import NewProjectPage from './pages/NewProjectPage';
import ImportProjectPage from './pages/ImportProjectPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectDashboard />} />
      <Route path="/projects/new" element={<NewProjectPage />} />
      <Route path="/projects/import" element={<ImportProjectPage />} />
      <Route path="/projects/:projectId/*" element={<WorkspacePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
