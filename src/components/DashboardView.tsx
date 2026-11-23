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
  Pin,
  PinOff,
  Plus,
  Trash2,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  AnnouncementPriorityTag,
  AnnouncementSeverity,
  AttendanceLog,
  CompanyAnnouncement,
  CompanyProject,
  OperationalRequest,
  RequestStatus,
  Role,
} from '../types/nexops';
import {
  DepartmentScorecardRow,
  ExecutiveDepartmentAnalyticsRow,
  exportDepartmentScorecardCsv,
  exportExecutiveKpiSummaryCsv,
  formatCurrency,
  formatDateTime,
  formatShortDate,
  getBudgetUtilizationPct,
  getOverdueDays,
  getTodayDateString,
  isRequestOverdue,
  toUsdEquivalent,
} from '../utils/storage';
import {
  BudgetHealthBar,
  OverdueBadge,
  PriorityBadge,
  StatusBadge,
} from './StatusIndicator';

interface DashboardViewProps {
  companyName: string;
  requests: OperationalRequest[];
  projects: CompanyProject[];
  attendanceLogs: AttendanceLog[];
  announcements: CompanyAnnouncement[];
  activeRole: Role;
  departments: string[];
  onOpenRequest: (request: OperationalRequest) => void;
  onNavigateToQueue: (statusFilter?: RequestStatus | 'All') => void;
  onNavigateToProjects?: () => void;
  onOpenExecutiveReport: () => void;
  onExportScorecardSuccess?: (deptCount: number) => void;
  onPublishAnnouncement: (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    priorityTag: AnnouncementPriorityTag;
    pinned: boolean;
  }) => void;
  onEditAnnouncement: (announcement: CompanyAnnouncement) => void;
  onDeleteAnnouncement: (announcementId: string) => void;
  onTogglePinAnnouncement: (announcementId: string) => void;
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
  requests,
  projects,
  attendanceLogs,
  announcements,
  activeRole,
  departments,
  onOpenRequest,
  onNavigateToQueue,
  onNavigateToProjects,
  onOpenExecutiveReport,
  onExportScorecardSuccess,
  onPublishAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
  onTogglePinAnnouncement,
}: DashboardViewProps) {
  const isAdmin = activeRole === 'Admin';
  const todayStr = getTodayDateString();

  // Notice Board Modal & Confirm State (Admin Only)
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<CompanyAnnouncement | null>(null);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeTag, setNoticeTag] = useState<AnnouncementPriorityTag>('General');
  const [noticePinned, setNoticePinned] = useState(true);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);

  const activeNotices = useMemo(
    () =>
      announcements
        .filter((a) => !a.archived)
        .sort((a, b) => {
          const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          if (pinDiff !== 0) return pinDiff;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        }),
    [announcements],
  );

  const openPostNotice = () => {
    setEditingNotice(null);
    setNoticeTitle('');
    setNoticeMessage('');
    setNoticeTag('General');
    setNoticePinned(true);
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
    setNoticeError(null);
    setNoticeModalOpen(true);
  };

  const handleNoticeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!noticeTitle.trim()) {
      setNoticeError('Notice title is required.');
      return;
    }
    if (!noticeMessage.trim()) {
      setNoticeError('Notice message body is required.');
      return;
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
        updatedAt: new Date().toISOString(),
      });
    } else {
      onPublishAnnouncement({
        title: noticeTitle.trim(),
        message: noticeMessage.trim(),
        severity: mappedSeverity,
        priorityTag: noticeTag,
        pinned: noticePinned,
      });
    }

    setNoticeModalOpen(false);
    setEditingNotice(null);
  };

  const totalRequests = requests.length;
  const pendingCount = requests.filter(
    (r) => r.status === 'Draft' || r.status === 'Submitted',
  ).length;
  const inProgressCount = requests.filter(
    (r) => r.status === 'Under QA Review' || r.status === 'Revision Required',
  ).length;
  const completedCount = requests.filter((r) => r.status === 'Approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'Rejected').length;

  const pendingApproval = requests.filter(
    (r) => r.status === 'Submitted' || r.status === 'Under QA Review',
  ).length;
  const revisionRequired = requests.filter((r) => r.status === 'Revision Required').length;
  const approvedCount = completedCount;
  const decidedCount = requests.filter(
    (r) => r.status === 'Approved' || r.status === 'Rejected' || r.status === 'Revision Required',
  ).length;
  const approvalRate =
    decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;

  const displayDepartments = Array.from(
    new Set([
      ...departments,
      ...requests.map((r) => r.department).filter(Boolean),
      ...attendanceLogs.map((a) => a.department).filter(Boolean),
    ]),
  );

  const todayAttendanceLogs = useMemo(
    () => attendanceLogs.filter((a) => a.attendanceDate === todayStr),
    [attendanceLogs, todayStr],
  );

  const departmentAnalyticsRows: ExecutiveDepartmentAnalyticsRow[] = displayDepartments.map(
    (dept) => {
      const deptReqs = requests.filter((r) => r.department === dept);
      const deptAttToday = todayAttendanceLogs.filter((a) => a.department === dept);
      return {
        department: dept,
        totalTasks: deptReqs.length,
        pendingCount: deptReqs.filter((r) => r.status === 'Draft' || r.status === 'Submitted').length,
        inProgressCount: deptReqs.filter(
          (r) => r.status === 'Under QA Review' || r.status === 'Revision Required',
        ).length,
        completedCount: deptReqs.filter((r) => r.status === 'Approved').length,
        rejectedCount: deptReqs.filter((r) => r.status === 'Rejected').length,
        presentToday: deptAttToday.filter((a) => a.status === 'Present').length,
        lateToday: deptAttToday.filter((a) => a.status === 'Late').length,
        completedShiftToday: deptAttToday.filter((a) => a.status === 'Completed').length,
      };
    },
  );

  const maxDeptCount = Math.max(1, ...departmentAnalyticsRows.map((d) => d.totalTasks));

  // SVG Donut chart geometry (r = 52, circumference = 2 * pi * 52 = 326.7256)
  const donutRadius = 52;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const completionPct =
    totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 0;
  const donutSegments = [
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
  ];

  const scorecardRows: DepartmentScorecardRow[] = displayDepartments.map((dept) => {
    const deptRequests = requests.filter((r) => r.department === dept);
    const total = deptRequests.length;
    const approved = deptRequests.filter((r) => r.status === 'Approved').length;
    const decided = deptRequests.filter(
      (r) => r.status === 'Approved' || r.status === 'Rejected' || r.status === 'Revision Required',
    ).length;
    const approvalRatePct = decided > 0 ? Math.round((approved / decided) * 100) : 0;
    const overdue = deptRequests.filter((r) => isRequestOverdue(r)).length;
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
    };
  });

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

  const overdueCount = requests.filter((r) => isRequestOverdue(r)).length;

  const portfolioBudgetUsd = projects.reduce(
    (sum, p) => sum + toUsdEquivalent(p.estimatedBudget ?? 0, p.currency || 'USD'),
    0,
  );
  const portfolioSpendUsd = projects.reduce(
    (sum, p) => sum + toUsdEquivalent(p.actualSpend ?? 0, p.currency || 'USD'),
    0,
  );
  const portfolioUtilPct = getBudgetUtilizationPct(portfolioBudgetUsd, portfolioSpendUsd);
  const overBudgetProjectsCount = projects.filter(
    (p) => getBudgetUtilizationPct(p.estimatedBudget ?? 0, p.actualSpend ?? 0) > 100,
  ).length;

  const urgentRequests = requests
    .filter(
      (r) =>
        r.status !== 'Approved' &&
        r.status !== 'Rejected' &&
        (isRequestOverdue(r) ||
          r.priority === 'Urgent' ||
          r.priority === 'High' ||
          r.status === 'Revision Required'),
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 6);

  const kpis = [
    {
      label: 'Total Operational Requests',
      value: totalRequests,
      trend:
        totalRequests === 0
          ? 'Clean workspace'
          : `${requests.filter((r) => r.status === 'Submitted').length} awaiting review`,
      trendPositive: true,
      icon: FileText,
      accent: 'text-indigo-600',
      onClick: () => onNavigateToQueue('All'),
    },
    {
      label: 'Pending QA / Approval',
      value: pendingApproval,
      trend: `${requests.filter((r) => r.status === 'Under QA Review').length} actively in QA`,
      trendPositive: true,
      icon: Clock,
      accent: 'text-amber-600',
      onClick: () => onNavigateToQueue('Under QA Review'),
    },
    {
      label: 'Revision Required',
      value: revisionRequired,
      trend: revisionRequired > 0 ? 'Action needed by owner' : 'Zero blockers',
      trendPositive: revisionRequired === 0,
      icon: AlertTriangle,
      accent: 'text-rose-600',
      onClick: () => onNavigateToQueue('Revision Required'),
    },
    {
      label: 'Overall Approval Rate',
      value: `${approvalRate}%`,
      trend: `${approvedCount} of ${decidedCount} reviewed`,
      trendPositive: approvalRate >= 70,
      icon: CheckCircle2,
      accent: 'text-emerald-600',
      onClick: () => onNavigateToQueue('Approved'),
    },
  ];

  let cumulativeOffset = 0;

  return (
    <div className="space-y-6">
      {/* Executive Action Strip with Export KPI CSV & Calibri PDF Report */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Executive Governance Snapshot</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {overdueCount > 0 ? (
              <span className="font-semibold text-rose-700">
                {overdueCount} SLA Overdue Alert{overdueCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-emerald-700">All active SLAs on track</span>
            )}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-slate-700 tabular-nums">
            <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
            {todayAttendanceLogs.length} Staff Clocked In Today
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExecutiveKpiCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
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
            <span>Export Print / PDF Report</span>
          </button>
        </div>
      </div>

      {/* Prominent Company Notice Board & Announcements Widget */}
      <section
        aria-label="Company Notice Board & Announcements"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Company Notice Board &amp; Announcements
              </h2>
              <p className="text-xs text-slate-500">
                Official circulars, policy updates, and company notices
              </p>
            </div>
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={openPostNotice}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Post Official Notice</span>
            </button>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
              Official Notices ({activeNotices.length})
            </span>
          )}
        </div>

        {activeNotices.length === 0 ? (
          <div className="py-8 text-center">
            <Megaphone className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-800">
              No active company announcements
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {isAdmin
                ? 'Post circulars, holiday schedules, or HR policy notices using the button above.'
                : 'Official company announcements posted by Administrators will appear here.'}
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
                      ? 'border-rose-200 bg-rose-50/50'
                      : notice.pinned
                        ? 'border-indigo-200 bg-indigo-50/40'
                        : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            tag === 'Urgent'
                              ? 'border-rose-300 bg-rose-100 text-rose-800'
                              : tag === 'HR'
                                ? 'border-amber-300 bg-amber-100 text-amber-900'
                                : 'border-indigo-200 bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {tag}
                        </span>
                        {notice.pinned && (
                          <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            <Pin className="h-2.5 w-2.5 text-indigo-600" />
                            Pinned
                          </span>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onTogglePinAnnouncement(notice.id)}
                            title={notice.pinned ? 'Unpin notice' : 'Pin notice'}
                            className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
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
                            className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {isConfirmingDel ? (
                            <div className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteAnnouncement(notice.id);
                                  setConfirmDeleteNoticeId(null);
                                }}
                                className="text-[10px] font-bold text-rose-700 hover:underline"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteNoticeId(null)}
                                className="text-[10px] text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteNoticeId(notice.id)}
                              title="Delete notice"
                              className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-slate-900">{notice.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {notice.message}
                    </p>
                  </div>

                  <p className="mt-3 border-t border-slate-200/70 pt-2 font-mono text-[10px] text-slate-500">
                    Posted by {notice.publishedBy} · {formatDateTime(notice.publishedAt)}
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
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/40 focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${kpi.accent}`} aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-3xl">
                  {kpi.value}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    kpi.trendPositive ? 'text-emerald-700' : 'text-rose-700'
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
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Task Completion Breakdown (SVG Donut Chart) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Task Completion Breakdown
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Pending vs. In Progress vs. Completed governance distribution
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
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
                  stroke="#f1f5f9"
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
                <span className="font-display text-xl font-bold text-slate-900 tabular-nums">
                  {completionPct}%
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Completed</span>
              </div>
            </div>

            <div className="w-full flex-1 divide-y divide-slate-100">
              {donutSegments.map((seg) => {
                const pct =
                  totalRequests > 0 ? Math.round((seg.count / totalRequests) * 100) : 0;
                return (
                  <button
                    key={seg.label}
                    type="button"
                    onClick={() => onNavigateToQueue(seg.queueFilter)}
                    className="flex w-full items-center justify-between py-2 text-left text-xs transition-colors hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-800">
                      <span className={`h-2.5 w-2.5 rounded-xs ${seg.dotClass}`} />
                      {seg.label}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {seg.count} <span className="text-slate-400">({pct}%)</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular 6-stage pipeline bar */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {STATUS_ORDER.map(({ status, barColor }) => {
                const count = requests.filter((r) => r.status === status).length;
                if (count === 0 || totalRequests === 0) return null;
                return (
                  <div
                    key={status}
                    className={`${barColor} h-full border-r border-white last:border-r-0`}
                    style={{ width: `${(count / totalRequests) * 100}%` }}
                    title={`${status}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Department Workload &amp; Attendance Summary
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Task volume, completion progress &amp; today&apos;s staff attendance across departments
              </p>
            </div>
            <span className="font-mono text-xs font-medium text-slate-500 tabular-nums">
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
                    <span className="font-semibold text-slate-800">{item.department}</span>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
                      <span className="text-slate-600">
                        {item.totalTasks} tasks ({item.completedCount} done ·{' '}
                        {item.pendingCount + item.inProgressCount} active)
                      </span>
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                        Attendance Today: {todayAttTotal}
                        {item.lateToday > 0 ? ` (${item.lateToday} Late)` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
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

          <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
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

      {/* Financial Cost-Center & Budget Variance Tracker */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Financial Cost-Center &amp; Budget Variance Tracker
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Multi-currency project &amp; vendor budget utilization normalized in USD equivalent
              </p>
            </div>
          </div>

          {onNavigateToProjects && (
            <button
              type="button"
              onClick={onNavigateToProjects}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <span>Manage Cost Centers</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-medium text-slate-500">
              Portfolio Estimated Budget (USD eq.)
            </p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(portfolioBudgetUsd, 'USD')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-medium text-slate-500">
              Portfolio Actual Spend (USD eq.)
            </p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(portfolioSpendUsd, 'USD')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-500">Overall Utilization</p>
              <span
                className={`font-mono text-[11px] font-bold ${
                  overBudgetProjectsCount > 0 ? 'text-rose-700' : 'text-emerald-700'
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
                  className="rounded-xl border border-slate-200 bg-white p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-indigo-700">
                          {proj.code}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                          {cur}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs font-bold text-slate-900">
                        {proj.name}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums shrink-0">
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

      {/* Department Performance & Turnaround Scorecard */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Department Performance &amp; Turnaround
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Throughput scorecard comparing approval velocity, SLA adherence, and QA checklist completion
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadScorecard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Scorecard CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-3 pl-6">Department</th>
                <th className="px-3 py-3 text-right">Total Requests</th>
                <th className="px-3 py-3">Approval Rate %</th>
                <th className="px-3 py-3 text-right">Overdue Count</th>
                <th className="py-3 pr-6 pl-3">Avg QA Checklist Completion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scorecardRows.map((row) => (
                <tr key={row.department} className="transition-colors hover:bg-slate-50/70">
                  <td className="py-3.5 pr-3 pl-6 font-semibold text-slate-900 whitespace-nowrap">
                    {row.department}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums">
                    {row.totalRequests}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            row.approvalRatePct >= 75
                              ? 'bg-emerald-600'
                              : row.approvalRatePct >= 40
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                          }`}
                          style={{ width: `${row.approvalRatePct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {row.approvalRatePct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-xs tabular-nums">
                    {row.overdueCount > 0 ? (
                      <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-rose-700">
                        {row.overdueCount}
                      </span>
                    ) : (
                      <span className="font-medium text-emerald-700">0</span>
                    )}
                  </td>
                  <td className="py-3.5 pr-6 pl-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            row.avgChecklistPct >= 80
                              ? 'bg-indigo-600'
                              : row.avgChecklistPct >= 50
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                          }`}
                          style={{ width: `${row.avgChecklistPct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {row.avgChecklistPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Urgent Attention Table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Urgent Attention Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              High/Urgent priority submissions and revision blockers requiring immediate action
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToQueue('All')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <span>View Full Queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {urgentRequests.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              All high-priority and urgent items have been resolved.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              New urgent requests will automatically surface here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-3 pl-6">Request ID</th>
                  <th className="px-3 py-3">Operational Deliverable</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="py-3 pr-6 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {urgentRequests.map((req) => {
                  const overdue = isRequestOverdue(req);
                  return (
                    <tr
                      key={req.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="py-3.5 pr-3 pl-6 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {req.id}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="max-w-xs truncate font-medium text-slate-900">{req.title}</p>
                        <p className="text-xs text-slate-500">
                          {req.category} · {req.submittedBy}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {req.department}
                      </td>
                      <td className="px-3 py-3.5">
                        <PriorityBadge priority={req.priority} />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={req.status} />
                          {overdue && <OverdueBadge days={getOverdueDays(req.dueDate)} />}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3.5 font-mono text-xs tabular-nums whitespace-nowrap ${
                          overdue ? 'font-semibold text-rose-700' : 'text-slate-600'
                        }`}
                      >
                        {formatShortDate(req.dueDate)}
                      </td>
                      <td className="py-3.5 pr-6 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenRequest(req)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
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

      {/* Post / Edit Official Notice Modal (Admin Only) */}
      {noticeModalOpen && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-indigo-600" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  {editingNotice ? 'Edit Official Company Notice' : 'Post Official Company Notice'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNoticeModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleNoticeSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {noticeError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {noticeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Headline <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="e.g., Official Holiday Notice & Updated Attendance Cutoff"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Priority Tag
                  </label>
                  <select
                    value={noticeTag}
                    onChange={(e) => setNoticeTag(e.target.value as AnnouncementPriorityTag)}
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
                      checked={noticePinned}
                      onChange={(e) => setNoticePinned(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Pin to top of Notice Board
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Circular / Policy Details <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={noticeMessage}
                  onChange={(e) => setNoticeMessage(e.target.value)}
                  placeholder="Write official circular text, effective dates, and action items..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setNoticeModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
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

