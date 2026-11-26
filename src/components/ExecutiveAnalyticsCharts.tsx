import { BarChart3, CalendarRange, CheckCircle2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AttendanceLog, OperationalRequest, TeamMember } from '../types/nexops';
import { getTodayDateString, isSuperAdminEmail } from '../utils/storage';

interface ExecutiveAnalyticsChartsProps {
  requests: OperationalRequest[];
  attendanceLogs: AttendanceLog[];
  teamMembers: TeamMember[];
  departments: string[];
}

interface MonthTrendPoint {
  monthKey: string;
  label: string;
  totalSubmitted: number;
  approved: number;
  attendanceCount: number;
}

export function ExecutiveAnalyticsCharts({
  requests,
  attendanceLogs,
  teamMembers,
  departments,
}: ExecutiveAnalyticsChartsProps) {
  const [hoveredDept, setHoveredDept] = useState<string | null>(null);
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  const displayDepartments = useMemo(
    () =>
      Array.from(
        new Set([
          ...departments,
          ...requests.map((r) => r.department).filter(Boolean),
          ...attendanceLogs.map((a) => a.department).filter(Boolean),
        ]),
      ).slice(0, 8),
    [departments, requests, attendanceLogs],
  );

  // 1. Department-wise Attendance Rate (%)
  const deptAttendanceStats = useMemo(() => {
    const approvedActive = teamMembers.filter(
      (m) =>
        m.active &&
        ((m.approvalStatus ?? 'approved') === 'approved' || isSuperAdminEmail(m.email)),
    );
    const todayLogs = attendanceLogs.filter((a) => a.attendanceDate === todayStr);

    return displayDepartments.map((dept) => {
      const staffInDept = approvedActive.filter((m) => m.department === dept).length;
      const logsInDept = todayLogs.filter((a) => a.department === dept);
      const uniqueEmails = new Set(
        logsInDept.map((l) => l.userEmail.trim().toLowerCase()).filter(Boolean),
      );
      const presentCount = uniqueEmails.size > 0 ? uniqueEmails.size : logsInDept.length;
      const ratePct =
        staffInDept > 0
          ? Math.min(100, Math.round((presentCount / staffInDept) * 100))
          : presentCount > 0
            ? 100
            : 0;

      return {
        department: dept,
        staffCount: staffInDept,
        presentCount,
        ratePct,
      };
    });
  }, [displayDepartments, teamMembers, attendanceLogs, todayStr]);

  // 2. Request Approval Status Breakdown
  const approvalBreakdown = useMemo(() => {
    const total = Math.max(1, requests.length);
    const items = [
      {
        label: 'Approved',
        count: requests.filter((r) => r.status === 'Approved').length,
        color: '#059669',
        bgClass: 'bg-emerald-500',
      },
      {
        label: 'Under QA Review',
        count: requests.filter((r) => r.status === 'Under QA Review').length,
        color: '#d97706',
        bgClass: 'bg-amber-500',
      },
      {
        label: 'Submitted',
        count: requests.filter((r) => r.status === 'Submitted').length,
        color: '#4f46e5',
        bgClass: 'bg-indigo-600',
      },
      {
        label: 'Revision Required',
        count: requests.filter((r) => r.status === 'Revision Required').length,
        color: '#e11d48',
        bgClass: 'bg-rose-600',
      },
      {
        label: 'Draft',
        count: requests.filter((r) => r.status === 'Draft').length,
        color: '#64748b',
        bgClass: 'bg-slate-500',
      },
      {
        label: 'Rejected',
        count: requests.filter((r) => r.status === 'Rejected').length,
        color: '#9f1239',
        bgClass: 'bg-rose-800',
      },
    ];
    return items.map((item) => ({
      ...item,
      pct: requests.length > 0 ? Math.round((item.count / total) * 100) : 0,
    }));
  }, [requests]);

  const maxStatusCount = useMemo(
    () => Math.max(1, ...approvalBreakdown.map((b) => b.count)),
    [approvalBreakdown],
  );

  // 3. Monthly Operational Trends (last 6 months)
  const monthlyTrends: MonthTrendPoint[] = useMemo(() => {
    const now = new Date();
    const months: MonthTrendPoint[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthReqs = requests.filter((r) => (r.createdAt || '').startsWith(monthKey));
      const monthAtt = attendanceLogs.filter((a) => (a.attendanceDate || '').startsWith(monthKey));
      months.push({
        monthKey,
        label,
        totalSubmitted: monthReqs.length,
        approved: monthReqs.filter((r) => r.status === 'Approved').length,
        attendanceCount: monthAtt.length,
      });
    }
    return months;
  }, [requests, attendanceLogs]);

  const trendMax = useMemo(
    () =>
      Math.max(
        4,
        ...monthlyTrends.flatMap((m) => [m.totalSubmitted, m.approved, m.attendanceCount]),
      ),
    [monthlyTrends],
  );

  // Build SVG Polyline / Area coordinates for 6-month trend (viewBox 420 x 160)
  const svgWidth = 420;
  const svgHeight = 160;
  const padX = 28;
  const padTop = 16;
  const padBottom = 28;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padTop - padBottom;

  const getPointXY = (idx: number, val: number) => {
    const x =
      monthlyTrends.length > 1
        ? padX + (idx / (monthlyTrends.length - 1)) * chartW
        : padX + chartW / 2;
    const y = padTop + chartH - (val / trendMax) * chartH;
    return { x, y };
  };

  const submittedPts = monthlyTrends.map((m, i) => getPointXY(i, m.totalSubmitted));
  const approvedPts = monthlyTrends.map((m, i) => getPointXY(i, m.approved));
  const attendancePts = monthlyTrends.map((m, i) => getPointXY(i, m.attendanceCount));

  const toPolyline = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const toArea = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    const baseY = padTop + chartH;
    return `M ${pts[0].x.toFixed(1)} ${baseY} L ${pts
      .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' L ')} L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} Z`;
  };

  return (
    <section
      aria-label="Executive Analytics Charts"
      className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3"
    >
      {/* Chart 1: Department-Wise Attendance Rate */}
      <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Department Attendance Rate
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Live check-in coverage today ({todayStr})
            </p>
          </div>
          <Users className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="mt-4 flex-1">
          {deptAttendanceStats.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No department attendance data available yet.
            </p>
          ) : (
            <div className="space-y-3">
              {deptAttendanceStats.map((row) => {
                const isHovered = hoveredDept === row.department;
                return (
                  <div
                    key={row.department}
                    onMouseEnter={() => setHoveredDept(row.department)}
                    onMouseLeave={() => setHoveredDept(null)}
                    className={`rounded-lg p-1.5 transition-colors ${
                      isHovered ? 'bg-slate-50 dark:bg-slate-800/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                        {row.department}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold text-indigo-700 tabular-nums dark:text-indigo-400">
                        {row.ratePct}% ({row.presentCount}/{row.staffCount || row.presentCount})
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 240 10"
                      className="mt-1 h-2.5 w-full overflow-visible"
                      aria-label={`${row.department} attendance ${row.ratePct}%`}
                    >
                      <rect
                        x="0"
                        y="1"
                        width="240"
                        height="8"
                        rx="4"
                        className="fill-slate-100 dark:fill-slate-800"
                      />
                      <rect
                        x="0"
                        y="1"
                        width={Math.max(4, (row.ratePct / 100) * 240)}
                        height="8"
                        rx="4"
                        className={
                          row.ratePct >= 80
                            ? 'fill-emerald-600'
                            : row.ratePct >= 50
                              ? 'fill-indigo-600'
                              : 'fill-amber-500'
                        }
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chart 2: Request Approval Status Breakdown */}
      <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Request Approval Breakdown
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Workflow distribution across {requests.length} requests
            </p>
          </div>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        </div>

        <div className="mt-4 flex-1 space-y-2.5">
          {approvalBreakdown.map((item) => {
            const barWidth =
              requests.length > 0 ? Math.max(4, (item.count / maxStatusCount) * 180) : 0;
            const active = hoveredStatus === item.label;
            return (
              <div
                key={item.label}
                onMouseEnter={() => setHoveredStatus(item.label)}
                onMouseLeave={() => setHoveredStatus(null)}
                className={`rounded-lg px-2 py-1 transition-colors ${
                  active ? 'bg-slate-50 dark:bg-slate-800/60' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                    <span className={`h-2 w-2 rounded-full ${item.bgClass}`} />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {item.count} ({item.pct}%)
                  </span>
                </div>
                <svg viewBox="0 0 180 8" className="mt-1 h-2 w-full">
                  <rect
                    x="0"
                    y="1"
                    width="180"
                    height="6"
                    rx="3"
                    className="fill-slate-100 dark:fill-slate-800"
                  />
                  {item.count > 0 && (
                    <rect
                      x="0"
                      y="1"
                      width={barWidth}
                      height="6"
                      rx="3"
                      fill={item.color}
                    />
                  )}
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart 3: Monthly Operational Trends */}
      <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Monthly Operational Trends
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              6-month volume: Submitted, Approved &amp; Attendance
            </p>
          </div>
          <CalendarRange className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="mt-3 flex flex-1 flex-col justify-between">
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-44 w-full overflow-visible"
              role="img"
              aria-label="6 month operational trends chart"
            >
              {/* Horizontal Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padTop + chartH - ratio * chartH;
                const val = Math.round(ratio * trendMax);
                return (
                  <g key={ratio}>
                    <line
                      x1={padX}
                      y1={y}
                      x2={svgWidth - padX}
                      y2={y}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padX - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] dark:fill-slate-500"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Areas & Trend Lines */}
              <path d={toArea(submittedPts)} fill="rgba(79, 70, 229, 0.08)" />
              <polyline
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={toPolyline(submittedPts)}
              />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={toPolyline(approvedPts)}
              />
              <polyline
                fill="none"
                stroke="#d97706"
                strokeWidth="1.8"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={toPolyline(attendancePts)}
              />

              {/* Interactive Month Nodes & X-Axis Labels */}
              {monthlyTrends.map((m, idx) => {
                const subPt = submittedPts[idx];
                const appPt = approvedPts[idx];
                const attPt = attendancePts[idx];
                const active = hoveredMonthIdx === idx;
                return (
                  <g
                    key={m.monthKey}
                    onMouseEnter={() => setHoveredMonthIdx(idx)}
                    onMouseLeave={() => setHoveredMonthIdx(null)}
                    className="cursor-pointer"
                  >
                    {active && (
                      <line
                        x1={subPt.x}
                        y1={padTop}
                        x2={subPt.x}
                        y2={padTop + chartH}
                        className="stroke-slate-300 dark:stroke-slate-600"
                        strokeWidth="1"
                      />
                    )}
                    <circle
                      cx={subPt.x}
                      cy={subPt.y}
                      r={active ? 4.5 : 3}
                      fill="#4f46e5"
                    />
                    <circle
                      cx={appPt.x}
                      cy={appPt.y}
                      r={active ? 4.5 : 3}
                      fill="#059669"
                    />
                    <circle
                      cx={attPt.x}
                      cy={attPt.y}
                      r={active ? 4 : 2.5}
                      fill="#d97706"
                    />
                    <text
                      x={subPt.x}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      className={`text-[10px] font-semibold ${
                        active
                          ? 'fill-indigo-600 dark:fill-indigo-400'
                          : 'fill-slate-500 dark:fill-slate-400'
                      }`}
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Hover Tooltip Readout or Legend */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-950/60">
            {hoveredMonthIdx !== null && monthlyTrends[hoveredMonthIdx] ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  {monthlyTrends[hoveredMonthIdx].label}
                </span>
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span className="text-indigo-700 dark:text-indigo-400">
                    Req: {monthlyTrends[hoveredMonthIdx].totalSubmitted}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    App: {monthlyTrends[hoveredMonthIdx].approved}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    Att: {monthlyTrends[hoveredMonthIdx].attendanceCount}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  Submitted
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  Approved
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Attendance
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <BarChart3 className="h-3 w-3" />
                  Hover points
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
