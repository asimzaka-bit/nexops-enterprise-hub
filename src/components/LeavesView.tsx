import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  LogIn,
  LogOut,
  Plus,
  Search,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AttendanceLog,
  Department,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PermissionMatrix,
  Role,
  TeamMember,
} from '../types/nexops';
import {
  exportAttendanceLogsCsv,
  formatDateTime,
  formatShortDate,
  getTodayDateString,
} from '../utils/storage';

export interface CreateLeavePayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  backupDelegateName?: string;
}

interface LeavesViewProps {
  leaves: LeaveRequest[];
  attendanceLogs: AttendanceLog[];
  activeRole: Role;
  currentUser: TeamMember;
  departments: string[];
  teamMembers: TeamMember[];
  permissionMatrix: PermissionMatrix;
  onClockIn: () => void;
  onClockOut: (attendanceId: string) => void;
  onCreateLeave: (payload: CreateLeavePayload) => void;
  onDecisionLeave: (
    leaveId: string,
    decision: 'Approved' | 'Rejected',
    reviewerNotes?: string,
  ) => void;
}

const LEAVE_TYPES: LeaveType[] = ['Casual', 'Sick', 'Annual'];

function computeBusinessOrCalendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 1;
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

function formatClockTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function LeavesView({
  leaves,
  attendanceLogs,
  activeRole,
  currentUser,
  departments,
  teamMembers,
  permissionMatrix,
  onClockIn,
  onClockOut,
  onCreateLeave,
  onDecisionLeave,
}: LeavesViewProps) {
  const isAdmin = activeRole === 'Admin';
  void permissionMatrix;
  const isViewer = !isAdmin;
  const canSubmitLeave = isAdmin;
  const canClockAction = isAdmin;
  const canApproveLeaves = isAdmin;

  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'All'>('All');
  const [departmentFilter, setDepartmentFilter] = useState<Department | 'All'>('All');

  // Attendance table filters
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] = useState<string>('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    leave: LeaveRequest;
    decision: 'Approved' | 'Rejected';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');

  // Create Leave Form state
  const today = getTodayDateString();
  const [leaveType, setLeaveType] = useState<LeaveType>('Casual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [backupDelegateName, setBackupDelegateName] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const computedDays = useMemo(
    () => computeBusinessOrCalendarDays(startDate, endDate),
    [startDate, endDate],
  );

  const delegateCandidates = useMemo(
    () =>
      teamMembers.filter(
        (m) => m.active && m.id !== currentUser.id && m.name !== currentUser.name,
      ),
    [teamMembers, currentUser.id, currentUser.name],
  );

  const myTodayAttendance = useMemo(() => {
    const emailLower = currentUser.email.trim().toLowerCase();
    return attendanceLogs.find(
      (log) =>
        log.attendanceDate === today &&
        (log.userId === currentUser.id ||
          log.userEmail.trim().toLowerCase() === emailLower),
    );
  }, [attendanceLogs, today, currentUser.id, currentUser.email]);

  const visibleAttendanceLogs = useMemo(() => {
    const emailLower = currentUser.email.trim().toLowerCase();
    const scoped = isAdmin
      ? attendanceLogs
      : attendanceLogs.filter(
          (log) =>
            log.userId === currentUser.id ||
            log.userEmail.trim().toLowerCase() === emailLower,
        );

    const q = attendanceSearch.trim().toLowerCase();
    return scoped
      .filter((log) => {
        if (attendanceDateFilter && log.attendanceDate !== attendanceDateFilter) return false;
        if (!q) return true;
        return (
          log.userName.toLowerCase().includes(q) ||
          log.userEmail.toLowerCase().includes(q) ||
          log.employeeId.toLowerCase().includes(q) ||
          log.department.toLowerCase().includes(q) ||
          log.status.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.checkInTime.localeCompare(a.checkInTime));
  }, [
    attendanceLogs,
    isAdmin,
    currentUser.id,
    currentUser.email,
    attendanceSearch,
    attendanceDateFilter,
  ]);

  const scopedLeaves = useMemo(() => {
    if (isAdmin || canApproveLeaves) return leaves;
    const emailLower = currentUser.email.trim().toLowerCase();
    return leaves.filter(
      (l) =>
        (l.employeeEmail && l.employeeEmail.toLowerCase() === emailLower) ||
        l.employeeId === currentUser.employeeId ||
        l.employeeName.toLowerCase() === currentUser.name.toLowerCase(),
    );
  }, [leaves, isAdmin, canApproveLeaves, currentUser.email, currentUser.employeeId, currentUser.name]);

  const metrics = useMemo(() => {
    const pendingCount = scopedLeaves.filter((l) => l.status === 'Pending').length;
    const approvedCount = scopedLeaves.filter((l) => l.status === 'Approved').length;
    const presentTodayCount = attendanceLogs.filter(
      (a) => a.attendanceDate === today,
    ).length;
    const onLeaveTodayCount = leaves.filter(
      (l) => l.status === 'Approved' && l.startDate <= today && l.endDate >= today,
    ).length;
    return { pendingCount, approvedCount, presentTodayCount, onLeaveTodayCount };
  }, [scopedLeaves, attendanceLogs, leaves, today]);

  const filteredLeaves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedLeaves.filter((leave) => {
      if (statusFilter !== 'All' && leave.status !== statusFilter) return false;
      if (departmentFilter !== 'All' && leave.department !== departmentFilter) return false;
      if (!q) return true;
      return (
        leave.code.toLowerCase().includes(q) ||
        leave.employeeName.toLowerCase().includes(q) ||
        leave.employeeId.toLowerCase().includes(q) ||
        leave.leaveType.toLowerCase().includes(q) ||
        leave.reason.toLowerCase().includes(q)
      );
    });
  }, [scopedLeaves, searchQuery, statusFilter, departmentFilter]);

  const handleOpenCreate = () => {
    setLeaveType('Casual');
    setStartDate(today);
    setEndDate(today);
    setBackupDelegateName(delegateCandidates[0]?.name ?? '');
    setReason('');
    setFormError(null);
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitLeave) return;
    if (!startDate || !endDate) {
      setFormError('Start date and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }
    if (reason.trim().length < 5) {
      setFormError('Provide a concise handover / leave reason (at least 5 characters).');
      return;
    }

    onCreateLeave({
      leaveType,
      startDate,
      endDate,
      totalDays: computedDays,
      reason: reason.trim(),
      backupDelegateName: backupDelegateName.trim() || undefined,
    });
    setCreateModalOpen(false);
  };

  const handleDecisionSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!decisionTarget) return;
    if (decisionTarget.decision === 'Rejected' && !decisionNotes.trim()) {
      return;
    }
    onDecisionLeave(
      decisionTarget.leave.id,
      decisionTarget.decision,
      decisionNotes.trim() || undefined,
    );
    setDecisionTarget(null);
    setDecisionNotes('');
  };

  const getStatusBadge = (status: LeaveStatus) => {
    if (status === 'Approved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    }
    if (status === 'Rejected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
        <Clock className="h-3 w-3" />
        Pending Review
      </span>
    );
  };

  const getAttendanceStatusBadge = (status: AttendanceLog['status']) => {
    if (status === 'Completed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    }
    if (status === 'Late') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
          <Clock className="h-3 w-3" />
          Late
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
        <UserCheck className="h-3 w-3" />
        Present
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Daily Staff Clock-In / Clock-Out Console */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Daily Staff Attendance
            </h2>
            {myTodayAttendance ? (
              getAttendanceStatusBadge(myTodayAttendance.status)
            ) : (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Not Clocked In
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatShortDate(today)} · Office cutoff 09:30 AM · Live time:{' '}
            <span className="font-mono font-semibold text-slate-800 tabular-nums dark:text-slate-200">
              {nowTick.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {myTodayAttendance && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/60">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Check-In</p>
                <p className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {formatClockTime(myTodayAttendance.checkInTime)}
                </p>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
              <div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Check-Out</p>
                <p className="font-mono font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {myTodayAttendance.checkOutTime
                    ? formatClockTime(myTodayAttendance.checkOutTime)
                    : 'Active Shift'}
                </p>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
              <div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Hours</p>
                <p className="font-mono font-bold text-indigo-700 tabular-nums dark:text-indigo-400">
                  {typeof myTodayAttendance.totalHours === 'number'
                    ? `${myTodayAttendance.totalHours.toFixed(2)} hrs`
                    : 'In Progress'}
                </p>
              </div>
            </div>
          )}

          {canClockAction ? (
            !myTodayAttendance ? (
              <button
                type="button"
                onClick={onClockIn}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <LogIn className="h-4 w-4" />
                Clock In Now
              </button>
            ) : !myTodayAttendance.checkOutTime ? (
              <button
                type="button"
                onClick={() => onClockOut(myTodayAttendance.id)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <LogOut className="h-4 w-4" />
                Clock Out
              </button>
            ) : (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Shift Completed
              </span>
            )
          ) : (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Read-only mode (Viewer)
            </span>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Staff Checked In Today</span>
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.presentTodayCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recorded on {today}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Leave Approvals</span>
            <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.pendingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Awaiting Admin / manager sign-off</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Approved Time-Off</span>
            <CalendarCheck2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.approvedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cleared leave applications</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Team On Leave Today</span>
            <FileCheck2 className="h-4 w-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {metrics.onLeaveTodayCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Approved absence window today</p>
        </div>
      </div>

      {/* Staff Attendance Logs Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              {isAdmin ? 'All Staff Attendance Logs' : 'My Attendance History'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isAdmin
                ? 'Company-wide daily clock-in, clock-out & total working hours across all staff members'
                : 'Your daily clock-in, clock-out & verified working hours'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="search"
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
                placeholder="Search staff or dept..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
              />
            </div>
            <input
              type="date"
              aria-label="Filter attendance by date"
              value={attendanceDateFilter}
              onChange={(e) => setAttendanceDateFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            {attendanceDateFilter && (
              <button
                type="button"
                onClick={() => setAttendanceDateFilter('')}
                className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                All Dates
              </button>
            )}
            <button
              type="button"
              onClick={() => exportAttendanceLogsCsv(visibleAttendanceLogs)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              Export CSV
            </button>
          </div>
        </div>

        {visibleAttendanceLogs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Clock className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">No attendance logs recorded</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Use &ldquo;Clock In Now&rdquo; at the start of the workday to record check-in time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-2.5 pr-3 pl-6">Date</th>
                  <th className="px-3 py-2.5">Staff Member</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Check-In</th>
                  <th className="px-3 py-2.5">Check-Out</th>
                  <th className="px-3 py-2.5">Working Hours</th>
                  <th className="py-2.5 pr-6 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleAttendanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="py-3 pr-3 pl-6 font-mono font-semibold text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                      {log.attendanceDate}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{log.userName}</p>
                      <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                        {log.employeeId} · {log.userEmail}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{log.department}</td>
                    <td className="px-3 py-3 font-mono text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                      {formatDateTime(log.checkInTime)}
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600 tabular-nums whitespace-nowrap dark:text-slate-400">
                      {log.checkOutTime ? formatDateTime(log.checkOutTime) : 'Active Shift'}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-indigo-700 tabular-nums whitespace-nowrap dark:text-indigo-400">
                      {typeof log.totalHours === 'number' ? `${log.totalHours.toFixed(2)} hrs` : '—'}
                    </td>
                    <td className="py-3 pr-6 pl-3 text-right whitespace-nowrap">
                      {getAttendanceStatusBadge(log.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filter & Action Toolbar for Leaves */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leave ID, employee, type..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
            />
          </div>

          <select
            aria-label="Filter by leave status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeaveStatus | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            aria-label="Filter by department"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value as Department | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="All">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        {canSubmitLeave && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Request Leave</span>
          </button>
        )}
      </div>

      {/* Leaves Registry Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Leave &amp; Time-Off Approval Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredLeaves.length} of {scopedLeaves.length} leave records ·{' '}
              {canApproveLeaves
                ? '1-click Admin / manager approval enabled'
                : 'Synced to Supabase leave_requests'}
            </p>
          </div>
          {!canApproveLeaves && (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {isViewer
                ? 'Read-only access (Viewer)'
                : 'Showing your submitted leave requests'}
            </span>
          )}
        </div>

        {filteredLeaves.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">No leave requests match</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Adjust your filters or submit a new Casual, Sick, or Annual leave request.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-3 pr-3 pl-6">Leave Code</th>
                  <th className="px-3 py-3">Employee &amp; Dept</th>
                  <th className="px-3 py-3">Type &amp; Window</th>
                  <th className="px-3 py-3">Handover &amp; Reason</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pr-6 pl-3 text-right">Approvals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLeaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="py-3.5 pr-3 pl-6 align-top">
                      <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap dark:text-indigo-400">
                        {leave.code}
                      </span>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                        {leave.employeeId}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{leave.employeeName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{leave.department}</p>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <span className="inline-block rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {leave.leaveType}
                      </span>
                      <p className="mt-1 font-mono text-[11px] text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {formatShortDate(leave.startDate)} → {formatShortDate(leave.endDate)}
                      </p>
                      <p className="font-mono text-[10px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                        {leave.totalDays} day{leave.totalDays === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="max-w-xs px-3 py-3.5 align-top">
                      <p className="text-xs text-slate-700 dark:text-slate-300">{leave.reason}</p>
                      {leave.backupDelegateName && (
                        <p className="mt-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                          Backup Coverage: {leave.backupDelegateName}
                        </p>
                      )}
                      {leave.reviewerNotes && (
                        <p className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <span className="font-semibold">{leave.reviewerName || 'Reviewer'}:</span>{' '}
                          {leave.reviewerNotes}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3.5 align-top whitespace-nowrap">
                      {getStatusBadge(leave.status)}
                      {leave.reviewerName && leave.status !== 'Pending' && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">By {leave.reviewerName}</p>
                      )}
                    </td>
                    <td className="py-3.5 pr-6 pl-3 text-right align-top whitespace-nowrap">
                      {leave.status === 'Pending' && canApproveLeaves ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDecisionLeave(leave.id, 'Approved')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecisionLeave(leave.id, 'Rejected')}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionNotes('');
                              setDecisionTarget({ leave, decision: 'Rejected' });
                            }}
                            title="Decide with written remarks"
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            Note
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                          {leave.status === 'Pending' ? 'Awaiting Review' : 'Decision Logged'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Leave Modal */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-label="Request Leave"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Request Leave
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  Submitting as {currentUser.name} ({currentUser.employeeId} · {currentUser.department})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Leave Type <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {LEAVE_TYPES.map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Backup / Handover Delegate
                  </label>
                  <select
                    value={backupDelegateName}
                    onChange={(e) => setBackupDelegateName(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">No backup assigned</option>
                    {delegateCandidates.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Start Date <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    End Date <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-200">
                Requested Duration:{' '}
                <span className="font-mono font-bold tabular-nums">
                  {computedDays} calendar day{computedDays === 1 ? '' : 's'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason &amp; Operational Handover Plan <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Describe coverage details and reason for leave..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Submit Leave Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Optional Written Remarks Leave Decision Modal */}
      {decisionTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-label="Leave Approval Decision"
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Decision Notes · {decisionTarget.leave.code}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {decisionTarget.leave.employeeName} · {decisionTarget.leave.leaveType} (
                  {decisionTarget.leave.totalDays}d)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDecisionTarget(null)}
                aria-label="Close decision modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDecisionSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Decision Action
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['Approved', 'Rejected'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setDecisionTarget((prev) => (prev ? { ...prev, decision: opt } : prev))
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        decisionTarget.decision === opt
                          ? opt === 'Approved'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500/70 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-rose-500 bg-rose-50 text-rose-800 dark:border-rose-500/70 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reviewer Decision Remarks{' '}
                  {decisionTarget.decision === 'Rejected' && (
                    <span className="text-rose-600 dark:text-rose-400">*</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  required={decisionTarget.decision === 'Rejected'}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder={
                    decisionTarget.decision === 'Approved'
                      ? 'Optional approval confirmation or handover note...'
                      : 'Specify operational conflict or reason for rejection...'
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDecisionTarget(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`rounded-lg px-4 py-2 text-xs font-semibold text-white ${
                    decisionTarget.decision === 'Approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirm {decisionTarget.decision}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

