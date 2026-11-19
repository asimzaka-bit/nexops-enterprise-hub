import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  FileSpreadsheet,
  HardDrive,
  Info,
  LogOut,
  Menu,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppNotification,
  AuditEvent,
  Department,
  NavSection,
  OperationalRequest,
  Role,
  TeamMember,
} from '../types/nexops';
import { formatDateTime } from '../utils/storage';

interface TopBarProps {
  activeSection: NavSection;
  activeRole: Role;
  currentUser: TeamMember;
  departments: string[];
  requests: OperationalRequest[];
  auditLogs: AuditEvent[];
  dbConnected: boolean;
  isSyncing: boolean;
  onSyncNow: () => void;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
  onSelectRequestById: (requestId: string) => void;
  onSelectDepartment: (department: Department) => void;
  onSelectAuditMatch: (audit: AuditEvent) => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onSelectNotificationRequest: (requestId: string, notificationId: string) => void;
  onOpenMobileMenu: () => void;
  onOpenCreateModal: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}

const SECTION_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Executive KPI Dashboard',
    subtitle: 'Operational throughput, QA compliance & bottleneck visibility',
  },
  requests: {
    title: 'Requests & Workflow Queue',
    subtitle: 'Manage submissions, QA checklists & multi-stage approvals',
  },
  projects: {
    title: 'Projects & Clients Directory',
    subtitle: 'Manage active engagements, client/vendor programs & budget hours',
  },
  assets: {
    title: 'Assets & Inventory Management',
    subtitle: 'Track company hardware, software licenses, custody transfers & maintenance logs',
  },
  sops: {
    title: 'Corporate SOP & Knowledge Vault',
    subtitle: 'Standard operating procedures, QA guidelines, HR policies & compliance sign-off',
  },
  leaves: {
    title: 'Leave & Time-Off Approvals',
    subtitle: 'Employee absence scheduling, backup coverage & manager approval routing',
  },
  meetings: {
    title: 'Meetings & Action Items (MoM)',
    subtitle: 'Executive summaries, recorded decisions & 1-click request conversion',
  },
  audit: {
    title: 'Audit Logs & Compliance Center',
    subtitle: 'Immutable ledger of operational actions & CSV reporting',
  },
  settings: {
    title: 'Team & Department Settings',
    subtitle: 'RBAC directory, permission matrix, cloud health diagnostics & workspace controls',
  },
};

type CommandItem =
  | { kind: 'request'; request: OperationalRequest }
  | { kind: 'department'; department: Department; count: number }
  | { kind: 'audit'; audit: AuditEvent };

export function TopBar({
  activeSection,
  activeRole,
  currentUser,
  departments,
  requests,
  auditLogs,
  dbConnected,
  isSyncing,
  onSyncNow,
  globalSearch,
  onGlobalSearchChange,
  onSelectRequestById,
  onSelectDepartment,
  onSelectAuditMatch,
  notifications,
  onMarkAllRead,
  onSelectNotificationRequest,
  onOpenMobileMenu,
  onOpenCreateModal,
  onOpenProfile,
  onSignOut,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState(globalSearch);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommandQuery(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Global Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setNotifOpen(false);
        setProfileOpen(false);

        if (window.innerWidth >= 768 && desktopSearchInputRef.current) {
          setSearchOpen(true);
          desktopSearchInputRef.current.focus();
          desktopSearchInputRef.current.select();
        } else {
          setMobileSearchOpen(true);
          window.setTimeout(() => mobileSearchInputRef.current?.focus(), 30);
        }
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const sectionMeta = SECTION_TITLES[activeSection];

  const commandResults = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();

    const matchedRequests = (
      q
        ? requests.filter(
            (r) =>
              r.id.toLowerCase().includes(q) ||
              r.title.toLowerCase().includes(q) ||
              r.department.toLowerCase().includes(q) ||
              r.category.toLowerCase().includes(q) ||
              r.submittedBy.toLowerCase().includes(q),
          )
        : requests
    ).slice(0, 5);

    const matchedDepartments = (
      q
        ? departments.filter((dept) => dept.toLowerCase().includes(q))
        : departments
    ).map((department) => ({
      department,
      count: requests.filter((r) => r.department === department).length,
    }));

    const matchedAudits = (
      q
        ? auditLogs.filter(
            (a) =>
              a.requestId.toLowerCase().includes(q) ||
              a.actorName.toLowerCase().includes(q) ||
              a.actorRole.toLowerCase().includes(q) ||
              a.actionType.toLowerCase().includes(q) ||
              a.details.toLowerCase().includes(q),
          )
        : auditLogs
    ).slice(0, 4);

    const flatItems: CommandItem[] = [
      ...matchedRequests.map((request) => ({ kind: 'request' as const, request })),
      ...matchedDepartments.map((d) => ({
        kind: 'department' as const,
        department: d.department,
        count: d.count,
      })),
      ...matchedAudits.map((audit) => ({ kind: 'audit' as const, audit })),
    ];

    return { matchedRequests, matchedDepartments, matchedAudits, flatItems };
  }, [commandQuery, requests, auditLogs]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [commandQuery]);

  const executeCommandItem = (item: CommandItem) => {
    if (item.kind === 'request') {
      onSelectRequestById(item.request.id);
    } else if (item.kind === 'department') {
      onSelectDepartment(item.department);
    } else {
      onSelectAuditMatch(item.audit);
    }
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const handleSearchInputChange = (val: string) => {
    setCommandQuery(val);
    setSearchOpen(true);
    if (activeSection === 'requests') {
      onGlobalSearchChange(val);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const items = commandResults.flatItems;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        setHighlightedIdx((prev) => (prev + 1) % items.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        setHighlightedIdx((prev) => (prev - 1 + items.length) % items.length);
      }
    } else if (e.key === 'Enter') {
      if (items.length > 0 && items[highlightedIdx]) {
        e.preventDefault();
        executeCommandItem(items[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      setMobileSearchOpen(false);
      e.currentTarget.blur();
    }
  };

  const getRoleIcon = (role: Role) => {
    if (role === 'Admin') return <Shield className="h-3.5 w-3.5 text-indigo-600 shrink-0" />;
    if (role === 'Manager / QA Reviewer')
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
    return <User className="h-3.5 w-3.5 text-slate-600 shrink-0" />;
  };

  const renderCommandResultsBody = () => {
    const { matchedRequests, matchedDepartments, matchedAudits, flatItems } = commandResults;
    if (flatItems.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-xs text-slate-500">
          No matching Request IDs, Titles, Departments, or Audit Logs found for &ldquo;{commandQuery}&rdquo;.
        </div>
      );
    }

    let runningIdx = 0;

    return (
      <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {matchedRequests.length > 0 && (
          <div className="p-2">
            <p className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400">
              OPERATIONAL REQUESTS
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedRequests.map((req) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'request', request: req })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums">
                            {req.id}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {req.title}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">
                          {req.department} · {req.status} · Owner: {req.submittedBy}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedDepartments.length > 0 && (
          <div className="p-2">
            <p className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400">
              DEPARTMENTS
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedDepartments.map((d) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={d.department}
                    type="button"
                    onClick={() =>
                      executeCommandItem({
                        kind: 'department',
                        department: d.department,
                        count: d.count,
                      })
                    }
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-900">
                        {d.department} Department
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {d.count} requests →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedAudits.length > 0 && (
          <div className="p-2">
            <p className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400">
              AUDIT LOGS
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedAudits.map((audit) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={audit.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'audit', audit })}
                    className={`flex w-full items-start justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                            {audit.requestId}
                          </span>
                          <span className="text-xs font-semibold text-slate-900">
                            {audit.actionType}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-600">
                          {audit.actorName}: {audit.details}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                      {formatDateTime(audit.timestamp)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        {/* Left: Mobile Menu + Breadcrumb / Page Title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold text-slate-900 sm:text-lg">
              {sectionMeta.title}
            </h1>
            <p className="hidden truncate text-xs text-slate-500 xl:block">
              {sectionMeta.subtitle}
            </p>
          </div>
        </div>

        {/* Center: Global Command Search (Ctrl+K / Cmd+K) */}
        <div className="relative hidden max-w-md flex-1 md:block" ref={searchContainerRef}>
          <label htmlFor="global-request-search" className="sr-only">
            Command Search across Request IDs, Titles, Departments, and Audit Logs
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              ref={desktopSearchInputRef}
              id="global-request-search"
              type="search"
              value={commandQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search Request IDs, Titles, Departments, Audit..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-16 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
              Ctrl K
            </kbd>
          </div>

          {searchOpen && (
            <div
              role="region"
              aria-label="Command search results"
              className="absolute right-0 left-0 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[11px] text-slate-500">
                <span>Instant Command Search</span>
                <span className="font-mono">↑↓ Navigate · Enter Open · Esc Close</span>
              </div>
              {renderCommandResultsBody()}
            </div>
          )}
        </div>

        {/* Right: DB Connection Pill + Sync Now, Mobile Search, Role Switcher, New Request, Bell, Profile */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {/* Live Database Connection Status & Sync Now */}
          <div className="hidden items-center gap-1.5 xl:flex">
            <span
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold whitespace-nowrap ${
                dbConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}
            >
              {dbConnected ? (
                <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              )}
              <span>
                {dbConnected ? 'Cloud Connected: Supabase' : 'Offline Storage'}
              </span>
            </span>

            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              title="Refresh data from database"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span>{isSyncing ? 'Syncing' : 'Sync Now'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen(true);
              window.setTimeout(() => mobileSearchInputRef.current?.focus(), 30);
            }}
            aria-label="Open command search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Read-Only Authenticated Role Pill (Strictly from Profile) */}
          <div
            title="Permission role assigned by your corporate profile"
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 sm:inline-flex"
          >
            {getRoleIcon(activeRole)}
            <span className="max-w-[150px] truncate font-semibold text-slate-900 whitespace-nowrap">
              {activeRole}
            </span>
          </div>

          {/* Primary Create Action */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap shrink-0 sm:px-3.5"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">New Request</span>
            <span className="sm:hidden">New</span>
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={notifOpen}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {unreadCount} unread operational alerts
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500">
                      No operational notifications yet.
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const severityIcon =
                        notif.severity === 'success' ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : notif.severity === 'warning' ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : notif.severity === 'danger' ? (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                        ) : (
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        );

                      return (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => {
                            if (notif.requestId) {
                              onSelectNotificationRequest(notif.requestId, notif.id);
                              setNotifOpen(false);
                            }
                          }}
                          className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            !notif.read ? 'bg-indigo-50/40' : 'bg-white'
                          }`}
                        >
                          {severityIcon}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-slate-900">
                                {notif.title}
                              </span>
                              {!notif.read && (
                                <span className="shrink-0 text-[10px] font-semibold text-indigo-600">
                                  Unread
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                              {notif.message}
                            </p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                                {formatDateTime(notif.timestamp)}
                              </span>
                              {notif.requestId && (
                                <span className="font-mono text-[10px] font-semibold text-indigo-600">
                                  Open {notif.requestId} →
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white pr-2 pl-1.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-display text-xs font-bold text-white">
                {currentUser.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0].toUpperCase())
                  .join('') || 'U'}
              </span>
              <span className="hidden max-w-[136px] flex-col leading-tight sm:flex">
                <span className="truncate text-[11px] font-semibold text-slate-900">
                  {currentUser.name}
                </span>
                <span className="truncate font-mono text-[10px] text-slate-500">
                  {currentUser.email}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {currentUser.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {currentUser.signOffTitle || currentUser.title}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 tabular-nums">
                    {currentUser.employeeId}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                  {currentUser.email}
                </p>
                <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                  <p className="text-[11px] font-medium text-slate-500">
                    Active Permission Tier
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                    {currentUser.role} · {currentUser.department}
                  </p>
                  {currentUser.outOfOffice && (
                    <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      Out-of-Office: Delegating to {currentUser.delegateApproverName || 'Backup Approver'}
                    </p>
                  )}
                </div>

                <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <PenTool className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>Profile &amp; Digital Signature</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onSignOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Command Search Overlay */}
      {mobileSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-16 backdrop-blur-xs md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Command Search"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={commandQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search Request IDs, Titles, Departments, Audit..."
                className="h-9 flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                aria-label="Close mobile search"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderCommandResultsBody()}
          </div>
        </div>
      )}
    </header>
  );
}
