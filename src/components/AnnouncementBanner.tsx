import {
  AlertTriangle,
  Archive,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  Megaphone,
  Plus,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  AnnouncementPriorityTag,
  AnnouncementSeverity,
  CompanyAnnouncement,
  Role,
} from '../types/nexops';
import { formatDateTime } from '../utils/storage';

interface AnnouncementBannerProps {
  announcements: CompanyAnnouncement[];
  activeRole: Role;
  onPublishAnnouncement: (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    priorityTag: AnnouncementPriorityTag;
    pinned: boolean;
  }) => void;
  onArchiveAnnouncement: (announcementId: string) => void;
  onRestoreAnnouncement: (announcementId: string) => void;
}

export function AnnouncementBanner({
  announcements,
  activeRole,
  onPublishAnnouncement,
  onArchiveAnnouncement,
  onRestoreAnnouncement,
}: AnnouncementBannerProps) {
  const isAdmin = activeRole === 'Admin';
  const activeNotices = announcements
    .filter((a) => !a.archived)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const archivedNotices = announcements.filter((a) => a.archived);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Publish modal state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('info');
  const [priorityTag, setPriorityTag] = useState<AnnouncementPriorityTag>('General');
  const [pinned, setPinned] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const safeIndex = activeNotices.length > 0 ? currentIndex % activeNotices.length : 0;
  const activeNotice = activeNotices[safeIndex];

  const handlePublishSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Announcement headline is required.');
      return;
    }
    if (!message.trim()) {
      setFormError('Official notice message body is required.');
      return;
    }
    setFormError(null);
    onPublishAnnouncement({
      title: title.trim(),
      message: message.trim(),
      severity,
      priorityTag,
      pinned,
    });
    setTitle('');
    setMessage('');
    setSeverity('info');
    setPriorityTag('General');
    setPinned(true);
    setCurrentIndex(0);
    setPublishOpen(false);
  };

  if (activeNotices.length === 0 && !isAdmin) {
    return null;
  }

  const severityStyles: Record<
    AnnouncementSeverity,
    { wrapper: string; badge: string; iconColor: string; label: string }
  > = {
    urgent: {
      wrapper: 'border-rose-200 bg-rose-50/95 text-rose-950',
      badge: 'border-rose-300 bg-rose-100 text-rose-800',
      iconColor: 'text-rose-600',
      label: 'URGENT CIRCULAR',
    },
    warning: {
      wrapper: 'border-amber-200 bg-amber-50/95 text-amber-950',
      badge: 'border-amber-300 bg-amber-100 text-amber-900',
      iconColor: 'text-amber-700',
      label: 'EXECUTIVE NOTICE',
    },
    info: {
      wrapper: 'border-indigo-200 bg-indigo-50/95 text-indigo-950',
      badge: 'border-indigo-300 bg-indigo-100 text-indigo-800',
      iconColor: 'text-indigo-600',
      label: 'COMPANY CIRCULAR',
    },
  };

  return (
    <>
      {activeNotice ? (
        <div
          role="region"
          aria-label="Official Company Circulars"
          className={`border-b px-4 py-2.5 sm:px-6 lg:px-8 ${severityStyles[activeNotice.severity].wrapper}`}
        >
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
              {activeNotice.severity === 'urgent' ? (
                <ShieldAlert
                  className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${severityStyles[activeNotice.severity].iconColor}`}
                />
              ) : activeNotice.severity === 'warning' ? (
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${severityStyles[activeNotice.severity].iconColor}`}
                />
              ) : (
                <Megaphone
                  className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${severityStyles[activeNotice.severity].iconColor}`}
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide ${severityStyles[activeNotice.severity].badge}`}
                  >
                    {severityStyles[activeNotice.severity].label}
                  </span>
                  <span className="text-xs font-bold">{activeNotice.title}</span>
                  <span className="hidden font-mono text-[10px] opacity-70 sm:inline">
                    · {activeNotice.publishedBy} · {formatDateTime(activeNotice.publishedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">{activeNotice.message}</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {activeNotices.length > 1 && (
                <div className="inline-flex items-center gap-1 rounded-md border border-slate-900/10 bg-white/70 px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex(
                        (prev) => (prev - 1 + activeNotices.length) % activeNotices.length,
                      )
                    }
                    aria-label="Previous announcement"
                    className="rounded p-0.5 hover:bg-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono text-[10px] font-semibold tabular-nums">
                    {safeIndex + 1}/{activeNotices.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev + 1) % activeNotices.length)}
                    aria-label="Next announcement"
                    className="rounded p-0.5 hover:bg-white"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setPublishOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-900 transition-colors hover:bg-white whitespace-nowrap"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Publish Notice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchiveAnnouncement(activeNotice.id)}
                    title="Archive this notice"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-white hover:text-rose-700 whitespace-nowrap"
                  >
                    <Archive className="h-3 w-3" />
                    <span>Archive</span>
                  </button>
                  {archivedNotices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setArchiveOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-white whitespace-nowrap"
                    >
                      <History className="h-3 w-3" />
                      <span>({archivedNotices.length})</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Admin-only compact circular bar when all notices are archived */
        <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-1.5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              <span>No active executive circulars published.</span>
            </span>
            <div className="flex items-center gap-2">
              {archivedNotices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <History className="h-3 w-3" />
                  <span>Archived ({archivedNotices.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setPublishOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
              >
                <Megaphone className="h-3 w-3" />
                <span>Publish Official Circular</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Official Circular Modal (Admin Only) */}
      {publishOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-notice-heading"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-indigo-600" />
                <h2
                  id="publish-notice-heading"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Publish Official Company Circular
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="space-y-4 px-6 py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="notice-title" className="block text-xs font-semibold text-slate-700">
                  Circular Headline <span className="text-rose-600">*</span>
                </label>
                <input
                  id="notice-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="e.g., Year-End Procurement Freeze & Q4 Cutover Window"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="notice-tag"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Notice Category Tag
                  </label>
                  <select
                    id="notice-tag"
                    value={priorityTag}
                    onChange={(e) => {
                      const nextTag = e.target.value as AnnouncementPriorityTag;
                      setPriorityTag(nextTag);
                      setSeverity(
                        nextTag === 'Urgent'
                          ? 'urgent'
                          : nextTag === 'HR'
                            ? 'warning'
                            : 'info',
                      );
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="General">General</option>
                    <option value="HR">HR</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Pin to top of Notice Board
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="notice-message"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Circular Details <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="notice-message"
                  rows={3}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="State effective dates, impacted departments, and compliance instructions..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Publish to All Users
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archived Circulars Modal */}
      {archiveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archived-notices-heading"
        >
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-600" />
                <h2
                  id="archived-notices-heading"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Archived Executive Circulars ({archivedNotices.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {archivedNotices.length === 0 ? (
                <p className="text-center text-xs text-slate-500">No archived circulars.</p>
              ) : (
                archivedNotices.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{item.message}</p>
                        <p className="mt-2 font-mono text-[11px] text-slate-400">
                          {item.publishedBy} · {formatDateTime(item.publishedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRestoreAnnouncement(item.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Republish</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
