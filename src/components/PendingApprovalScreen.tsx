import { Clock, LogOut, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { useState } from 'react';
import { CompanyBrandingConfig, TeamMember } from '../types/nexops';
import { NexOpsLogo } from './NexOpsLogo';

interface PendingApprovalScreenProps {
  branding: CompanyBrandingConfig;
  user: TeamMember;
  onRefreshStatus: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function PendingApprovalScreen({
  branding,
  user,
  onRefreshStatus,
  onSignOut,
}: PendingApprovalScreenProps) {
  const [checking, setChecking] = useState(false);
  const isRejected = user.approvalStatus === 'rejected';

  const handleCheck = async () => {
    setChecking(true);
    try {
      await onRefreshStatus();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80">
            <NexOpsLogo className="h-11 w-11" title={branding.companyName} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
            {branding.companyName}
          </h1>
        </div>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                isRejected
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-amber-200 bg-amber-50 text-amber-600'
              }`}
            >
              {isRejected ? (
                <XCircle className="h-6 w-6" />
              ) : (
                <Clock className="h-6 w-6" />
              )}
            </div>

            <span
              className={`mt-4 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                isRejected
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{isRejected ? 'Access Request Declined' : 'Pending Admin Approval'}</span>
            </span>

            <h2 className="mt-4 font-display text-lg font-bold text-slate-900">
              {isRejected
                ? 'Account Access Not Approved — Please contact your administrator'
                : 'Account Pending Admin Approval — Please contact your administrator'}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {isRejected
                ? 'Your access request has been declined by a System Administrator. Company records remain restricted.'
                : 'Your corporate account is registered and secured, but workspace data access is locked until an Administrator approves your account and assigns your role (Viewer or Admin).'}
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Registered Name</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{user.name}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Employee ID</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                  {user.employeeId}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Corporate Email</dt>
                <dd className="mt-0.5 truncate font-semibold text-slate-900">{user.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Department</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{user.department}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking Status...' : 'Check Approval Status'}</span>
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
