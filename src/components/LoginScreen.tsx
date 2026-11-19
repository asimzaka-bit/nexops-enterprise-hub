import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Shield,
  User,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { getPersistenceMode } from '../services/dataService';
import { CompanyBrandingConfig, Department } from '../types/nexops';

export interface InitialAdminPayload {
  fullName: string;
  email: string;
  employeeId: string;
  password: string;
  department: Department;
}

export type SignUpOutcome =
  | { status: 'signed_in' }
  | { status: 'confirmation_required'; email: string };

interface LoginScreenProps {
  branding: CompanyBrandingConfig;
  allowInitialAdminSetup: boolean;
  onEmailSignIn: (
    email: string,
    password: string,
    rememberSession: boolean,
  ) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onRegisterInitialAdmin: (
    payload: InitialAdminPayload,
    rememberSession: boolean,
  ) => Promise<SignUpOutcome>;
}

type AuthScreenView = 'signin' | 'forgot' | 'setup_admin';

export function LoginScreen({
  branding,
  allowInitialAdminSetup,
  onEmailSignIn,
  onResetPassword,
  onRegisterInitialAdmin,
}: LoginScreenProps) {
  const mode = getPersistenceMode();
  const [view, setView] = useState<AuthScreenView>('signin');

  // If Admin becomes initialized externally while viewing setup_admin, lock back to signin
  useEffect(() => {
    if (!allowInitialAdminSetup && view === 'setup_admin') {
      setView('signin');
    }
  }, [allowInitialAdminSetup, view]);

  // Sign-In state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password state
  const [resetEmail, setResetEmail] = useState('');

  // First-Time Primary Admin Setup state
  const [adminName, setAdminName] = useState('');
  const [adminEmployeeId, setAdminEmployeeId] = useState('EMP-001');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminDepartment, setAdminDepartment] = useState<Department>(
    branding.departments.includes('Admin')
      ? 'Admin'
      : branding.departments[0] ?? 'Operations',
  );

  const [rememberSession, setRememberSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchView = (nextView: AuthScreenView) => {
    setView(nextView);
    setError(null);
    setNotice(null);
  };

  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await onEmailSignIn(email, password, rememberSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await onResetPassword(resetEmail);
      setNotice(
        `Password reset link dispatched to ${resetEmail.trim()}. Check your corporate inbox to set a new password.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitialAdminSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allowInitialAdminSetup) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const outcome = await onRegisterInitialAdmin(
        {
          fullName: adminName,
          email: adminEmail,
          employeeId: adminEmployeeId,
          password: adminPassword,
          department: adminDepartment,
        },
        rememberSession,
      );
      if (outcome.status === 'confirmation_required') {
        setNotice(
          `Primary System Administrator account created for ${outcome.email}. Verify your email link to sign in. Registration is now locked to Admin-only.`,
        );
        setEmail(outcome.email);
        setPassword('');
        setView('signin');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to register Primary System Administrator.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        {/* Corporate Brand Lockup */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Layers className="h-6 w-6 text-indigo-400" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
            {branding.companyName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{branding.tagline}</p>
        </div>

        {/* Main Corporate Auth Card */}
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                {view === 'signin'
                  ? 'Corporate Sign-In'
                  : view === 'forgot'
                    ? 'Reset Corporate Password'
                    : 'Primary Administrator Setup'}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {view === 'signin'
                  ? 'Authenticate with your corporate credentials'
                  : view === 'forgot'
                    ? 'Request a secure password recovery link'
                    : 'First-time initialization · Locks after completion'}
              </p>
            </div>
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-semibold text-slate-600">
              {mode === 'supabase' ? 'Supabase Auth' : 'Corporate Auth'}
            </span>
          </div>

          {/* First-Time Setup Guard Banner (Shown ONLY when 0 Admin users exist) */}
          {allowInitialAdminSetup && view !== 'setup_admin' && (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                  <div>
                    <p className="text-xs font-bold text-indigo-950">
                      First-Time Setup Required
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-indigo-800">
                      Zero System Administrators are registered yet. Initialize the Primary
                      System Administrator account once to configure your organization.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => switchView('setup_admin')}
                className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Register Primary System Administrator</span>
              </button>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* View 1: Official Email & Password Sign-In */}
          {view === 'signin' && (
            <form onSubmit={handleSignInSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Corporate Email
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      switchView('forgot');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Enter your corporate password"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Remember Session</span>
                </label>
                <span className="text-[11px] text-slate-400">Role-Locked RBAC</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </form>
          )}

          {/* View 2: Forgot Password / Reset Link */}
          {view === 'forgot' && (
            <form onSubmit={handleResetSubmit} className="mt-5 space-y-4">
              <p className="text-xs leading-relaxed text-slate-600">
                Enter your registered corporate email address. If your account is active, you
                will receive a password reset link via Supabase Auth.
              </p>
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Corporate Email
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                <span>{submitting ? 'Sending Reset Link...' : 'Send Reset Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => switchView('signin')}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Corporate Sign-In</span>
              </button>
            </form>
          )}

          {/* View 3: First-Time Primary Admin Registration (Guarded) */}
          {view === 'setup_admin' && allowInitialAdminSetup && (
            <form onSubmit={handleInitialAdminSubmit} className="mt-5 space-y-3.5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                One-time initialization guard: after creating the Primary System Administrator,
                public registration permanently locks and new staff must be invited by an Admin.
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="admin-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative mt-1">
                    <User
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="admin-name"
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => {
                        setAdminName(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Primary Admin Name"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-emp-id"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Employee ID <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative mt-1">
                    <BadgeCheck
                      className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="admin-emp-id"
                      type="text"
                      required
                      value={adminEmployeeId}
                      onChange={(e) => setAdminEmployeeId(e.target.value)}
                      placeholder="EMP-001"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-2 pl-8 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Corporate Email <span className="text-rose-600">*</span>
                </label>
                <div className="relative mt-1">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="admin-email"
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => {
                      setAdminEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="admin@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="admin-dept"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Department
                  </label>
                  <div className="relative mt-1">
                    <Building2
                      className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <select
                      id="admin-dept"
                      value={adminDepartment}
                      onChange={(e) => setAdminDepartment(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-2 pl-8 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
                    >
                      {branding.departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700">
                    Assigned Role
                  </span>
                  <div className="mt-1 flex h-10 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-800">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    <span>Admin (Locked)</span>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Administrator Password <span className="text-rose-600">*</span>
                </label>
                <div className="relative mt-1">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="admin-password"
                    type={showAdminPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Minimum 8 characters"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-9 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((prev) => !prev)}
                    aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showAdminPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                <Shield className="h-4 w-4" />
                <span>
                  {submitting
                    ? 'Initializing Administrator...'
                    : 'Initialize Primary System Administrator'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => switchView('signin')}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Sign-In</span>
              </button>
            </form>
          )}

          {/* Security Provisioning Policy Notice */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {allowInitialAdminSetup
                  ? 'Public employee self-registration is disabled. Complete Primary Administrator setup to provision team accounts.'
                  : 'Admin-only provisioning enforced. Public self-signup is disabled — contact your System Administrator for an employee account.'}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          {branding.companyName} · Production Enterprise Security
        </p>
      </div>
    </div>
  );
}
