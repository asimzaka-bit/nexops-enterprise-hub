import { DEFAULT_PERMISSION_MATRIX } from '../data/seedData';
import {
  ApprovalStatus,
  AttendanceLog,
  AuditEvent,
  CalendarEvent,
  CompanyAnnouncement,
  CompanyAsset,
  CorporateMailMessage,
  CurrencyCode,
  DEFAULT_SHIFT_CONFIG,
  DEFAULT_SLA_POLICY,
  DEFAULT_USER_PREFERENCES,
  DbAccessRole,
  DepartmentShiftConfig,
  DocumentVaultItem,
  FontStyleOption,
  LeaveRequest,
  MeetingActionItem,
  MeetingActionStatus,
  MeetingMinute,
  NavSection,
  NexOpsState,
  OperationalRequest,
  PermissionKey,
  PermissionMatrix,
  Priority,
  QuickBookmark,
  RecycleBinItem,
  RequestStatus,
  Role,
  SlaPolicyConfig,
  TeamChatMessage,
  TeamMember,
  TemperatureUnit,
  TextScaleOption,
  UserPreferences,
  WorkspaceEmailLog,
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
  const safeLogs = logs.filter((ev) => !isPrivateCommsAuditEvent(ev));
  const rows = safeLogs.map((log) => [
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
  const redactedState: NexOpsState = {
    ...state,
    corporateMails: [],
    chatMessages: [],
    workspaceEmails: [],
    globalAuditLogs: Array.isArray(state.globalAuditLogs)
      ? state.globalAuditLogs.filter((ev) => !isPrivateCommsAuditEvent(ev))
      : [],
  };

  const payload: NexOpsBackupEnvelope = {
    schemaVersion: 'nexops-backup-v1',
    exportedAt: new Date().toISOString(),
    exportedBy,
    state: redactedState,
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
    workspaceEmails: [],
    workspaceLinks: Array.isArray(rawState.workspaceLinks) ? rawState.workspaceLinks : [],
    teamMembers: normalizedMembers,
    globalAuditLogs: Array.isArray(rawState.globalAuditLogs)
      ? rawState.globalAuditLogs
          .map((a) => ({ ...a, actorRole: normalizeRole(a.actorRole) }))
          .filter((a) => !isPrivateCommsAuditEvent(a))
      : [],
    notifications: Array.isArray(rawState.notifications) ? rawState.notifications : [],
    subtasks: Array.isArray(rawState.subtasks) ? rawState.subtasks : [],
    taskComments: Array.isArray(rawState.taskComments) ? rawState.taskComments : [],
    vaultDocuments: Array.isArray(rawState.vaultDocuments) ? rawState.vaultDocuments : [],
    pendingEditorChanges: Array.isArray(rawState.pendingEditorChanges)
      ? rawState.pendingEditorChanges
      : [],
    corporateMails: [],
    chatMessages: [],
    calendarEvents: Array.isArray(rawState.calendarEvents) ? rawState.calendarEvents : [],
    recycleBin: pruneExpiredRecycleBin(
      Array.isArray(rawState.recycleBin) ? rawState.recycleBin : [],
    ),
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

const USER_PREFS_STORAGE_PREFIX = 'nexops_user_preferences_v1';

function getUserPreferencesStorageKey(email?: string | null): string {
  const clean = (email ?? '').trim().toLowerCase();
  return clean ? `${USER_PREFS_STORAGE_PREFIX}:${clean}` : `${USER_PREFS_STORAGE_PREFIX}:default`;
}

export function normalizeUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_USER_PREFERENCES };
  }
  const obj = raw as Partial<UserPreferences>;
  const density =
    obj.density === 'compact' || obj.density === 'comfortable' || obj.density === 'standard'
      ? obj.density
      : DEFAULT_USER_PREFERENCES.density;
  const fontStyle =
    obj.fontStyle === 'calibri' ||
    obj.fontStyle === 'segoe' ||
    obj.fontStyle === 'inter' ||
    obj.fontStyle === 'system'
      ? obj.fontStyle
      : DEFAULT_USER_PREFERENCES.fontStyle;
  const textScale =
    obj.textScale === '95' || obj.textScale === '100' || obj.textScale === '105'
      ? obj.textScale
      : DEFAULT_USER_PREFERENCES.textScale;
  const weatherUnit =
    obj.weatherUnit === 'C' || obj.weatherUnit === 'F'
      ? obj.weatherUnit
      : DEFAULT_USER_PREFERENCES.weatherUnit;
  const timeFormat =
    obj.timeFormat === '12h' || obj.timeFormat === '24h'
      ? obj.timeFormat
      : DEFAULT_USER_PREFERENCES.timeFormat;

  return {
    density,
    fontStyle,
    textScale,
    teamChatAlerts:
      typeof obj.teamChatAlerts === 'boolean'
        ? obj.teamChatAlerts
        : DEFAULT_USER_PREFERENCES.teamChatAlerts,
    mailNotifications:
      typeof obj.mailNotifications === 'boolean'
        ? obj.mailNotifications
        : DEFAULT_USER_PREFERENCES.mailNotifications,
    approvalLeaveAlerts:
      typeof obj.approvalLeaveAlerts === 'boolean'
        ? obj.approvalLeaveAlerts
        : DEFAULT_USER_PREFERENCES.approvalLeaveAlerts,
    calendarReminders:
      typeof obj.calendarReminders === 'boolean'
        ? obj.calendarReminders
        : DEFAULT_USER_PREFERENCES.calendarReminders,
    weatherCity:
      typeof obj.weatherCity === 'string' && obj.weatherCity.trim()
        ? obj.weatherCity.trim()
        : DEFAULT_USER_PREFERENCES.weatherCity,
    weatherUnit,
    timeFormat,
    timezone:
      typeof obj.timezone === 'string' && obj.timezone.trim()
        ? obj.timezone.trim()
        : DEFAULT_USER_PREFERENCES.timezone,
  };
}

export function loadUserPreferences(email?: string | null): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_PREFERENCES };
  try {
    const raw = localStorage.getItem(getUserPreferencesStorageKey(email));
    if (!raw) return { ...DEFAULT_USER_PREFERENCES };
    return normalizeUserPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function saveUserPreferences(email: string | null | undefined, prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getUserPreferencesStorageKey(email), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveFontFamilyCss(fontStyle: FontStyleOption): string {
  switch (fontStyle) {
    case 'segoe':
      return "'Segoe UI', 'Calibri', 'Carlito', sans-serif";
    case 'inter':
      return "'Inter', 'Calibri', 'Carlito', 'Segoe UI', sans-serif";
    case 'system':
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case 'calibri':
    default:
      return "'Calibri', 'Carlito', 'Segoe UI', sans-serif";
  }
}

export function resolveTextScaleValue(scale: TextScaleOption): string {
  switch (scale) {
    case '95':
      return '0.95';
    case '105':
      return '1.05';
    case '100':
    default:
      return '1';
  }
}

export function applyUserPreferencesToDom(prefs: UserPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--nexops-font-family', resolveFontFamilyCss(prefs.fontStyle));
  root.style.setProperty('--nexops-text-scale', resolveTextScaleValue(prefs.textScale));
  root.dataset.density = prefs.density;
}

export function formatTemperatureValue(tempC: number, unit: TemperatureUnit): number {
  if (unit === 'F') {
    return Math.round((tempC * 9) / 5 + 32);
  }
  return Math.round(tempC);
}

// ---------------------------------------------------------------------------
// Security Hardening, Password Complexity, Log Masking & Isolation Helpers
// ---------------------------------------------------------------------------

export function validateStrongPassword(password: string): {
  valid: boolean;
  error?: string;
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
} {
  const trimmed = password.trim();
  const hasMinLength = trimmed.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!hasMinLength) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long.',
      hasMinLength,
      hasLetter,
      hasNumber,
    };
  }
  if (!hasLetter || !hasNumber) {
    return {
      valid: false,
      error: 'Password must include at least 1 letter and 1 number.',
      hasMinLength,
      hasLetter,
      hasNumber,
    };
  }
  return { valid: true, hasMinLength, hasLetter, hasNumber };
}

export function evaluatePasswordStrength(pw: string): {
  score: number;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  barClass: string;
  textClass: string;
} {
  const check = validateStrongPassword(pw);
  if (!check.hasMinLength || !check.hasLetter || !check.hasNumber) {
    return {
      score: 1,
      label: 'Weak',
      barClass: 'w-1/4 bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400',
    };
  }
  let variety = 0;
  if (/[a-z]/.test(pw)) variety += 1;
  if (/[A-Z]/.test(pw)) variety += 1;
  if (/\d/.test(pw)) variety += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) variety += 1;

  if (pw.length >= 12 && variety >= 3) {
    return {
      score: 4,
      label: 'Strong',
      barClass: 'w-full bg-emerald-600',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (pw.length >= 10 || variety >= 3) {
    return {
      score: 3,
      label: 'Good',
      barClass: 'w-3/4 bg-indigo-600',
      textClass: 'text-indigo-700 dark:text-indigo-400',
    };
  }
  return {
    score: 2,
    label: 'Fair',
    barClass: 'w-1/2 bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
  };
}

export function maskEmailForLog(email?: string | null): string {
  const raw = (email ?? '').trim();
  if (!raw || !raw.includes('@')) return raw;
  const atIdx = raw.indexOf('@');
  const local = raw.slice(0, atIdx);
  const domain = raw.slice(atIdx + 1);
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskSensitiveIdentifiers(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, (full) =>
      maskEmailForLog(full),
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]{8,}\b/gi, '$1***')
    .replace(/\b((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;)]+/gi, '$1***');
}

export function sanitizePostgrestEmailFilter(email?: string | null): string | null {
  const clean = (email ?? '').trim().toLowerCase();
  if (!clean) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
    return null;
  }
  return clean;
}

export function extractDmPeerEmail(roomId: string, senderOrSelfEmail?: string | null): string | undefined {
  if (!roomId.startsWith('dm:')) return undefined;
  const participants = roomId
    .slice(3)
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (participants.length === 0) return undefined;
  const cleanSelf = (senderOrSelfEmail ?? '').trim().toLowerCase();
  if (!cleanSelf) return participants[0];
  const other = participants.find((p) => p !== cleanSelf);
  return other ?? (participants.length === 2 ? participants[0] : undefined);
}

export function normalizePrivateChatMessage(msg: TeamChatMessage): TeamChatMessage {
  const senderLower = (msg.senderEmail ?? '').trim().toLowerCase();
  const isDm = msg.roomType === 'dm' || msg.roomId.startsWith('dm:');
  if (!isDm) {
    return {
      ...msg,
      senderEmail: senderLower || msg.senderEmail,
    };
  }
  const explicitReceiver = (msg.receiverEmail ?? '').trim().toLowerCase();
  const derivedReceiver = explicitReceiver || extractDmPeerEmail(msg.roomId, senderLower) || '';
  return {
    ...msg,
    roomType: 'dm',
    senderEmail: senderLower || msg.senderEmail,
    receiverEmail: derivedReceiver || undefined,
  };
}

export function isDmParticipant(roomId: string, userEmail?: string | null): boolean {
  const cleanEmail = (userEmail ?? '').trim().toLowerCase();
  if (!cleanEmail || !roomId.startsWith('dm:')) return false;
  const participants = roomId
    .slice(3)
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return participants.includes(cleanEmail);
}

export function isStrictChatParticipant(
  msg: Pick<TeamChatMessage, 'roomId' | 'roomType' | 'senderEmail' | 'receiverEmail'>,
  userEmail?: string | null,
): boolean {
  const selfLower = (userEmail ?? '').trim().toLowerCase();
  if (!selfLower) return false;

  const isDm = msg.roomType === 'dm' || msg.roomId.startsWith('dm:');
  if (!isDm) {
    return true;
  }

  const senderLower = (msg.senderEmail ?? '').trim().toLowerCase();
  const explicitReceiver = (msg.receiverEmail ?? '').trim().toLowerCase();
  const receiverLower = explicitReceiver || extractDmPeerEmail(msg.roomId, senderLower) || '';

  if (senderLower === selfLower || (Boolean(receiverLower) && receiverLower === selfLower)) {
    // Also verify roomId participants if dm: prefix is used
    if (msg.roomId.startsWith('dm:')) {
      return isDmParticipant(msg.roomId, selfLower);
    }
    return true;
  }
  return false;
}

export function isStrictMailParticipant(
  mail: Pick<CorporateMailMessage, 'fromEmail' | 'receiverEmail' | 'toEmails' | 'ccEmails' | 'status'>,
  userEmail?: string | null,
): boolean {
  const selfLower = (userEmail ?? '').trim().toLowerCase();
  if (!selfLower) return false;
  const fromLower = (mail.fromEmail ?? '').trim().toLowerCase();
  if (mail.status === 'draft') {
    return fromLower === selfLower;
  }
  if (fromLower === selfLower) return true;
  const directReceiver = (mail.receiverEmail ?? '').trim().toLowerCase();
  if (directReceiver && directReceiver === selfLower) return true;
  const toList = Array.isArray(mail.toEmails)
    ? mail.toEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  const ccList = Array.isArray(mail.ccEmails)
    ? mail.ccEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return toList.includes(selfLower) || ccList.includes(selfLower);
}

export function isStrictMailRecipient(
  mail: Pick<CorporateMailMessage, 'receiverEmail' | 'toEmails' | 'ccEmails' | 'status'>,
  userEmail?: string | null,
): boolean {
  const selfLower = (userEmail ?? '').trim().toLowerCase();
  if (!selfLower || mail.status !== 'sent') return false;
  const directReceiver = (mail.receiverEmail ?? '').trim().toLowerCase();
  if (directReceiver && directReceiver === selfLower) return true;
  const toList = Array.isArray(mail.toEmails)
    ? mail.toEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  const ccList = Array.isArray(mail.ccEmails)
    ? mail.ccEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return toList.includes(selfLower) || ccList.includes(selfLower);
}

export function isStrictWorkspaceEmailParticipant(
  emailLog: Pick<WorkspaceEmailLog, 'senderEmail' | 'toRecipients' | 'ccRecipients'>,
  userEmail?: string | null,
): boolean {
  const selfLower = (userEmail ?? '').trim().toLowerCase();
  if (!selfLower) return false;
  if ((emailLog.senderEmail ?? '').trim().toLowerCase() === selfLower) {
    return true;
  }
  const parseRecipients = (raw?: string): string[] =>
    (raw ?? '')
      .split(/[,\n;<>]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.includes('@'));
  const toList = parseRecipients(emailLog.toRecipients);
  const ccList = parseRecipients(emailLog.ccRecipients);
  return toList.includes(selfLower) || ccList.includes(selfLower);
}

export function isPrivateCommsAuditEvent(ev?: Partial<AuditEvent> | null): boolean {
  if (!ev) return false;
  const action = String(ev.actionType ?? '').trim().toLowerCase();
  const reqId = String(ev.requestId ?? '').trim().toUpperCase();
  const details = String(ev.details ?? '').trim().toLowerCase();
  if (action === 'mail sent') return true;
  if (
    reqId === 'MAIL-HUB' ||
    reqId === 'WORKSPACE-GMAIL' ||
    reqId.startsWith('MAIL-') ||
    reqId.startsWith('CHAT-')
  ) {
    return true;
  }
  if (
    details.includes('sent corporate email') ||
    details.includes('sent email "') ||
    details.includes('1:1 google meet')
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 24h SLA Overdue Helpers, 30-Day Recycle Bin & Filtered Executive CSV
// ---------------------------------------------------------------------------

export function isLeavePendingOver24h(leave: LeaveRequest, nowMs: number = Date.now()): boolean {
  if (leave.status !== 'Pending') return false;
  const createdMs = new Date(leave.createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs >= 24 * 60 * 60 * 1000;
}

export const RECYCLE_BIN_RETENTION_DAYS = 30;

export function createRecycleBinExpiry(deletedAtIso: string): string {
  const baseMs = new Date(deletedAtIso).getTime();
  const safeBase = Number.isNaN(baseMs) ? Date.now() : baseMs;
  return new Date(safeBase + RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function getRecycleBinDaysLeft(expiresAtIso: string, nowMs: number = Date.now()): number {
  const expMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expMs)) return RECYCLE_BIN_RETENTION_DAYS;
  const remaining = Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export function pruneExpiredRecycleBin(
  items: RecycleBinItem[],
  nowMs: number = Date.now(),
): RecycleBinItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    if (!item || !item.id || !item.itemId) return false;
    const expMs = new Date(item.expiresAt).getTime();
    if (Number.isNaN(expMs)) return true;
    return expMs > nowMs;
  });
}

export function exportFilteredExecutiveReportCsv(params: {
  companyName: string;
  departmentFilter: string;
  fromDate: string;
  toDate: string;
  preparedBy: string;
  requests: OperationalRequest[];
  attendanceLogs: AttendanceLog[];
}): void {
  const headers = [
    'Request ID',
    'Title',
    'Department',
    'Category',
    'Priority',
    'Status',
    'Submitted By',
    'Assigned Reviewer',
    'Created Date',
    'Due Date',
    'QA Verified',
    'QA Total',
  ];

  const metaHeader = [
    [
      escapeCsvCell(`${params.companyName} — Official Executive Report`),
      escapeCsvCell(`Department: ${params.departmentFilter}`),
      escapeCsvCell(`Range: ${params.fromDate || 'All'} to ${params.toDate || 'Present'}`),
      escapeCsvCell(`Prepared by: ${params.preparedBy}`),
      escapeCsvCell(`Attendance Records in Scope: ${params.attendanceLogs.length}`),
    ],
    [],
    headers,
  ];

  const rows = params.requests.map((req) => [
    escapeCsvCell(req.id),
    escapeCsvCell(req.title),
    escapeCsvCell(req.department),
    escapeCsvCell(req.category),
    escapeCsvCell(req.priority),
    escapeCsvCell(req.status),
    escapeCsvCell(req.submittedBy),
    escapeCsvCell(req.assignedReviewer),
    escapeCsvCell(req.createdAt.slice(0, 10)),
    escapeCsvCell(req.dueDate),
    escapeCsvCell(String(req.checklist.filter((c) => c.checked).length)),
    escapeCsvCell(String(req.checklist.length)),
  ]);

  const csvContent = [...metaHeader, ...rows].map((r) => r.join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = getTodayDateString();
  link.href = url;
  link.setAttribute('download', `nexops-official-report-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 1. Shift Roster & Punctuality Score Helpers
// ---------------------------------------------------------------------------

export function normalizeTimeHHMM(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function normalizeShiftRosters(
  raw: unknown,
  departments: string[] = [],
): Record<string, DepartmentShiftConfig> {
  const result: Record<string, DepartmentShiftConfig> = {};
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const allDepts = Array.from(new Set([...departments, ...Object.keys(source)])).filter(Boolean);

  for (const dept of allDepts) {
    const entry = source[dept];
    const obj = entry && typeof entry === 'object' ? (entry as Partial<DepartmentShiftConfig>) : {};
    const graceRaw = Number(obj.graceMinutes);
    const graceMinutes =
      Number.isFinite(graceRaw) && graceRaw >= 0 && graceRaw <= 180
        ? Math.round(graceRaw)
        : DEFAULT_SHIFT_CONFIG.graceMinutes;

    result[dept] = {
      department: dept,
      startTime: normalizeTimeHHMM(obj.startTime, DEFAULT_SHIFT_CONFIG.startTime),
      endTime: normalizeTimeHHMM(obj.endTime, DEFAULT_SHIFT_CONFIG.endTime),
      graceMinutes,
    };
  }
  return result;
}

export function getShiftForDepartment(
  department: string,
  shiftRosters?: Record<string, DepartmentShiftConfig>,
): DepartmentShiftConfig {
  const found = shiftRosters?.[department];
  if (found) {
    return {
      department,
      startTime: normalizeTimeHHMM(found.startTime, DEFAULT_SHIFT_CONFIG.startTime),
      endTime: normalizeTimeHHMM(found.endTime, DEFAULT_SHIFT_CONFIG.endTime),
      graceMinutes:
        typeof found.graceMinutes === 'number' && Number.isFinite(found.graceMinutes)
          ? Math.max(0, Math.min(180, Math.round(found.graceMinutes)))
          : DEFAULT_SHIFT_CONFIG.graceMinutes,
    };
  }
  return {
    department,
    ...DEFAULT_SHIFT_CONFIG,
  };
}

export function formatTime12hFromHHMM(time24: string): string {
  const normalized = normalizeTimeHHMM(time24, '09:00');
  const [hStr, mStr] = normalized.split(':');
  const h = Number(hStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${mStr} ${period}`;
}

function toMinutesFromHHMM(time24: string): number {
  const normalized = normalizeTimeHHMM(time24, '09:00');
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function getLocalMinutesFromIso(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export function evaluateAttendanceTags(
  log: Pick<
    AttendanceLog,
    'checkInTime' | 'checkOutTime' | 'status' | 'checkInTag' | 'checkOutTag' | 'shiftStartTime' | 'shiftEndTime'
  >,
  shift: DepartmentShiftConfig,
): {
  checkInTag: 'On Time' | 'Late';
  checkOutTag?: 'On Time' | 'Early Out';
  shiftStartTime: string;
  shiftEndTime: string;
} {
  const shiftStartTime = log.shiftStartTime || shift.startTime;
  const shiftEndTime = log.shiftEndTime || shift.endTime;

  let checkInTag: 'On Time' | 'Late';
  if (log.checkInTag) {
    checkInTag = log.checkInTag;
  } else {
    const inMins = getLocalMinutesFromIso(log.checkInTime);
    if (inMins !== null) {
      const cutoffMins = toMinutesFromHHMM(shiftStartTime) + shift.graceMinutes;
      checkInTag = inMins > cutoffMins ? 'Late' : 'On Time';
    } else {
      checkInTag = log.status === 'Late' ? 'Late' : 'On Time';
    }
  }

  let checkOutTag: 'On Time' | 'Early Out' | undefined = log.checkOutTag;
  if (!checkOutTag && log.checkOutTime) {
    const outMins = getLocalMinutesFromIso(log.checkOutTime);
    if (outMins !== null) {
      const endMins = toMinutesFromHHMM(shiftEndTime);
      checkOutTag = outMins < endMins ? 'Early Out' : 'On Time';
    }
  }

  return {
    checkInTag,
    checkOutTag,
    shiftStartTime,
    shiftEndTime,
  };
}

export interface PunctualityStats {
  score: number;
  totalCount: number;
  onTimeCount: number;
  lateCount: number;
  earlyOutCount: number;
}

export function calculatePunctualityStats(
  logs: AttendanceLog[],
  shiftRosters?: Record<string, DepartmentShiftConfig>,
): PunctualityStats {
  if (logs.length === 0) {
    return { score: 100, totalCount: 0, onTimeCount: 0, lateCount: 0, earlyOutCount: 0 };
  }
  let onTimeCount = 0;
  let lateCount = 0;
  let earlyOutCount = 0;
  for (const log of logs) {
    const shift = getShiftForDepartment(log.department, shiftRosters);
    const evaluated = evaluateAttendanceTags(log, shift);
    if (evaluated.checkInTag === 'On Time') {
      onTimeCount += 1;
    } else {
      lateCount += 1;
    }
    if (evaluated.checkOutTag === 'Early Out') {
      earlyOutCount += 1;
    }
  }
  const score = Math.round((onTimeCount / logs.length) * 100);
  return {
    score,
    totalCount: logs.length,
    onTimeCount,
    lateCount,
    earlyOutCount,
  };
}

// ---------------------------------------------------------------------------
// 2. Meeting Action Items Tracker Helpers
// ---------------------------------------------------------------------------

export function normalizeActionItemStatus(
  status: MeetingActionStatus,
): 'Todo' | 'In Progress' | 'Done' | 'Converted to Request' {
  if (status === 'Open' || status === 'Todo') return 'Todo';
  if (status === 'In Progress') return 'In Progress';
  if (status === 'Done' || status === 'Completed') return 'Done';
  return 'Converted to Request';
}

export function getNextActionTrackerStatus(
  status: MeetingActionStatus,
): 'Todo' | 'In Progress' | 'Done' {
  const norm = normalizeActionItemStatus(status);
  if (norm === 'Todo') return 'In Progress';
  if (norm === 'In Progress') return 'Done';
  return 'Todo';
}

export function isActionItemOpen(status: MeetingActionStatus): boolean {
  const norm = normalizeActionItemStatus(status);
  return norm === 'Todo' || norm === 'In Progress';
}

export function isActionItemOverdue(
  item: Pick<MeetingActionItem, 'dueDate' | 'status'>,
  todayStr: string = getTodayDateString(),
): boolean {
  if (!item.dueDate) return false;
  const norm = normalizeActionItemStatus(item.status);
  if (norm === 'Done') return false;
  return item.dueDate.slice(0, 10) < todayStr;
}

// ---------------------------------------------------------------------------
// 3. Document Expiry Alerts Helpers
// ---------------------------------------------------------------------------

export interface DocumentExpiryInfo {
  status: 'none' | 'valid' | 'expiring_soon' | 'expired';
  daysLeft: number;
  label: string;
}

export function getDocumentExpiryInfo(
  expiryDate?: string,
  todayStr: string = getTodayDateString(),
): DocumentExpiryInfo {
  const clean = (expiryDate ?? '').trim().slice(0, 10);
  if (!clean) {
    return { status: 'none', daysLeft: 0, label: 'No Expiry' };
  }
  const expMs = new Date(`${clean}T00:00:00`).getTime();
  const todayMs = new Date(`${todayStr}T00:00:00`).getTime();
  if (Number.isNaN(expMs) || Number.isNaN(todayMs)) {
    return { status: 'none', daysLeft: 0, label: 'No Expiry' };
  }
  const daysLeft = Math.round((expMs - todayMs) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      status: 'expired',
      daysLeft,
      label: `Expired ${overdueDays}d ago`,
    };
  }
  if (daysLeft === 0) {
    return {
      status: 'expiring_soon',
      daysLeft: 0,
      label: 'Expires Today',
    };
  }
  if (daysLeft <= 30) {
    return {
      status: 'expiring_soon',
      daysLeft,
      label: `Expiring in ${daysLeft}d`,
    };
  }
  return {
    status: 'valid',
    daysLeft,
    label: `Expires ${formatShortDate(clean)}`,
  };
}

// ---------------------------------------------------------------------------
// 4. Safe External URL Validation & Calendar Conflict Detection
// ---------------------------------------------------------------------------

export function sanitizeExternalHttpUrl(rawUrl?: string | null): string | null {
  const raw = (rawUrl ?? '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface CalendarConflictItem {
  id: string;
  title: string;
  time: string;
  source: 'calendar' | 'meeting';
  reasons: string[];
}

export function detectCalendarConflicts(
  candidate: {
    id?: string;
    date: string;
    time: string;
    locationOrLink?: string;
    attendees?: string[];
  },
  existingEvents: CalendarEvent[],
  meetings: MeetingMinute[],
): CalendarConflictItem[] {
  const cleanDate = (candidate.date ?? '').slice(0, 10);
  if (!cleanDate) return [];

  const candMins = toMinutesFromHHMM(candidate.time || '09:00');
  const candLocation = (candidate.locationOrLink ?? '').trim().toLowerCase();
  const candAttendees = new Set(
    (candidate.attendees ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean),
  );

  if (!candLocation && candAttendees.size === 0) {
    return [];
  }

  const conflicts: CalendarConflictItem[] = [];

  for (const ev of existingEvents) {
    if (candidate.id && ev.id === candidate.id) continue;
    if ((ev.date ?? '').slice(0, 10) !== cleanDate) continue;

    const evMins = toMinutesFromHHMM(ev.time || '09:00');
    if (Math.abs(candMins - evMins) >= 60) continue;

    const reasons: string[] = [];
    const evLocation = (ev.locationOrLink ?? '').trim().toLowerCase();
    if (candLocation && evLocation && candLocation === evLocation) {
      reasons.push(`Room/Link conflict (${ev.locationOrLink})`);
    }

    const evPeople = new Set(
      [
        ...(ev.attendees ?? []),
        ev.createdBy,
        ev.createdByEmail,
      ]
        .map((p) => (p ?? '').trim().toLowerCase())
        .filter(Boolean),
    );
    const sharedAttendees = Array.from(candAttendees).filter((a) => evPeople.has(a));
    if (sharedAttendees.length > 0) {
      reasons.push(`Attendee busy (${sharedAttendees.join(', ')})`);
    }

    if (reasons.length > 0) {
      conflicts.push({
        id: ev.id,
        title: ev.title,
        time: ev.time || '09:00',
        source: 'calendar',
        reasons,
      });
    }
  }

  for (const mom of meetings) {
    if ((mom.meetingDate ?? '').slice(0, 10) !== cleanDate) continue;
    const momTime = '10:00';
    const momMins = toMinutesFromHHMM(momTime);
    if (Math.abs(candMins - momMins) >= 60) continue;

    const momPeople = new Set(
      [...(mom.attendees ?? []), mom.facilitator]
        .map((p) => (p ?? '').trim().toLowerCase())
        .filter(Boolean),
    );
    const sharedAttendees = Array.from(candAttendees).filter((a) => momPeople.has(a));
    if (sharedAttendees.length > 0) {
      conflicts.push({
        id: `mom-${mom.id}`,
        title: `${mom.code}: ${mom.title}`,
        time: momTime,
        source: 'meeting',
        reasons: [`MoM attendee overlap (${sharedAttendees.join(', ')})`],
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// 5. Announcement Expiry & Per-User Dismiss Helpers
// ---------------------------------------------------------------------------

export function isAnnouncementActive(
  ann: Pick<CompanyAnnouncement, 'archived' | 'expiresAt'>,
  nowMs: number = Date.now(),
): boolean {
  if (ann.archived) return false;
  if (!ann.expiresAt) return true;
  const expMs = new Date(ann.expiresAt).getTime();
  if (Number.isNaN(expMs)) return true;
  return expMs > nowMs;
}

function getDismissedAnnouncementsStorageKey(email?: string | null): string {
  const safe = (email ?? 'guest').trim().toLowerCase() || 'guest';
  return `nexops_dismissed_announcements_v1_${safe}`;
}

export function loadDismissedAnnouncementIds(email?: string | null): string[] {
  try {
    const raw = localStorage.getItem(getDismissedAnnouncementsStorageKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveDismissedAnnouncementIds(email: string | null | undefined, ids: string[]): void {
  try {
    localStorage.setItem(
      getDismissedAnnouncementsStorageKey(email),
      JSON.stringify(Array.from(new Set(ids)).slice(0, 50)),
    );
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// 6. Personal Bookmarks / Quick Launch Bar Helpers
// ---------------------------------------------------------------------------

export function getDefaultQuickBookmarks(
  role: Role,
  isSuperAdmin: boolean,
): QuickBookmark[] {
  const now = new Date().toISOString();
  const base: QuickBookmark[] = [
    { id: 'bm-dashboard', label: 'Executive KPIs', kind: 'module', section: 'dashboard', createdAt: now },
    { id: 'bm-requests', label: 'Requests & Queue', kind: 'module', section: 'requests', createdAt: now },
    { id: 'bm-vault', label: 'Document Vault', kind: 'module', section: 'vault', createdAt: now },
    { id: 'bm-calendar', label: 'Calendar', kind: 'module', section: 'calendar', createdAt: now },
  ];
  if (isSuperAdmin && role === 'Admin') {
    base.push({
      id: 'bm-settings',
      label: 'Settings',
      kind: 'module',
      section: 'settings',
      createdAt: now,
    });
  }
  return base;
}

function getQuickBookmarksStorageKey(email?: string | null): string {
  const safe = (email ?? 'guest').trim().toLowerCase() || 'guest';
  return `nexops_quick_bookmarks_v1_${safe}`;
}

export function sanitizeQuickBookmarks(
  raw: unknown,
  role: Role,
  isSuperAdmin: boolean,
): QuickBookmark[] {
  if (!Array.isArray(raw)) {
    return getDefaultQuickBookmarks(role, isSuperAdmin);
  }
  const allowedSections = new Set<NavSection>([
    'dashboard',
    'requests',
    'projects',
    'assets',
    'sops',
    'vault',
    'leaves',
    'meetings',
    'calendar',
    'mailchat',
    'workspace',
    'user_settings',
    ...(isSuperAdmin && role === 'Admin' ? (['audit', 'settings'] as NavSection[]) : []),
  ]);

  const cleaned: QuickBookmark[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const bm = item as Partial<QuickBookmark>;
    const label = typeof bm.label === 'string' ? bm.label.trim().slice(0, 40) : '';
    if (!label) continue;
    if (bm.kind === 'module' && bm.section && allowedSections.has(bm.section)) {
      cleaned.push({
        id: typeof bm.id === 'string' && bm.id ? bm.id : `bm-${bm.section}`,
        label,
        kind: 'module',
        section: bm.section,
        createdAt: typeof bm.createdAt === 'string' ? bm.createdAt : new Date().toISOString(),
      });
    } else if (bm.kind === 'url') {
      const safeUrl = sanitizeExternalHttpUrl(bm.url);
      if (!safeUrl) continue;
      cleaned.push({
        id:
          typeof bm.id === 'string' && bm.id
            ? bm.id
            : `bm-url-${Math.random().toString(36).slice(2, 8)}`,
        label,
        kind: 'url',
        url: safeUrl,
        createdAt: typeof bm.createdAt === 'string' ? bm.createdAt : new Date().toISOString(),
      });
    }
  }
  return cleaned;
}

export function loadQuickBookmarks(
  email: string | null | undefined,
  role: Role,
  isSuperAdmin: boolean,
): QuickBookmark[] {
  try {
    const raw = localStorage.getItem(getQuickBookmarksStorageKey(email));
    if (!raw) return getDefaultQuickBookmarks(role, isSuperAdmin);
    return sanitizeQuickBookmarks(JSON.parse(raw), role, isSuperAdmin);
  } catch {
    return getDefaultQuickBookmarks(role, isSuperAdmin);
  }
}

export function saveQuickBookmarks(
  email: string | null | undefined,
  bookmarks: QuickBookmark[],
): void {
  try {
    localStorage.setItem(getQuickBookmarksStorageKey(email), JSON.stringify(bookmarks));
  } catch {
    // Ignore storage errors
  }
}

