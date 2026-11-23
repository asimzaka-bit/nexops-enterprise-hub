import { AlertCircle, ArrowLeft, BadgeCheck, Building2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { CompanyBrandingConfig, Department } from '../types/nexops';
import { NexOpsLogo } from './NexOpsLogo';

interface DepartmentVerificationScreenProps {
  branding: CompanyBrandingConfig;
  initialDepartment?: Department;
  initialEmployeeId?: string;
  onContinue: (payload: { department: Department; employeeId: string }) => Promise<void>;
  onBackToLogin: () => Promise<void> | void;
}

export function DepartmentVerificationScreen({
  branding,
  initialDepartment,
  initialEmployeeId,
  onContinue,
  onBackToLogin,
}: DepartmentVerificationScreenProps) {
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

  const [department, setDepartment] = useState<Department>(() => {
    const cleanInit = initialDepartment?.trim();
    if (cleanInit && departmentOptions.includes(cleanInit)) return cleanInit;
    return departmentOptions[0] ?? '';
  });
  const [employeeId, setEmployeeId] = useState<string>(() => initialEmployeeId?.trim() ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanDept = department.trim();
    const cleanEmpId = employeeId.trim();
    if (!cleanDept) {
      setError('Please select your Department.');
      return;
    }
    if (!cleanEmpId) {
      setError('Please enter your Employee ID (e.g., EMP-001).');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onContinue({
        department: cleanDept,
        employeeId: cleanEmpId.toUpperCase(),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save Department and Employee ID.',
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
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        {/* Corporate Brand Lockup */}
        <NexOpsLogo
          size={54}
          showWordmark
          layout="stacked"
          title={branding.companyName}
          tagline={branding.tagline}
        />

        {/* Step 2: Clean Department & Employee ID Verification Card */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="step2-department"
                className="block text-xs font-semibold text-slate-700"
              >
                Department
              </label>
              <div className="relative mt-1.5">
                <Building2
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <select
                  id="step2-department"
                  required
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    if (error) setError(null);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="step2-employee-id"
                className="block text-xs font-semibold text-slate-700"
              >
                Employee ID
              </label>
              <div className="relative mt-1.5">
                <BadgeCheck
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="step2-employee-id"
                  type="text"
                  required
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="EMP-001"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || signingOut}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Continue to Workspace'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              disabled={submitting || signingOut}
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-60"
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
