import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '../state/api';

function NewProjectPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await createProject({
        title: title.trim(),
        description: description.trim(),
        project_id: projectId.trim() ? sanitizeProjectId(projectId) : undefined,
      });
      navigate(`/projects/${result.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow">
        <button
          type="button"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-primary"
          onClick={() => navigate('/')}
        >
          ← Back to projects
        </button>
        <h1 className="text-2xl font-semibold">Create a New Project</h1>
        <p className="mt-1 text-sm text-slate-400">
          We will prepare an empty workspace with a starter brief node and create a mirrored folder in Drive.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-200" htmlFor="project-title">
              Project title
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!projectId) {
                  setProjectId(sanitizeProjectId(event.target.value));
                }
              }}
              placeholder="Snack launch campaign"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              disabled={loading}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200" htmlFor="project-id">
              Project ID (optional)
            </label>
            <input
              id="project-id"
              type="text"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              onBlur={() => projectId && setProjectId(sanitizeProjectId(projectId))}
              placeholder="project-2025-launch"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-slate-500">
              Lowercase letters, numbers, dash or underscore. Leave blank to auto-generate.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200" htmlFor="project-description">
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Short summary for teammates"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              disabled={loading}
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create project'}
            </button>
            <button
              type="button"
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-primary/60 hover:text-primary"
              onClick={() => navigate('/')}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function sanitizeProjectId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `project-${Date.now()}`;
}

export default NewProjectPage;
