import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  History,
  Info,
  Megaphone,
  Plus,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AnnouncementPriorityTag,
  AnnouncementSeverity,
  CompanyAnnouncement,
  Role,
} from '../types/nexops';
import {
  formatDateTime,
  isAnnouncementActive,
  isSuperAdminEmail,
  loadDismissedAnnouncementIds,
  saveDismissedAnnouncementIds,
} from '../utils/storage';

interface AnnouncementBannerProps {
  announcements: CompanyAnnouncement[];
  activeRole: Role;
  currentUserEmail: string;
  onPublishAnnouncement: (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    priorityTag: AnnouncementPriorityTag;
    pinned: boolean;
    expiresAt?: string;
  }) => void;
  onArchiveAnnouncement: (announcementId: string) => void;
  onRestoreAnnouncement: (announcementId: string) => void;
}

export function AnnouncementBanner({
  announcements,
  activeRole,
  currentUserEmail,
  onPublishAnnouncement,
  onArchiveAnnouncement,
  onRestoreAnnouncement,
}: AnnouncementBannerProps) {
  const isSuperAdmin = activeRole === 'Admin' && isSuperAdminEmail(currentUserEmail);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dismissedIds, setDismissedIds] = useState<string[]>(() =>
    loadDismissedAnnouncementIds(currentUserEmail),
  );
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setDismissedIds(loadDismissedAnnouncementIds(currentUserEmail));
  }, [currentUserEmail]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const allLiveNotices = useMemo(
    () =>
      announcements
        .filter((a) => isAnnouncementActive(a, nowMs))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))),
    [announcements, nowMs],
  );

  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);
  const activeNotices = useMemo(
    () => allLiveNotices.filter((a) => !dismissedSet.has(a.id)),
    [allLiveNotices, dismissedSet],
  );
  const archivedNotices = useMemo(
    () => announcements.filter((a) => a.archived || !isAnnouncementActive(a, nowMs)),
    [announcements, nowMs],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Publish modal state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('info');
  const [priorityTag, setPriorityTag] = useState<AnnouncementPriorityTag>('General');
  const [pinned, setPinned] = useState(true);
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const safeIndex = activeNotices.length > 0 ? currentIndex % activeNotices.length : 0;
  const activeNotice = activeNotices[safeIndex];

  const handleDismissNotice = (noticeId: string) => {
    const next = Array.from(new Set([...dismissedIds, noticeId]));
    setDismissedIds(next);
    saveDismissedAnnouncementIds(currentUserEmail, next);
  };

  const handleRestoreDismissed = () => {
    setDismissedIds([]);
    saveDismissedAnnouncementIds(currentUserEmail, []);
    setCollapsed(false);
  };

  const handlePublishSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    if (!title.trim()) {
      setFormError('Announcement headline is required.');
      return;
    }
    if (!message.trim()) {
      setFormError('Official notice message body is required.');
      return;
    }
    let normalizedExpiresAt: string | undefined;
    if (expiresAtInput.trim()) {
      const parsedExp = new Date(expiresAtInput);
      if (Number.isNaN(parsedExp.getTime())) {
        setFormError('Please provide a valid expiry date and time.');
        return;
      }
      if (parsedExp.getTime() <= Date.now()) {
        setFormError('Expiry date & time must be in the future.');
        return;
      }
      normalizedExpiresAt = parsedExp.toISOString();
    }

    setFormError(null);
    onPublishAnnouncement({
      title: title.trim(),
      message: message.trim(),
      severity,
      priorityTag,
      pinned,
      expiresAt: normalizedExpiresAt,
    });
    setTitle('');
    setMessage('');
    setSeverity('info');
    setPriorityTag('General');
    setPinned(true);
    setExpiresAtInput('');
    setCurrentIndex(0);
    setCollapsed(false);
    setPublishOpen(false);
  };

  if (activeNotices.length === 0 && !isSuperAdmin && allLiveNotices.length === 0) {
    return null;
  }

  const severityStyles: Record<
    AnnouncementSeverity,
    { wrapper: string; badge: string; iconColor: string; label: string }
  > = {
    urgent: {
      wrapper:
        'border-rose-200 bg-rose-50/95 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100',
      badge:
        'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-900/70 dark:text-rose-200',
      iconColor: 'text-rose-600 dark:text-rose-400',
      label: 'URGENT CIRCULAR',
    },
    warning: {
      wrapper:
        'border-amber-200 bg-amber-50/95 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
      badge:
        'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/70 dark:text-amber-200',
      iconColor: 'text-amber-700 dark:text-amber-400',
      label: 'EXECUTIVE NOTICE',
    },
    info: {
      wrapper:
        'border-indigo-200 bg-indigo-50/95 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-100',
      badge:
        'border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      label: 'COMPANY CIRCULAR',
    },
  };

  return (
    <>
      {activeNotice ? (
        <div
          role="region"
          aria-label="Official Company Circulars"
          className={`max-w-full overflow-x-clip border-b px-2.5 py-2 sm:px-6 lg:px-8 2xl:px-10 ${severityStyles[activeNotice.severity].wrapper}`}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-wrap items-center justify-between gap-2.5">
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
                  {activeNotice.expiresAt && (
                    <span className="inline-flex items-center gap-1 rounded border border-slate-900/15 bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold opacity-85 dark:border-slate-700 dark:bg-slate-900/70">
                      <Clock className="h-2.5 w-2.5" />
                      <span>Expires {formatDateTime(activeNotice.expiresAt)}</span>
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <p className="mt-0.5 break-words text-xs leading-relaxed opacity-90">{activeNotice.message}</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {activeNotices.length > 1 && (
                <div className="inline-flex items-center gap-1 rounded-md border border-slate-900/10 bg-white/70 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900/80">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex(
                        (prev) => (prev - 1 + activeNotices.length) % activeNotices.length,
                      )
                    }
                    aria-label="Previous announcement"
                    className="rounded p-0.5 hover:bg-white dark:hover:bg-slate-800"
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
                    className="rounded p-0.5 hover:bg-white dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                title={collapsed ? 'Expand announcement' : 'Collapse announcement'}
                aria-label={collapsed ? 'Expand announcement' : 'Collapse announcement'}
                className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/80 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                <span className="hidden sm:inline">{collapsed ? 'Expand' : 'Collapse'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDismissNotice(activeNotice.id)}
                title="Dismiss this announcement"
                aria-label="Dismiss announcement"
                className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/80 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-3 w-3" />
                <span className="hidden sm:inline">Dismiss</span>
              </button>

              {isSuperAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setPublishOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-900 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Post Announcement</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchiveAnnouncement(activeNotice.id)}
                    title="Archive this notice"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-white hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                  >
                    <Archive className="h-3 w-3" />
                    <span>Archive</span>
                  </button>
                  {archivedNotices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setArchiveOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-900/15 bg-white/85 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
        /* Compact bar when notices are dismissed or only Super Admin controls are shown */
        <div className="max-w-full overflow-x-clip border-b border-slate-200 bg-slate-100/80 px-2.5 py-1.5 sm:px-6 lg:px-8 2xl:px-10 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span>
                {allLiveNotices.length > 0
                  ? `${allLiveNotices.length} active notice${allLiveNotices.length === 1 ? '' : 's'} dismissed.`
                  : 'No active executive circulars published.'}
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {allLiveNotices.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreDismissed}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Show Notices ({allLiveNotices.length})</span>
                </button>
              )}
              {isSuperAdmin && archivedNotices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setArchiveOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <History className="h-3 w-3" />
                  <span>Archived ({archivedNotices.length})</span>
                </button>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setPublishOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  <Megaphone className="h-3 w-3" />
                  <span>Post Announcement</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post Announcement Modal (Sole Super Admin Only) */}
      {publishOpen && isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-notice-heading"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h2
                  id="publish-notice-heading"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Post Live Company Announcement
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="notice-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="notice-tag"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="General">General</option>
                    <option value="HR">HR</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="notice-expires"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Auto-Expiry Date &amp; Time (Optional)
                  </label>
                  <input
                    id="notice-expires"
                    type="datetime-local"
                    value={expiresAtInput}
                    onChange={(e) => {
                      setExpiresAtInput(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  Pin to top of Notice Board
                </label>
              </div>

              <div>
                <label
                  htmlFor="notice-message"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
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
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  Post Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archived Circulars Modal */}
      {archiveOpen && isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archived-notices-heading"
        >
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <h2
                  id="archived-notices-heading"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Archived &amp; Expired Circulars ({archivedNotices.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {archivedNotices.length === 0 ? (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  No archived or expired circulars.
                </p>
              ) : (
                archivedNotices.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {item.message}
                        </p>
                        <p className="mt-2 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {item.publishedBy} · {formatDateTime(item.publishedAt)}
                          {item.expiresAt ? ` · Expired ${formatDateTime(item.expiresAt)}` : ''}
                        </p>
                      </div>
                      {item.archived && (
                        <button
                          type="button"
                          onClick={() => onRestoreAnnouncement(item.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Republish</span>
                        </button>
                      )}
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
