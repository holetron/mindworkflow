import React from 'react';
import {
  Plus,
  Search,
  Star,
  ArrowLeft,
  Sparkles,
  Filter,
  Grid3x3,
  List,
  ChevronDown,
  Download,
  Upload,
} from 'lucide-react';
import type { AgentsState, AgentsActions } from './types';

interface AgentsHeaderProps {
  state: AgentsState;
  actions: AgentsActions;
  onNavigateHome: () => void;
}

export function AgentsHeader({ state, actions, onNavigateHome }: AgentsHeaderProps) {
  const {
    filteredPresets,
    searchQuery,
    setSearchQuery,
    filterMode,
    setFilterMode,
    selectedTag,
    setSelectedTag,
    tagDropdownOpen,
    setTagDropdownOpen,
    viewMode,
    setViewMode,
    presets,
    allTags,
    fileInputRef,
  } = state;

  const { handleCreateAgent, handleExportAll, handleImport } = actions;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Back button + Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={onNavigateHome}
              className="group flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft size={20} className="transition group-hover:-translate-x-1" />
              <span className="hidden sm:inline">{'\u041D\u0430\u0437\u0430\u0434'}</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white sm:text-xl">
                  {'\u041C\u043E\u0438 \u0430\u0433\u0435\u043D\u0442\u044B'}
                </h1>
                <p className="text-xs text-slate-400">
                  {filteredPresets.length} {filteredPresets.length === 1 ? '\u0430\u0433\u0435\u043D\u0442' : '\u0430\u0433\u0435\u043D\u0442\u043E\u0432'}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Import button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:border-slate-500"
              title={'\u0418\u043C\u043F\u043E\u0440\u0442 \u0430\u0433\u0435\u043D\u0442\u043E\u0432'}
            >
              <Upload size={18} />
              <span className="hidden sm:inline">{'\u0418\u043C\u043F\u043E\u0440\u0442'}</span>
            </button>

            {/* Export all button */}
            <button
              onClick={handleExportAll}
              disabled={presets.length === 0}
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title={'\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0432\u0441\u0435\u0445 \u0430\u0433\u0435\u043D\u0442\u043E\u0432'}
            >
              <Download size={18} />
              <span className="hidden sm:inline">{'\u042D\u043A\u0441\u043F\u043E\u0440\u0442'}</span>
            </button>

            {/* Create button */}
            <button
              onClick={handleCreateAgent}
              className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 font-medium text-white shadow-lg shadow-purple-500/25 transition hover:shadow-purple-500/40 hover:scale-105"
            >
              <Plus size={20} className="transition group-hover:rotate-90" />
              <span className="hidden sm:inline">{'\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0430\u0433\u0435\u043D\u0442\u0430'}</span>
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Search and filters */}
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={'\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E, \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044E, \u0442\u0435\u0433\u0430\u043C...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          {/* Filters and view mode */}
          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-1">
              <div
                onClick={() => setFilterMode('all')}
                className={`rounded px-3 py-1.5 text-sm font-medium transition cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {'\u0412\u0441\u0435'}
              </div>
              <div
                onClick={() => setFilterMode('favorites')}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition cursor-pointer ${
                  filterMode === 'favorites'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Star size={14} className={filterMode === 'favorites' ? 'fill-yellow-400 text-yellow-400' : ''} />
                {'\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435'}
              </div>
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="relative">
                <div
                  onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 cursor-pointer hover:border-slate-600 transition"
                >
                  <Filter size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-300 min-w-[100px]">
                    {selectedTag || '\u0412\u0441\u0435 \u0442\u0435\u0433\u0438'}
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {tagDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[100]"
                      onClick={() => setTagDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-[110] mt-1 w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl max-h-64 overflow-y-auto">
                      <div
                        onClick={() => {
                          setSelectedTag(null);
                          setTagDropdownOpen(false);
                        }}
                        className={`px-4 py-2 text-sm transition cursor-pointer ${
                          !selectedTag
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                        }`}
                      >
                        {'\u0412\u0441\u0435 \u0442\u0435\u0433\u0438'}
                      </div>
                      {allTags.map(tag => (
                        <div
                          key={tag}
                          onClick={() => {
                            setSelectedTag(tag);
                            setTagDropdownOpen(false);
                          }}
                          className={`px-4 py-2 text-sm transition cursor-pointer ${
                            selectedTag === tag
                              ? 'bg-slate-700 text-white'
                              : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                          }`}
                        >
                          {tag}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* View mode toggle */}
            <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-1">
              <div
                onClick={() => setViewMode('grid')}
                className={`rounded p-1.5 transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={'\u0421\u0435\u0442\u043A\u0430'}
              >
                <Grid3x3 size={18} />
              </div>
              <div
                onClick={() => setViewMode('list')}
                className={`rounded p-1.5 transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={'\u0421\u043F\u0438\u0441\u043E\u043A'}
              >
                <List size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
