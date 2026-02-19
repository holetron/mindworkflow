import { useNavigate } from 'react-router-dom';

export function NewProjectCard() {
  const navigate = useNavigate();

  return (
    <article
      className="flex flex-col justify-between rounded-xl border border-dashed border-primary/60 bg-slate-900/40 p-4 text-sm text-primary shadow hover:border-primary hover:bg-slate-900/60"
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">New Project</h2>
        <p className="text-sm text-primary/70">
          Start from scratch or import a .lcfz archive. Google Drive will receive a mirrored folder automatically.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded bg-primary px-3 py-1 text-white"
          onClick={() => navigate('/projects/new')}
        >
          Create Blank
        </button>
        <button
          className="rounded border border-primary/60 bg-amber-200/10 px-3 py-1 text-primary hover:bg-primary/10 hover:text-white"
          onClick={() => navigate('/projects/import')}
        >
          Import Archive
        </button>
      </div>
    </article>
  );
}
