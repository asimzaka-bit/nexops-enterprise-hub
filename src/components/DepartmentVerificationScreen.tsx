import { AlertCircle, ArrowLeft, BadgeCheck, Building2, Lock } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CompanyBrandingConfig, Department, TeamMember } from '../types/nexops';
import { isSuperAdminEmail } from '../utils/storage';
import { NexOpsLogo } from './NexOpsLogo';

interface DepartmentVerificationScreenProps {
  branding: CompanyBrandingConfig;
  userEmail?: string;
  initialDepartment?: Department;
  assignedEmployeeId?: string;
  teamMembers?: TeamMember[];
  onContinue: (payload: { department: Department; employeeId: string }) => Promise<void>;
  onBackToLogin: () => Promise<void> | void;
}

export function DepartmentVerificationScreen({
  branding,
  userEmail,
  initialDepartment,
  assignedEmployeeId,
  teamMembers = [],
  onContinue,
  onBackToLogin,
}: DepartmentVerificationScreenProps) {
  const isSuperAdmin = isSuperAdminEmail(userEmail);

  const departmentOptions = useMemo(() => {
    const base =
      branding.departments.length > 0
        ? [...branding.departments]
        : ['Engineering', 'Operations', 'QA', 'Admin', 'Finance'];
    const cleanInit = initialDepartment?.trim();
    if (cleanInit && !base.includes(cleanInit)) {
      base.unshift(cleanInit);
    }
    return base;
  }, [branding.departments, initialDepartment]);

  const assignedDepartment = useMemo(() => {
    const cleanInit = initialDepartment?.trim();
    if (cleanInit) return cleanInit;
    return departmentOptions[0] ?? 'Operations';
  }, [initialDepartment, departmentOptions]);

  const [department, setDepartment] = useState<Department>(assignedDepartment);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setDepartment(assignedDepartment);
    } else if (initialDepartment?.trim()) {
      setDepartment(initialDepartment.trim());
    }
  }, [isSuperAdmin, assignedDepartment, initialDepartment]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanDept = isSuperAdmin ? department.trim() : assignedDepartment;
    const cleanEmpId = employeeId.trim().toUpperCase();
    if (!cleanDept) {
      setError('Please select your Department.');
      return;
    }
    if (!cleanEmpId) {
      setError('Please enter your Employee ID (e.g., EMP-001).');
      return;
    }

    const cleanUserEmail = (userEmail ?? '').trim().toLowerCase();
    const ownedByOther = teamMembers.some(
      (m) =>
        m.email.trim().toLowerCase() !== cleanUserEmail &&
        m.employeeId.trim().toUpperCase() === cleanEmpId,
    );
    const expectedEmpId = (assignedEmployeeId ?? '').trim().toUpperCase();
    if (ownedByOther || (expectedEmpId && cleanEmpId !== expectedEmpId)) {
      setError(
        'This Employee ID does not match your account or is assigned to another employee. Please enter your own valid Employee ID.',
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onContinue({
        department: cleanDept,
        employeeId: cleanEmpId,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify Department and Employee ID.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = async () => {
    setSigningOut(true);
    try {
      await onBackToLogin();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">
        {/* Corporate Brand Lockup */}
        <NexOpsLogo
          size={54}
          showWordmark
          layout="stacked"
          title={branding.companyName}
          tagline={branding.tagline}
        />

        {/* Step 2: Department & Employee ID Verification Card */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="step2-department"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Department
                </label>
                {!isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    <span>Assigned by Super Admin</span>
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <Building2
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                {isSuperAdmin ? (
                  <select
                    id="step2-department"
                    required
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      if (error) setError(null);
                    }}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {departmentOptions.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="step2-department"
                    type="text"
                    readOnly
                    aria-readonly="true"
                    value={assignedDepartment}
                    className="h-10 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 pr-9 pl-9 text-sm font-medium text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                  />
                )}
                {!isSuperAdmin && (
                  <Lock
                    className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="step2-employee-id"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Employee ID
              </label>
              <div className="relative mt-1.5">
                <BadgeCheck
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <input
                  id="step2-employee-id"
                  type="text"
                  required
                  autoComplete="off"
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your assigned Employee ID"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || signingOut}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Verifying...' : 'Continue to Workspace'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              disabled={submitting || signingOut}
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{signingOut ? 'Signing Out...' : 'Back to Login'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
