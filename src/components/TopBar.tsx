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
  Clock,
  Cloud,
  FileSpreadsheet,
  HardDrive,
  Info,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppNotification,
  AuditEvent,
  DEFAULT_SLA_POLICY,
  Department,
  NavSection,
  OperationalRequest,
  PendingEditorChange,
  Role,
  SlaPolicyConfig,
  TeamMember,
  WorkspaceToolType,
} from '../types/nexops';
import {
  formatDateTime,
  getRequestSlaStatus,
  isRequestPendingOver24h,
  isSuperAdminEmail,
  resolveLivePresenceOverride,
} from '../utils/storage';
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
  onlinePresenceKeys?: Set<string>;
  recentlyOfflineKeys?: Set<string>;
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
  slaPolicy?: SlaPolicyConfig;
  pendingEditorChanges?: PendingEditorChange[];
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
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
  onlinePresenceKeys,
  recentlyOfflineKeys,
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
  slaPolicy = DEFAULT_SLA_POLICY,
  pendingEditorChanges = [],
  isDarkMode,
  onToggleDarkMode,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
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

  const smartSlaAlerts = useMemo(() => {
    return requests
      .filter((r) => r.status !== 'Approved' && r.status !== 'Rejected')
      .map((req) => {
        const sla = getRequestSlaStatus(req, slaPolicy, nowMs);
        const pendingOver24h = isRequestPendingOver24h(req, nowMs);
        return { request: req, sla, pendingOver24h };
      })
      .filter((entry) => entry.sla.breached || entry.pendingOver24h)
      .sort((a, b) => {
        if (a.sla.breached !== b.sla.breached) return a.sla.breached ? -1 : 1;
        if (b.sla.overdueHours !== a.sla.overdueHours) {
          return b.sla.overdueHours - a.sla.overdueHours;
        }
        return new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime();
      });
  }, [requests, slaPolicy, nowMs]);

  const pendingEditorApprovals = useMemo(() => {
    if (activeRole !== 'Admin') return [];
    return pendingEditorChanges.filter((c) => c.status === 'pending');
  }, [activeRole, pendingEditorChanges]);

  const totalAlertCount = unreadCount + smartSlaAlerts.length + pendingEditorApprovals.length;
  const isSuperAdmin = isSuperAdminEmail(currentUser.email);
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
    if (role === 'Admin')
      return <Shield className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />;
    if (role === 'Editor')
      return (
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      );
    return <User className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-300" />;
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
        <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          No matching Requests, Departments, Modules, Users, or Audit Logs found for &ldquo;{commandQuery}&rdquo;.
        </div>
      );
    }

    let runningIdx = 0;

    return (
      <div className="max-h-[60vh] divide-y divide-slate-100 overflow-x-hidden overflow-y-auto dark:divide-slate-800">
        {matchedRequests.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-xs font-bold text-indigo-700 tabular-nums dark:text-indigo-400">
                            {req.id}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {req.title}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {req.department} · {req.status} · Owner: {req.submittedBy}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedDepartments.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Building2 className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {d.department} Department
                      </span>
                    </div>
                    <span className="shrink-0 text-xs font-medium whitespace-nowrap text-slate-500 tabular-nums dark:text-slate-400">
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
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <LayoutGrid className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {mod.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {mod.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-medium whitespace-nowrap text-indigo-600 dark:text-indigo-400">
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
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
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
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {member.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {member.department} · {member.role} · {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <PresenceBadge
                        lastActiveAt={member.lastActiveAt || member.lastActive}
                        nowMs={nowMs}
                        compact
                        isOnlineOverride={resolveLivePresenceOverride(
                          member,
                          onlinePresenceKeys,
                          recentlyOfflineKeys,
                        )}
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
            <p className="px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[11px] font-bold text-slate-700 tabular-nums dark:text-slate-300">
                            {audit.requestId}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {audit.actionType}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {audit.actorName}: {audit.details}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] whitespace-nowrap text-slate-400 tabular-nums dark:text-slate-500">
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
    <header className="gpu-accelerated sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex h-16 w-full max-w-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 md:gap-2 md:px-4">
        {/* Left: Mobile Menu + Breadcrumb / Page Title */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:h-10 sm:w-10 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">
              {sectionMeta.title}
            </h1>
            <p className="hidden truncate text-xs text-slate-500 xl:block dark:text-slate-400">
              {sectionMeta.subtitle}
            </p>
          </div>
        </div>

        {/* Center: Clean Desktop Search Trigger (No Ctrl K badge) */}
        <div className="hidden shrink-0 md:block md:w-44 xl:w-56">
          <button
            id="global-request-search"
            type="button"
            onClick={openCommandPalette}
            aria-label="Search workspace"
            aria-expanded={commandOpen}
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-white focus-visible:border-indigo-500 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="truncate text-xs">
              {commandQuery.trim() ? commandQuery : 'Search workspace...'}
            </span>
          </button>
        </div>

        {/* Right: DB Connection Pill + Refresh, Mobile Search, Workspace, Role, New Request, Theme Toggle, Bell, Profile */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-1.5">
          {/* Live Database Connection Status & Refresh */}
          <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                dbConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {dbConnected ? (
                <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span>{isSyncing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command search"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Unified Workspace Launcher (Gmail, Google Docs, Google Sheets, Google Forms) */}
          {onSelectWorkspaceTool && (
            <div className="relative shrink-0" ref={workspaceMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen((prev) => !prev);
                  setNotifOpen(false);
                  setProfileOpen(false);
                }}
                aria-expanded={workspaceMenuOpen}
                aria-label="Open Workspace Suite (Gmail, Docs, Sheets, Forms)"
                className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-semibold whitespace-nowrap transition-colors sm:gap-1.5 sm:px-2.5 md:h-auto md:py-1.5 ${
                  activeSection === 'workspace' || workspaceMenuOpen
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/70 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Workspace</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>

              {workspaceMenuOpen && (
                <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-72 sm:overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Google Workspace Suite
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                              ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                              : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                            {item.renderIcon('h-5 w-5')}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                              {item.label}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
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
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-800 sm:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {getRoleIcon(activeRole)}
            <span className="font-semibold whitespace-nowrap text-slate-900 dark:text-slate-100">
              {isSuperAdmin ? (
                'Super Admin'
              ) : activeRole === 'Admin' ? (
                'Admin'
              ) : activeRole === 'Editor' ? (
                <>
                  <span>Editor</span>
                  <span className="hidden 2xl:inline"> (Maker-Checker)</span>
                </>
              ) : (
                <>
                  <span>Viewer</span>
                  <span className="hidden 2xl:inline"> (Read-Only)</span>
                </>
              )}
            </span>
          </div>

          {/* Primary Create Action (Admin or Editor Maker-Checker) */}
          {(activeRole === 'Admin' || activeRole === 'Editor') && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:gap-1.5 sm:px-3 md:h-auto md:px-2.5 md:py-1.5"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </button>
          )}

          {/* Global Dark Mode Toggle (Light / Executive Dark Theme) */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Executive Dark Mode'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 md:h-8 md:w-8 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-slate-800 dark:hover:text-amber-200"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Notification Bell */}
          <div className="relative shrink-0" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
                setProfileOpen(false);
              }}
              aria-label={`Notifications (${unreadCount} unread, ${smartSlaAlerts.length} SLA alerts)`}
              aria-expanded={notifOpen}
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 md:h-8 md:w-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Bell className="h-4 w-4" />
              {totalAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {totalAlertCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-96 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-3 sm:px-4 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Notifications
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {unreadCount} unread · {smartSlaAlerts.length} SLA alert
                      {smartSlaAlerts.length === 1 ? '' : 's'}
                      {activeRole === 'Admin' && pendingEditorApprovals.length > 0
                        ? ` · ${pendingEditorApprovals.length} editor approval${pendingEditorApprovals.length === 1 ? '' : 's'}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={onMarkAllRead}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/60"
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
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {pendingEditorApprovals.length > 0 && (
                    <div className="bg-amber-50/45 dark:bg-amber-950/20">
                      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-2 dark:border-amber-900/50">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-amber-800 dark:text-amber-300">
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Editor Change Approvals (Maker-Checker)</span>
                        </span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800 tabular-nums dark:bg-amber-900/60 dark:text-amber-200">
                          {pendingEditorApprovals.length}
                        </span>
                      </div>
                      <div className="divide-y divide-amber-100/70 dark:divide-amber-900/40">
                        {pendingEditorApprovals.slice(0, 5).map((chg) => (
                          <button
                            key={`editor-chg-${chg.id}`}
                            type="button"
                            onClick={() => {
                              onSelectSection?.('settings');
                              setNotifOpen(false);
                            }}
                            className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-amber-50/80 dark:hover:bg-amber-950/40"
                          >
                            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                                  {chg.editorName} · {chg.moduleLabel}
                                </span>
                                <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                  Pending Approval
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {chg.itemLabel}
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="truncate">{chg.summary}</span>
                                <span className="shrink-0 font-semibold text-indigo-700 dark:text-indigo-400">
                                  Review →
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {smartSlaAlerts.length > 0 && (
                    <div className="bg-rose-50/35 dark:bg-rose-950/20">
                      <div className="flex items-center justify-between border-b border-rose-100 px-4 py-2 dark:border-rose-900/50">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-rose-800 dark:text-rose-300">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Automated SLA &amp; Bottleneck Alerts</span>
                        </span>
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-800 tabular-nums dark:bg-rose-900/60 dark:text-rose-200">
                          {smartSlaAlerts.length}
                        </span>
                      </div>
                      <div className="divide-y divide-rose-100/70 dark:divide-rose-900/40">
                        {smartSlaAlerts.map(({ request, sla, pendingOver24h }) => (
                          <button
                            key={`sla-alert-${request.id}`}
                            type="button"
                            onClick={() => {
                              onSelectRequestById(request.id);
                              setNotifOpen(false);
                            }}
                            className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-rose-50/80 dark:hover:bg-rose-950/40"
                          >
                            {sla.breached ? (
                              <span
                                className="relative mt-1.5 flex h-2 w-2 shrink-0"
                                aria-hidden="true"
                              >
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
                              </span>
                            ) : (
                              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                                  {request.id} · {request.department}
                                </span>
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                    sla.breached
                                      ? 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                      : 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                  }`}
                                >
                                  {sla.breached
                                    ? sla.label
                                    : pendingOver24h
                                      ? 'Pending > 24h'
                                      : sla.label}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {request.title}
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="truncate">
                                  {request.priority} · {request.status} · {request.submittedBy}
                                </span>
                                <span className="shrink-0 font-semibold text-indigo-700 dark:text-indigo-400">
                                  Inspect →
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {visibleNotifications.length === 0 &&
                  smartSlaAlerts.length === 0 &&
                  pendingEditorApprovals.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      All active SLAs are on track and no unread notifications remain.
                    </div>
                  ) : visibleNotifications.length === 0 ? null : (
                    visibleNotifications.map((notif) => {
                      const severityIcon =
                        notif.severity === 'success' ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : notif.severity === 'warning' ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        ) : notif.severity === 'danger' ? (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        ) : (
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                        );

                      return (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => {
                            onSelectNotification(notif);
                            setNotifOpen(false);
                          }}
                          className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 ${
                            !notif.read
                              ? 'bg-indigo-50/40 dark:bg-indigo-950/30'
                              : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          {severityIcon}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                {notif.title}
                              </span>
                              {!notif.read && (
                                <span className="shrink-0 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                                  Unread
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              {notif.message}
                            </p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                                {formatDateTime(notif.timestamp)}
                              </span>
                              {(notif.requestId || notif.targetSection) && (
                                <span className="font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
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
          <div className="relative shrink-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
                setNotifOpen(false);
              }}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white pr-1.5 pl-1 text-left whitespace-nowrap transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:gap-2 sm:pr-2 sm:pl-1.5 md:h-auto md:gap-1.5 md:px-2.5 md:py-1.5 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-6 w-6 md:h-5 md:w-5"
                textClass="text-xs md:text-[10px]"
                roundedClass="rounded-md"
              />
              <span className="hidden max-w-[104px] flex-col leading-tight sm:flex 2xl:max-w-[136px]">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {currentUser.name}
                </span>
                <span className="hidden truncate font-mono text-[10px] text-slate-500 2xl:block dark:text-slate-400">
                  {currentUser.email}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            </button>

            {profileOpen && (
              <div className="fixed inset-x-4 top-16 z-40 mx-auto max-h-[calc(100vh-5rem)] w-auto max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-none sm:w-72 dark:border-slate-800 dark:bg-slate-900">
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
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {currentUser.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {currentUser.signOffTitle || currentUser.title}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {currentUser.employeeId}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {currentUser.email}
                  </p>
                  <PresenceBadge
                    lastActiveAt={currentUser.lastActiveAt || currentUser.lastActive}
                    nowMs={nowMs}
                    compact
                    isOnlineOverride={resolveLivePresenceOverride(
                      currentUser,
                      onlinePresenceKeys,
                      recentlyOfflineKeys,
                    )}
                  />
                </div>
                <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Active Permission Tier
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {isSuperAdmin ? 'Super Admin' : currentUser.role} · {currentUser.department}
                  </p>
                  {currentUser.outOfOffice && (
                    <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300">
                      Out-of-Office: Delegating to {currentUser.delegateApproverName || 'Backup Approver'}
                    </p>
                  )}
                </div>

                <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <Camera className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>Upload / Manage Profile Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenProfile();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <PenTool className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>Profile &amp; Digital Signature</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onSignOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                  >
                    <LogOut className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
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
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-16 backdrop-blur-[2px] sm:pt-24 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-label="Global Command Search"
        >
          <div className="gpu-accelerated w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-2xl sm:w-full dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <input
                ref={paletteInputRef}
                type="search"
                value={commandQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search requests, departments, modules, users..."
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {commandQuery && (
                <button
                  type="button"
                  onClick={() => {
                    handleSearchInputChange('');
                    paletteInputRef.current?.focus();
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={closeCommandPalette}
                aria-label="Close search modal"
                title="Close search"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderCommandResultsBody()}

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
              <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                Instant Workspace Search
              </span>
              <span className="shrink-0 whitespace-nowrap">
                ↑↓ Navigate · Enter Open
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
