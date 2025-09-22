import { AI_CATEGORIES, getAiProfilesByCategory } from '../../data/aiCatalog';

function AiCatalogPanel() {
  const profilesByCategory = getAiProfilesByCategory();

  return (
    <div className="flex h-full flex-col gap-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-100">AI Catalog</h2>
        <p className="text-sm text-slate-400">Reference settings for text, image, and voice pipelines.</p>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto pr-2">
        {AI_CATEGORIES.map((category) => {
          const profiles = profilesByCategory[category.key];
          if (!profiles || profiles.length === 0) return null;
          return (
            <section key={category.key} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {category.label}
              </h3>
              <div className="space-y-3">
                {profiles.map((profile) => (
                  <article
                    key={profile.id}
                    className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-sm text-slate-200 shadow"
                  >
                    <header className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-slate-100">{profile.name}</h4>
                        <p className="text-xs text-slate-400">{profile.description}</p>
                      </div>
                      {profile.maxLength && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                          Max {profile.maxLength}
                        </span>
                      )}
                    </header>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Inputs</p>
                        <ul className="space-y-1 text-[13px] text-slate-200">
                          {profile.inputs.map((input) => (
                            <li key={input.name} className="rounded bg-slate-800/80 px-2 py-1">
                              <span className="font-medium text-slate-100">{input.name}</span>
                              <span className="block text-xs text-slate-400">{input.description}</span>
                              {input.requirement && (
                                <span className="block text-[11px] text-slate-500">{input.requirement}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Model Settings</p>
                        <ul className="space-y-1 text-[13px] text-slate-200">
                          {Object.entries(profile.settings).map(([key, value]) => (
                            <li key={key} className="flex justify-between gap-4 rounded bg-slate-800/80 px-2 py-1">
                              <span className="text-slate-400">{key}</span>
                              <span className="font-medium text-slate-100">{value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">User Prompt</p>
                        <blockquote className="rounded bg-slate-800/60 p-2 text-[13px] text-slate-200">
                          {profile.userPromptExample}
                        </blockquote>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">System Prompt</p>
                        <blockquote className="rounded bg-slate-800/60 p-2 text-[13px] text-slate-200">
                          {profile.systemPromptExample}
                        </blockquote>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default AiCatalogPanel;
