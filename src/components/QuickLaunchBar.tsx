import {
  Bookmark,
  BookOpenCheck,
  Briefcase,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  FolderKanban,
  FolderLock,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Package,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { NavSection, QuickBookmark, Role } from '../types/nexops';
import { sanitizeExternalHttpUrl } from '../utils/storage';

interface QuickLaunchBarProps {
  bookmarks: QuickBookmark[];
  activeSection: NavSection;
  activeRole: Role;
  isSuperAdmin: boolean;
  onSelectSection: (section: NavSection) => void;
  onUpdateBookmarks: (next: QuickBookmark[]) => void;
}

const MODULE_OPTIONS: {
  section: NavSection;
  label: string;
  adminOnly?: boolean;
}[] = [
  { section: 'dashboard', label: 'Executive KPIs' },
  { section: 'requests', label: 'Requests & Queue' },
  { section: 'projects', label: 'Projects & Clients' },
  { section: 'assets', label: 'Assets & Inventory' },
  { section: 'sops', label: 'SOP & Policy Vault' },
  { section: 'vault', label: 'Document Vault' },
  { section: 'leaves', label: 'Attendance & Leaves' },
  { section: 'meetings', label: 'Meetings & MoM' },
  { section: 'calendar', label: 'Calendar' },
  { section: 'mailchat', label: 'Mail & Chat' },
  { section: 'workspace', label: 'Google Workspace' },
  { section: 'user_settings', label: 'Settings' },
  { section: 'audit', label: 'Audit Trail', adminOnly: true },
  { section: 'settings', label: 'Admin Panel', adminOnly: true },
];

function getModuleIcon(section?: NavSection) {
  switch (section) {
    case 'dashboard':
      return LayoutDashboard;
    case 'requests':
      return ClipboardCheck;
    case 'projects':
      return FolderKanban;
    case 'assets':
      return Package;
    case 'sops':
      return BookOpenCheck;
    case 'vault':
      return FolderLock;
    case 'leaves':
      return CalendarCheck2;
    case 'meetings':
      return CalendarClock;
    case 'calendar':
      return CalendarDays;
    case 'mailchat':
      return MessageSquare;
    case 'workspace':
      return Briefcase;
    case 'audit':
      return FileSpreadsheet;
    case 'settings':
      return Users;
    case 'user_settings':
      return Settings;
    default:
      return Bookmark;
  }
}

export function QuickLaunchBar({
  bookmarks,
  activeSection,
  activeRole,
  isSuperAdmin,
  onSelectSection,
  onUpdateBookmarks,
}: QuickLaunchBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setUrlError('');
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  const availableModules = MODULE_OPTIONS.filter(
    (mod) => !mod.adminOnly || (isSuperAdmin && activeRole === 'Admin'),
  );

  const pinnedSections = new Set(
    bookmarks.filter((b) => b.kind === 'module' && b.section).map((b) => b.section!),
  );

  const toggleModulePin = (section: NavSection, label: string) => {
    if (pinnedSections.has(section)) {
      onUpdateBookmarks(
        bookmarks.filter((b) => !(b.kind === 'module' && b.section === section)),
      );
      return;
    }
    const nextItem: QuickBookmark = {
      id: `bm-${section}`,
      label,
      kind: 'module',
      section,
      createdAt: new Date().toISOString(),
    };
    onUpdateBookmarks([...bookmarks, nextItem]);
  };

  const handleAddCustomUrl = (e: FormEvent) => {
    e.preventDefault();
    const label = customLabel.trim().slice(0, 40);
    if (!label) {
      setUrlError('Enter a short bookmark label.');
      return;
    }
    const safeUrl = sanitizeExternalHttpUrl(customUrl);
    if (!safeUrl) {
      setUrlError('Enter a valid https:// or http:// URL.');
      return;
    }
    const nextItem: QuickBookmark = {
      id: `bm-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      kind: 'url',
      url: safeUrl,
      createdAt: new Date().toISOString(),
    };
    onUpdateBookmarks([...bookmarks, nextItem]);
    setCustomLabel('');
    setCustomUrl('');
    setUrlError('');
  };

  const handleRemoveBookmark = (id: string) => {
    onUpdateBookmarks(bookmarks.filter((b) => b.id !== id));
  };

  return (
    <div className="relative flex w-full max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mr-1 inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <Bookmark className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
        <span className="hidden sm:inline">Quick Launch</span>
      </div>

      {bookmarks.length === 0 ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Pin favorite modules or links for 1-click access.
        </span>
      ) : (
        bookmarks.map((bm) => {
          if (bm.kind === 'module' && bm.section) {
            const Icon = getModuleIcon(bm.section);
            const isActive = activeSection === bm.section;
            return (
              <div
                key={bm.id}
                className={`group inline-flex max-w-full min-w-0 items-center rounded-lg border text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600 dark:text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSection(bm.section!)}
                  className="inline-flex min-w-0 items-center gap-1.5 py-1 pr-1.5 pl-2.5 text-left"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[130px] truncate">{bm.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveBookmark(bm.id)}
                  title={`Unpin ${bm.label}`}
                  aria-label={`Unpin ${bm.label}`}
                  className={`mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity sm:opacity-60 sm:group-hover:opacity-100 ${
                    isActive
                      ? 'text-slate-300 hover:bg-white/15 hover:text-white'
                      : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          }

          const safeUrl = sanitizeExternalHttpUrl(bm.url);
          if (!safeUrl) return null;
          return (
            <div
              key={bm.id}
              className="group inline-flex max-w-full min-w-0 items-center rounded-lg border border-indigo-200 bg-indigo-50/70 text-xs font-semibold text-indigo-800 transition-colors hover:bg-indigo-100/80 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950/70"
            >
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={safeUrl}
                className="inline-flex min-w-0 items-center gap-1.5 py-1 pr-1.5 pl-2.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="max-w-[130px] truncate">{bm.label}</span>
              </a>
              <button
                type="button"
                onClick={() => handleRemoveBookmark(bm.id)}
                title={`Remove ${bm.label}`}
                aria-label={`Remove ${bm.label}`}
                className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-indigo-500 transition-opacity hover:bg-indigo-200/70 hover:text-indigo-900 sm:opacity-60 sm:group-hover:opacity-100 dark:text-indigo-300 dark:hover:bg-indigo-900/70 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })
      )}

      {/* + Pin Popover Trigger */}
      <div className="relative ml-auto shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Pin</span>
        </button>

        {menuOpen && (
          <div className="absolute top-[calc(100%+6px)] right-0 z-40 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Bookmark className="h-3.5 w-3.5 text-slate-800 dark:text-slate-200" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Manage Quick Launch
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setUrlError('');
                }}
                aria-label="Close Quick Launch menu"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-2.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              NexOps Modules
            </p>
            <div className="mt-1.5 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
              {availableModules.map((mod) => {
                const pinned = pinnedSections.has(mod.section);
                const Icon = getModuleIcon(mod.section);
                return (
                  <button
                    key={mod.section}
                    type="button"
                    onClick={() => toggleModulePin(mod.section, mod.label)}
                    className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-colors ${
                      pinned
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600 dark:text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{mod.label}</span>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleAddCustomUrl}
              className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                <Link2 className="h-3 w-3" />
                <span>Add External Link</span>
              </div>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Label (e.g. Jira Board)"
                maxLength={40}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500"
              />
              <input
                type="url"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  if (urlError) setUrlError('');
                }}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500"
              />
              {urlError && (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  {urlError}
                </p>
              )}
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Pin Custom Link</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
