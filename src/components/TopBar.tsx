import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Cloud,
  FileSpreadsheet,
  FolderLock,
  HardDrive,
  Info,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppNotification,
  AttendanceLog,
  AuditEvent,
  CalendarEvent,
  CompanyAnnouncement,
  DEFAULT_SLA_POLICY,
  Department,
  DocumentVaultItem,
  LeaveRequest,
  MeetingMinute,
  NavSection,
  OperationalRequest,
  PendingEditorChange,
  Role,
  SlaPolicyConfig,
  SopDocument,
  TeamMember,
  ThemePreference,
  WorkspaceToolType,
} from '../types/nexops';
import {
  formatDateTime,
  getRequestSlaStatus,
  isAnnouncementActive,
  isPrivateCommsAuditEvent,
  isRequestPendingOver24h,
  isSuperAdminEmail,
  maskSensitiveIdentifiers,
  resolveLivePresenceOverride,
} from '../utils/storage';
import type { ViewportInfo } from '../hooks/useViewport';
import {
  GmailColorIcon,
  GoogleDocsColorIcon,
  GoogleFormsColorIcon,
  GoogleMeetColorIcon,
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
  sops?: SopDocument[];
  vaultDocuments?: DocumentVaultItem[];
  meetings?: MeetingMinute[];
  calendarEvents?: CalendarEvent[];
  announcements?: CompanyAnnouncement[];
  attendanceLogs?: AttendanceLog[];
  leaves?: LeaveRequest[];
  dbConnected: boolean;
  lastSyncError?: string | null;
  isSyncing: boolean;
  onSyncNow: () => void;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
  onSelectRequestById: (requestId: string) => void;
  onSelectDepartment: (department: Department) => void;
  onSelectAuditMatch: (audit: AuditEvent) => void;
  onSelectSection?: (section: NavSection) => void;
  onSelectSopById?: (sopId: string) => void;
  onSelectVaultDocById?: (docId: string) => void;
  onSelectMeetingById?: (meetingId: string) => void;
  onSelectCalendarDate?: (dateKey: string) => void;
  onSelectAnnouncementById?: (announcementId: string) => void;
  onSelectLeaveOrAttendance?: (query: string) => void;
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
  unreadCommsCount?: number;
  slaPolicy?: SlaPolicyConfig;
  pendingEditorChanges?: PendingEditorChange[];
  isDarkMode: boolean;
  themePreference?: ThemePreference;
  onToggleDarkMode: () => void;
  onSetThemePreference?: (pref: ThemePreference) => void;
  viewport?: ViewportInfo;
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
  calendar: {
    title: 'Enterprise Calendar',
    subtitle: 'Monthly & weekly schedule, milestones, MoM sessions & leave visibility',
  },
  mailchat: {
    title: 'Mail & Chat Hub',
    subtitle: 'Corporate inbox, real-time team chat & instant Google Meet calls',
  },
  workspace: {
    title: 'Workspace Tools',
    subtitle: 'Integrated Gmail corporate client, Google Docs, Google Sheets & Google Forms',
  },
  audit: {
    title: 'Activity Audit Trail & Security Logs',
    subtitle: 'Admin-only ledger of user actions, security changes & CSV compliance exports',
  },
  user_settings: {
    title: 'Settings',
    subtitle: 'Appearance, typography, cloud storage quota, notifications & account security',
  },
  settings: {
    title: 'Team & Department Settings',
    subtitle: 'RBAC directory, permission matrix, cloud health diagnostics & workspace controls',
  },
};

type CommandItem =
  | { kind: 'request'; request: OperationalRequest }
  | { kind: 'sop'; sop: SopDocument }
  | { kind: 'vault'; doc: DocumentVaultItem }
  | { kind: 'meeting'; meeting: MeetingMinute }
  | { kind: 'calendar'; event: CalendarEvent }
  | { kind: 'announcement'; announcement: CompanyAnnouncement }
  | { kind: 'leave'; leave: LeaveRequest }
  | { kind: 'attendance'; log: AttendanceLog }
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
  sops = [],
  vaultDocuments = [],
  meetings = [],
  calendarEvents = [],
  announcements = [],
  attendanceLogs = [],
  leaves = [],
  dbConnected,
  lastSyncError,
  isSyncing,
  onSyncNow,
  globalSearch,
  onGlobalSearchChange,
  onSelectRequestById,
  onSelectDepartment,
  onSelectAuditMatch,
  onSelectSection,
  onSelectSopById,
  onSelectVaultDocById,
  onSelectMeetingById,
  onSelectCalendarDate,
  onSelectAnnouncementById,
  onSelectLeaveOrAttendance,
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
  unreadCommsCount = 0,
  slaPolicy = DEFAULT_SLA_POLICY,
  pendingEditorChanges = [],
  isDarkMode,
  themePreference = 'system',
  onToggleDarkMode,
  onSetThemePreference,
  viewport,
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState(globalSearch);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const notifRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommandQuery(globalSearch);
  }, [globalSearch]);

  const openCommandPalette = () => {
    setNotifOpen(false);
    setProfileOpen(false);
    setWorkspaceMenuOpen(false);
    setCommandOpen(true);
    const isSmallViewport = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isSmallViewport) {
      setMobileSearchOpen(true);
      window.setTimeout(() => {
        mobileInputRef.current?.focus();
      }, 20);
    } else {
      window.setTimeout(() => {
        desktopInputRef.current?.focus();
      }, 20);
    }
  };

  const closeCommandPalette = () => {
    setCommandOpen(false);
    setMobileSearchOpen(false);
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        notifRef.current &&
        !notifRef.current.contains(target) &&
        (!notifMenuRef.current || !notifMenuRef.current.contains(target))
      ) {
        setNotifOpen(false);
      }
      if (
        profileRef.current &&
        !profileRef.current.contains(target) &&
        (!profileMenuRef.current || !profileMenuRef.current.contains(target))
      ) {
        setProfileOpen(false);
      }
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(target) &&
        (!workspaceDropdownRef.current || !workspaceDropdownRef.current.contains(target))
      ) {
        setWorkspaceMenuOpen(false);
      }
      const insideDesktopSearch = Boolean(
        desktopSearchRef.current && desktopSearchRef.current.contains(target),
      );
      const insideMobileSearch = Boolean(
        mobileSearchRef.current && mobileSearchRef.current.contains(target),
      );
      if (!insideDesktopSearch && !insideMobileSearch) {
        setCommandOpen(false);
        setMobileSearchOpen(false);
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
        if (window.innerWidth < 768) {
          setMobileSearchOpen(true);
          window.setTimeout(() => {
            mobileInputRef.current?.focus();
            mobileInputRef.current?.select();
          }, 20);
        } else {
          window.setTimeout(() => {
            desktopInputRef.current?.focus();
            desktopInputRef.current?.select();
          }, 20);
        }
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setMobileSearchOpen(false);
        setNotifOpen(false);
        setProfileOpen(false);
        setWorkspaceMenuOpen(false);
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
    const selfEmailLower = currentUser.email.trim().toLowerCase();

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
    ).slice(0, 4);

    const matchedSops = (
      q
        ? sops.filter(
            (s) =>
              s.code.toLowerCase().includes(q) ||
              s.title.toLowerCase().includes(q) ||
              s.department.toLowerCase().includes(q) ||
              s.category.toLowerCase().includes(q) ||
              s.authorName.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 4);

    const visibleVaultDocs = vaultDocuments.filter((doc) => {
      if (activeRole === 'Admin') return true;
      if (doc.accessTag === 'Admin Restricted') return false;
      if (doc.accessTag === 'Editors & Admins' && activeRole === 'Viewer') return false;
      if (doc.accessTag === 'Department Only') {
        return doc.department.toLowerCase() === currentUser.department.toLowerCase();
      }
      return true;
    });

    const matchedVaultDocs = (
      q
        ? visibleVaultDocs.filter(
            (d) =>
              d.title.toLowerCase().includes(q) ||
              d.folder.toLowerCase().includes(q) ||
              d.department.toLowerCase().includes(q) ||
              d.uploadedBy.toLowerCase().includes(q) ||
              (d.fileName ?? '').toLowerCase().includes(q),
          )
        : []
    ).slice(0, 4);

    const matchedMeetings = (
      q
        ? meetings.filter(
            (m) =>
              m.code.toLowerCase().includes(q) ||
              m.title.toLowerCase().includes(q) ||
              m.department.toLowerCase().includes(q) ||
              m.facilitator.toLowerCase().includes(q) ||
              m.summary.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 4);

    const matchedCalendarEvents = (
      q
        ? calendarEvents.filter(
            (ev) =>
              ev.title.toLowerCase().includes(q) ||
              ev.type.toLowerCase().includes(q) ||
              ev.department.toLowerCase().includes(q) ||
              ev.createdBy.toLowerCase().includes(q) ||
              ev.date.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 4);

    const activeAnnouncements = announcements.filter((a) => isAnnouncementActive(a, nowMs));
    const matchedAnnouncements = (
      q
        ? activeAnnouncements.filter(
            (a) =>
              a.title.toLowerCase().includes(q) ||
              a.message.toLowerCase().includes(q) ||
              a.priorityTag.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 3);

    const scopedLeaves =
      activeRole === 'Admin'
        ? leaves
        : leaves.filter(
            (l) =>
              (l.employeeEmail && l.employeeEmail.trim().toLowerCase() === selfEmailLower) ||
              l.employeeId === currentUser.employeeId ||
              l.employeeName.trim().toLowerCase() === currentUser.name.trim().toLowerCase(),
          );
    const matchedLeaves = (
      q
        ? scopedLeaves.filter(
            (l) =>
              l.code.toLowerCase().includes(q) ||
              l.employeeName.toLowerCase().includes(q) ||
              l.department.toLowerCase().includes(q) ||
              l.leaveType.toLowerCase().includes(q) ||
              l.status.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 3);

    const scopedAttendance =
      activeRole === 'Admin'
        ? attendanceLogs
        : attendanceLogs.filter(
            (a) =>
              a.userId === currentUser.id ||
              a.userEmail.trim().toLowerCase() === selfEmailLower,
          );
    const matchedAttendance = (
      q
        ? scopedAttendance.filter(
            (a) =>
              a.userName.toLowerCase().includes(q) ||
              a.department.toLowerCase().includes(q) ||
              a.attendanceDate.toLowerCase().includes(q) ||
              a.status.toLowerCase().includes(q),
          )
        : []
    ).slice(0, 3);

    const matchedDepartments = (
      q
        ? departments.filter((dept) => dept.toLowerCase().includes(q))
        : departments.slice(0, 4)
    ).map((department) => ({
      department,
      count: requests.filter((r) => r.department === department).length,
    }));

    const availableModules = (Object.keys(SECTION_TITLES) as NavSection[])
      .filter(
        (section) =>
          (activeRole === 'Admin' && isSuperAdmin) ||
          (section !== 'audit' && section !== 'settings'),
      )
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

    const sanitizedAudits = auditLogs.filter((a) => !isPrivateCommsAuditEvent(a));
    const matchedAudits =
      activeRole === 'Admin' && isSuperAdmin && q
        ? sanitizedAudits
            .filter(
              (a) =>
                a.requestId.toLowerCase().includes(q) ||
                a.actorName.toLowerCase().includes(q) ||
                (a.actorEmail ?? '').toLowerCase().includes(q) ||
                a.actorRole.toLowerCase().includes(q) ||
                a.actionType.toLowerCase().includes(q) ||
                a.details.toLowerCase().includes(q),
            )
            .slice(0, 3)
        : [];

    const flatItems: CommandItem[] = [
      ...matchedModules.map((mod) => ({
        kind: 'module' as const,
        section: mod.section,
        title: mod.title,
        subtitle: mod.subtitle,
      })),
      ...matchedRequests.map((request) => ({ kind: 'request' as const, request })),
      ...matchedVaultDocs.map((doc) => ({ kind: 'vault' as const, doc })),
      ...matchedSops.map((sop) => ({ kind: 'sop' as const, sop })),
      ...matchedMeetings.map((meeting) => ({ kind: 'meeting' as const, meeting })),
      ...matchedCalendarEvents.map((event) => ({ kind: 'calendar' as const, event })),
      ...matchedAnnouncements.map((announcement) => ({ kind: 'announcement' as const, announcement })),
      ...matchedLeaves.map((leave) => ({ kind: 'leave' as const, leave })),
      ...matchedAttendance.map((log) => ({ kind: 'attendance' as const, log })),
      ...matchedDepartments.map((d) => ({
        kind: 'department' as const,
        department: d.department,
        count: d.count,
      })),
      ...matchedUsers.map((member) => ({ kind: 'user' as const, member })),
      ...matchedAudits.map((audit) => ({ kind: 'audit' as const, audit })),
    ];

    return {
      matchedRequests,
      matchedSops,
      matchedVaultDocs,
      matchedMeetings,
      matchedCalendarEvents,
      matchedAnnouncements,
      matchedLeaves,
      matchedAttendance,
      matchedDepartments,
      matchedModules,
      matchedUsers,
      matchedAudits,
      flatItems,
    };
  }, [
    commandQuery,
    requests,
    sops,
    vaultDocuments,
    meetings,
    calendarEvents,
    announcements,
    leaves,
    attendanceLogs,
    departments,
    teamMembers,
    auditLogs,
    activeRole,
    isSuperAdmin,
    currentUser.department,
    currentUser.email,
    currentUser.employeeId,
    currentUser.id,
    currentUser.name,
    nowMs,
  ]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [commandQuery]);

  const executeCommandItem = (item: CommandItem) => {
    if (item.kind === 'request') {
      onSelectRequestById(item.request.id);
    } else if (item.kind === 'sop') {
      if (onSelectSopById) {
        onSelectSopById(item.sop.id);
      } else {
        onSelectSection?.('sops');
      }
    } else if (item.kind === 'vault') {
      if (onSelectVaultDocById) {
        onSelectVaultDocById(item.doc.id);
      } else {
        onSelectSection?.('vault');
      }
    } else if (item.kind === 'meeting') {
      if (onSelectMeetingById) {
        onSelectMeetingById(item.meeting.id);
      } else {
        onSelectSection?.('meetings');
      }
    } else if (item.kind === 'calendar') {
      if (onSelectCalendarDate) {
        onSelectCalendarDate(item.event.date);
      } else {
        onSelectSection?.('calendar');
      }
    } else if (item.kind === 'announcement') {
      if (onSelectAnnouncementById) {
        onSelectAnnouncementById(item.announcement.id);
      } else {
        onSelectSection?.('dashboard');
      }
    } else if (item.kind === 'leave') {
      if (onSelectLeaveOrAttendance) {
        onSelectLeaveOrAttendance(item.leave.code);
      } else {
        onSelectSection?.('leaves');
      }
    } else if (item.kind === 'attendance') {
      if (onSelectLeaveOrAttendance) {
        onSelectLeaveOrAttendance(item.log.userName);
      } else {
        onSelectSection?.('leaves');
      }
    } else if (item.kind === 'department') {
      onSelectDepartment(item.department);
    } else if (item.kind === 'module') {
      onSelectSection?.(item.section);
    } else if (item.kind === 'user') {
      if (item.member.id === currentUser.id) {
        onOpenProfile();
      } else if (activeRole === 'Admin' && isSuperAdmin) {
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
    setCommandOpen(true);
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
      matchedSops,
      matchedVaultDocs,
      matchedMeetings,
      matchedCalendarEvents,
      matchedAnnouncements,
      matchedLeaves,
      matchedAttendance,
      matchedDepartments,
      matchedModules,
      matchedUsers,
      matchedAudits,
      flatItems,
    } = commandResults;
    if (flatItems.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No workspace records matched &ldquo;{commandQuery}&rdquo;. Private 1-on-1 chats and direct mails are never indexed globally.
        </div>
      );
    }

    let runningIdx = 0;

    return (
      <div className="max-h-[60dvh] divide-y divide-slate-100 overflow-x-hidden overflow-y-auto dark:divide-slate-800">
        {matchedModules.length > 0 && onSelectSection && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                    <span className="shrink-0 text-[11px] font-semibold whitespace-nowrap text-indigo-600 dark:text-indigo-400">
                      Jump →
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {matchedRequests.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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

        {matchedVaultDocs.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              DOCUMENT VAULT
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedVaultDocs.map((doc) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'vault', doc })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <FolderLock className="h-4 w-4 shrink-0 text-slate-700 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {doc.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {doc.folder} · {doc.department} · {doc.currentVersion || 'v1.0'}
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

        {matchedSops.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              SOP &amp; POLICY VAULT
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedSops.map((sop) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={sop.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'sop', sop })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <BookOpen className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {sop.code} · {sop.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {sop.department} · {sop.category} · {sop.version}
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

        {matchedMeetings.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              MEETINGS &amp; MOM
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedMeetings.map((meeting) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'meeting', meeting })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Users className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {meeting.code} · {meeting.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {meeting.department} · {meeting.meetingDate} · {meeting.facilitator}
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

        {matchedCalendarEvents.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              CALENDAR EVENTS
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedCalendarEvents.map((ev) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'calendar', event: ev })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Calendar className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ev.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {ev.date} {ev.time} · {ev.type} · {ev.department}
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

        {matchedAnnouncements.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              CIRCULARS &amp; NOTICES
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedAnnouncements.map((ann) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={ann.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'announcement', announcement: ann })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Megaphone className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ann.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          [{ann.priorityTag}] · {ann.message}
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

        {(matchedLeaves.length > 0 || matchedAttendance.length > 0) && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              ATTENDANCE &amp; LEAVES
            </p>
            <div className="mt-0.5 space-y-0.5">
              {matchedLeaves.map((lve) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={lve.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'leave', leave: lve })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {lve.code} · {lve.employeeName} ({lve.leaveType})
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {lve.startDate} → {lve.endDate} · {lve.status}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                );
              })}
              {matchedAttendance.map((att) => {
                const currentIdx = runningIdx++;
                const isHighlighted = currentIdx === highlightedIdx;
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => executeCommandItem({ kind: 'attendance', log: att })}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {att.userName} · {att.attendanceDate}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {att.department} · {att.status}
                          {typeof att.totalHours === 'number' ? ` · ${att.totalHours.toFixed(2)}h` : ''}
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
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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

        {matchedUsers.length > 0 && (
          <div className="p-2">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
              TEAM DIRECTORY
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
            <p className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                          {audit.actorName}: {maskSensitiveIdentifiers(audit.details)}
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

  const isCompactMobile = viewport ? viewport.isMobile : false;
  const isXsMobile = viewport ? viewport.isXs : false;

  return (
    <>
    <header className="gpu-accelerated sticky top-0 z-30 w-full max-w-full border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex h-16 w-full min-w-0 max-w-[1680px] items-center justify-between gap-1.5 overflow-x-clip px-2.5 sm:gap-3 sm:px-6 lg:px-8 2xl:px-10">
        {/* Left: Mobile/Tablet Menu + Breadcrumb / Page Title */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:h-9 sm:w-9 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-sm font-bold text-slate-900 sm:text-base lg:text-lg dark:text-slate-100">
              {sectionMeta.title}
            </h1>
            <p className="hidden truncate text-xs text-slate-500 xl:block dark:text-slate-400">
              {sectionMeta.subtitle}
            </p>
          </div>
        </div>

        {/* Center: Live Instant Jump Search (Tablet/Desktop) */}
        <div
          ref={desktopSearchRef}
          className="relative hidden shrink-0 md:block md:w-44 lg:w-56 xl:w-64 2xl:w-72"
        >
          <div className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-indigo-500 focus-within:bg-white dark:border-slate-700 dark:bg-slate-950 dark:focus-within:bg-slate-900">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <input
              ref={desktopInputRef}
              id="global-request-search"
              type="search"
              value={commandQuery}
              onFocus={() => {
                setNotifOpen(false);
                setProfileOpen(false);
                setWorkspaceMenuOpen(false);
                setCommandOpen(true);
              }}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search workspace..."
              aria-label="Search workspace"
              aria-expanded={commandOpen}
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {commandQuery ? (
              <button
                type="button"
                onClick={() => {
                  handleSearchInputChange('');
                  desktopInputRef.current?.focus();
                }}
                aria-label="Clear workspace search"
                className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <span className="hidden shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[9px] font-semibold text-slate-400 lg:inline dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
                Ctrl+K
              </span>
            )}
          </div>

          {commandOpen && (
            <div
              role="dialog"
              aria-label="Instant Workspace Jump Search"
              className="fixed top-[68px] right-3 z-50 w-[min(640px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-2xl md:absolute md:top-10 md:right-auto md:left-1/2 md:-translate-x-1/2 dark:border-slate-800 dark:bg-slate-900"
            >
              {renderCommandResultsBody()}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/90 px-3.5 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-400">
                <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                  Instant Jump Search · Modules, Records &amp; People
                </span>
                <span className="shrink-0 whitespace-nowrap">↑↓ · Enter · Esc</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: DB Connection Pill + Refresh, Mobile Search, Workspace, Role, New Request, Theme Toggle, Bell, Profile */}
        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5 xl:gap-2">
          {/* Live Database Connection Status & Refresh (Desktop xl+ inline; accessible inside Profile on compact screens) */}
          <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
            <span
              title={
                lastSyncError
                  ? `Supabase Sync Error: ${lastSyncError}`
                  : dbConnected
                    ? 'Connected to live Supabase Cloud Sync (nexops_system_state)'
                    : 'Offline Storage active (unable to reach Supabase)'
              }
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold whitespace-nowrap 2xl:px-2.5 ${
                lastSyncError
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300'
                  : dbConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {lastSyncError ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : dbConnected ? (
                <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              )}
              <span className="hidden 2xl:inline">
                {lastSyncError
                  ? 'Sync Warning'
                  : dbConnected
                    ? 'Cloud Connected: Supabase'
                    : 'Offline Storage'}
              </span>
              <span className="2xl:hidden">
                {lastSyncError ? 'Sync Warn' : dbConnected ? 'Supabase' : 'Offline'}
              </span>
            </span>

            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              aria-label="Refresh data from database"
              title="Refresh data from database"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 2xl:h-auto 2xl:w-auto 2xl:px-2.5 2xl:py-1.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span className="hidden 2xl:inline">{isSyncing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command search"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:h-9 sm:w-9 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Unified Workspace Launcher (Gmail, Google Docs, Google Sheets, Google Forms) */}
          {onSelectWorkspaceTool && (
            <div className="shrink-0" ref={workspaceMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen((prev) => !prev);
                  setNotifOpen(false);
                  setProfileOpen(false);
                }}
                aria-expanded={workspaceMenuOpen}
                aria-label="Open Workspace Suite (Gmail, Docs, Sheets, Forms)"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-lg border text-xs font-semibold whitespace-nowrap transition-colors sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2.5 md:h-8 ${
                  activeSection === 'workspace' || activeSection === 'mailchat' || workspaceMenuOpen
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/70 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                {!isCompactMobile && <span className="hidden sm:inline">Workspace</span>}
                <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:inline" />
              </button>
            </div>
          )}

          {/* Read-Only Authenticated Role Pill (Strictly from Profile) */}
          <div
            title="Permission role assigned by your corporate profile"
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-800 xl:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
              aria-label="New Request"
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-indigo-600 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:h-9 sm:gap-1.5 sm:px-3 md:h-8 md:px-2.5 ${
                isXsMobile ? 'w-8 justify-center px-0' : 'px-2'
              }`}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">New Request</span>
              {!isXsMobile && <span className="sm:hidden">New</span>}
            </button>
          )}

          {/* Global Dark Mode Toggle (Auto Device Detection + Manual Override) */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={
              themePreference === 'system'
                ? `Auto Device Theme (${isDarkMode ? 'Dark' : 'Light'}) — Click to override`
                : `Manual ${isDarkMode ? 'Dark' : 'Light'} Mode — Click to switch`
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:h-9 sm:w-9 md:h-8 md:w-8 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-slate-800 dark:hover:text-amber-200"
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
              className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:h-9 sm:w-9 md:h-8 md:w-8 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Bell className="h-4 w-4" />
              {totalAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {totalAlertCount}
                </span>
              )}
            </button>
          </div>

          {/* User Profile Trigger */}
          <div className="shrink-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setWorkspaceMenuOpen(false);
                setNotifOpen(false);
              }}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 text-left whitespace-nowrap transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:h-9 sm:gap-1.5 sm:px-2 md:h-8 md:px-2 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-5 w-5 sm:h-6 sm:w-6 md:h-5 md:w-5"
                textClass="text-[10px] sm:text-xs md:text-[10px]"
                roundedClass="rounded-md"
              />
              <span className="hidden max-w-[96px] flex-col leading-tight lg:flex 2xl:max-w-[136px]">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {currentUser.name}
                </span>
                <span className="hidden truncate font-mono text-[10px] text-slate-500 2xl:block dark:text-slate-400">
                  {currentUser.email}
                </span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-500 sm:inline dark:text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Viewport-Safe Anchored Workspace Launcher Dropdown */}
      {onSelectWorkspaceTool && workspaceMenuOpen && (
        <div
          ref={workspaceDropdownRef}
          className="absolute top-[calc(100%+8px)] right-2.5 z-50 max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-20px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:right-6 sm:w-80 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Google Workspace Suite
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Open directly inside NexOps Enterprise Hub
            </p>
          </div>
          <div className="mt-1.5 space-y-1">
            {onSelectSection && (
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMenuOpen(false);
                  onSelectSection('mailchat');
                }}
                className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  activeSection === 'mailchat'
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100'
                    : 'border-slate-200/80 bg-slate-50/70 text-slate-800 hover:bg-indigo-50/60 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white dark:border-indigo-800 dark:bg-slate-900">
                  <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                      Mail &amp; Chat Hub
                    </span>
                    {unreadCommsCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white tabular-nums">
                        {unreadCommsCount}
                      </span>
                    ) : (
                      <GoogleMeetColorIcon className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    Mail compose, live chat &amp; Google Meet
                  </span>
                </span>
              </button>
            )}
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
                    <span className="block truncate text-xs font-bold text-slate-900 dark:text-slate-100">
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

      {/* Viewport-Safe Anchored Notifications Popover */}
      {notifOpen && (
        <div
          ref={notifMenuRef}
          className="absolute top-[calc(100%+8px)] right-2.5 z-50 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-20px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:right-6 sm:w-96 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-3 sm:px-4 dark:border-slate-800">
            <div className="min-w-0">
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
            <div className="flex shrink-0 items-center gap-1">
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
          <div className="max-h-[min(24rem,calc(100vh-11rem))] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
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

      {/* Viewport-Safe Anchored Profile Dropdown (Never clips off right edge) */}
      {profileOpen && (
        <div
          ref={profileMenuRef}
          className="absolute top-[calc(100%+8px)] right-2.5 z-50 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-20px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl sm:right-6 sm:w-[340px] dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Profile Identity Header */}
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <UserAvatar
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
                sizeClass="h-9 w-9 shrink-0"
                textClass="text-xs"
                roundedClass="rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {currentUser.name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {currentUser.signOffTitle || currentUser.title}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {currentUser.employeeId}
            </span>
          </div>

          {/* Email & Live Online Badge */}
          <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {currentUser.email}
            </p>
            <div className="shrink-0">
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
          </div>

          {/* Active Permission Tier */}
          <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Active Permission Tier
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {isSuperAdmin ? 'Super Admin' : currentUser.role} · {currentUser.department}
            </p>
            {currentUser.outOfOffice && (
              <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300">
                Out-of-Office: Delegating to {currentUser.delegateApproverName || 'Backup Approver'}
              </p>
            )}
          </div>

          {/* Compact Cloud Sync Status & Refresh on Mobile/Tablet (< xl) */}
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 xl:hidden dark:border-slate-800">
            <span
              className={`inline-flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold ${
                lastSyncError
                  ? 'text-amber-700 dark:text-amber-300'
                  : dbConnected
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lastSyncError ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              ) : dbConnected ? (
                <Cloud className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {lastSyncError
                  ? 'Sync Warning'
                  : dbConnected
                    ? 'Cloud Connected: Supabase'
                    : 'Offline Storage'}
              </span>
            </span>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing' : 'Refresh'}</span>
            </button>
          </div>

          {/* Appearance Theme (Single-Line Header + Even 3-Button Grid) */}
          {onSetThemePreference && (
            <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Appearance Theme
                </p>
                <span className="shrink-0 text-[10px] font-semibold whitespace-nowrap text-indigo-600 dark:text-indigo-400">
                  {themePreference === 'system' ? 'Auto (Device)' : 'Manual Override'}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                {(
                  [
                    { id: 'system', label: 'System', icon: Monitor },
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = themePreference === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSetThemePreference(opt.id)}
                      className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-indigo-600'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Profile & Session Actions */}
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
            {onSelectSection && (
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onSelectSection('user_settings');
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                  activeSection === 'user_settings'
                    ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Settings className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>Account &amp; App Settings</span>
              </button>
            )}
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

      {/* Mobile Compact Expandable Instant Jump Search (< md) */}
      {mobileSearchOpen && (
        <div
          ref={mobileSearchRef}
          className="border-t border-slate-200 bg-white px-2.5 py-2 md:hidden dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-indigo-500 focus-within:bg-white dark:border-slate-700 dark:bg-slate-950">
            <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              ref={mobileInputRef}
              type="search"
              value={commandQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search workspace..."
              aria-label="Mobile workspace search"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {commandQuery && (
              <button
                type="button"
                onClick={() => {
                  handleSearchInputChange('');
                  mobileInputRef.current?.focus();
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={closeCommandPalette}
              aria-label="Close mobile search"
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {commandOpen && (
            <div className="mt-2 max-h-[70dvh] w-full max-w-[calc(100vw-20px)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
              {renderCommandResultsBody()}
            </div>
          )}
        </div>
      )}
    </header>
    </>
  );
}
