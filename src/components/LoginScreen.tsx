import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  initialRecoveryMode?: boolean;
  initialRecoveryEmail?: string;
  onClearRecoveryMode?: () => void;
  onEmailSignIn: (
    email: string,
    password: string,
    rememberSession: boolean,
  ) => Promise<void>;
  onRegisterUser?: (
    payload: RegisterUserPayload,
    rememberSession: boolean,
  ) => Promise<SignUpOutcome>;
  onResetPassword?: (email: string) => Promise<{ emailSent: boolean; message: string } | void>;
  onCompletePasswordReset?: (
    email: string,
    newPassword: string,
  ) => Promise<{ cloudUpdated: boolean } | void>;
  onRegisterInitialAdmin?: (
    payload: InitialAdminPayload,
    rememberSession: boolean,
  ) => Promise<SignUpOutcome>;
}

type AuthScreenMode = 'login' | 'forgot_email' | 'forgot_new_password' | 'forgot_done';

function evaluatePasswordStrength(pw: string): {
  score: number;
  label: 'Too Short' | 'Fair' | 'Good' | 'Strong';
  barClass: string;
  textClass: string;
} {
  if (pw.length < 8) {
    return {
      score: 1,
      label: 'Too Short',
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

export function LoginScreen({
  branding,
  initialRecoveryMode = false,
  initialRecoveryEmail = '',
  onClearRecoveryMode,
  onEmailSignIn,
  onResetPassword,
  onCompletePasswordReset,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthScreenMode>(
    initialRecoveryMode ? 'forgot_new_password' : 'login',
  );
  const [email, setEmail] = useState(initialRecoveryEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot Password / Create New Password state
  const [resetEmail, setResetEmail] = useState(initialRecoveryEmail);
  const [resetStepNote, setResetStepNote] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string>('');

  useEffect(() => {
    if (initialRecoveryMode) {
      if (initialRecoveryEmail) {
        setResetEmail(initialRecoveryEmail);
        setEmail(initialRecoveryEmail);
      }
      setMode('forgot_new_password');
      setResetStepNote(
        'Recovery session verified. Create your new corporate password below.',
      );
    }
  }, [initialRecoveryMode, initialRecoveryEmail]);

  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);
  const hasMinLength = newPassword.trim().length >= 8;
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

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

  const handleOpenForgotPassword = () => {
    setError(null);
    setResetStepNote(null);
    setResetEmail(email.trim());
    setNewPassword('');
    setConfirmPassword('');
    setMode('forgot_email');
  };

  const handleReturnToLogin = () => {
    setError(null);
    setResetStepNote(null);
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    if (resetEmail.trim()) {
      setEmail(resetEmail.trim());
    }
    onClearRecoveryMode?.();
    setMode('login');
  };

  const handleStepASubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = resetEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setError('Enter a valid registered corporate email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const outcome = onResetPassword ? await onResetPassword(clean) : undefined;
      setResetEmail(clean);
      setResetStepNote(
        outcome && typeof outcome === 'object' && outcome.message
          ? outcome.message
          : `Password recovery initiated for ${clean}. Enter your new password below.`,
      );
      setMode('forgot_new_password');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to initiate password recovery.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepBSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('A valid account email is required to update your password.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = onCompletePasswordReset
        ? await onCompletePasswordReset(cleanEmail, newPassword)
        : undefined;
      const cloudUpdated = Boolean(
        result && typeof result === 'object' && result.cloudUpdated,
      );
      setCompletionMessage(
        cloudUpdated
          ? `Your password for ${cleanEmail} has been updated in Supabase Auth. Return to login to sign in with your new password.`
          : `New password saved for ${cleanEmail}. Return to login to sign in with your updated password.`,
      );
      setPassword('');
      setEmail(cleanEmail);
      onClearRecoveryMode?.();
      setMode('forgot_done');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save your new password.',
      );
    } finally {
      setSubmitting(false);
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

        {/* Login & Password Recovery Card */}
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

          {mode === 'login' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email / Username
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenForgotPassword}
                    className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
                {submitting ? 'Authenticating...' : 'Login'}
              </button>
            </form>
          )}

          {mode === 'forgot_email' && (
            <form onSubmit={handleStepASubmit} className="space-y-4">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                      Forgot Password
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Step 1 of 2 · Verify your registered corporate email
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-account-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Registered Account Email
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="reset-account-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? 'Sending Reset Request...' : 'Continue to Create New Password'}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={handleReturnToLogin}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Login</span>
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot_new_password' && (
            <form onSubmit={handleStepBSubmit} className="space-y-4">
              <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                      Create New Password
                    </h2>
                    <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {resetEmail || 'Account Recovery'}
                    </p>
                  </div>
                </div>
              </div>

              {resetStepNote && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs font-medium text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {resetStepNote}
                </div>
              )}

              <div>
                <label
                  htmlFor="new-password-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  New Password
                </label>
                <div className="relative mt-1.5">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="new-password-input"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="At least 8 characters"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">
                        Password Strength
                      </span>
                      <span className={`font-semibold ${strength.textClass}`}>
                        {strength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${strength.barClass}`}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirm-password-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Confirm New Password
                </label>
                <div className="relative mt-1.5">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Re-enter your new password"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-10 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'
                    }
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      hasMinLength
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>8+ characters</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      passwordsMatch
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Passwords match</span>
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !hasMinLength || !passwordsMatch}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? 'Updating Password...' : 'Save New Password'}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('forgot_email');
                  }}
                  className="font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Change Email
                </button>
                <button
                  type="button"
                  onClick={handleReturnToLogin}
                  className="font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot_done' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Password Reset Complete
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {completionMessage}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReturnToLogin}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Return to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
