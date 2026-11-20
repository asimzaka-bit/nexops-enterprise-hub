import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProvisionEmployeePayload } from '../services/dataService';
import {
  ApprovalStatus,
  AuditEvent,
  CompanyBrandingConfig,
  Department,
  NexOpsState,
  OperationalRequest,
  PermissionKey,
  PermissionMatrix,
  Role,
  TableSyncStatus,
  TeamMember,
} from '../types/nexops';
import { formatDateTime, isSuperAdminEmail, parseSystemBackupJson } from '../utils/storage';
import { UserAvatar } from './UserAvatar';

interface TeamSettingsViewProps {
  activeRole: Role;
  branding: CompanyBrandingConfig;
  permissionMatrix: PermissionMatrix;
  tableDiagnostics: TableSyncStatus[];
  isCheckingHealth: boolean;
  teamMembers: TeamMember[];
  requests: OperationalRequest[];
  auditLogs: AuditEvent[];
  notificationsCount: number;
  dbConnected: boolean;
  onUpdateBranding: (nextBranding: CompanyBrandingConfig) => void;
  onResetBranding: () => void;
  onUpdatePermissionMatrix: (nextMatrix: PermissionMatrix) => void;
  onRunHealthCheck: () => void;
  onUpdateMemberRole: (memberId: string, role: Role) => void;
  onUpdateMemberDepartment: (memberId: string, department: Department) => void;
  onToggleMemberActive: (memberId: string) => void;
  onApproveUser: (memberId: string, assignedRole: Role) => Promise<void> | void;
  onRejectUser: (memberId: string) => Promise<void> | void;
  onProvisionEmployee: (payload: ProvisionEmployeePayload) => Promise<void>;
  onDownloadBackup: () => void;
  onRestoreBackup: (restoredState: NexOpsState) => void;
  onBackupError: (message: string) => void;
}

const ROLES: Role[] = ['Admin', 'Viewer'];
const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: 'Viewer', label: 'Viewer (Read-Only)' },
  { value: 'Admin', label: 'Admin (Full Data Control)' },
];

const PERMISSION_LABELS: { key: PermissionKey; label: string; scope: string }[] = [
  {
    key: 'create_requests',
    label: 'Create & Submit Requests',
    scope: 'Requests & Workflow Queue',
  },
  {
    key: 'approve_requests',
    label: 'QA Review & Stage Approvals',
    scope: 'Requests & Workflow Queue',
  },
  {
    key: 'manage_projects',
    label: 'Create / Edit Projects & Budgets',
    scope: 'Projects & Clients',
  },
  {
    key: 'manage_assets',
    label: 'Register Assets & Custody Transfers',
    scope: 'Assets & Inventory',
  },
  {
    key: 'publish_sops',
    label: 'Publish SOPs & Mandatory Flags',
    scope: 'SOP & Policy Vault',
  },
  {
    key: 'approve_leaves',
    label: 'Approve / Reject Employee Leaves',
    scope: 'Leaves & Time-Off',
  },
  {
    key: 'manage_meetings',
    label: 'Log MoMs & Convert Action Items',
    scope: 'Meetings & MoM Tracker',
  },
  {
    key: 'publish_announcements',
    label: 'Publish & Archive Executive Circulars',
    scope: 'Executive Announcements',
  },
  {
    key: 'manage_admin_settings',
    label: 'Manage RBAC, Branding & Backups',
    scope: 'Team & Admin Settings',
  },
];

function generateNextEmployeeId(members: TeamMember[]): string {
  const maxNum = members.reduce((max, m) => {
    const match = m.employeeId.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      return n > max && n < 1000 ? n : max;
    }
    return max;
  }, 100);
  return `EMP-${String(maxNum + 1).padStart(3, '0')}`;
}

export function TeamSettingsView({
  activeRole,
  branding,
  permissionMatrix,
  tableDiagnostics,
  isCheckingHealth,
  teamMembers,
  requests,
  auditLogs,
  notificationsCount,
  dbConnected,
  onUpdateBranding,
  onResetBranding,
  onUpdatePermissionMatrix,
  onRunHealthCheck,
  onUpdateMemberRole,
  onUpdateMemberDepartment,
  onToggleMemberActive,
  onApproveUser,
  onRejectUser,
  onProvisionEmployee,
  onDownloadBackup,
  onRestoreBackup,
  onBackupError,
}: TeamSettingsViewProps) {
  const isAdmin = activeRole === 'Admin';
  const [showAddForm, setShowAddForm] = useState(false);
  const backupFileRef = useRef<HTMLInputElement>(null);

  // User Access & Approvals state
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | 'all'>('all');
  const [draftApprovalRoles, setDraftApprovalRoles] = useState<Record<string, Role>>({});
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);

  const [draftMatrix, setDraftMatrix] = useState<PermissionMatrix>(permissionMatrix);

  useEffect(() => {
    setDraftMatrix(permissionMatrix);
  }, [permissionMatrix]);

  const handleTogglePermission = (role: Role, key: PermissionKey) => {
    if (!isAdmin) return;
    if (role !== 'Admin') return;
    if (key === 'manage_admin_settings') return;
    setDraftMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [key]: !prev[role][key],
      },
    }));
  };

  const healthyTablesCount = tableDiagnostics.filter((t) => t.status === 'connected').length;
  const totalCloudRows = tableDiagnostics.reduce((sum, t) => sum + t.rowCount, 0);

  // White-Label Branding & Dynamic Lists local draft state
  const [draftCompanyName, setDraftCompanyName] = useState(branding.companyName);
  const [draftTagline, setDraftTagline] = useState(branding.tagline);
  const [draftBudgetThresholdUsd, setDraftBudgetThresholdUsd] = useState(
    String(branding.approvalBudgetThresholdUsd ?? 5000),
  );
  const [draftDepartments, setDraftDepartments] = useState<string[]>(branding.departments);
  const [draftCategories, setDraftCategories] = useState<string[]>(branding.categories);
  const [newDepartmentInput, setNewDepartmentInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [brandingError, setBrandingError] = useState<string | null>(null);

  useEffect(() => {
    setDraftCompanyName(branding.companyName);
    setDraftTagline(branding.tagline);
    setDraftBudgetThresholdUsd(String(branding.approvalBudgetThresholdUsd ?? 5000));
    setDraftDepartments(branding.departments);
    setDraftCategories(branding.categories);
  }, [branding]);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState(() =>
    generateNextEmployeeId(teamMembers),
  );
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState<Role>('Viewer');
  const [newDept, setNewDept] = useState<Department>(
    branding.departments[0] ?? 'Engineering',
  );
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddDepartment = () => {
    const trimmed = newDepartmentInput.trim();
    if (!trimmed) return;
    if (draftDepartments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setBrandingError(`Department "${trimmed}" is already in the list.`);
      return;
    }
    setDraftDepartments((prev) => [...prev, trimmed]);
    setNewDepartmentInput('');
    setBrandingError(null);
  };

  const handleRemoveDepartment = (deptToRemove: string) => {
    if (draftDepartments.length <= 1) {
      setBrandingError('At least one corporate department must remain configured.');
      return;
    }
    setDraftDepartments((prev) => prev.filter((d) => d !== deptToRemove));
    setBrandingError(null);
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (draftCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setBrandingError(`Category "${trimmed}" is already in the list.`);
      return;
    }
    setDraftCategories((prev) => [...prev, trimmed]);
    setNewCategoryInput('');
    setBrandingError(null);
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    if (draftCategories.length <= 1) {
      setBrandingError('At least one request category must remain configured.');
      return;
    }
    setDraftCategories((prev) => prev.filter((c) => c !== categoryToRemove));
    setBrandingError(null);
  };

  const handleBrandingSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!draftCompanyName.trim()) {
      setBrandingError('Company / Organization Name cannot be empty.');
      return;
    }
    if (draftDepartments.length === 0 || draftCategories.length === 0) {
      setBrandingError('At least one department and one category are required.');
      return;
    }
    const parsedThreshold = Number(draftBudgetThresholdUsd);
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      setBrandingError('Two-Tier Approval Budget Threshold must be a non-negative USD amount.');
      return;
    }
    setBrandingError(null);
    onUpdateBranding({
      companyName: draftCompanyName.trim(),
      tagline: draftTagline.trim() || 'Unified Operations, QA & Approval Management System',
      departments: draftDepartments,
      categories: draftCategories,
      approvalBudgetThresholdUsd: Math.round(parsedThreshold),
    });
  };

  const healthMetrics = useMemo(() => {
    const totalChecklistGates = requests.reduce((sum, r) => sum + r.checklist.length, 0);
    const verifiedGates = requests.reduce(
      (sum, r) => sum + r.checklist.filter((c) => c.checked).length,
      0,
    );
    const approxBytes = new Blob([
      JSON.stringify({ requests, teamMembers, auditLogs, notificationsCount }),
    ]).size;
    const approxKb = Math.max(1, Math.round(approxBytes / 1024));
    return { totalChecklistGates, verifiedGates, approxKb };
  }, [requests, teamMembers, auditLogs, notificationsCount]);

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newName.trim() || !newEmail.trim() || !newEmployeeId.trim()) {
      setFormError('Full name, Employee ID (EMP-XXX), and corporate email are required.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setFormError('Temporary password must be at least 8 characters.');
      return;
    }

    setFormError(null);
    setProvisioning(true);
    try {
      await onProvisionEmployee({
        fullName: newName.trim(),
        email: newEmail.trim(),
        employeeId: newEmployeeId.trim().toUpperCase(),
        password: newPassword,
        role: newRole,
        department: newDept,
        title: newTitle.trim() || undefined,
      });
      setNewName('');
      setNewEmail('');
      setNewTitle('');
      setNewPassword('');
      setNewEmployeeId(generateNextEmployeeId(teamMembers));
      setShowAddForm(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to provision employee account.',
      );
    } finally {
      setProvisioning(false);
    }
  };

  const handleRestoreFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') {
          throw new Error('Unable to read backup file content.');
        }
        const restored = parseSystemBackupJson(reader.result);
        onRestoreBackup(restored);
      } catch (err) {
        onBackupError(
          err instanceof Error ? err.message : 'Invalid JSON backup payload.',
        );
      }
    };
    reader.readAsText(file);
  };

  const approvalStats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    teamMembers.forEach((m) => {
      const status: ApprovalStatus = isSuperAdminEmail(m.email)
        ? 'approved'
        : m.approvalStatus ?? (m.active ? 'approved' : 'pending');
      if (status === 'pending') pending += 1;
      else if (status === 'rejected') rejected += 1;
      else approved += 1;
    });
    return { all: teamMembers.length, pending, approved, rejected };
  }, [teamMembers]);

  const filteredApprovalUsers = useMemo(() => {
    return [...teamMembers]
      .filter((m) => {
        if (approvalFilter === 'all') return true;
        const status: ApprovalStatus = isSuperAdminEmail(m.email)
          ? 'approved'
          : m.approvalStatus ?? (m.active ? 'approved' : 'pending');
        return status === approvalFilter;
      })
      .sort((a, b) => {
        const statusOrder = (m: TeamMember) => {
          if (isSuperAdminEmail(m.email)) return 1;
          const s = m.approvalStatus ?? (m.active ? 'approved' : 'pending');
          return s === 'pending' ? 0 : s === 'approved' ? 1 : 2;
        };
        return statusOrder(a) - statusOrder(b);
      });
  }, [teamMembers, approvalFilter]);

  const handleTriggerBackupRestore = () => {
    if (!isAdmin) return;
    backupFileRef.current?.click();
  };

  return (
    <div className="space-y-6">
      {/* RBAC Guard Notice for non-Admin roles */}
      {!isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Admin Access Required ({activeRole})
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                User approvals, role assignments, and system administration are restricted strictly
                to verified Admin accounts.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Admin-Only: User Access & Approvals Workflow */}
      {isAdmin && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <UserCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  User Access &amp; Approvals
                </h2>
                {approvalStats.pending > 0 && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-800 tabular-nums">
                    {approvalStats.pending} Pending Approval
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Review new user registrations, approve or reject workspace entry, and assign strict
                RBAC roles (Viewer, Editor, or Admin).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  { id: 'all', label: 'All', count: approvalStats.all },
                  { id: 'pending', label: 'Pending', count: approvalStats.pending },
                  { id: 'approved', label: 'Approved', count: approvalStats.approved },
                  { id: 'rejected', label: 'Rejected', count: approvalStats.rejected },
                ] as const
              ).map((tab) => {
                const active = approvalFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setApprovalFilter(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        active ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-3 pl-6">User</th>
                  <th className="px-3 py-3">Corporate Email</th>
                  <th className="px-3 py-3">Approval Status</th>
                  <th className="px-3 py-3">Assigned Role</th>
                  <th className="py-3 pr-6 pl-3 text-right">Admin Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApprovalUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-xs text-slate-500">
                      No user accounts found under the selected approval filter.
                    </td>
                  </tr>
                ) : (
                  filteredApprovalUsers.map((member) => {
                    const superAdmin = isSuperAdminEmail(member.email);
                    const status: ApprovalStatus = superAdmin
                      ? 'approved'
                      : member.approvalStatus ?? (member.active ? 'approved' : 'pending');
                    const rawRole: Role = superAdmin
                      ? 'Admin'
                      : draftApprovalRoles[member.id] ?? member.role;
                    const selectedRole: Role = rawRole === 'Admin' ? 'Admin' : 'Viewer';
                    const busy = approvalBusyId === member.id;

                    return (
                      <tr key={member.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 pr-3 pl-6">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              name={member.name}
                              avatarUrl={member.avatarUrl}
                              sizeClass="h-8 w-8"
                              textClass="text-[11px]"
                              roundedClass="rounded-lg"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-slate-900">{member.name}</p>
                                {superAdmin && (
                                  <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                    <Lock className="h-2.5 w-2.5" />
                                    <span>Primary Super Admin</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {member.employeeId} · {member.department}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 font-mono text-xs text-slate-700">
                          {member.email}
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Approved</span>
                            </span>
                          ) : status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                              <UserX className="h-3 w-3" />
                              <span>Rejected</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Pending</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <select
                            aria-label={`Assign role for ${member.name}`}
                            disabled={superAdmin || busy}
                            value={selectedRole}
                            onChange={(e) => {
                              const nextRole = e.target.value as Role;
                              setDraftApprovalRoles((prev) => ({ ...prev, [member.id]: nextRole }));
                              if (status === 'approved' && !superAdmin) {
                                onUpdateMemberRole(member.id, nextRole);
                              }
                            }}
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            <option value="Viewer">Viewer (Read-Only)</option>
                            <option value="Admin">Admin (Full Data Control)</option>
                          </select>
                        </td>
                        <td className="py-3.5 pr-6 pl-3 text-right whitespace-nowrap">
                          {superAdmin ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Protected Account</span>
                            </span>
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {status !== 'approved' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    setApprovalBusyId(member.id);
                                    try {
                                      await onApproveUser(member.id, selectedRole);
                                    } finally {
                                      setApprovalBusyId(null);
                                    }
                                  }}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Approve</span>
                                </button>
                              )}
                              {status !== 'rejected' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    setApprovalBusyId(member.id);
                                    try {
                                      await onRejectUser(member.id);
                                    } finally {
                                      setApprovalBusyId(null);
                                    }
                                  }}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  <span>Reject</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Company Branding & White-Label Configuration Card */}
      <form
        onSubmit={handleBrandingSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Company Branding &amp; Configuration
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Customize white-label identity, corporate departments, and request categories synced
              across Login, Sidebar, Forms, Filters, and Official PDF Reports.
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onResetBranding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save Branding &amp; Lists</span>
              </button>
            </div>
          )}
        </div>

        {brandingError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
          >
            {brandingError}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="brand-company-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Company / Organization Name
            </label>
            <input
              id="brand-company-name"
              type="text"
              disabled={!isAdmin}
              value={draftCompanyName}
              onChange={(e) => {
                setDraftCompanyName(e.target.value);
                if (brandingError) setBrandingError(null);
              }}
              placeholder="NexOps Enterprise Hub"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label
              htmlFor="brand-tagline"
              className="block text-xs font-semibold text-slate-700"
            >
              Subtitle / Tagline
            </label>
            <input
              id="brand-tagline"
              type="text"
              disabled={!isAdmin}
              value={draftTagline}
              onChange={(e) => setDraftTagline(e.target.value)}
              placeholder="Unified Operations, QA & Approval Management System"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label
              htmlFor="brand-budget-threshold"
              className="block text-xs font-semibold text-slate-700"
            >
              Two-Tier Budget Threshold (USD eq.)
            </label>
            <input
              id="brand-budget-threshold"
              type="number"
              min={0}
              step="100"
              disabled={!isAdmin}
              value={draftBudgetThresholdUsd}
              onChange={(e) => {
                setDraftBudgetThresholdUsd(e.target.value);
                if (brandingError) setBrandingError(null);
              }}
              placeholder="5000"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Dynamic Department List */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                <span>Custom Department List</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {draftDepartments.length} active
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {draftDepartments.map((dept) => (
                <span
                  key={dept}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                >
                  <span>{dept}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDepartment(dept)}
                      aria-label={`Remove department ${dept}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newDepartmentInput}
                  onChange={(e) => setNewDepartmentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDepartment();
                    }
                  }}
                  placeholder="Add department (e.g., Legal & Risk)..."
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddDepartment}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
            )}
          </div>

          {/* Dynamic Request Categories */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Tag className="h-3.5 w-3.5 text-indigo-600" />
                <span>Custom Request Categories</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {draftCategories.length} active
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {draftCategories.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                >
                  <span>{category}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(category)}
                      aria-label={`Remove category ${category}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isAdmin && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  placeholder="Add category (e.g., Vendor Onboarding)..."
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Team Directory Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Corporate Team &amp; RBAC Directory
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {teamMembers.filter((m) => m.active).length} active accounts ·{' '}
              {teamMembers.filter((m) => !m.active).length} inactive
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setNewEmployeeId(generateNextEmployeeId(teamMembers));
                setFormError(null);
                setShowAddForm((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Invite / Create Employee Account</span>
            </button>
          )}
        </div>

        {/* Invite / Create Employee Account Form (Admin-Only) */}
        {isAdmin && showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            className="border-b border-slate-200 bg-slate-50/70 px-6 py-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Invite / Create Corporate Employee Account
                </h3>
                <p className="text-[11px] text-slate-500">
                  Provision credentials and assign immutable RBAC role, department, and Employee ID.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="e.g., Jordan Alvarez"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Corporate Email <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="name@company.com"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Employee ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newEmployeeId}
                  onChange={(e) => {
                    setNewEmployeeId(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="EMP-105"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Job Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Security Operations Lead"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Assigned Role
                </label>
                <select
                  value={newRole === 'Admin' ? 'Admin' : 'Viewer'}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Department
                </label>
                <select
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value as Department)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {branding.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                  Temporary Password (min 8 chars) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="Initial corporate password"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {formError && (
              <p className="mt-2.5 text-xs font-medium text-rose-700">{formError}</p>
            )}
            <div className="mt-3.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={provisioning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {provisioning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{provisioning ? 'Provisioning...' : 'Create Employee Account'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-3 pl-6">Employee ID</th>
                <th className="px-3 py-3">User &amp; Title</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Assigned Role</th>
                <th className="px-3 py-3">Last Active</th>
                <th className="px-3 py-3">Account Status</th>
                <th className="py-3 pr-6 pl-3 text-right">Access Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamMembers.map((member) => {
                const superAdmin = isSuperAdminEmail(member.email);
                const approvalStatus: ApprovalStatus = superAdmin
                  ? 'approved'
                  : member.approvalStatus ?? (member.active ? 'approved' : 'pending');
                return (
                <tr key={member.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 pr-3 pl-6 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                    {member.employeeId}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        name={member.name}
                        avatarUrl={member.avatarUrl}
                        sizeClass="h-8 w-8"
                        textClass="text-[11px]"
                        roundedClass="rounded-lg"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-900">{member.name}</p>
                          {superAdmin && (
                            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                              Super Admin
                            </span>
                          )}
                          {member.outOfOffice && member.delegateApproverName && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              OOO → {member.delegateApproverName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {member.title} · <span className="font-mono">{member.email}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    {isAdmin ? (
                      <select
                        aria-label={`Department for ${member.name}`}
                        value={member.department}
                        onChange={(e) =>
                          onUpdateMemberDepartment(member.id, e.target.value as Department)
                        }
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                      >
                        {Array.from(new Set([...branding.departments, member.department])).map(
                          (d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-700">
                        {member.department}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    {isAdmin && !superAdmin ? (
                      <select
                        aria-label={`Role for ${member.name}`}
                        value={member.role === 'Admin' ? 'Admin' : 'Viewer'}
                        onChange={(e) =>
                          onUpdateMemberRole(member.id, e.target.value as Role)
                        }
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-700">
                        {superAdmin ? 'Admin' : member.role === 'Admin' ? 'Admin' : 'Viewer (Read-Only)'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTime(member.lastActive)}
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                        approvalStatus === 'pending'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : approvalStatus === 'rejected'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : member.active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {member.active && approvalStatus === 'approved' ? (
                        <UserCheck className="h-3 w-3" />
                      ) : (
                        <UserX className="h-3 w-3" />
                      )}
                      <span>
                        {approvalStatus === 'pending'
                          ? 'Pending Approval'
                          : approvalStatus === 'rejected'
                            ? 'Rejected'
                            : member.active
                              ? 'Active'
                              : 'Inactive'}
                      </span>
                    </span>
                  </td>
                  <td className="py-3.5 pr-6 pl-3 text-right">
                    <button
                      type="button"
                      disabled={!isAdmin || superAdmin}
                      onClick={() => onToggleMemberActive(member.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                    >
                      {superAdmin ? 'Locked' : member.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Health & Full JSON Backup / Restore */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <HardDrive className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                System Health &amp; Full Backup (JSON Export / Restore)
              </h3>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                  dbConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {dbConnected
                  ? 'Cloud Connected: Supabase'
                  : 'Adapter: Local Persistence (localStorage)'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Export a complete snapshot of operational requests, QA checklists, SOP acknowledgments,
              inventory assets, team profiles, and immutable audit logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={backupFileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={onDownloadBackup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-indigo-600" />
              <span>Download Full System Backup (.json)</span>
            </button>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={handleTriggerBackupRestore}
              title={
                isAdmin
                  ? 'Restore full workspace state from a NexOps JSON backup'
                  : 'Admin role required to restore workspace backups'
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Restore Backup (.json)</span>
            </button>
          </div>
        </div>

        {/* Live Health Inventory Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-medium text-slate-500">Persistence Mode</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Database
                className={`h-3.5 w-3.5 shrink-0 ${
                  dbConnected ? 'text-emerald-600' : 'text-slate-500'
                }`}
              />
              <span>{dbConnected ? 'Supabase Live' : 'Local Storage'}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-medium text-slate-500">Requests / QA Gates</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
              {requests.length} reqs · {healthMetrics.verifiedGates}/{healthMetrics.totalChecklistGates} gates
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-medium text-slate-500">Audit Ledger Records</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
              {auditLogs.length} immutable events
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-medium text-slate-500">Workspace Footprint</p>
            <p className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
              {healthMetrics.approxKb} KB · {notificationsCount} alerts
            </p>
          </div>
        </div>
      </div>

      {/* Cloud Health Diagnostics — Database Sync Status across all 8 Supabase Tables */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Cloud
                className={`h-4 w-4 ${dbConnected ? 'text-emerald-600' : 'text-slate-500'}`}
                aria-hidden="true"
              />
              <h3 className="font-display text-base font-bold text-slate-900">
                Cloud Health Diagnostics — Database Sync Status
              </h3>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  healthyTablesCount === tableDiagnostics.length && dbConnected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : dbConnected
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}
              >
                {dbConnected
                  ? `${healthyTablesCount}/${tableDiagnostics.length} Tables Healthy · ${totalCloudRows} Rows`
                  : 'Offline Fallback Mode'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Live row counts, Realtime replication targets, and PostgreSQL connection health for all
              8 NexOps Supabase tables.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunHealthCheck}
            disabled={isCheckingHealth}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-indigo-600 ${isCheckingHealth ? 'animate-spin' : ''}`}
            />
            <span>{isCheckingHealth ? 'Checking Tables...' : 'Run Health Check'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-3 pl-6">Key</th>
                <th className="px-3 py-3">Supabase Table</th>
                <th className="px-3 py-3">Workspace Module</th>
                <th className="px-3 py-3">Connection Health</th>
                <th className="px-3 py-3 text-right">Live Row Count</th>
                <th className="py-3 pr-6 pl-3 text-right">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableDiagnostics.map((tbl) => (
                <tr key={tbl.tableKey} className="hover:bg-slate-50/70">
                  <td className="py-3 pr-3 pl-6 font-mono text-xs font-semibold text-slate-700">
                    {tbl.tableKey}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-bold text-indigo-700">
                    {tbl.tableName}
                  </td>
                  <td className="px-3 py-3 text-xs font-medium text-slate-800">
                    {tbl.moduleName}
                    {tbl.errorMessage && (
                      <p className="mt-0.5 font-mono text-[11px] text-rose-600">
                        {tbl.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {tbl.status === 'connected' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    ) : tbl.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        <AlertTriangle className="h-3 w-3" />
                        Schema / Query Error
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        <HardDrive className="h-3 w-3" />
                        Local Fallback
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                    {tbl.rowCount}
                  </td>
                  <td className="py-3 pr-6 pl-3 text-right font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTime(tbl.lastCheckedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Permission Matrix (Synced via nexops_system_state) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-900">
                Role Permission Matrix
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Configure operational capabilities by corporate RBAC tier. Synced across all devices via{' '}
              <span className="font-mono">nexops_system_state</span>.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onUpdatePermissionMatrix(draftMatrix)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Save Permission Matrix</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-3 pl-6">Capability</th>
                <th className="px-3 py-3">Module Scope</th>
                {ROLES.map((role) => (
                  <th key={role} className="px-3 py-3 text-center">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSION_LABELS.map((perm) => (
                <tr key={perm.key} className="hover:bg-slate-50/70">
                  <td className="py-3 pr-3 pl-6 text-xs font-semibold text-slate-900">
                    {perm.label}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">{perm.scope}</td>
                  {ROLES.map((role) => {
                    const enabled = Boolean(draftMatrix[role]?.[perm.key]);
                    const locked =
                      !isAdmin ||
                      role !== 'Admin' ||
                      perm.key === 'manage_admin_settings';
                    return (
                      <td key={role} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => handleTogglePermission(role, perm.key)}
                          aria-label={`${perm.label} for ${role}: ${enabled ? 'Enabled' : 'Disabled'}`}
                          className={`inline-flex h-7 min-w-[68px] items-center justify-center rounded-md border px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                            enabled
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {enabled ? 'Allowed' : 'Restricted'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

