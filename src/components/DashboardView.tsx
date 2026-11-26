import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileOutput,
  FileText,
  Megaphone,
  Moon,
  Pin,
  PinOff,
  Plus,
  Sun,
  Sunset,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AnnouncementPriorityTag,
  AnnouncementSeverity,
  AttendanceLog,
  CompanyAnnouncement,
  CompanyProject,
  DEFAULT_SLA_POLICY,
  OperationalRequest,
  RequestStatus,
  Role,
  SlaPolicyConfig,
  TeamMember,
} from '../types/nexops';
import {
  DepartmentScorecardRow,
  ExecutiveDepartmentAnalyticsRow,
  exportDepartmentScorecardCsv,
  exportExecutiveKpiSummaryCsv,
  formatCurrency,
  formatDateTime,
  formatPresenceStatus,
  formatShortDate,
  formatTurnaroundDuration,
  getApprovalTurnaroundHours,
  getBudgetUtilizationPct,
  getOverdueDays,
  getRequestSlaStatus,
  getTimeOfDayGreeting,
  getTodayDateString,
  isAnnouncementActive,
  isRequestOverdue,
  isSuperAdminEmail,
  resolveLivePresenceOverride,
  toUsdEquivalent,
} from '../utils/storage';
import {
  BudgetHealthBar,
  OverdueBadge,
  PresenceBadge,
  PriorityBadge,
  SlaCountdownPill,
  StatusBadge,
} from './StatusIndicator';
import { UserAvatar } from './UserAvatar';
import { WeatherAndMapSection } from './WeatherLocationWidgets';
import { ExecutiveAnalyticsCharts } from './ExecutiveAnalyticsCharts';

interface DashboardViewProps {
  companyName: string;
  currentUser: TeamMember;
  teamMembers?: TeamMember[];
  onlinePresenceKeys?: Set<string>;
  recentlyOfflineKeys?: Set<string>;
  requests: OperationalRequest[];
  projects: CompanyProject[];
  attendanceLogs: AttendanceLog[];
  announcements: CompanyAnnouncement[];
  activeRole: Role;
  departments: string[];
  slaPolicy?: SlaPolicyConfig;
  onOpenRequest: (request: OperationalRequest) => void;
  onNavigateToQueue: (statusFilter?: RequestStatus | 'All') => void;
  onNavigateToOverdueQueue?: () => void;
  onNavigateToProjects?: () => void;
  onOpenExecutiveReport: () => void;
  onExportScorecardSuccess?: (deptCount: number) => void;
  onPublishAnnouncement: (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    priorityTag: AnnouncementPriorityTag;
    pinned: boolean;
    expiresAt?: string;
  }) => void;
  onEditAnnouncement: (announcement: CompanyAnnouncement) => void;
  onDeleteAnnouncement: (announcementId: string) => void;
  onTogglePinAnnouncement: (announcementId: string) => void;
  weatherCity?: string;
  weatherUnit?: 'C' | 'F';
  timeFormat?: '12h' | '24h';
  timezone?: string;
}

const STATUS_ORDER: { status: RequestStatus; barColor: string }[] = [
  { status: 'Approved', barColor: 'bg-emerald-600' },
  { status: 'Under QA Review', barColor: 'bg-amber-500' },
  { status: 'Submitted', barColor: 'bg-indigo-600' },
  { status: 'Revision Required', barColor: 'bg-rose-600' },
  { status: 'Draft', barColor: 'bg-slate-400' },
  { status: 'Rejected', barColor: 'bg-rose-800' },
];

export function DashboardView({
  companyName,
  currentUser,
  teamMembers = [],
  onlinePresenceKeys,
  recentlyOfflineKeys,
  requests,
  projects,
  attendanceLogs,
  announcements,
  activeRole,
  departments,
  slaPolicy = DEFAULT_SLA_POLICY,
  onOpenRequest,
  onNavigateToQueue,
  onNavigateToOverdueQueue,
  onNavigateToProjects,
  onOpenExecutiveReport,
  onExportScorecardSuccess,
  onPublishAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
  onTogglePinAnnouncement,
  weatherCity,
  weatherUnit = 'C',
  timeFormat = '12h',
  timezone,
}: DashboardViewProps) {
  const isAdmin = activeRole === 'Admin';
  const isNoticeAdmin = isAdmin && isSuperAdminEmail(currentUser.email);
  const todayStr = getTodayDateString();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'analytics'>('overview');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = useMemo(
    () => getTimeOfDayGreeting(currentUser.name, new Date(nowMs)),
    [currentUser.name, nowMs],
  );

  const localDateLabel = useMemo(
    () =>
      new Date(nowMs).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
    [nowMs],
  );

  const activeDirectoryWithPresence = useMemo(() => {
    const approved = teamMembers.filter(
      (m) =>
        m.active &&
        ((m.approvalStatus ?? 'approved') === 'approved' || isSuperAdminEmail(m.email)),
    );
    return approved
      .map((member) => {
        const ts = member.lastActiveAt || member.lastActive;
        const liveOverride = resolveLivePresenceOverride(
          member,
          onlinePresenceKeys,
          recentlyOfflineKeys,
        );
        const presence = formatPresenceStatus(ts, nowMs, liveOverride);
        const tsMs = ts ? new Date(ts).getTime() : 0;
        return {
          member,
          presence,
          liveOverride,
          sortTime: Number.isNaN(tsMs) ? 0 : tsMs,
        };
      })
      .sort((a, b) => {
        if (a.presence.isOnline !== b.presence.isOnline) {
          return a.presence.isOnline ? -1 : 1;
        }
        if (b.sortTime !== a.sortTime) {
          return b.sortTime - a.sortTime;
        }
        return a.member.name.localeCompare(b.member.name);
      });
  }, [teamMembers, nowMs, onlinePresenceKeys, recentlyOfflineKeys]);

  const onlineMembersCount = useMemo(
    () => activeDirectoryWithPresence.filter((item) => item.presence.isOnline).length,
    [activeDirectoryWithPresence],
  );

  // Notice Board Modal & Confirm State (Sole Super Admin Only)
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<CompanyAnnouncement | null>(null);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeTag, setNoticeTag] = useState<AnnouncementPriorityTag>('General');
  const [noticePinned, setNoticePinned] = useState(true);
  const [noticeExpiresAt, setNoticeExpiresAt] = useState('');
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);

  const activeNotices = useMemo(
    () =>
      announcements
        .filter((a) => isAnnouncementActive(a, nowMs))
        .sort((a, b) => {
          const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          if (pinDiff !== 0) return pinDiff;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        }),
    [announcements, nowMs],
  );

  const openPostNotice = () => {
    setEditingNotice(null);
    setNoticeTitle('');
    setNoticeMessage('');
    setNoticeTag('General');
    setNoticePinned(true);
    setNoticeExpiresAt('');
    setNoticeError(null);
    setNoticeModalOpen(true);
  };

  const openEditNotice = (notice: CompanyAnnouncement) => {
    setEditingNotice(notice);
    setNoticeTitle(notice.title);
    setNoticeMessage(notice.message);
    setNoticeTag(
      notice.priorityTag ??
        (notice.severity === 'urgent' ? 'Urgent' : notice.severity === 'warning' ? 'HR' : 'General'),
    );
    setNoticePinned(Boolean(notice.pinned));
    if (notice.expiresAt) {
      const dt = new Date(notice.expiresAt);
      if (!Number.isNaN(dt.getTime())) {
        const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setNoticeExpiresAt(localIso);
      } else {
        setNoticeExpiresAt('');
      }
    } else {
      setNoticeExpiresAt('');
    }
    setNoticeError(null);
    setNoticeModalOpen(true);
  };

  const handleNoticeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isNoticeAdmin) return;
    if (!noticeTitle.trim()) {
      setNoticeError('Notice title is required.');
      return;
    }
    if (!noticeMessage.trim()) {
      setNoticeError('Notice message body is required.');
      return;
    }

    let normalizedExpiresAt: string | undefined;
    if (noticeExpiresAt.trim()) {
      const parsedExp = new Date(noticeExpiresAt);
      if (Number.isNaN(parsedExp.getTime())) {
        setNoticeError('Please enter a valid expiry date and time.');
        return;
      }
      normalizedExpiresAt = parsedExp.toISOString();
    }

    const mappedSeverity: AnnouncementSeverity =
      noticeTag === 'Urgent' ? 'urgent' : noticeTag === 'HR' ? 'warning' : 'info';

    if (editingNotice) {
      onEditAnnouncement({
        ...editingNotice,
        title: noticeTitle.trim(),
        message: noticeMessage.trim(),
        priorityTag: noticeTag,
        severity: mappedSeverity,
        pinned: noticePinned,
        expiresAt: normalizedExpiresAt,
        updatedAt: new Date().toISOString(),
      });
    } else {
      onPublishAnnouncement({
        title: noticeTitle.trim(),
        message: noticeMessage.trim(),
        severity: mappedSeverity,
        priorityTag: noticeTag,
        pinned: noticePinned,
        expiresAt: normalizedExpiresAt,
      });
    }

    setNoticeModalOpen(false);
    setEditingNotice(null);
  };

  const requestMetrics = useMemo(() => {
    const total = requests.length;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let rejected = 0;
    let pendingApp = 0;
    let revReq = 0;
    let decided = 0;
    let submitted = 0;
    let underQa = 0;

    for (const r of requests) {
      if (r.status === 'Draft' || r.status === 'Submitted') pending += 1;
      if (r.status === 'Under QA Review' || r.status === 'Revision Required') inProgress += 1;
      if (r.status === 'Approved') {
        completed += 1;
        decided += 1;
      } else if (r.status === 'Rejected') {
        rejected += 1;
        decided += 1;
      } else if (r.status === 'Revision Required') {
        revReq += 1;
        decided += 1;
      }
      if (r.status === 'Submitted' || r.status === 'Under QA Review') pendingApp += 1;
      if (r.status === 'Submitted') submitted += 1;
      if (r.status === 'Under QA Review') underQa += 1;
    }

    return {
      totalRequests: total,
      pendingCount: pending,
      inProgressCount: inProgress,
      completedCount: completed,
      rejectedCount: rejected,
      pendingApproval: pendingApp,
      revisionRequired: revReq,
      approvedCount: completed,
      decidedCount: decided,
      submittedCount: submitted,
      underQaCount: underQa,
      approvalRate: decided > 0 ? Math.round((completed / decided) * 100) : 0,
    };
  }, [requests]);

  const {
    totalRequests,
    pendingCount,
    inProgressCount,
    completedCount,
    rejectedCount,
    pendingApproval,
    revisionRequired,
    approvedCount,
    decidedCount,
    submittedCount,
    underQaCount,
    approvalRate,
  } = requestMetrics;

  const displayDepartments = useMemo(
    () =>
      Array.from(
        new Set([
          ...departments,
          ...requests.map((r) => r.department).filter(Boolean),
          ...attendanceLogs.map((a) => a.department).filter(Boolean),
        ]),
      ),
    [departments, requests, attendanceLogs],
  );

  const todayAttendanceLogs = useMemo(
    () => attendanceLogs.filter((a) => a.attendanceDate === todayStr),
    [attendanceLogs, todayStr],
  );

  const departmentAnalyticsRows: ExecutiveDepartmentAnalyticsRow[] = useMemo(
    () =>
      displayDepartments.map((dept) => {
        const deptReqs = requests.filter((r) => r.department === dept);
        const deptAttToday = todayAttendanceLogs.filter((a) => a.department === dept);
        return {
          department: dept,
          totalTasks: deptReqs.length,
          pendingCount: deptReqs.filter((r) => r.status === 'Draft' || r.status === 'Submitted')
            .length,
          inProgressCount: deptReqs.filter(
            (r) => r.status === 'Under QA Review' || r.status === 'Revision Required',
          ).length,
          completedCount: deptReqs.filter((r) => r.status === 'Approved').length,
          rejectedCount: deptReqs.filter((r) => r.status === 'Rejected').length,
          presentToday: deptAttToday.filter((a) => a.status === 'Present').length,
          lateToday: deptAttToday.filter((a) => a.status === 'Late').length,
          completedShiftToday: deptAttToday.filter((a) => a.status === 'Completed').length,
        };
      }),
    [displayDepartments, requests, todayAttendanceLogs],
  );

  const maxDeptCount = useMemo(
    () => Math.max(1, ...departmentAnalyticsRows.map((d) => d.totalTasks)),
    [departmentAnalyticsRows],
  );

  // SVG Donut chart geometry (r = 52, circumference = 2 * pi * 52 = 326.7256)
  const donutRadius = 52;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const completionPct =
    totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 0;
  const donutSegments = useMemo(
    () => [
      {
        label: 'Completed',
        count: completedCount,
        stroke: '#059669',
        dotClass: 'bg-emerald-600',
        queueFilter: 'Approved' as const,
      },
      {
        label: 'In Progress',
        count: inProgressCount,
        stroke: '#d97706',
        dotClass: 'bg-amber-600',
        queueFilter: 'Under QA Review' as const,
      },
      {
        label: 'Pending',
        count: pendingCount,
        stroke: '#4f46e5',
        dotClass: 'bg-indigo-600',
        queueFilter: 'Submitted' as const,
      },
      {
        label: 'Rejected',
        count: rejectedCount,
        stroke: '#be123c',
        dotClass: 'bg-rose-700',
        queueFilter: 'Rejected' as const,
      },
    ],
    [completedCount, inProgressCount, pendingCount, rejectedCount],
  );

  const approvedActiveMembers = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.active &&
          ((m.approvalStatus ?? 'approved') === 'approved' || isSuperAdminEmail(m.email)),
      ),
    [teamMembers],
  );

  const scorecardRows: DepartmentScorecardRow[] = useMemo(
    () =>
      displayDepartments.map((dept) => {
        const deptRequests = requests.filter((r) => r.department === dept);
        const total = deptRequests.length;
        const approved = deptRequests.filter((r) => r.status === 'Approved').length;
        const decided = deptRequests.filter(
          (r) =>
            r.status === 'Approved' ||
            r.status === 'Rejected' ||
            r.status === 'Revision Required',
        ).length;
        const approvalRatePct = decided > 0 ? Math.round((approved / decided) * 100) : 0;
        const overdue = deptRequests.filter((r) => isRequestOverdue(r, slaPolicy, nowMs)).length;

        const withinSlaCount = deptRequests.filter((r) => {
          const sla = getRequestSlaStatus(r, slaPolicy, nowMs);
          if (r.status === 'Approved') return sla.metSla !== false;
          if (r.status === 'Rejected') return true;
          return !sla.breached;
        }).length;
        const slaCompliancePct = total > 0 ? Math.round((withinSlaCount / total) * 100) : 100;

        const turnaroundValues = deptRequests
          .map((r) => getApprovalTurnaroundHours(r))
          .filter((h): h is number => h !== null);
        const avgTurnaroundHours =
          turnaroundValues.length > 0
            ? turnaroundValues.reduce((sum, h) => sum + h, 0) / turnaroundValues.length
            : null;

        const deptStaff = approvedActiveMembers.filter((m) => m.department === dept);
        const activeStaffCount = deptStaff.length;
        const deptAttToday = todayAttendanceLogs.filter((a) => a.department === dept);
        const uniqueAttEmails = new Set(
          deptAttToday.map((a) => a.userEmail.trim().toLowerCase()).filter(Boolean),
        );
        const attendanceTodayCount =
          uniqueAttEmails.size > 0 ? uniqueAttEmails.size : deptAttToday.length;
        const attendanceRatePct =
          activeStaffCount > 0
            ? Math.min(100, Math.round((attendanceTodayCount / activeStaffCount) * 100))
            : attendanceTodayCount > 0
              ? 100
              : 0;

        const avgChecklistPct =
          total > 0
            ? Math.round(
                deptRequests.reduce((sum, r) => {
                  const items = r.checklist.length;
                  if (items === 0) return sum + 100;
                  const checked = r.checklist.filter((c) => c.checked).length;
                  return sum + (checked / items) * 100;
                }, 0) / total,
              )
            : 0;

        return {
          department: dept,
          totalRequests: total,
          approvedCount: approved,
          approvalRatePct,
          overdueCount: overdue,
          avgChecklistPct,
          slaCompliancePct,
          avgTurnaroundHours,
          activeStaffCount,
          attendanceTodayCount,
          attendanceRatePct,
        };
      }),
    [displayDepartments, requests, slaPolicy, nowMs, approvedActiveMembers, todayAttendanceLogs],
  );

  const handleDownloadScorecard = () => {
    exportDepartmentScorecardCsv(scorecardRows);
    onExportScorecardSuccess?.(scorecardRows.length);
  };

  const handleExportExecutiveKpiCsv = () => {
    exportExecutiveKpiSummaryCsv({
      companyName,
      dateStamp: todayStr,
      totalTasks: totalRequests,
      pendingCount,
      inProgressCount,
      completedCount,
      rejectedCount,
      departmentRows: departmentAnalyticsRows,
    });
    onExportScorecardSuccess?.(departmentAnalyticsRows.length);
  };

  const overdueCount = useMemo(
    () => requests.filter((r) => isRequestOverdue(r, slaPolicy, nowMs)).length,
    [requests, slaPolicy, nowMs],
  );
  const approachingSlaCount = useMemo(
    () =>
      requests.filter((r) => {
        const sla = getRequestSlaStatus(r, slaPolicy, nowMs);
        return !sla.breached && sla.approaching;
      }).length,
    [requests, slaPolicy, nowMs],
  );

  const overallSlaCompliancePct = useMemo(() => {
    if (requests.length === 0) return 100;
    const compliant = requests.filter((r) => {
      const sla = getRequestSlaStatus(r, slaPolicy, nowMs);
      if (r.status === 'Approved') return sla.metSla !== false;
      if (r.status === 'Rejected') return true;
      return !sla.breached;
    }).length;
    return Math.round((compliant / requests.length) * 100);
  }, [requests, slaPolicy, nowMs]);

  const overallAvgTurnaroundHours = useMemo(() => {
    const vals = requests
      .map((r) => getApprovalTurnaroundHours(r))
      .filter((h): h is number => h !== null);
    if (vals.length === 0) return null;
    return vals.reduce((sum, h) => sum + h, 0) / vals.length;
  }, [requests]);

  const { portfolioBudgetUsd, portfolioSpendUsd, portfolioUtilPct, overBudgetProjectsCount } =
    useMemo(() => {
      const budget = projects.reduce(
        (sum, p) => sum + toUsdEquivalent(p.estimatedBudget ?? 0, p.currency || 'USD'),
        0,
      );
      const spend = projects.reduce(
        (sum, p) => sum + toUsdEquivalent(p.actualSpend ?? 0, p.currency || 'USD'),
        0,
      );
      const util = getBudgetUtilizationPct(budget, spend);
      const overCount = projects.filter(
        (p) => getBudgetUtilizationPct(p.estimatedBudget ?? 0, p.actualSpend ?? 0) > 100,
      ).length;
      return {
        portfolioBudgetUsd: budget,
        portfolioSpendUsd: spend,
        portfolioUtilPct: util,
        overBudgetProjectsCount: overCount,
      };
    }, [projects]);

  const urgentRequests = useMemo(
    () =>
      requests
        .filter(
          (r) =>
            r.status !== 'Approved' &&
            r.status !== 'Rejected' &&
            (isRequestOverdue(r, slaPolicy, nowMs) ||
              r.priority === 'Urgent' ||
              r.priority === 'High' ||
              r.status === 'Revision Required'),
        )
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 6),
    [requests, slaPolicy, nowMs],
  );

  const slaBreachedRequests = useMemo(
    () =>
      requests
        .filter((r) => isRequestOverdue(r, slaPolicy, nowMs))
        .sort(
          (a, b) =>
            getRequestSlaStatus(b, slaPolicy, nowMs).overdueHours -
            getRequestSlaStatus(a, slaPolicy, nowMs).overdueHours,
        ),
    [requests, slaPolicy, nowMs],
  );

  const kpis = useMemo(
    () => [
      {
        label: 'Total Operational Requests',
        value: totalRequests,
        trend:
          totalRequests === 0 ? 'Clean workspace' : `${submittedCount} awaiting review`,
        trendPositive: true,
        icon: FileText,
        accent: 'text-indigo-600 dark:text-indigo-400',
        onClick: () => onNavigateToQueue('All'),
      },
      {
        label: 'Pending QA / Approval',
        value: pendingApproval,
        trend: `${underQaCount} actively in QA`,
        trendPositive: true,
        icon: Clock,
        accent: 'text-amber-600 dark:text-amber-400',
        onClick: () => onNavigateToQueue('Under QA Review'),
      },
      {
        label: 'Revision Required',
        value: revisionRequired,
        trend: revisionRequired > 0 ? 'Action needed by owner' : 'Zero blockers',
        trendPositive: revisionRequired === 0,
        icon: AlertTriangle,
        accent: 'text-rose-600 dark:text-rose-400',
        onClick: () => onNavigateToQueue('Revision Required'),
      },
      {
        label: 'Overall Approval Rate',
        value: `${approvalRate}%`,
        trend: `${approvedCount} of ${decidedCount} reviewed`,
        trendPositive: approvalRate >= 70,
        icon: CheckCircle2,
        accent: 'text-emerald-600 dark:text-emerald-400',
        onClick: () => onNavigateToQueue('Approved'),
      },
    ],
    [
      totalRequests,
      submittedCount,
      pendingApproval,
      underQaCount,
      revisionRequired,
      approvalRate,
      approvedCount,
      decidedCount,
      onNavigateToQueue,
    ],
  );

  let cumulativeOffset = 0;

  const GreetingIcon =
    greeting.period === 'morning'
      ? Sun
      : greeting.period === 'afternoon'
        ? Sunset
        : Moon;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
      {/* Dynamic Time-of-Day Personalized Greeting Banner */}
      <section
        aria-label="Personalized Welcome Greeting"
        className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:px-6"
      >
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              greeting.period === 'morning'
                ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
                : greeting.period === 'afternoon'
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300'
                  : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <GreetingIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
              {greeting.fullText}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{companyName}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span>{currentUser.department}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span>{localDateLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <PresenceBadge
            lastActiveAt={currentUser.lastActiveAt || currentUser.lastActive}
            nowMs={nowMs}
            isOnlineOverride={resolveLivePresenceOverride(
              currentUser,
              onlinePresenceKeys,
              recentlyOfflineKeys,
            )}
          />
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {currentUser.employeeId}
          </span>
        </div>
      </section>

      {/* Executive Action Strip with Dynamic SLA Status & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 sm:gap-3">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Executive Governance Snapshot</span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="tabular-nums">
            {overdueCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  onNavigateToOverdueQueue ? onNavigateToOverdueQueue() : onNavigateToQueue('All')
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
                </span>
                <span>
                  {overdueCount} SLA Breach{overdueCount > 1 ? 'es' : ''} require attention
                </span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>All active SLAs on track</span>
              </span>
            )}
          </span>
          {approachingSlaCount > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 tabular-nums dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
                {approachingSlaCount} approaching SLA
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-slate-700 tabular-nums dark:text-slate-300">
            <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {todayAttendanceLogs.length} Staff Clocked In Today
          </span>
        </div>

        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {/* Sub-Tab Toggle: Overview vs Department & SLA Analytics */}
          <div
            role="tablist"
            aria-label="Dashboard view mode"
            className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={dashboardTab === 'overview'}
              onClick={() => setDashboardTab('overview')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                dashboardTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dashboardTab === 'analytics'}
              onClick={() => setDashboardTab('analytics')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                dashboardTab === 'analytics'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Department &amp; SLA Analytics
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExecutiveKpiCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export KPI Summary CSV</span>
          </button>

          <button
            type="button"
            onClick={onOpenExecutiveReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
          >
            <FileOutput className="h-3.5 w-3.5" />
            <span>Generate Official Report</span>
          </button>
        </div>
      </div>

      {dashboardTab === 'analytics' && (
        <ExecutiveAnalyticsCharts
          requests={requests}
          attendanceLogs={attendanceLogs}
          teamMembers={teamMembers}
          departments={departments}
        />
      )}

      {dashboardTab === 'overview' && (
        <>
      {/* Prominent Company Notice Board & Announcements Widget */}
      <section
        aria-label="Company Notice Board & Announcements"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Company Notice Board &amp; Announcements
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official circulars, policy updates, and company notices
              </p>
            </div>
          </div>

          {isNoticeAdmin ? (
            <button
              type="button"
              onClick={openPostNotice}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Post Announcement</span>
            </button>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Official Notices ({activeNotices.length})
            </span>
          )}
        </div>

        {activeNotices.length === 0 ? (
          <div className="py-8 text-center">
            <Megaphone className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              No active company announcements
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isNoticeAdmin
                ? 'Post circulars, holiday schedules, or HR policy notices using the button above.'
                : 'Official company announcements posted by Super Admin will appear here.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeNotices.map((notice) => {
              const tag =
                notice.priorityTag ??
                (notice.severity === 'urgent'
                  ? 'Urgent'
                  : notice.severity === 'warning'
                    ? 'HR'
                    : 'General');
              const isConfirmingDel = confirmDeleteNoticeId === notice.id;

              return (
                <div
                  key={notice.id}
                  className={`flex flex-col justify-between rounded-xl border p-4 ${
                    tag === 'Urgent'
                      ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/30'
                      : notice.pinned
                        ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/50'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            tag === 'Urgent'
                              ? 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                              : tag === 'HR'
                                ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'
                          }`}
                        >
                          {tag}
                        </span>
                        {notice.pinned && (
                          <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Pin className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-400" />
                            Pinned
                          </span>
                        )}
                      </div>

                      {isNoticeAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onTogglePinAnnouncement(notice.id)}
                            title={notice.pinned ? 'Unpin notice' : 'Pin notice'}
                            className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-indigo-300"
                          >
                            {notice.pinned ? (
                              <PinOff className="h-3.5 w-3.5" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditNotice(notice)}
                            title="Edit notice"
                            className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-indigo-300"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {isConfirmingDel ? (
                            <div className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 dark:border-rose-900/60 dark:bg-rose-950/60">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteAnnouncement(notice.id);
                                  setConfirmDeleteNoticeId(null);
                                }}
                                className="text-[10px] font-bold text-rose-700 hover:underline dark:text-rose-300"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteNoticeId(null)}
                                className="text-[10px] text-slate-600 dark:text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteNoticeId(notice.id)}
                              title="Delete notice"
                              className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">{notice.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {notice.message}
                    </p>
                  </div>

                  <p className="mt-3 border-t border-slate-200/70 pt-2 font-mono text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Posted by {notice.publishedBy} · {formatDateTime(notice.publishedAt)}
                    {notice.expiresAt ? ` · Expires ${formatDateTime(notice.expiresAt)}` : ''}
                    {notice.updatedAt && notice.updatedAt !== notice.publishedAt
                      ? ' (Edited)'
                      : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4 Top KPI Cards */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={kpi.onClick}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/40 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${kpi.accent}`} aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100 sm:text-3xl">
                  {kpi.value}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    kpi.trendPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{kpi.trend}</span>
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Executive Visual Analytics Row: Task Completion Donut + Dept Workload & Attendance */}
      <section className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Task Completion Breakdown (SVG Donut Chart) */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Task Completion Breakdown
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Pending vs. In Progress vs. Completed governance distribution
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
              {totalRequests} total
            </span>
          </div>

          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
              <svg viewBox="0 0 132 132" className="h-36 w-36 -rotate-90" aria-hidden="true">
                <circle
                  cx="66"
                  cy="66"
                  r={donutRadius}
                  fill="none"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  strokeWidth="16"
                />
                {totalRequests > 0 &&
                  donutSegments.map((seg) => {
                    if (seg.count === 0) return null;
                    const len = (seg.count / totalRequests) * donutCircumference;
                    const dashArray = `${len} ${donutCircumference - len}`;
                    const dashOffset = -cumulativeOffset;
                    cumulativeOffset += len;
                    return (
                      <circle
                        key={seg.label}
                        cx="66"
                        cy="66"
                        r={donutRadius}
                        fill="none"
                        stroke={seg.stroke}
                        strokeWidth="16"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                      />
                    );
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {completionPct}%
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Completed</span>
              </div>
            </div>

            <div className="w-full flex-1 divide-y divide-slate-100 dark:divide-slate-800">
              {donutSegments.map((seg) => {
                const pct =
                  totalRequests > 0 ? Math.round((seg.count / totalRequests) * 100) : 0;
                return (
                  <button
                    key={seg.label}
                    type="button"
                    onClick={() => onNavigateToQueue(seg.queueFilter)}
                    className="flex w-full items-center justify-between py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                      <span className={`h-2.5 w-2.5 rounded-xs ${seg.dotClass}`} />
                      {seg.label}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {seg.count} <span className="text-slate-400 dark:text-slate-500">({pct}%)</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular 6-stage pipeline bar */}
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {STATUS_ORDER.map(({ status, barColor }) => {
                const count = requests.filter((r) => r.status === status).length;
                if (count === 0 || totalRequests === 0) return null;
                return (
                  <div
                    key={status}
                    className={`${barColor} h-full border-r border-white last:border-r-0 dark:border-slate-900`}
                    style={{ width: `${(count / totalRequests) * 100}%` }}
                    title={`${status}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              {STATUS_ORDER.map(({ status, barColor }) => {
                const count = requests.filter((r) => r.status === status).length;
                return (
                  <span key={status} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <span className={`h-2 w-2 rounded-xs ${barColor}`} />
                    {status}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Department-Wise Workload & Attendance Summary */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Department Workload &amp; Attendance Summary
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Task volume, completion progress &amp; today&apos;s staff attendance across departments
              </p>
            </div>
            <span className="font-mono text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
              {todayStr}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {departmentAnalyticsRows.map((item) => {
              const totalPct = Math.round((item.totalTasks / maxDeptCount) * 100);
              const approvedPct =
                item.totalTasks > 0
                  ? Math.round((item.completedCount / item.totalTasks) * 100)
                  : 0;
              const todayAttTotal =
                item.presentToday + item.lateToday + item.completedShiftToday;

              return (
                <div key={item.department} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{item.department}</span>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
                      <span className="text-slate-600 dark:text-slate-400">
                        {item.totalTasks} tasks ({item.completedCount} done ·{' '}
                        {item.pendingCount + item.inProgressCount} active)
                      </span>
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                        Attendance Today: {todayAttTotal}
                        {item.lateToday > 0 ? ` (${item.lateToday} Late)` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="flex h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${Math.max(totalPct, item.totalTasks > 0 ? 8 : 0)}%` }}
                    >
                      {item.completedCount > 0 && (
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${approvedPct}%` }}
                          title={`${item.completedCount} Completed`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" aria-hidden="true" />
              Completed tasks
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600" aria-hidden="true" />
              Pending / In-Progress workload
            </span>
          </div>
        </div>
      </section>

      {/* Executive Analytics SVG Charts (Department Attendance, Approval Breakdown, 6-Month Trends) */}
      <ExecutiveAnalyticsCharts
        requests={requests}
        attendanceLogs={attendanceLogs}
        teamMembers={teamMembers}
        departments={departments}
      />

      {/* Financial Cost-Center & Budget Variance Tracker */}
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-4 w-4 text-indigo-600 shrink-0 dark:text-indigo-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Financial Cost-Center &amp; Budget Variance Tracker
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Multi-currency project &amp; vendor budget utilization normalized in USD equivalent
              </p>
            </div>
          </div>

          {onNavigateToProjects && (
            <button
              type="button"
              onClick={onNavigateToProjects}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <span>Manage Cost Centers</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Portfolio Estimated Budget (USD eq.)
            </p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatCurrency(portfolioBudgetUsd, 'USD')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Portfolio Actual Spend (USD eq.)
            </p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {formatCurrency(portfolioSpendUsd, 'USD')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Overall Utilization</p>
              <span
                className={`font-mono text-[11px] font-bold ${
                  overBudgetProjectsCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {overBudgetProjectsCount > 0
                  ? `${overBudgetProjectsCount} Over Budget`
                  : 'All Healthy'}
              </span>
            </div>
            <div className="mt-2">
              <BudgetHealthBar utilizationPct={portfolioUtilPct} />
            </div>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((proj) => {
              const cur = proj.currency || 'USD';
              const est = proj.estimatedBudget ?? 0;
              const spend = proj.actualSpend ?? 0;
              const util = getBudgetUtilizationPct(est, spend);
              return (
                <div
                  key={proj.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                          {proj.code}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {cur}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                        {proj.name}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums shrink-0 dark:text-slate-300">
                      {formatCurrency(spend, cur)} / {formatCurrency(est, cur)}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <BudgetHealthBar utilizationPct={util} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

        </>
      )}

      {/* Department Performance & SLA Analytics (Visible in both Overview & Dedicated Sub-Tab) */}
      <section
        aria-label="Department Performance and SLA Analytics"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4 text-indigo-600 shrink-0 dark:text-indigo-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Department Performance &amp; SLA Analytics
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Cross-department comparison of request throughput, SLA compliance %, approval
                turnaround speed, and today&apos;s staff attendance
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Overall SLA Compliance: {overallSlaCompliancePct}%
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Avg Turnaround: {formatTurnaroundDuration(overallAvgTurnaroundHours)}
            </span>
            <button
              type="button"
              onClick={handleDownloadScorecard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Scorecard CSV</span>
            </button>
          </div>
        </div>

        {/* Responsive Department Performance Summary Cards */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {scorecardRows.map((row) => {
            const slaPct = row.slaCompliancePct ?? 100;
            const attRate = row.attendanceRatePct ?? 0;
            const staffCount = row.activeStaffCount ?? 0;
            const attToday = row.attendanceTodayCount ?? 0;
            return (
              <div
                key={`card-${row.department}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{row.department}</h3>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {row.approvedCount} approved of {row.totalRequests} total requests
                      </p>
                    </div>
                    {row.overdueCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 tabular-nums dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                        {row.overdueCount} SLA Breach{row.overdueCount > 1 ? 'es' : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                        SLA Healthy
                      </span>
                    )}
                  </div>

                  {/* SLA Compliance Progress Bar */}
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">SLA Compliance Rate</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                        {row.totalRequests > 0 ? `${slaPct}%` : '—'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          slaPct >= 85
                            ? 'bg-emerald-600'
                            : slaPct >= 60
                              ? 'bg-amber-500'
                              : 'bg-rose-600'
                        }`}
                        style={{ width: `${row.totalRequests > 0 ? slaPct : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Turnaround & Attendance Metrics */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Avg Turnaround</p>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {formatTurnaroundDuration(row.avgTurnaroundHours ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Staff Attendance Today</p>
                    <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                      {attToday}/{staffCount}{' '}
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        ({attRate}%)
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full Responsive Department Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-3 pr-3 pl-6">Department</th>
                <th className="px-3 py-3 text-right">Approved / Total</th>
                <th className="px-3 py-3">SLA Compliance %</th>
                <th className="px-3 py-3 text-right">Avg Turnaround</th>
                <th className="px-3 py-3 text-right">SLA Breaches</th>
                <th className="px-3 py-3">Staff Attendance Today</th>
                <th className="py-3 pr-6 pl-3">Avg QA Checklist %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {scorecardRows.map((row) => {
                const slaPct = row.slaCompliancePct ?? 100;
                const attRate = row.attendanceRatePct ?? 0;
                const staffCount = row.activeStaffCount ?? 0;
                const attToday = row.attendanceTodayCount ?? 0;
                return (
                  <tr key={row.department} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 pr-3 pl-6 font-semibold text-slate-900 whitespace-nowrap dark:text-slate-100">
                      {row.department}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                      {row.approvedCount} / {row.totalRequests}
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400 dark:text-slate-500">
                        ({row.approvalRatePct}%)
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              row.totalRequests === 0
                                ? 'bg-slate-300 dark:bg-slate-700'
                                : slaPct >= 85
                                  ? 'bg-emerald-600'
                                  : slaPct >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-rose-600'
                            }`}
                            style={{ width: `${row.totalRequests > 0 ? slaPct : 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                          {row.totalRequests > 0 ? `${slaPct}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                      {formatTurnaroundDuration(row.avgTurnaroundHours ?? null)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">
                      {row.overdueCount > 0 ? (
                        <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                          {row.overdueCount}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                          {attToday}/{staffCount}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {attRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 pr-6 pl-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              row.avgChecklistPct >= 80
                                ? 'bg-indigo-600'
                                : row.avgChecklistPct >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400 dark:bg-slate-600'
                            }`}
                            style={{ width: `${row.avgChecklistPct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                          {row.avgChecklistPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dashboardTab === 'analytics' && (
        <section
          aria-label="Active SLA Breach Escalation Watchlist"
          className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Active SLA Escalations &amp; Breached Requests
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Requests exceeding configured SLA windows ({slaPolicy.urgentHours}h Urgent ·{' '}
                {slaPolicy.highHours}h High · {slaPolicy.mediumHours}h Medium ·{' '}
                {slaPolicy.lowHours}h Low)
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onNavigateToOverdueQueue ? onNavigateToOverdueQueue() : onNavigateToQueue('All')
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <span>Filter Overdue in Queue</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {slaBreachedRequests.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Zero SLA Breaches Across All Departments
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                All active requests are currently operating within target SLA response windows.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                    <th className="py-3 pr-3 pl-6">Request ID</th>
                    <th className="px-3 py-3">Operational Deliverable</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Priority</th>
                    <th className="px-3 py-3">SLA Status</th>
                    <th className="py-3 pr-6 pl-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {slaBreachedRequests.map((req) => (
                    <tr key={req.id} className="bg-rose-50/20 hover:bg-rose-50/45 dark:bg-rose-950/15 dark:hover:bg-rose-950/30">
                      <td className="py-3.5 pr-3 pl-6 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap dark:text-indigo-400">
                        {req.id}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="max-w-xs truncate font-semibold text-slate-900 dark:text-slate-100">{req.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {req.category} · Owner: {req.submittedBy}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap dark:text-slate-300">
                        {req.department}
                      </td>
                      <td className="px-3 py-3.5">
                        <PriorityBadge priority={req.priority} slaBreached />
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <SlaCountdownPill
                          dueDate={req.dueDate}
                          status={req.status}
                          createdAt={req.createdAt}
                          priority={req.priority}
                          slaPolicy={slaPolicy}
                          nowMs={nowMs}
                        />
                      </td>
                      <td className="py-3.5 pr-6 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenRequest(req)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 whitespace-nowrap"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dashboardTab === 'overview' && (
        <>

      {/* Urgent Attention Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Urgent Attention Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              High/Urgent priority submissions and revision blockers requiring immediate action
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToQueue('All')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <span>View Full Queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {urgentRequests.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              All high-priority and urgent items have been resolved.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              New urgent requests will automatically surface here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-3 pr-3 pl-6">Request ID</th>
                  <th className="px-3 py-3">Operational Deliverable</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="py-3 pr-6 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {urgentRequests.map((req) => {
                  const overdue = isRequestOverdue(req, slaPolicy, nowMs);
                  return (
                    <tr
                      key={req.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3.5 pr-3 pl-6 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap dark:text-slate-100">
                        {req.id}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="max-w-xs truncate font-medium text-slate-900 dark:text-slate-100">{req.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {req.category} · {req.submittedBy}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap dark:text-slate-300">
                        {req.department}
                      </td>
                      <td className="px-3 py-3.5">
                        <PriorityBadge priority={req.priority} slaBreached={overdue} />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={req.status} />
                          {overdue && <OverdueBadge days={getOverdueDays(req.dueDate)} />}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3.5 font-mono text-xs tabular-nums whitespace-nowrap ${
                          overdue ? 'font-semibold text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {formatShortDate(req.dueDate)}
                      </td>
                      <td className="py-3.5 pr-6 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenRequest(req)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 whitespace-nowrap"
                        >
                          <span>Review</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Live Weather & Interactive Operations Map */}
      <WeatherAndMapSection
        defaultCity={weatherCity}
        temperatureUnit={weatherUnit}
        timeFormat={timeFormat}
        timezone={timezone}
      />

      {/* Team Online Presence & Active Directory Strip */}
      <section
        aria-label="Team Online Presence"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Team Online Presence
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live availability and recent activity across approved workspace members
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 tabular-nums dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{onlineMembersCount} Online</span>
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {activeDirectoryWithPresence.length} Active Members
            </span>
          </div>
        </div>

        {activeDirectoryWithPresence.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No approved team members found in directory yet.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeDirectoryWithPresence.map(({ member, liveOverride }) => {
              const isSelf =
                member.id === currentUser.id ||
                member.email.toLowerCase() === currentUser.email.toLowerCase();
              return (
                <div
                  key={member.id}
                  className={`flex items-start justify-between gap-2.5 rounded-xl border p-3.5 transition-colors ${
                    isSelf
                      ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-800/70 dark:bg-indigo-950/30'
                      : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar
                      name={member.name}
                      avatarUrl={member.avatarUrl}
                      sizeClass="h-9 w-9"
                      textClass="text-xs"
                      roundedClass="rounded-lg"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                        {member.name}
                        {isSelf && (
                          <span className="ml-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {member.department} · {member.role}
                      </p>
                      <div className="mt-1.5">
                        <PresenceBadge
                          lastActiveAt={member.lastActiveAt || member.lastActive}
                          nowMs={nowMs}
                          compact
                          isOnlineOverride={liveOverride}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}

      {/* Post / Edit Official Notice Modal (Sole Super Admin Only) */}
      {noticeModalOpen && isNoticeAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs dark:bg-slate-950/75 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-6 sm:py-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingNotice ? 'Edit Official Company Notice' : 'Post Official Company Notice'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNoticeModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleNoticeSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {noticeError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                  {noticeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Headline <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="e.g., Official Holiday Notice & Updated Attendance Cutoff"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Priority Tag
                  </label>
                  <select
                    value={noticeTag}
                    onChange={(e) => setNoticeTag(e.target.value as AnnouncementPriorityTag)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="General">General</option>
                    <option value="HR">HR</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Auto-Expiry Date &amp; Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={noticeExpiresAt}
                    onChange={(e) => setNoticeExpiresAt(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={noticePinned}
                    onChange={(e) => setNoticePinned(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-950"
                  />
                  Pin to top of Notice Board
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Circular / Policy Details <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={noticeMessage}
                  onChange={(e) => setNoticeMessage(e.target.value)}
                  placeholder="Write official circular text, effective dates, and action items..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setNoticeModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {editingNotice ? 'Save Changes' : 'Publish Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

