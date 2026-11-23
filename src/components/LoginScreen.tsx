import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { CompanyBrandingConfig, Department } from '../types/nexops';
import { NexOpsLogo } from './NexOpsLogo';

export interface InitialAdminPayload {
  fullName: string;
  email: string;
  employeeId: string;
  password: string;
  department: Department;
}

export interface RegisterUserPayload {
  fullName: string;
  email: string;
  employeeId?: string;
  password: string;
  department: Department;
}

export type SignUpOutcome =
  | { status: 'signed_in' }
  | { status: 'confirmation_required'; email: string };

interface LoginScreenProps {
  branding: CompanyBrandingConfig;
  allowInitialAdminSetup?: boolean;
  onEmailSignIn: (
    email: string,
    password: string,
    rememberSession: boolean,
  ) => Promise<void>;
  onRegisterUser?: (
    payload: RegisterUserPayload,
    rememberSession: boolean,
  ) => Promise<SignUpOutcome>;
  onResetPassword?: (email: string) => Promise<void>;
  onRegisterInitialAdmin?: (
    payload: InitialAdminPayload,
    rememberSession: boolean,
  ) => Promise<SignUpOutcome>;
}

export function LoginScreen({ branding, onEmailSignIn }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onEmailSignIn(email, password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        {/* Corporate Brand Lockup */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80">
            <NexOpsLogo className="h-11 w-11" title={branding.companyName} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
            {branding.companyName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{branding.tagline}</p>
        </div>

        {/* Clean Login-Only Form Card */}
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

          <form onSubmit={handleSignInSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-700"
              >
                Email / Username
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
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Password
              </label>
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
                  placeholder="Enter your password"
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

            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
