import { CheckSquare, Printer, Square, X } from 'lucide-react';
import { useState } from 'react';
import {
  AttendanceLog,
  CompanyBrandingConfig,
  OperationalRequest,
  TeamMember,
} from '../types/nexops';
import { NexOpsLogo } from './NexOpsLogo';
import {
  formatCurrency,
  formatDateTime,
  formatShortDate,
  getOverdueDays,
  getTodayDateString,
  isRequestOverdue,
} from '../utils/storage';
import {
  AssetLinkBadge,
  OverdueBadge,
  PriorityBadge,
  ProjectLinkBadge,
  StatusBadge,
} from './StatusIndicator';

interface OfficialReportModalProps {
  branding: CompanyBrandingConfig;
  requests: OperationalRequest[];
  attendanceLogs?: AttendanceLog[];
  initialRequestId?: string | null;
  currentUser: TeamMember;
  onClose: () => void;
  onPrintTriggered: (reportTitle: string) => void;
}

export function OfficialReportModal({
  branding,
  requests,
  attendanceLogs = [],
  initialRequestId = null,
  currentUser,
  onClose,
  onPrintTriggered,
}: OfficialReportModalProps) {
  const [selectedScope, setSelectedScope] = useState<string>(initialRequestId || 'EXECUTIVE');

  const generatedAt = new Date().toISOString();

  const reportDepartments = Array.from(
    new Set([...branding.departments, ...requests.map((r) => r.department).filter(Boolean)]),
  );

  const targetRequest =
    selectedScope !== 'EXECUTIVE'
      ? requests.find((r) => r.id === selectedScope) ?? null
      : null;

  const handlePrint = () => {
    const label = targetRequest
      ? `Official Dossier ${targetRequest.id}`
      : 'Executive Operations Governance Report';
    onPrintTriggered(label);
    window.print();
  };

  // Executive aggregate stats
  const todayStr = getTodayDateString();
  const totalRequests = requests.length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;
  const pendingCount = requests.filter(
    (r) => r.status === 'Draft' || r.status === 'Submitted',
  ).length;
  const inProgressCount = requests.filter(
    (r) => r.status === 'Under QA Review' || r.status === 'Revision Required',
  ).length;
  const revisionCount = requests.filter((r) => r.status === 'Revision Required').length;
  const overdueRequests = requests.filter((r) => isRequestOverdue(r));

  return (
    <div
      className="print-report-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2.5 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="official-report-heading"
    >
      <div className="print-report-dialog flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Non-Printable Modal Action Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
            <h2
              id="official-report-heading"
              className="font-display text-sm font-bold text-slate-900"
            >
              Official Governance Report Preview
            </h2>
            <select
              aria-label="Select report scope"
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="h-8 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="EXECUTIVE">Executive Portfolio Summary (All Requests)</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report preview"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="print-report-scroll flex-1 overflow-y-auto bg-white p-4 sm:p-8 md:p-10">
          <div id="official-print-report" className="mx-auto max-w-3xl space-y-7 text-slate-900">
            {/* Corporate Letterhead */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
              <NexOpsLogo
                size={38}
                showWordmark
                layout="horizontal"
                surface="light"
                title={branding.companyName}
                tagline={branding.tagline}
                wordmarkClassName="block font-sans text-lg font-semibold tracking-tight text-slate-900"
                taglineClassName="mt-0.5 block font-sans text-xs font-normal text-slate-500"
              />

              <div className="text-right text-xs">
                <p className="font-semibold text-slate-900">
                  {targetRequest ? 'Official Request Approval Dossier' : 'Executive Portfolio Audit'}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                  Generated: {formatDateTime(generatedAt)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Prepared by: <span className="font-semibold text-slate-900">{currentUser.name}</span> ·{' '}
                  {currentUser.signOffTitle || currentUser.title} ({currentUser.employeeId})
                </p>
              </div>
            </header>

            {targetRequest ? (
              <SingleRequestReportBody request={targetRequest} />
            ) : (
              <div className="space-y-7">
                {/* Executive KPI Grid */}
                <section className="print-avoid-break">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    01. Executive Governance Summary
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <p className="text-[11px] font-medium text-slate-500">Total Requests</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">
                        {totalRequests}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <p className="text-[11px] font-medium text-slate-500">Approved</p>
                      <p className="mt-1 font-display text-xl font-bold text-emerald-700 tabular-nums">
                        {approvedCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <p className="text-[11px] font-medium text-slate-500">Pending / In Progress</p>
                      <p className="mt-1 font-display text-xl font-bold text-amber-700 tabular-nums">
                        {pendingCount} / {inProgressCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3.5">
                      <p className="text-[11px] font-medium text-slate-500">
                        Overdue / Revision
                      </p>
                      <p className="mt-1 font-display text-xl font-bold text-rose-700 tabular-nums">
                        {overdueRequests.length} / {revisionCount}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Departmental Breakdown */}
                <section className="print-avoid-break">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    02. Department Workload &amp; Today&apos;s Attendance Summary
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[540px] border-collapse border border-slate-200 text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 font-semibold text-slate-600">
                        <th className="border-b border-slate-200 px-3 py-2">Department</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">
                          Total
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">
                          Completed
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">
                          Pending / In Progress
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">
                          Overdue SLA
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right">
                          Attendance Today
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reportDepartments.map((dept) => {
                        const items = requests.filter((r) => r.department === dept);
                        const app = items.filter((r) => r.status === 'Approved').length;
                        const pend = items.filter(
                          (r) =>
                            r.status === 'Draft' ||
                            r.status === 'Submitted' ||
                            r.status === 'Under QA Review' ||
                            r.status === 'Revision Required',
                        ).length;
                        const over = items.filter((r) => isRequestOverdue(r)).length;
                        const deptAtt = attendanceLogs.filter(
                          (a) => a.attendanceDate === todayStr && a.department === dept,
                        ).length;
                        return (
                          <tr key={dept}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{dept}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {items.length}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-700 tabular-nums">
                              {app}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {pend}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-rose-700 tabular-nums">
                              {over}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-indigo-700 tabular-nums">
                              {deptAtt}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </section>

                {/* Individual Request Register with QA & Audit Summary */}
                <section className="space-y-4">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    03. Operational Request Register &amp; QA Verification Status
                  </h3>
                  {requests.map((req) => {
                    const overdue = isRequestOverdue(req);
                    const verified = req.checklist.filter((c) => c.checked).length;
                    const latestEvent = [...req.auditTrail].sort(
                      (a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                    )[0];

                    return (
                      <div
                        key={req.id}
                        className="print-avoid-break rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums">
                              {req.id}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{req.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {overdue && <OverdueBadge days={getOverdueDays(req.dueDate)} />}
                            <PriorityBadge priority={req.priority} />
                            <StatusBadge status={req.status} />
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
                          <span>Dept: {req.department}</span>
                          <span>Owner: {req.submittedBy}</span>
                          <span>Reviewer: {req.assignedReviewer}</span>
                          <span className="font-mono tabular-nums">
                            Due: {formatShortDate(req.dueDate)}
                          </span>
                          <span className="font-mono tabular-nums">
                            QA Gates: {verified}/{req.checklist.length} Verified
                          </span>
                          {req.projectCode && (
                            <ProjectLinkBadge code={req.projectCode} name={req.projectName} />
                          )}
                          {req.assetTag && (
                            <AssetLinkBadge tag={req.assetTag} name={req.assetName} />
                          )}
                        </div>

                        {latestEvent && (
                          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-800">Latest Audit:</span>{' '}
                            [{formatDateTime(latestEvent.timestamp)}] {latestEvent.actorName} —{' '}
                            {latestEvent.details}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              </div>
            )}

            {/* Digital Approval Sign-Off Block & Official Footer */}
            <section className="print-avoid-break rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-slate-500">
                    AUTHORIZED DIGITAL SIGN-OFF
                  </p>
                  <p className="mt-1 font-display text-sm font-bold text-slate-900">
                    {currentUser.name}
                  </p>
                  <p className="text-xs font-semibold text-indigo-700">
                    {currentUser.signOffTitle || currentUser.role}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {currentUser.department} · {currentUser.role}
                  </p>
                </div>
                <div className="text-right font-mono text-[11px] text-slate-600 tabular-nums">
                  <p>Employee ID: {currentUser.employeeId}</p>
                  <p className="mt-0.5">Signed Timestamp: {formatDateTime(generatedAt)}</p>
                  <p className="mt-0.5 text-emerald-700 font-semibold">
                    Verified Corporate Session
                  </p>
                </div>
              </div>
            </section>

            {/* Official Sign-Off Footer */}
            <footer className="print-avoid-break border-t border-slate-200 pt-4 text-[11px] text-slate-500">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{branding.companyName} · Internal Operations &amp; Compliance Dossier</span>
                <span className="font-mono tabular-nums">Document Ref: NX-{generatedAt.slice(0, 10)}</span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function SingleRequestReportBody({ request }: { request: OperationalRequest }) {
  const overdue = isRequestOverdue(request);
  const overdueDays = overdue ? getOverdueDays(request.dueDate) : 0;
  const totalChecks = request.checklist.length;
  const doneChecks = request.checklist.filter((c) => c.checked).length;
  const completionPct = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Request Identification & Status */}
      <section className="print-avoid-break rounded-xl border border-slate-200 bg-slate-50/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-indigo-700 tabular-nums">
              {request.id}
            </span>
            <PriorityBadge priority={request.priority} />
            <StatusBadge status={request.status} />
            {overdue && <OverdueBadge days={overdueDays} />}
            {request.projectCode && (
              <ProjectLinkBadge code={request.projectCode} name={request.projectName} />
            )}
            {request.assetTag && (
              <AssetLinkBadge tag={request.assetTag} name={request.assetName} />
            )}
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            Target Due: {formatShortDate(request.dueDate)}
            {overdue ? ` (${overdueDays}d overdue)` : ''}
          </span>
        </div>

        <h3 className="mt-3 font-display text-lg font-bold text-slate-900">{request.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-700">{request.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs sm:grid-cols-5">
          <div>
            <p className="text-[11px] text-slate-500">Department</p>
            <p className="font-semibold text-slate-900">{request.department}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Category</p>
            <p className="font-semibold text-slate-900">{request.category}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Project / Client</p>
            <p className="font-semibold text-slate-900">
              {request.projectCode
                ? `${request.projectCode}${request.projectName ? ` · ${request.projectName}` : ''}`
                : 'General Operations'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Submitted By</p>
            <p className="font-semibold text-slate-900">{request.submittedBy}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Assigned Reviewer</p>
            <p className="font-semibold text-slate-900">{request.assignedReviewer}</p>
          </div>
        </div>

        {(typeof request.estimatedCost === 'number' ||
          request.stage1Approval ||
          request.stage2Approval) && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 text-xs sm:grid-cols-3">
            {typeof request.estimatedCost === 'number' && (
              <div>
                <p className="text-[11px] text-slate-500">Cost-Center Budget / Spend</p>
                <p className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(request.actualSpend ?? 0, request.currency || 'USD')} /{' '}
                  {formatCurrency(request.estimatedCost, request.currency || 'USD')}
                </p>
              </div>
            )}
            {request.stage1Approval && (
              <div>
                <p className="text-[11px] text-slate-500">Stage 1 QA Sign-Off</p>
                <p className="font-semibold text-emerald-700">
                  {request.stage1Approval.actorName} ({request.stage1Approval.signOffTitle || request.stage1Approval.actorRole})
                </p>
              </div>
            )}
            {request.stage2Approval && (
              <div>
                <p className="text-[11px] text-slate-500">Stage 2 Executive Sign-Off</p>
                <p className="font-semibold text-emerald-700">
                  {request.stage2Approval.actorName} ({request.stage2Approval.signOffTitle || request.stage2Approval.actorRole})
                </p>
              </div>
            )}
          </div>
        )}

        {request.deliverableUrl && (
          <p className="mt-3 font-mono text-[11px] text-slate-600">
            Deliverable Reference: {request.deliverableUrl}
          </p>
        )}
      </section>

      {/* QA Verification Checklist Results */}
      <section className="print-avoid-break">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-bold text-slate-900">
            QA Verification Checklist Results
          </h4>
          <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
            {doneChecks}/{totalChecks} Verified ({completionPct}%)
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse border border-slate-200 text-left text-xs">
          <thead>
            <tr className="bg-slate-50 font-semibold text-slate-600">
              <th className="border-b border-slate-200 px-3 py-2">State</th>
              <th className="border-b border-slate-200 px-3 py-2">Verification Gate</th>
              <th className="border-b border-slate-200 px-3 py-2">Requirement</th>
              <th className="border-b border-slate-200 px-3 py-2">Verified By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {request.checklist.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {item.checked ? (
                      <>
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Passed</span>
                      </>
                    ) : (
                      <>
                        <Square className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-500">Pending</span>
                      </>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-800">{item.label}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className={`font-semibold ${
                      item.mandatory ? 'text-amber-700' : 'text-slate-500'
                    }`}
                  >
                    {item.mandatory ? 'Mandatory' : 'Optional'}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                  {item.checked && item.verifiedBy
                    ? `${item.verifiedBy} (${item.verifiedAt ? formatDateTime(item.verifiedAt) : ''})`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </section>

      {/* Full Chronological Audit Trail */}
      <section>
        <h4 className="font-display text-sm font-bold text-slate-900">
          Full Chronological Audit Trail ({request.auditTrail.length} Events)
        </h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse border border-slate-200 text-left text-xs">
          <thead>
            <tr className="bg-slate-50 font-semibold text-slate-600">
              <th className="border-b border-slate-200 px-3 py-2">Timestamp</th>
              <th className="border-b border-slate-200 px-3 py-2">Actor &amp; Role</th>
              <th className="border-b border-slate-200 px-3 py-2">Action</th>
              <th className="border-b border-slate-200 px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {[...request.auditTrail]
              .sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
              )
              .map((event) => (
                <tr key={event.id} className="print-avoid-break">
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                    {formatDateTime(event.timestamp)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-semibold text-slate-900">{event.actorName}</p>
                    <p className="text-[11px] text-slate-500">
                      {event.actorSignOffTitle
                        ? `${event.actorSignOffTitle} · ${event.actorRole}`
                        : event.actorRole}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                    {event.actionType}
                  </td>
                  <td className="px-3 py-2.5 leading-relaxed text-slate-700">{event.details}</td>
                </tr>
              ))}
          </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
