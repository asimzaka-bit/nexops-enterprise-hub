import { DEFAULT_PERMISSION_MATRIX } from '../data/seedData';
import {
  ApprovalStatus,
  AttendanceLog,
  AuditEvent,
  CompanyAsset,
  CurrencyCode,
  DEFAULT_SLA_POLICY,
  DbAccessRole,
  DocumentVaultItem,
  NexOpsState,
  OperationalRequest,
  PermissionKey,
  PermissionMatrix,
  Priority,
  RequestStatus,
  Role,
  SlaPolicyConfig,
  TeamMember,
} from '../types/nexops';

export const SUPER_ADMIN_EMAIL = 'hassanzaka018@gmail.com';
export const SUPER_ADMIN_EMPLOYEE_ID = 'Employee 1';
export const LEGACY_DOWNGRADED_VIEWER_EMAILS = [
  'ghangster777@gmail.com',
  'asim.zaka@mmpakistan.com',
] as const;

export function isSuperAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isSuperAdminEmployeeId(employeeId?: string | null): boolean {
  return (employeeId ?? '').trim().toUpperCase() === 'EMPLOYEE 1';
}

export function isLegacyDowngradedViewerEmail(email?: string | null): boolean {
  const clean = (email ?? '').trim().toLowerCase();
  return LEGACY_DOWNGRADED_VIEWER_EMAILS.includes(
    clean as (typeof LEGACY_DOWNGRADED_VIEWER_EMAILS)[number],
  );
}

export function normalizeRole(raw: unknown): Role {
  if (typeof raw !== 'string') return 'Viewer';
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'admin' || cleaned === 'super admin' || cleaned === 'super_admin') {
    return 'Admin';
  }
  if (
    cleaned === 'editor' ||
    cleaned === 'manager / qa reviewer' ||
    cleaned === 'manager' ||
    cleaned === 'qa reviewer'
  ) {
    return 'Editor';
  }
  if (
    cleaned === 'viewer' ||
    cleaned === 'staff / contributor' ||
    cleaned === 'staff' ||
    cleaned === 'contributor'
  ) {
    return 'Viewer';
  }
  return 'Viewer';
}

export function toDbRole(role: Role): DbAccessRole {
  switch (role) {
    case 'Admin':
      return 'admin';
    case 'Editor':
      return 'editor';
    default:
      return 'viewer';
  }
}

export function fromDbRole(raw: unknown): Role {
  return normalizeRole(raw);
}

export function normalizeApprovalStatus(raw: unknown, email?: string | null): ApprovalStatus {
  if (isSuperAdminEmail(email)) return 'approved';
  if (typeof raw !== 'string') return 'pending';
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'approved' || cleaned === 'active') return 'approved';
  if (cleaned === 'rejected' || cleaned === 'declined') return 'rejected';
  if (cleaned === 'deactivated' || cleaned === 'inactive') return 'deactivated';
  return 'pending';
}

export function generateNextRequestId(requests: OperationalRequest[]): string {
  const year = 2026;
  const maxNum = requests.reduce((max, req) => {
    const match = req.id.match(/^REQ-\d{4}-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);
  const nextNum = String(maxNum + 1).padStart(3, '0');
  return `REQ-${year}-${nextNum}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSlaWindowHours(
  priority: Priority,
  slaPolicy: SlaPolicyConfig = DEFAULT_SLA_POLICY,
): number {
  switch (priority) {
    case 'Urgent':
      return Math.max(1, slaPolicy.urgentHours || DEFAULT_SLA_POLICY.urgentHours);
    case 'High':
      return Math.max(1, slaPolicy.highHours || DEFAULT_SLA_POLICY.highHours);
    case 'Medium':
      return Math.max(1, slaPolicy.mediumHours || DEFAULT_SLA_POLICY.mediumHours);
    case 'Low':
    default:
      return Math.max(1, slaPolicy.lowHours || DEFAULT_SLA_POLICY.lowHours);
  }
}

export interface RequestSlaStatus {
  state: 'on_track' | 'approaching' | 'breached' | 'completed';
  label: string;
  tone: 'emerald' | 'amber' | 'red' | 'neutral';
  breached: boolean;
  approaching: boolean;
  slaHours: number;
  deadlineMs: number;
  remainingMs: number;
  overdueHours: number;
  metSla?: boolean;
}

export function getRequestSlaStatus(
  req: Pick<
    OperationalRequest,
    'createdAt' | 'dueDate' | 'priority' | 'status' | 'updatedAt' | 'stage1Approval' | 'stage2Approval'
  >,
  slaPolicy: SlaPolicyConfig = DEFAULT_SLA_POLICY,
  nowMs: number = Date.now(),
): RequestSlaStatus {
  const slaHours = getSlaWindowHours(req.priority, slaPolicy);
  const createdParsed = req.createdAt ? new Date(req.createdAt).getTime() : NaN;
  const dueStartParsed = req.dueDate ? new Date(`${req.dueDate}T00:00:00`).getTime() : NaN;
  const baseCreatedMs = !Number.isNaN(createdParsed)
    ? createdParsed
    : !Number.isNaN(dueStartParsed)
      ? dueStartParsed
      : nowMs;
  const slaDeadlineMs = baseCreatedMs + slaHours * 3600_000;
  const dueEndMs = req.dueDate ? new Date(`${req.dueDate}T23:59:59`).getTime() : NaN;
  const todayStr = getTodayDateString();
  const isPastDueDate = Boolean(req.dueDate && req.dueDate < todayStr);
  const effectiveDeadlineMs =
    isPastDueDate && !Number.isNaN(dueEndMs)
      ? Math.min(slaDeadlineMs, dueEndMs)
      : slaDeadlineMs;

  if (req.status === 'Approved') {
    const completedIso =
      req.stage2Approval?.timestamp ||
      req.stage1Approval?.timestamp ||
      req.updatedAt ||
      req.createdAt;
    const completedMs = completedIso ? new Date(completedIso).getTime() : NaN;
    const metSla = !Number.isNaN(completedMs) ? completedMs <= slaDeadlineMs : true;
    return {
      state: 'completed',
      label: metSla ? 'SLA Met' : 'Approved (Past SLA)',
      tone: 'neutral',
      breached: false,
      approaching: false,
      slaHours,
      deadlineMs: effectiveDeadlineMs,
      remainingMs: 0,
      overdueHours: 0,
      metSla,
    };
  }

  if (req.status === 'Rejected') {
    return {
      state: 'completed',
      label: 'Closed',
      tone: 'neutral',
      breached: false,
      approaching: false,
      slaHours,
      deadlineMs: effectiveDeadlineMs,
      remainingMs: 0,
      overdueHours: 0,
    };
  }

  const remainingMs = effectiveDeadlineMs - nowMs;

  if (remainingMs <= 0 || isPastDueDate) {
    const overdueMs = Math.max(60_000, nowMs - effectiveDeadlineMs);
    const overdueHours = Math.max(1, Math.round(overdueMs / 3600_000));
    const label =
      overdueMs < 3600_000
        ? `SLA Breached (+${Math.max(1, Math.ceil(overdueMs / 60_000))}m overdue)`
        : `SLA Breached (+${overdueHours}h overdue)`;
    return {
      state: 'breached',
      label,
      tone: 'red',
      breached: true,
      approaching: false,
      slaHours,
      deadlineMs: effectiveDeadlineMs,
      remainingMs,
      overdueHours,
    };
  }

  const totalWindowMs = slaHours * 3600_000;
  const remainingRatio = remainingMs / totalWindowMs;
  const timeLeftLabel =
    remainingMs < 3600_000
      ? `${Math.max(1, Math.ceil(remainingMs / 60_000))}m`
      : `${Math.max(1, Math.round(remainingMs / 3600_000))}h`;

  if (remainingRatio < 0.25) {
    return {
      state: 'approaching',
      label: `SLA: ${timeLeftLabel} left`,
      tone: 'amber',
      breached: false,
      approaching: true,
      slaHours,
      deadlineMs: effectiveDeadlineMs,
      remainingMs,
      overdueHours: 0,
    };
  }

  return {
    state: 'on_track',
    label: `SLA: ${timeLeftLabel} left`,
    tone: 'emerald',
    breached: false,
    approaching: false,
    slaHours,
    deadlineMs: effectiveDeadlineMs,
    remainingMs,
    overdueHours: 0,
  };
}

export function isRequestOverdue(
  req: OperationalRequest,
  slaPolicy: SlaPolicyConfig = DEFAULT_SLA_POLICY,
  nowMs: number = Date.now(),
): boolean {
  if (req.status === 'Approved' || req.status === 'Rejected') {
    return false;
  }
  return getRequestSlaStatus(req, slaPolicy, nowMs).breached;
}

export function isRequestPendingOver24h(
  req: OperationalRequest,
  nowMs: number = Date.now(),
): boolean {
  if (req.status === 'Approved' || req.status === 'Rejected') {
    return false;
  }
  const createdMs = new Date(req.createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs >= 24 * 3600_000;
}

export function getApprovalTurnaroundHours(req: OperationalRequest): number | null {
  if (req.status !== 'Approved') return null;
  const startMs = new Date(req.createdAt).getTime();
  const endIso =
    req.stage2Approval?.timestamp || req.stage1Approval?.timestamp || req.updatedAt;
  const endMs = endIso ? new Date(endIso).getTime() : NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 3600_000;
}

export function formatTurnaroundDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} min${mins === 1 ? '' : 's'}`;
  }
  return `${hours.toFixed(1)} hrs`;
}

export function getOverdueDays(dueDate: string): number {
  const today = new Date(`${getTodayDateString()}T00:00:00`);
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(due.getTime())) return 0;
  const diffMs = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export interface SlaCountdownInfo {
  label: string;
  tone: 'emerald' | 'slate' | 'amber' | 'red' | 'neutral';
  breached: boolean;
}

export function getSlaCountdown(
  dueDate: string,
  status: RequestStatus,
  nowMs: number = Date.now(),
  createdAt?: string,
  priority?: Priority,
  slaPolicy?: SlaPolicyConfig,
): SlaCountdownInfo {
  if (createdAt && priority) {
    const res = getRequestSlaStatus(
      {
        createdAt,
        dueDate,
        priority,
        status,
        updatedAt: createdAt,
      },
      slaPolicy,
      nowMs,
    );
    return {
      label: res.label,
      tone: res.tone,
      breached: res.breached,
    };
  }

  if (status === 'Approved') {
    return { label: 'SLA Met', tone: 'neutral', breached: false };
  }
  if (status === 'Rejected') {
    return { label: 'Closed', tone: 'neutral', breached: false };
  }
  if (!dueDate) {
    return { label: 'No SLA', tone: 'neutral', breached: false };
  }

  const todayStr = getTodayDateString();
  if (dueDate < todayStr) {
    const dueEndMs = new Date(`${dueDate}T23:59:59`).getTime();
    const overdueHours = !Number.isNaN(dueEndMs)
      ? Math.max(1, Math.round((nowMs - dueEndMs) / 3600_000))
      : Math.max(1, getOverdueDays(dueDate) * 24);
    return {
      label: `SLA Breached (+${overdueHours}h overdue)`,
      tone: 'red',
      breached: true,
    };
  }

  const dueEndMs = new Date(`${dueDate}T23:59:59`).getTime();
  if (Number.isNaN(dueEndMs)) {
    return { label: dueDate, tone: 'slate', breached: false };
  }

  const diffMs = Math.max(0, dueEndMs - nowMs);
  const hoursLeft = Math.max(1, Math.round(diffMs / 3600_000));
  if (dueDate === todayStr || hoursLeft <= 6) {
    return {
      label: `SLA: ${hoursLeft}h left`,
      tone: 'amber',
      breached: false,
    };
  }

  return {
    label: `SLA: ${hoursLeft}h left`,
    tone: 'emerald',
    breached: false,
  };
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening';

export interface TimeOfDayGreeting {
  period: TimeOfDayPeriod;
  salutation: 'Good Morning' | 'Good Afternoon' | 'Good Evening';
  fullText: string;
}

export function getTimeOfDayGreeting(
  userName: string,
  now: Date = new Date(),
): TimeOfDayGreeting {
  const hours = now.getHours();
  let period: TimeOfDayPeriod;
  let salutation: TimeOfDayGreeting['salutation'];

  if (hours >= 5 && hours < 12) {
    period = 'morning';
    salutation = 'Good Morning';
  } else if (hours >= 12 && hours < 17) {
    period = 'afternoon';
    salutation = 'Good Afternoon';
  } else {
    period = 'evening';
    salutation = 'Good Evening';
  }

  const cleanName = (userName || 'Team Member').trim() || 'Team Member';
  return {
    period,
    salutation,
    fullText: `Hello, ${cleanName} — ${salutation}`,
  };
}

export interface PresenceStatusInfo {
  isOnline: boolean;
  hasActivity: boolean;
  label: string;
  exactTitle: string;
}

export function resolveLivePresenceOverride(
  member?: { id?: string; email?: string | null } | null,
  onlinePresenceKeys?: Set<string>,
  recentlyOfflineKeys?: Set<string>,
): boolean | undefined {
  if (!member) return undefined;
  const idKey = (member.id ?? '').trim();
  const emailKey = (member.email ?? '').trim().toLowerCase();

  if (
    onlinePresenceKeys &&
    ((idKey && onlinePresenceKeys.has(idKey)) || (emailKey && onlinePresenceKeys.has(emailKey)))
  ) {
    return true;
  }
  if (
    recentlyOfflineKeys &&
    ((idKey && recentlyOfflineKeys.has(idKey)) || (emailKey && recentlyOfflineKeys.has(emailKey)))
  ) {
    return false;
  }
  return undefined;
}

export function formatPresenceStatus(
  timestamp?: string | null,
  nowMs: number = Date.now(),
  livePresenceOverride?: boolean,
): PresenceStatusInfo {
  const raw = typeof timestamp === 'string' ? timestamp.trim() : '';
  const tsMs = raw ? new Date(raw).getTime() : NaN;
  const hasValidTs = Boolean(raw) && !Number.isNaN(tsMs);
  const formattedExact = hasValidTs ? formatDateTime(raw) : '';

  if (livePresenceOverride === true) {
    return {
      isOnline: true,
      hasActivity: true,
      label: 'Online',
      exactTitle: hasValidTs
        ? `Online now · Last heartbeat ${formattedExact}`
        : 'Online now (Live connection)',
    };
  }

  if (!hasValidTs) {
    if (livePresenceOverride === false) {
      return {
        isOnline: false,
        hasActivity: true,
        label: 'Active just now',
        exactTitle: 'Signed out / left just now',
      };
    }
    return {
      isOnline: false,
      hasActivity: false,
      label: 'Never active',
      exactTitle: 'No login activity recorded yet',
    };
  }

  const diffMs = Math.max(0, nowMs - tsMs);

  if (livePresenceOverride !== false && diffMs <= 25 * 1000) {
    return {
      isOnline: true,
      hasActivity: true,
      label: 'Online',
      exactTitle: `Online · Last heartbeat ${formattedExact}`,
    };
  }

  if (diffMs < 60 * 1000) {
    return {
      isOnline: false,
      hasActivity: true,
      label: 'Active just now',
      exactTitle: `Last active ${formattedExact}`,
    };
  }

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) {
    return {
      isOnline: false,
      hasActivity: true,
      label: `Active ${mins} min${mins === 1 ? '' : 's'} ago`,
      exactTitle: `Last active ${formattedExact}`,
    };
  }

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) {
    return {
      isOnline: false,
      hasActivity: true,
      label: `Active ${hours} hour${hours === 1 ? '' : 's'} ago`,
      exactTitle: `Last active ${formattedExact}`,
    };
  }

  const days = Math.floor(hours / 24);
  if (days === 1) {
    return {
      isOnline: false,
      hasActivity: true,
      label: 'Active yesterday',
      exactTitle: `Last active ${formattedExact}`,
    };
  }

  return {
    isOnline: false,
    hasActivity: true,
    label: `Active ${days} days ago`,
    exactTitle: `Last active ${formattedExact}`,
  };
}

// Reference FX rates per 1 USD for multi-currency enterprise rollups & threshold checks
export const FX_UNITS_PER_USD: Record<CurrencyCode, number> = {
  USD: 1,
  AED: 3.6725,
  PKR: 278.5,
};

export function toUsdEquivalent(amount: number, currency: CurrencyCode = 'USD'): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const rate = FX_UNITS_PER_USD[currency] || 1;
  return safeAmount / rate;
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode = 'USD',
  to: CurrencyCode = 'USD',
): number {
  if (from === to) return amount;
  const usd = toUsdEquivalent(amount, from);
  return usd * (FX_UNITS_PER_USD[to] || 1);
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'USD'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: currency === 'PKR' ? 0 : 0,
  }).format(Math.round(safe));
  return `${currency} ${formatted}`;
}

export function getBudgetUtilizationPct(estimatedBudget: number, actualSpend: number): number {
  if (!Number.isFinite(estimatedBudget) || estimatedBudget <= 0) {
    return actualSpend > 0 ? 100 : 0;
  }
  return Math.round((Math.max(0, actualSpend) / estimatedBudget) * 100);
}

export type BudgetHealthTone = 'emerald' | 'amber' | 'rose';

export function getBudgetHealthTone(utilizationPct: number): BudgetHealthTone {
  if (utilizationPct > 100) return 'rose';
  if (utilizationPct >= 80) return 'amber';
  return 'emerald';
}

export function requiresTwoTierApproval(
  req: Pick<OperationalRequest, 'priority' | 'estimatedCost' | 'currency'>,
  budgetThresholdUsd: number = 5000,
): boolean {
  if (req.priority === 'High' || req.priority === 'Urgent') {
    return true;
  }
  const costUsd = toUsdEquivalent(req.estimatedCost ?? 0, req.currency ?? 'USD');
  return costUsd > budgetThresholdUsd;
}

export function resolveEffectiveReviewer(
  intendedName: string,
  members: TeamMember[],
): { assignedReviewer: string; delegatedFromReviewer?: string } {
  const cleanIntended = intendedName.trim();
  const isApprovedMember = (m: TeamMember) =>
    m.active && (isSuperAdminEmail(m.email) || (m.approvalStatus ?? 'approved') === 'approved');
  const target = members.find(
    (m) => m.name.toLowerCase() === cleanIntended.toLowerCase() && isApprovedMember(m),
  );
  if (!target) {
    // Fallback to first active approved non-OOO Admin if intended reviewer isn't found
    const fallback =
      members.find(
        (m) =>
          isApprovedMember(m) &&
          m.role === 'Admin' &&
          !m.outOfOffice,
      ) ??
      members.find((m) => isApprovedMember(m) && m.role === 'Admin');
    return {
      assignedReviewer: fallback?.name || cleanIntended || 'Operations Administrator',
    };
  }

  if (target.outOfOffice && target.delegateApproverId) {
    const delegate = members.find(
      (m) => m.id === target.delegateApproverId && m.active && m.id !== target.id,
    );
    if (delegate) {
      return {
        assignedReviewer: delegate.name,
        delegatedFromReviewer: target.name,
      };
    }
  }
  if (target.outOfOffice && target.delegateApproverName) {
    const delegateByName = members.find(
      (m) =>
        m.name.toLowerCase() === target.delegateApproverName!.toLowerCase() &&
        m.active &&
        m.id !== target.id,
    );
    if (delegateByName) {
      return {
        assignedReviewer: delegateByName.name,
        delegatedFromReviewer: target.name,
      };
    }
  }

  return { assignedReviewer: target.name };
}

export function exportAuditLogsCsv(logs: AuditEvent[]): void {
  const escapeCell = (value: string) => {
    const str = String(value ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Audit ID',
    'Timestamp (UTC)',
    'Actor Name',
    'Actor Email',
    'Actor Sign-Off Title',
    'Actor Role',
    'Action Type',
    'Target Request ID',
    'Details',
  ];
  const rows = logs.map((log) => [
    escapeCell(log.id),
    escapeCell(log.timestamp),
    escapeCell(log.actorName),
    escapeCell(log.actorEmail || ''),
    escapeCell(log.actorSignOffTitle || log.actorRole),
    escapeCell(log.actorRole),
    escapeCell(log.actionType),
    escapeCell(log.requestId),
    escapeCell(log.details),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `nexops-audit-compliance-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRequestsCsv(requests: OperationalRequest[]): void {
  const headers = [
    'Request ID',
    'Title',
    'Category',
    'Department',
    'Submitted By',
    'Assigned Reviewer',
    'Priority',
    'Status',
    'Due Date',
    'Currency',
    'Estimated Cost',
    'Actual Spend',
    'QA Verified',
    'QA Total',
    'Deliverable URL',
    'Description',
  ];

  const rows = requests.map((req) => {
    const verified = req.checklist.filter((c) => c.checked).length;
    return [
      escapeCsvCell(req.id),
      escapeCsvCell(req.title),
      escapeCsvCell(req.category),
      escapeCsvCell(req.department),
      escapeCsvCell(req.submittedBy),
      escapeCsvCell(req.assignedReviewer),
      escapeCsvCell(req.priority),
      escapeCsvCell(req.status),
      escapeCsvCell(req.dueDate),
      escapeCsvCell(req.currency ?? 'USD'),
      escapeCsvCell(String(req.estimatedCost ?? 0)),
      escapeCsvCell(String(req.actualSpend ?? 0)),
      escapeCsvCell(String(verified)),
      escapeCsvCell(String(req.checklist.length)),
      escapeCsvCell(req.deliverableUrl),
      escapeCsvCell(req.description),
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `nexops-requests-export-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DepartmentScorecardRow {
  department: string;
  totalRequests: number;
  approvedCount: number;
  approvalRatePct: number;
  overdueCount: number;
  avgChecklistPct: number;
  slaCompliancePct?: number;
  avgTurnaroundHours?: number | null;
  activeStaffCount?: number;
  attendanceTodayCount?: number;
  attendanceRatePct?: number;
}

export function exportDepartmentScorecardCsv(rows: DepartmentScorecardRow[]): void {
  const headers = [
    'Department',
    'Total Requests',
    'Approved Requests',
    'Approval Rate (%)',
    'SLA Compliance Rate (%)',
    'Avg Approval Turnaround',
    'Overdue / SLA Breached Count',
    'Active Staff',
    'Clocked In Today',
    'Attendance Rate (%)',
    'Avg QA Checklist Completion (%)',
  ];

  const csvRows = rows.map((row) => [
    escapeCsvCell(row.department),
    escapeCsvCell(String(row.totalRequests)),
    escapeCsvCell(String(row.approvedCount)),
    escapeCsvCell(`${row.approvalRatePct}%`),
    escapeCsvCell(
      row.slaCompliancePct !== undefined ? `${row.slaCompliancePct}%` : '—',
    ),
    escapeCsvCell(formatTurnaroundDuration(row.avgTurnaroundHours ?? null)),
    escapeCsvCell(String(row.overdueCount)),
    escapeCsvCell(String(row.activeStaffCount ?? 0)),
    escapeCsvCell(String(row.attendanceTodayCount ?? 0)),
    escapeCsvCell(
      row.attendanceRatePct !== undefined ? `${row.attendanceRatePct}%` : '—',
    ),
    escapeCsvCell(`${row.avgChecklistPct}%`),
  ]);

  const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `nexops-department-scorecard-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function isAssetAlert(asset: CompanyAsset): boolean {
  if (asset.status === 'Under Maintenance' || asset.condition === 'Needs Repair') {
    return true;
  }
  if (
    typeof asset.stockQuantity === 'number' &&
    typeof asset.minStockThreshold === 'number' &&
    asset.minStockThreshold > 0 &&
    asset.stockQuantity <= asset.minStockThreshold
  ) {
    return true;
  }
  return false;
}

export function exportAssetsCsv(assets: CompanyAsset[]): void {
  const headers = [
    'Asset Tag',
    'Item Name',
    'Category',
    'Assigned To',
    'Department',
    'Condition',
    'Status',
    'Stock Qty',
    'Serial / License Ref',
    'Location',
    'Last Updated',
  ];

  const rows = assets.map((asset) => [
    escapeCsvCell(asset.tag),
    escapeCsvCell(asset.name),
    escapeCsvCell(asset.category),
    escapeCsvCell(asset.assignedTo),
    escapeCsvCell(asset.department),
    escapeCsvCell(asset.condition),
    escapeCsvCell(asset.status),
    escapeCsvCell(String(asset.stockQuantity ?? 1)),
    escapeCsvCell(asset.serialNumber ?? ''),
    escapeCsvCell(asset.location ?? ''),
    escapeCsvCell(asset.updatedAt),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `nexops-asset-ledger-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleRequestsCsvTemplate(): void {
  const headers = [
    'title',
    'category',
    'department',
    'priority',
    'status',
    'dueDate',
    'submittedBy',
    'assignedReviewer',
    'deliverableUrl',
    'description',
    'checklist',
  ];

  const sampleRows = [
    [
      'Cloud IAM Key Rotation Verification',
      'Security & Infrastructure',
      'Engineering',
      'High',
      'Submitted',
      '2026-12-05',
      'Operations Staff',
      'Operations Reviewer',
      'https://intranet.company.example/sec/iam-rotation',
      'Validate automated KMS and IAM service credential rotation across production clusters with zero service disruption.',
      'Confirm zero hardcoded secrets;Verify dual-region replication;Attach automated penetration test report',
    ],
    [
      'Vendor SLA Renewal Audit Package',
      'Compliance & Audit',
      'Operations',
      'Medium',
      'Draft',
      '2026-12-12',
      'Operations Staff',
      'Operations Reviewer',
      'https://intranet.company.example/ops/vendor-sla',
      'Annual vendor SLA compliance and uptime guarantee verification prior to finance sign-off.',
      'Confirm 99.95% uptime SLA clause;Verify SOC 2 Type II attestation',
    ],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'nexops-requests-import-template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export interface NexOpsBackupEnvelope {
  schemaVersion: 'nexops-backup-v1';
  exportedAt: string;
  exportedBy: string;
  state: NexOpsState;
}

export function downloadSystemBackupJson(state: NexOpsState, exportedBy: string): void {
  const payload: NexOpsBackupEnvelope = {
    schemaVersion: 'nexops-backup-v1',
    exportedAt: new Date().toISOString(),
    exportedBy,
    state,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `nexops-system-backup-${dateStamp}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const VALID_ROLES: Role[] = ['Admin', 'Editor', 'Viewer'];

const PERMISSION_KEYS: PermissionKey[] = [
  'create_requests',
  'approve_requests',
  'manage_projects',
  'manage_assets',
  'publish_sops',
  'approve_leaves',
  'manage_meetings',
  'publish_announcements',
  'manage_admin_settings',
];

export function normalizePermissionMatrix(raw: unknown): PermissionMatrix {
  const base = structuredClone(DEFAULT_PERMISSION_MATRIX);
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, Partial<Record<PermissionKey, unknown>> | undefined>;

  const adminEntry = candidate.Admin ?? candidate.admin;
  if (adminEntry && typeof adminEntry === 'object') {
    for (const key of PERMISSION_KEYS) {
      if (typeof adminEntry[key] === 'boolean') {
        base.Admin[key] = adminEntry[key] as boolean;
      }
    }
  }

  const editorEntry = candidate.Editor ?? candidate.editor ?? candidate['Manager / QA Reviewer'];
  if (editorEntry && typeof editorEntry === 'object') {
    for (const key of PERMISSION_KEYS) {
      if (typeof editorEntry[key] === 'boolean') {
        base.Editor[key] = editorEntry[key] as boolean;
      }
    }
  }

  // Enforce strict boundaries: Admin holds full operational controls; Editor has Maker-Checker content access; Viewer is read-only.
  base.Admin.manage_admin_settings = true;
  base.Editor.approve_requests = false;
  base.Editor.approve_leaves = false;
  base.Editor.publish_announcements = false;
  base.Editor.manage_admin_settings = false;
  for (const key of PERMISSION_KEYS) {
    base.Viewer[key] = false;
  }

  return base;
}

export function parseSystemBackupJson(rawText: string): NexOpsState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON file. Could not parse workspace backup.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup payload must be a JSON object.');
  }

  const candidate =
    'state' in parsed && (parsed as { state?: unknown }).state
      ? (parsed as { state: unknown }).state
      : parsed;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Backup JSON is missing workspace state.');
  }

  const rawState = candidate as Partial<NexOpsState>;
  if (!Array.isArray(rawState.requests) || !Array.isArray(rawState.teamMembers)) {
    throw new Error('Backup file must include valid "requests" and "teamMembers" arrays.');
  }

  const normalizedRole = normalizeRole(rawState.activeRole);
  const activeRole: Role = VALID_ROLES.includes(normalizedRole) ? normalizedRole : 'Viewer';

  const normalizedMembers = rawState.teamMembers.map((m, idx) => {
    const isSuper = isSuperAdminEmail(m.email);
    const parsedRole = normalizeRole(m.role);
    const role: Role = isSuper
      ? 'Admin'
      : isLegacyDowngradedViewerEmail(m.email) && parsedRole === 'Admin'
        ? 'Viewer'
        : parsedRole === 'Editor'
          ? 'Editor'
          : 'Viewer';
    return {
      ...m,
      role,
      approvalStatus: normalizeApprovalStatus(m.approvalStatus ?? 'approved', m.email),
      isSuperAdmin: isSuper,
      active: isSuper ? true : m.active !== false,
      employeeId: m.employeeId || `NX-EMP-${String(1001 + idx * 4)}`,
      signOffTitle:
        !isSuper && (isLegacyDowngradedViewerEmail(m.email) || m.signOffTitle === 'Primary Super Administrator') && role === 'Viewer'
          ? 'Workspace Viewer'
          : m.signOffTitle || m.title || role,
    };
  });

  return {
    activeRole,
    requests: rawState.requests.map((r) => ({
      ...r,
      auditTrail: Array.isArray(r.auditTrail)
        ? r.auditTrail.map((a) => ({ ...a, actorRole: normalizeRole(a.actorRole) }))
        : [],
    })),
    projects: Array.isArray(rawState.projects)
      ? rawState.projects.map((p) => ({
          ...p,
          currency: p.currency ?? 'USD',
          estimatedBudget: typeof p.estimatedBudget === 'number' ? p.estimatedBudget : 0,
          actualSpend: typeof p.actualSpend === 'number' ? p.actualSpend : 0,
        }))
      : [],
    assets: Array.isArray(rawState.assets) ? rawState.assets : [],
    sops: Array.isArray(rawState.sops)
      ? rawState.sops.map((s) => ({
          ...s,
          acknowledgments: Array.isArray(s.acknowledgments)
            ? s.acknowledgments.map((ack) => ({ ...ack, role: normalizeRole(ack.role) }))
            : [],
        }))
      : [],
    leaves: Array.isArray(rawState.leaves) ? rawState.leaves : [],
    attendanceLogs: Array.isArray(rawState.attendanceLogs) ? rawState.attendanceLogs : [],
    announcements: Array.isArray(rawState.announcements)
      ? rawState.announcements.map((a) => ({
          ...a,
          priorityTag:
            a.priorityTag ??
            (a.severity === 'urgent' ? 'Urgent' : a.severity === 'warning' ? 'HR' : 'General'),
          pinned: Boolean(a.pinned),
          publishedByRole: normalizeRole(a.publishedByRole),
        }))
      : [],
    meetings: Array.isArray(rawState.meetings) ? rawState.meetings : [],
    workspaceEmails: Array.isArray(rawState.workspaceEmails) ? rawState.workspaceEmails : [],
    workspaceLinks: Array.isArray(rawState.workspaceLinks) ? rawState.workspaceLinks : [],
    teamMembers: normalizedMembers,
    globalAuditLogs: Array.isArray(rawState.globalAuditLogs)
      ? rawState.globalAuditLogs.map((a) => ({ ...a, actorRole: normalizeRole(a.actorRole) }))
      : [],
    notifications: Array.isArray(rawState.notifications) ? rawState.notifications : [],
    subtasks: Array.isArray(rawState.subtasks) ? rawState.subtasks : [],
    taskComments: Array.isArray(rawState.taskComments) ? rawState.taskComments : [],
    vaultDocuments: Array.isArray(rawState.vaultDocuments) ? rawState.vaultDocuments : [],
    pendingEditorChanges: Array.isArray(rawState.pendingEditorChanges)
      ? rawState.pendingEditorChanges
      : [],
    corporateMails: Array.isArray(rawState.corporateMails) ? rawState.corporateMails : [],
    chatMessages: Array.isArray(rawState.chatMessages) ? rawState.chatMessages : [],
    calendarEvents: Array.isArray(rawState.calendarEvents) ? rawState.calendarEvents : [],
    permissionMatrix: normalizePermissionMatrix(rawState.permissionMatrix),
  };
}

export interface ExecutiveDepartmentAnalyticsRow {
  department: string;
  totalTasks: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  rejectedCount: number;
  presentToday: number;
  lateToday: number;
  completedShiftToday: number;
}

export function exportExecutiveKpiSummaryCsv(params: {
  companyName: string;
  dateStamp: string;
  totalTasks: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  rejectedCount: number;
  departmentRows: ExecutiveDepartmentAnalyticsRow[];
}): void {
  const lines: string[] = [
    [
      escapeCsvCell(`${params.companyName} - Executive KPI Summary`),
      escapeCsvCell(`Generated ${params.dateStamp}`),
    ].join(','),
    '',
    ['Metric', 'Count', 'Share (%)'].join(','),
    [
      'Total Operational Requests',
      String(params.totalTasks),
      params.totalTasks > 0 ? '100%' : '0%',
    ].join(','),
    [
      'Pending (Draft / Submitted)',
      String(params.pendingCount),
      params.totalTasks > 0
        ? `${Math.round((params.pendingCount / params.totalTasks) * 100)}%`
        : '0%',
    ].join(','),
    [
      'In Progress (QA Review / Revision)',
      String(params.inProgressCount),
      params.totalTasks > 0
        ? `${Math.round((params.inProgressCount / params.totalTasks) * 100)}%`
        : '0%',
    ].join(','),
    [
      'Completed (Approved)',
      String(params.completedCount),
      params.totalTasks > 0
        ? `${Math.round((params.completedCount / params.totalTasks) * 100)}%`
        : '0%',
    ].join(','),
    [
      'Rejected',
      String(params.rejectedCount),
      params.totalTasks > 0
        ? `${Math.round((params.rejectedCount / params.totalTasks) * 100)}%`
        : '0%',
    ].join(','),
    '',
    [
      'Department',
      'Total Tasks',
      'Pending',
      'In Progress',
      'Completed',
      'Rejected',
      'Staff Present Today',
      'Staff Late Today',
      'Completed Shift Today',
    ].join(','),
    ...params.departmentRows.map((row) =>
      [
        escapeCsvCell(row.department),
        escapeCsvCell(String(row.totalTasks)),
        escapeCsvCell(String(row.pendingCount)),
        escapeCsvCell(String(row.inProgressCount)),
        escapeCsvCell(String(row.completedCount)),
        escapeCsvCell(String(row.rejectedCount)),
        escapeCsvCell(String(row.presentToday)),
        escapeCsvCell(String(row.lateToday)),
        escapeCsvCell(String(row.completedShiftToday)),
      ].join(','),
    ),
  ];

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `nexops-executive-kpi-summary-${params.dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportAttendanceLogsCsv(logs: AttendanceLog[]): void {
  const headers = [
    'Date',
    'Employee ID',
    'Staff Name',
    'Email',
    'Department',
    'Check-In Time',
    'Check-Out Time',
    'Total Hours',
    'Status',
  ];
  const rows = logs.map((log) => [
    escapeCsvCell(log.attendanceDate),
    escapeCsvCell(log.employeeId),
    escapeCsvCell(log.userName),
    escapeCsvCell(log.userEmail),
    escapeCsvCell(log.department),
    escapeCsvCell(formatDateTime(log.checkInTime)),
    escapeCsvCell(log.checkOutTime ? formatDateTime(log.checkOutTime) : 'Active Shift'),
    escapeCsvCell(typeof log.totalHours === 'number' ? log.totalHours.toFixed(2) : '0.00'),
    escapeCsvCell(log.status),
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = getTodayDateString();
  link.href = url;
  link.setAttribute('download', `nexops-staff-attendance-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const TEN_GB_BYTES = 10 * 1024 * 1024 * 1024;

export function formatStorageSize(bytes?: number | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export interface VaultStorageStats {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usedPercent: number;
  fileCount: number;
  linkCount: number;
}

export function calculateVaultStorageStats(documents: DocumentVaultItem[]): VaultStorageStats {
  let usedBytes = 0;
  let fileCount = 0;
  let linkCount = 0;

  for (const doc of documents) {
    if (doc.sourceType === 'uploaded_file') {
      fileCount += 1;
      if (typeof doc.fileSize === 'number' && Number.isFinite(doc.fileSize) && doc.fileSize > 0) {
        usedBytes += doc.fileSize;
      }
    } else {
      linkCount += 1;
      if (typeof doc.fileSize === 'number' && Number.isFinite(doc.fileSize) && doc.fileSize > 0) {
        usedBytes += doc.fileSize;
      }
    }
  }

  const remainingBytes = Math.max(0, TEN_GB_BYTES - usedBytes);
  const usedPercent = Math.min(100, (usedBytes / TEN_GB_BYTES) * 100);

  return {
    usedBytes,
    quotaBytes: TEN_GB_BYTES,
    remainingBytes,
    usedPercent,
    fileCount,
    linkCount,
  };
}

export function buildDmRoomId(emailA: string, emailB: string): string {
  const cleanA = emailA.trim().toLowerCase();
  const cleanB = emailB.trim().toLowerCase();
  const pair = [cleanA, cleanB].sort();
  return `dm:${pair[0]}|${pair[1]}`;
}

export function buildChannelRoomId(channelName: string): string {
  return `channel:${channelName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
