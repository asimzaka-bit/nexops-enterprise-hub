import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileOutput,
  FileText,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { CompanyProject, OperationalRequest, RequestStatus } from '../types/nexops';
import {
  DepartmentScorecardRow,
  exportDepartmentScorecardCsv,
  formatCurrency,
  formatShortDate,
  getBudgetUtilizationPct,
  getOverdueDays,
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
  requests: OperationalRequest[];
  projects: CompanyProject[];
  departments: string[];
  onOpenRequest: (request: OperationalRequest) => void;
  onNavigateToQueue: (statusFilter?: RequestStatus | 'All') => void;
  onNavigateToProjects?: () => void;
  onOpenExecutiveReport: () => void;
  onExportScorecardSuccess?: (deptCount: number) => void;
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
  requests,
  projects,
  departments,
  onOpenRequest,
  onNavigateToQueue,
  onNavigateToProjects,
  onOpenExecutiveReport,
  onExportScorecardSuccess,
}: DashboardViewProps) {
  const totalRequests = requests.length;
  const pendingApproval = requests.filter(
    (r) => r.status === 'Submitted' || r.status === 'Under QA Review',
  ).length;
  const revisionRequired = requests.filter((r) => r.status === 'Revision Required').length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;
  const decidedCount = requests.filter(
    (r) => r.status === 'Approved' || r.status === 'Rejected' || r.status === 'Revision Required',
  ).length;
  const approvalRate =
    decidedCount > 0 ? Math.round((approvedCount / decidedCount) * 100) : 0;

  const displayDepartments = Array.from(
    new Set([...departments, ...requests.map((r) => r.department).filter(Boolean)]),
  );

  const deptCounts = displayDepartments.map((dept) => ({
    department: dept,
    total: requests.filter((r) => r.department === dept).length,
    approved: requests.filter((r) => r.department === dept && r.status === 'Approved').length,
  }));
  const maxDeptCount = Math.max(1, ...deptCounts.map((d) => d.total));

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

  // Urgent Attention: Overdue, High/Urgent priority, or Revision Required items not yet Approved/Rejected
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
      trend: '+14% vs prior cycle',
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

  return (
    <div className="space-y-6">
      {/* Executive Action Strip */}
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
        </div>

        <button
          type="button"
          onClick={onOpenExecutiveReport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
        >
          <FileOutput className="h-3.5 w-3.5" />
          <span>Export Official Report</span>
        </button>
      </div>

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

      {/* Visual Analytics Row */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Requests by Department Bar Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Requests by Department
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Volume distribution and approved throughput across corporate units
              </p>
            </div>
            <span className="font-mono text-xs font-medium text-slate-500 tabular-nums">
              Total: {totalRequests}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {deptCounts.map((item) => {
              const totalPct = Math.round((item.total / maxDeptCount) * 100);
              const approvedPct =
                item.total > 0 ? Math.round((item.approved / item.total) * 100) : 0;

              return (
                <div key={item.department} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.department}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {item.total} total · {item.approved} approved ({approvedPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="flex h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${Math.max(totalPct, item.total > 0 ? 8 : 0)}%` }}
                    >
                      {item.approved > 0 && (
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${approvedPct}%` }}
                          title={`${item.approved} Approved`}
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
              Approved requests
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600" aria-hidden="true" />
              In-flight / Active pipeline
            </span>
          </div>
        </div>

        {/* Status Distribution Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Workflow Status Distribution
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Real-time breakdown across governance stages
              </p>
            </div>
          </div>

          {/* Segmented proportional bar */}
          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {STATUS_ORDER.map(({ status, barColor }) => {
              const count = requests.filter((r) => r.status === status).length;
              if (count === 0 || totalRequests === 0) return null;
              const pct = (count / totalRequests) * 100;
              return (
                <div
                  key={status}
                  className={`${barColor} h-full border-r border-white last:border-r-0`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count}`}
                />
              );
            })}
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {STATUS_ORDER.map(({ status, barColor }) => {
              const count = requests.filter((r) => r.status === status).length;
              const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onNavigateToQueue(status)}
                  className="flex w-full items-center justify-between py-2.5 text-left text-xs transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5 font-medium text-slate-800">
                    <span className={`h-2.5 w-2.5 rounded-xs ${barColor}`} aria-hidden="true" />
                    <span>{status}</span>
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {count} <span className="text-slate-400">({pct}%)</span>
                  </span>
                </button>
              );
            })}
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
    </div>
  );
}
