import { DEFAULT_PERMISSION_MATRIX } from '../data/seedData';
import {
  ApprovalStatus,
  AttendanceLog,
  AuditEvent,
  CompanyAsset,
  CurrencyCode,
  DbAccessRole,
  NexOpsState,
  OperationalRequest,
  PermissionKey,
  PermissionMatrix,
  RequestStatus,
  Role,
  TeamMember,
} from '../types/nexops';

export const SUPER_ADMIN_EMAIL = 'asim.zaka@mmpakistan.com';

export function isSuperAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
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
  if (cleaned === 'approved') return 'approved';
  if (cleaned === 'rejected' || cleaned === 'declined') return 'rejected';
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

export function isRequestOverdue(req: OperationalRequest): boolean {
  if (req.status === 'Approved' || req.status === 'Rejected') {
    return false;
  }
  if (!req.dueDate) return false;
  return req.dueDate < getTodayDateString();
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
): SlaCountdownInfo {
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
    const breachDays = Math.max(1, getOverdueDays(dueDate));
    return {
      label: `Breached by ${breachDays}d`,
      tone: 'red',
      breached: true,
    };
  }

  const dueEndMs = new Date(`${dueDate}T23:59:59`).getTime();
  if (Number.isNaN(dueEndMs)) {
    return { label: dueDate, tone: 'slate', breached: false };
  }

  const diffMs = dueEndMs - nowMs;

  if (dueDate === todayStr) {
    const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    return {
      label: hoursLeft > 0 ? `Due Today (${hoursLeft}h)` : 'Due Today',
      tone: 'amber',
      breached: false,
    };
  }

  const safeDiff = Math.max(0, diffMs);
  const days = Math.floor(safeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((safeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const label = days > 0 ? `Due in ${days}d ${hours}h` : `Due in ${Math.max(1, hours)}h`;
  return {
    label,
    tone: days >= 2 ? 'emerald' : 'slate',
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
}

export function exportDepartmentScorecardCsv(rows: DepartmentScorecardRow[]): void {
  const headers = [
    'Department',
    'Total Requests',
    'Approved Requests',
    'Approval Rate (%)',
    'Overdue Count',
    'Avg QA Checklist Completion (%)',
  ];

  const csvRows = rows.map((row) => [
    escapeCsvCell(row.department),
    escapeCsvCell(String(row.totalRequests)),
    escapeCsvCell(String(row.approvedCount)),
    escapeCsvCell(`${row.approvalRatePct}%`),
    escapeCsvCell(String(row.overdueCount)),
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

  // Enforce strict boundaries: Admin holds full operational controls; non-admin roles are strictly read-only.
  base.Admin.manage_admin_settings = true;
  for (const key of PERMISSION_KEYS) {
    base.Editor[key] = false;
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
    const role = isSuperAdminEmail(m.email) ? 'Admin' : normalizeRole(m.role);
    return {
      ...m,
      role,
      approvalStatus: normalizeApprovalStatus(m.approvalStatus ?? 'approved', m.email),
      isSuperAdmin: isSuperAdminEmail(m.email) || Boolean(m.isSuperAdmin),
      active: isSuperAdminEmail(m.email) ? true : m.active !== false,
      employeeId: m.employeeId || `NX-EMP-${String(1001 + idx * 4)}`,
      signOffTitle: m.signOffTitle || m.title || role,
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


