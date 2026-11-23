import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  Camera,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  FileSpreadsheet,
  HardDrive,
  Info,
  LayoutGrid,
  LogOut,
  Menu,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppNotification,
  AuditEvent,
  Department,
  NavSection,
  OperationalRequest,
  Role,
  TeamMember,
  WorkspaceToolType,
} from '../types/nexops';
import { formatDateTime } from '../utils/storage';
import {
  GmailColorIcon,
  GoogleDocsColorIcon,
  GoogleFormsColorIcon,
  GoogleSheetsColorIcon,
} from './GoogleWorkspaceIcons';
import { PresenceBadge } from './StatusIndicator';
import { UserAvatar } from './UserAvatar';

interface TopBarProps {
  activeSection: NavSection;
  activeRole: Role;
  currentUser: TeamMember;
  teamMembers?: TeamMember[];
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
  onSelectSection?: (section: NavSection) => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
  onSelectNotification: (notification: AppNotification) => void;
  onOpenMobileMenu: () => void;
  onOpenCreateModal: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  activeWorkspaceTool?: WorkspaceToolType;
  onSelectWorkspaceTool?: (tool: WorkspaceToolType) => void;
}

const WORKSPACE_LAUNCHER_ITEMS: {
  id: WorkspaceToolType;
  label: string;
  description: string;
  renderIcon: (className?: string) => ReactNode;
}[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Corporate inbox, attachments & compose',
    renderIcon: (cls) => <GmailColorIcon className={cls} />,
  },
  {
    id: 'docs',
    label: 'Google Docs',
    description: 'Word studio & embedded documents',
    renderIcon: (cls) => <GoogleDocsColorIcon className={cls} />,
  },
  {
    id: 'sheets',
    label: 'Google Sheets',
    description: 'Spreadsheets, formulas & CSV studio',
    renderIcon: (cls) => <GoogleSheetsColorIcon className={cls} />,
  },
  {
    id: 'forms',
    label: 'Google Forms',
    description: 'Surveys, intake forms & responses',
    renderIcon: (cls) => <GoogleFormsColorIcon className={cls} />,
  },
];

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
  vault: {
    title: 'Department Document Vault',
    subtitle: 'Centralized repository for HR policies, SOPs, finance files & client contracts',
  },
  leaves: {
    title: 'Staff Attendance & Leave Management',
    subtitle: 'Daily clock-in/clock-out attendance logs, shift hours & leave approvals',
  },
  meetings: {
    title: 'Meetings & Action Items (MoM)',
    subtitle: 'Executive summaries, recorded decisions & 1-click request conversion',
  },
  workspace: {
    title: 'Workspace Tools',
    subtitle: 'Integrated Gmail corporate client, Google Docs, Google Sheets & Google Forms',
  },
  audit: {
    title: 'Activity Audit Trail & Security Logs',
    subtitle: 'Admin-only ledger of user actions, security changes & CSV compliance exports',
  },
  settings: {
    title: 'Team & Department Settings',
    subtitle: 'RBAC directory, permission matrix, cloud health diagnostics & workspace controls',
  },
};

type CommandItem =
  | { kind: 'request'; request: OperationalRequest }
  | { kind: 'department'; department: Department; count: number }
  | { kind: 'module'; section: NavSection; title: string; subtitle: string }
  | { kind: 'user'; member: TeamMember }
  | { kind: 'audit'; audit: AuditEvent };

export function TopBar({
  activeSection,
  activeRole,
  currentUser,
  teamMembers = [],
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
  onSelectSection,
  notifications,
  onMarkAllRead,
  onClearNotifications,
  onSelectNotification,
  onOpenMobileMenu,
  onOpenCreateModal,
  onOpenProfile,
  onSignOut,
  activeWorkspaceTool = 'gmail',
  onSelectWorkspaceTool,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState(globalSearch);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommandQuery(globalSearch);
  }, [globalSearch]);

  const openCommandPalette = () => {
    setNotifOpen(false);
    setProfileOpen(false);
    setWorkspaceMenuOpen(false);
    setCommandOpen(true);
    window.setTimeout(() => {
      paletteInputRef.current?.focus();
      paletteInputRef.current?.select();
    }, 20);
  };

  const closeCommandPalette = () => {
    setCommandOpen(false);
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false);
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
        setWorkspaceMenuOpen(false);
        setCommandOpen(true);
        window.setTimeout(() => {
          paletteInputRef.current?.focus();
          paletteInputRef.current?.select();
        }, 20);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const visibleNotifications = useMemo(() => {
    const userEmail = currentUser.email.trim().toLowerCase();
    return notifications.filter((n) => {
      if (n.recipientEmail) {
        return n.recipientEmail.trim().toLowerCase() === userEmail;
      }
      if (n.recipientRole && n.recipientRole !== 'all') {
        return n.recipientRole === activeRole;
      }
      return true;
    });
  }, [notifications, currentUser.email, activeRole]);

  const unreadCount = visibleNotifications.filter((n) => !n.read).length;
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

    const availableModules = (Object.keys(SECTION_TITLES) as NavSection[])
      .filter((section) => activeRole === 'Admin' || (section !== 'audit' && section !== 'settings'))
      .map((section) => ({
        section,
        title: SECTION_TITLES[section].title,
        subtitle: SECTION_TITLES[section].subtitle,
      }));

    const matchedModules = (
      q
        ? availableModules.filter(
            (m) =>
              m.title.toLowerCase().includes(q) ||
              m.subtitle.toLowerCase().includes(q) ||
              m.section.toLowerCase().includes(q),
          )
        : availableModules
    ).slice(0, 5);

    const activeUsers = teamMembers.filter(
      (m) => m.active && (m.approvalStatus ?? 'approved') === 'approved',
    );
    const matchedUsers = (
      q
        ? activeUsers.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.email.toLowerCase().includes(q) ||
              m.department.toLowerCase().includes(q) ||
              m.employeeId.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 4);

    const matchedAudits =
      activeRole === 'Admin'
        ? (q
            ? auditLogs.filter(
                (a) =>
                  a.requestId.toLowerCase().includes(q) ||
                  a.actorName.toLowerCase().includes(q) ||
                  (a.actorEmail ?? '').toLowerCase().includes(q) ||
                  a.actorRole.toLowerCase().includes(q) ||
                  a.actionType.toLowerCase().includes(q) ||
                  a.details.toLowerCase().includes(q),
              )
            : auditLogs
          ).slice(0, 4)
        : [];

    const flatItems: CommandItem[] = [
      ...matchedRequests.map((request) => ({ kind: 'request' as const, request })),
      ...matchedDepartments.map((d) => ({
        kind: 'department' as const,
        department: d.department,
        count: d.count,
      })),
      ...matchedModules.map((mod) => ({
        kind: 'module' as const,
        section: mod.section,
        title: mod.title,
        subtitle: mod.subtitle,
      })),
      ...matchedUsers.map((member) => ({ kind: 'user' as const, member })),
      ...matchedAudits.map((audit) => ({ kind: 'audit' as const, audit })),
    ];

    return {
      matchedRequests,
      matchedDepartments,
      matchedModules,
      matchedUsers,
      matchedAudits,
      flatItems,
    };
  }, [commandQuery, requests, departments, teamMembers, auditLogs, activeRole]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [commandQuery]);

  const executeCommandItem = (item: CommandItem) => {
    if (item.kind === 'request') {
      onSelectRequestById(item.request.id);
    } else if (item.kind === 'department') {
      onSelectDepartment(item.department);
    } else if (item.kind === 'module') {
      onSelectSection?.(item.section);
    } else if (item.kind === 'user') {
      if (item.member.id === currentUser.id) {
        onOpenProfile();
      } else if (activeRole === 'Admin') {
        onSelectSection?.('settings');
      } else {
        onSelectSection?.('dashboard');
      }
    } else {
      onSelectAuditMatch(item.audit);
    }
    closeCommandPalette();
  };

  const handleSearchInputChange = (val: string) => {
    setCommandQuery(val);
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
      closeCommandPalette();
    }
  };

  const getRoleIcon = (role: Role) => {
    if (role === 'Admin') return <Shield className="h-3.5 w-3.5 text-indigo-600 shrink-0" />;
    if (role === 'Editor')
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
    return <User className="h-3.5 w-3.5 text-slate-600 shrink-0" />;
  };

  const renderCommandResultsBody = () => {
    const {
      matchedRequests,
      matchedDepartments,
      matchedModules,
      matchedUsers,
      matchedAudits,
      flatItems,
    } = commandResults;
    if (flatItems.length === 0) {
      return (
        <div className="px-4 py-10 text-center text-xs text-slate-500">
          No matching Requests, Departments, Modules, Users, or Audit Logs found for &ldquo;{commandQuery}&rdquo;.
        </div>
      );
    }

    let runningIdx = 0;

    return (
      <div className="max-h-[60vh] divide-y divide-slate-100 overflow-x-hidden overflow-y-auto">
        {matchedRequests.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-xs font-bold text-indigo-700 tabular-nums">
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
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="truncate text-xs font-semibold text-slate-900">
                        {d.department} Department
                      </span>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500 tabular-nums">
                      {d.count} requests →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedModules.length > 0 && onSelectSection && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">
              MODULES
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedModules.map((mod) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={mod.section}
                    type="button"
                    onClick={() =>
                      executeCommandItem({
                        kind: 'module',
                        section: mod.section,
                        title: mod.title,
                        subtitle: mod.subtitle,
                      })
                    }
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <LayoutGrid className="h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {mod.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">{mod.subtitle}</p>
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium text-indigo-600">
                      Open →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedUsers.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">
              USERS
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedUsers.map((member) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'user', member })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar
                        name={member.name}
                        avatarUrl={member.avatarUrl}
                        sizeClass="h-7 w-7"
                        textClass="text-[11px]"
                        roundedClass="rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {member.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {member.department} · {member.role} · {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <PresenceBadge
                        lastActiveAt={member.lastActiveAt || member.lastActive}
                        nowMs={nowMs}
                        compact
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedAudits.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      isHighlighted ? 'bg-indigo-50 text-indigo-950' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[11px] font-bold text-slate-700 tabular-nums">
                            {audit.requestId}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {audit.actionType}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-600">
                          {audit.actorName}: {audit.details}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400 tabular-nums">
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
    <>
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      <div className="flex h-16 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        {/* Left: Mobile Menu + Breadcrumb / Page Title */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:h-10 sm:w-10 lg:hidden"
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

        {/* Center: Global Command Search Trigger (opens centered Ctrl+K palette modal) */}
        <div className="hidden max-w-md flex-1 md:block">
          <button
            id="global-request-search"
            type="button"
            onClick={openCommandPalette}
            aria-label="Open Command Search (Ctrl K)"
            aria-expanded={commandOpen}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white focus-visible:border-indigo-500 focus-visible:outline-none"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate text-xs sm:text-sm">
                {commandQuery.trim()
                  ? commandQuery
                  : 'Search requests, departments, modules...'}
              </span>
            </span>
            <kbd className="shrink-0 whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: DB Connection Pill + Sync Now, Mobile Search, Role Switcher, New Request, Bell, Profile */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
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
            onClick={openCommandPalette}
            aria-label="Open command search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Unified Workspace Launcher (Gmail, Google Docs, Google Sheets, Google Forms) */}
          {onSelectWorkspaceTool && (
            <div className="relative" ref={workspaceMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen((prev) => !prev);
                  setNotifOpen(false);
                  setProfileOpen(false);
                }}
                aria-expanded={workspaceMenuOpen}
                aria-label="Open Workspace Suite (Gmail, Docs, Sheets, Forms)"
                className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-xs font-semibold transition-colors whitespace-nowrap sm:gap-1.5 sm:px-2.5 ${
                  activeSection === 'workspace' || workspaceMenuOpen
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span className="hidden sm:inline">Workspace</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>

              {workspaceMenuOpen && (
                <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-72 sm:overflow-hidden">
                  <div className="border-b border-slate-100 px-2.5 py-2">
                    <p className="text-xs font-bold text-slate-900">Google Workspace Suite</p>
                    <p className="text-[11px] text-slate-500">
                      Open directly inside NexOps Enterprise Hub
                    </p>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {WORKSPACE_LAUNCHER_ITEMS.map((item) => {
                      const isToolSelected =
                        activeSection === 'workspace' && activeWorkspaceTool === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            onSelectWorkspaceTool(item.id);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            isToolSelected
                              ? 'bg-indigo-50 text-indigo-900'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                            {item.renderIcon('h-5 w-5')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-900">
                              {item.label}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {item.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Read-Only Authenticated Role Pill (Strictly from Profile) */}
          <div
            title="Permission role assigned by your corporate profile"
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 sm:inline-flex"
          >
            {getRoleIcon(activeRole)}
            <span className="max-w-[160px] truncate font-semibold text-slate-900 whitespace-nowrap">
              {activeRole === 'Admin' ? 'Admin' : 'Viewer (Read-Only)'}
            </span>
          </div>

          {/* Primary Create Action (strictly Admin only) */}
          {activeRole === 'Admin' && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 whitespace-nowrap shrink-0 sm:gap-1.5 sm:px-3.5"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </button>
          )}

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
                setProfileOpen(false);
              }}
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
              <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-96">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-3 sm:px-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {unreadCount} unread alerts
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
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
                    {visibleNotifications.length > 0 && (
                      <button
                        type="button"
                        onClick={onClearNotifications}
                        title="Clear all notifications"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {visibleNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500">
                      No notifications in your feed yet.
                    </div>
                  ) : (
                    visibleNotifications.map((notif) => {
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
                            onSelectNotification(notif);
                            setNotifOpen(false);
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
                              {(notif.requestId || notif.targetSection) && (
                                <span className="font-mono text-[10px] font-semibold text-indigo-600">
                                  {notif.requestId ? `Open ${notif.requestId} →` : 'View →'}
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
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
                setNotifOpen(false);
              }}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white pr-1.5 pl-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:gap-2 sm:pr-2 sm:pl-1.5"
            >
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-6 w-6"
                textClass="text-xs"
                roundedClass="rounded-md"
              />
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
              <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-72">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar
                      name={currentUser.name}
                      avatarUrl={currentUser.avatarUrl}
                      sizeClass="h-9 w-9"
                      textClass="text-xs"
                      roundedClass="rounded-lg"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {currentUser.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {currentUser.signOffTitle || currentUser.title}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 tabular-nums">
                    {currentUser.employeeId}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate font-mono text-[11px] text-slate-400">
                    {currentUser.email}
                  </p>
                  <PresenceBadge
                    lastActiveAt={currentUser.lastActiveAt || currentUser.lastActive}
                    nowMs={nowMs}
                    compact
                  />
                </div>
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
                    <Camera className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>Upload / Manage Profile Photo</span>
                  </button>
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
    </header>

      {/* Centered Wide Command Search Palette Modal (Desktop & Mobile) */}
      {commandOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCommandPalette();
          }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-16 backdrop-blur-[2px] sm:pt-24"
          role="dialog"
          aria-modal="true"
          aria-label="Global Command Search"
        >
          <div className="w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-2xl sm:w-full">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                ref={paletteInputRef}
                type="search"
                value={commandQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search requests, departments, modules, users..."
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {commandQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchInputChange('')}
                  aria-label="Clear search query"
                  className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={closeCommandPalette}
                aria-label="Close command search"
                className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                Esc
              </button>
            </div>

            {renderCommandResultsBody()}

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500">
              <span className="truncate font-semibold text-slate-600">
                Instant Command Search
              </span>
              <span className="shrink-0 whitespace-nowrap">
                ↑↓ Navigate · Enter Open · Esc Close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
