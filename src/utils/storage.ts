import {
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_ASSETS,
  INITIAL_LEAVES,
  INITIAL_MEETINGS,
  INITIAL_PROJECTS,
  INITIAL_SOPS,
} from '../data/seedData';
import {
  AuditEvent,
  CompanyAsset,
  CurrencyCode,
  NexOpsState,
  OperationalRequest,
  PermissionKey,
  PermissionMatrix,
  RequestStatus,
  Role,
  TeamMember,
} from '../types/nexops';

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
  const target = members.find(
    (m) => m.name.toLowerCase() === cleanIntended.toLowerCase() && m.active,
  );
  if (!target) {
    // Fallback to first active non-OOO Manager/Admin if intended reviewer isn't found
    const fallback =
      members.find(
        (m) =>
          m.active &&
          (m.role === 'Manager / QA Reviewer' || m.role === 'Admin') &&
          !m.outOfOffice,
      ) ??
      members.find((m) => m.active && (m.role === 'Manager / QA Reviewer' || m.role === 'Admin'));
    return {
      assignedReviewer: fallback?.name || cleanIntended || 'QA Reviewer',
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
      'Q4 Cloud IAM Key Rotation Verification',
      'Security Compliance',
      'Engineering',
      'High',
      'Submitted',
      '2026-12-05',
      'Nadia Patel',
      'Marcus Vance',
      'https://intra.nexops.example/sec/iam-rotation-q4',
      'Validate automated KMS and IAM service credential rotation across production clusters with zero service disruption.',
      'Confirm zero hardcoded secrets;Verify dual-region replication;Attach automated penetration test report',
    ],
    [
      'Vendor SLA Renewal Audit Package',
      'Vendor Risk Review',
      'Operations',
      'Medium',
      'Draft',
      '2026-12-12',
      'David Kim',
      'Marcus Vance',
      'https://intra.nexops.example/ops/vendor-sla-2026',
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

const VALID_ROLES: Role[] = ['Admin', 'Manager / QA Reviewer', 'Staff / Contributor'];

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
  const candidate = raw as Partial<Record<Role, Partial<Record<PermissionKey, unknown>>>>;
  for (const role of VALID_ROLES) {
    const roleEntry = candidate[role];
    if (roleEntry && typeof roleEntry === 'object') {
      for (const key of PERMISSION_KEYS) {
        if (typeof roleEntry[key] === 'boolean') {
          base[role][key] = roleEntry[key] as boolean;
        }
      }
    }
  }
  // Ensure Admin always retains system administration access
  base.Admin.manage_admin_settings = true;
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

  const activeRole: Role = VALID_ROLES.includes(rawState.activeRole as Role)
    ? (rawState.activeRole as Role)
    : 'Admin';

  const normalizedMembers = rawState.teamMembers.map((m, idx) => ({
    ...m,
    employeeId: m.employeeId || `NX-EMP-${String(1001 + idx * 4)}`,
    signOffTitle: m.signOffTitle || m.title || m.role,
  }));

  return {
    activeRole,
    requests: rawState.requests,
    projects: Array.isArray(rawState.projects)
      ? rawState.projects.map((p) => ({
          ...p,
          currency: p.currency ?? 'USD',
          estimatedBudget: typeof p.estimatedBudget === 'number' ? p.estimatedBudget : 25000,
          actualSpend: typeof p.actualSpend === 'number' ? p.actualSpend : 0,
        }))
      : structuredClone(INITIAL_PROJECTS),
    assets: Array.isArray(rawState.assets)
      ? rawState.assets
      : structuredClone(INITIAL_ASSETS),
    sops: Array.isArray(rawState.sops)
      ? rawState.sops
      : structuredClone(INITIAL_SOPS),
    leaves: Array.isArray(rawState.leaves)
      ? rawState.leaves
      : structuredClone(INITIAL_LEAVES),
    announcements: Array.isArray(rawState.announcements)
      ? rawState.announcements
      : structuredClone(INITIAL_ANNOUNCEMENTS),
    meetings: Array.isArray(rawState.meetings)
      ? rawState.meetings
      : structuredClone(INITIAL_MEETINGS),
    workspaceEmails: Array.isArray(rawState.workspaceEmails) ? rawState.workspaceEmails : [],
    workspaceLinks: Array.isArray(rawState.workspaceLinks) ? rawState.workspaceLinks : [],
    teamMembers: normalizedMembers,
    globalAuditLogs: Array.isArray(rawState.globalAuditLogs)
      ? rawState.globalAuditLogs
      : [],
    notifications: Array.isArray(rawState.notifications) ? rawState.notifications : [],
    permissionMatrix: normalizePermissionMatrix(rawState.permissionMatrix),
  };
}

