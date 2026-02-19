import { Loader2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import type { AdminFeedbackDetails, AdminFeedbackStatus, AdminFeedbackSummary } from '../../state/api';
import type { FeedbackFormState } from './types';
import {
  FEEDBACK_STATUS_BADGE_CLASSES,
  FEEDBACK_STATUS_BUTTON_CLASSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_ORDER,
  FEEDBACK_TYPE_LABELS,
  formatDateTime,
} from './constants';

interface FeedbackManagementProps {
  feedback: AdminFeedbackSummary[];
  filteredFeedback: AdminFeedbackSummary[];
  feedbackError: string | null;
  feedbackLoading: boolean;
  feedbackSearch: string;

  // Modal state
  feedbackModalOpen: boolean;
  feedbackDetails: AdminFeedbackDetails | null;
  feedbackDetailsLoading: boolean;
  feedbackForm: FeedbackFormState;
  feedbackSaving: boolean;
  feedbackDeleting: boolean;
  feedbackModalError: string | null;
  feedbackDirty: boolean;
  selectedFeedbackId: string | null;

  // Actions
  onOpenFeedbackModal: (entry: AdminFeedbackSummary) => Promise<void>;
  onCloseFeedbackModal: () => void;
  onFeedbackFieldChange: (field: 'title' | 'description' | 'contact' | 'resolution', value: string) => void;
  onFeedbackStatusChange: (status: AdminFeedbackStatus) => void;
  onSaveFeedback: () => Promise<void>;
  onDeleteFeedback: () => Promise<void>;
}

export function FeedbackManagement({
  feedback,
  filteredFeedback,
  feedbackError,
  feedbackLoading,
  feedbackSearch,
  feedbackModalOpen,
  feedbackDetails,
  feedbackDetailsLoading,
  feedbackForm,
  feedbackSaving,
  feedbackDeleting,
  feedbackModalError,
  feedbackDirty,
  selectedFeedbackId,
  onOpenFeedbackModal,
  onCloseFeedbackModal,
  onFeedbackFieldChange,
  onFeedbackStatusChange,
  onSaveFeedback,
  onDeleteFeedback,
}: FeedbackManagementProps) {
  return (
    <>
      <section className="space-y-4">
        {feedbackError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            Failed to load feedback: {feedbackError}
          </div>
        )}
        {feedbackLoading && !feedback.length ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            Loading feedback...
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
            {feedbackSearch.trim()
              ? `No records matching query \u00AB${feedbackSearch.trim()}\u00BB.`
              : 'No feedback yet.'}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                { id: 'problem', label: 'Problem reports', tone: 'border-rose-500/40 bg-rose-500/10' },
                { id: 'suggestion', label: 'Improvement suggestions', tone: 'border-emerald-500/20 bg-emerald-500/10' },
                { id: 'unknown', label: 'Uncategorized', tone: 'border-slate-700 bg-slate-900/70' },
              ] as const
            ).map((section) => {
              const sectionItems = filteredFeedback.filter((item) => item.type === section.id);
              const validSectionItems = sectionItems.filter((item) => {
                if (!item.feedback_id) {
                  console.warn('[AdminPage] Skipping feedback entry without id', item);
                  return false;
                }
                return true;
              });
              if (validSectionItems.length === 0) {
                return (
                  <article
                    key={section.id}
                    className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400"
                  >
                    <header className="mb-3 text-sm font-semibold text-slate-200">
                      {section.label}
                    </header>
                    <p>No records.</p>
                  </article>
                );
              }
              return (
                <article
                  key={section.id}
                  className={`rounded-2xl border ${section.tone} bg-slate-900/80 p-4 shadow-sm`}
                >
                  <header className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white">{section.label}</h2>
                    <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
                      {sectionItems.length}
                    </span>
                  </header>
                  <ul className="space-y-3">
                    {validSectionItems.map((item) => {
                      const statusLabel = FEEDBACK_STATUS_LABELS[item.status];
                      const badgeClass = FEEDBACK_STATUS_BADGE_CLASSES[item.status];
                      return (
                        <li
                          key={item.feedback_id}
                          className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-slate-200 shadow-inner"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${badgeClass}`}>
                                  {statusLabel}
                                </span>
                                {item.has_resolution && (
                                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-200">
                                    Has resolution
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                Created: {formatDateTime(item.created_at)}
                                <span className="mx-1">&middot;</span>
                                Updated: {formatDateTime(item.updated_at)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Contact: {item.contact ? item.contact : 'not specified'}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenFeedbackModal(item)}
                                className="rounded-full px-4 py-1 text-sm font-medium transition bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                              >
                                Open
                              </button>
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-slate-200">{item.excerpt}</p>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Feedback detail modal */}
      {feedbackModalOpen && (
        <Modal
          title={feedbackDetails ? `Feedback: ${feedbackDetails.title}` : 'Feedback'}
          onClose={onCloseFeedbackModal}
          actions={
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onDeleteFeedback}
                className="rounded-full border border-rose-600 px-4 py-1 text-sm text-rose-200 transition hover:border-rose-500 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                disabled={feedbackDeleting || feedbackDetailsLoading || !selectedFeedbackId}
              >
                {feedbackDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCloseFeedbackModal}
                  className="rounded-full border border-slate-700 px-4 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                  disabled={feedbackSaving}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={onSaveFeedback}
                  className="rounded-full bg-primary px-4 py-1 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-700"
                  disabled={
                    !feedbackDetails ||
                    feedbackDetailsLoading ||
                    feedbackSaving ||
                    !feedbackDirty
                  }
                >
                  {feedbackSaving ? 'Saving...' : feedbackDirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {feedbackModalError && (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {feedbackModalError}
              </div>
            )}
            {feedbackDetailsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading record...
              </div>
            ) : feedbackDetails ? (
              <div className="space-y-4">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                  <div>ID: {feedbackDetails.feedback_id}</div>
                  <div className="mt-1">
                    Type: {FEEDBACK_TYPE_LABELS[feedbackDetails.type] ?? feedbackDetails.type}
                  </div>
                  <div className="mt-1">
                    Created: {formatDateTime(feedbackDetails.created_at)}
                  </div>
                  <div className="mt-1">
                    Updated: {formatDateTime(feedbackDetails.updated_at)}
                  </div>
                  {feedbackDetails.source && (
                    <div className="mt-1">
                      File: <span className="text-slate-300">{feedbackDetails.source}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Title</label>
                  <input
                    type="text"
                    value={feedbackForm.title}
                    onChange={(event) => onFeedbackFieldChange('title', event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-400">Status</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FEEDBACK_STATUS_ORDER.map((status) => {
                      const isActive = feedbackForm.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => onFeedbackStatusChange(status)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isActive
                              ? `bg-white/10 text-white ring-2 ${FEEDBACK_STATUS_BUTTON_CLASSES[status]}`
                              : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                          }`}
                          disabled={feedbackSaving}
                        >
                          {FEEDBACK_STATUS_LABELS[status]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Contact</label>
                  <input
                    type="text"
                    value={feedbackForm.contact}
                    onChange={(event) => onFeedbackFieldChange('contact', event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="telegram @username, email or phone"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                  <textarea
                    rows={6}
                    value={feedbackForm.description}
                    onChange={(event) => onFeedbackFieldChange('description', event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Resolution</label>
                  <textarea
                    rows={4}
                    value={feedbackForm.resolution}
                    onChange={(event) => onFeedbackFieldChange('resolution', event.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-primary focus:outline-none"
                    placeholder="Describe how the problem was resolved or what is planned"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                Failed to load record.
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
