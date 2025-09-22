import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importProjectArchive } from '../state/api';

function ImportProjectPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Select an .lcfz archive to import');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const projectId = await importProjectArchive(file);
      navigate(`/projects/${projectId}`);
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
        <h1 className="text-2xl font-semibold">Import Project</h1>
        <p className="mt-1 text-sm text-slate-400">
          Upload a .lcfz archive exported from another workspace. Assets will be mirrored to your shared Drive root.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-200" htmlFor="project-archive">
              Project archive (.lcfz)
            </label>
            <input
              id="project-archive"
              type="file"
              accept=".lcfz,.zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={loading}
              className="mt-1 w-full text-sm text-slate-300"
            />
            <p className="mt-1 text-xs text-slate-500">Max 200 MB. Contains project JSON and asset folders.</p>
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Importing…' : 'Import project'}
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

export default ImportProjectPage;
