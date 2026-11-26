import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CompanyBrandingConfig, Department } from '../types/nexops';
import { evaluatePasswordStrength, validateStrongPassword } from '../utils/storage';
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
  onBruteForceLockout?: (email: string, attempts: number) => void;
}

type AuthScreenMode = 'login' | 'forgot_email' | 'forgot_new_password' | 'forgot_done';

const LOGIN_GUARD_STORAGE_KEY = 'nexops_login_guard_v1';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;

interface LoginGuardState {
  attempts: number;
  lockedUntil: number;
}

function readLoginGuard(): LoginGuardState {
  if (typeof window === 'undefined') return { attempts: 0, lockedUntil: 0 };
  try {
    const raw = localStorage.getItem(LOGIN_GUARD_STORAGE_KEY);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<LoginGuardState>;
    const attempts = typeof parsed.attempts === 'number' ? parsed.attempts : 0;
    const lockedUntil = typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0;
    if (lockedUntil > 0 && lockedUntil <= Date.now()) {
      localStorage.removeItem(LOGIN_GUARD_STORAGE_KEY);
      return { attempts: 0, lockedUntil: 0 };
    }
    return { attempts, lockedUntil };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function writeLoginGuard(state: LoginGuardState): void {
  if (typeof window === 'undefined') return;
  try {
    if (state.attempts === 0 && state.lockedUntil === 0) {
      localStorage.removeItem(LOGIN_GUARD_STORAGE_KEY);
    } else {
      localStorage.setItem(LOGIN_GUARD_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage restriction
  }
}

export function LoginScreen({
  branding,
  initialRecoveryMode = false,
  initialRecoveryEmail = '',
  onClearRecoveryMode,
  onEmailSignIn,
  onResetPassword,
  onCompletePasswordReset,
  onBruteForceLockout,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthScreenMode>(
    initialRecoveryMode ? 'forgot_new_password' : 'login',
  );
  const [email, setEmail] = useState(initialRecoveryEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guard, setGuard] = useState<LoginGuardState>(() => readLoginGuard());
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Forgot Password / Create New Password state
  const [resetEmail, setResetEmail] = useState(initialRecoveryEmail);
  const [resetStepNote, setResetStepNote] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string>('');

  const remainingLockSeconds = Math.max(0, Math.ceil((guard.lockedUntil - nowMs) / 1000));
  const isLockedOut = remainingLockSeconds > 0;

  useEffect(() => {
    if (guard.lockedUntil <= Date.now()) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (guard.lockedUntil <= current) {
        const cleared = { attempts: 0, lockedUntil: 0 };
        writeLoginGuard(cleared);
        setGuard(cleared);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guard.lockedUntil]);

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
  const pwCheck = useMemo(() => validateStrongPassword(newPassword), [newPassword]);
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const currentGuard = readLoginGuard();
    if (currentGuard.lockedUntil > Date.now()) {
      const secs = Math.max(1, Math.ceil((currentGuard.lockedUntil - Date.now()) / 1000));
      setGuard(currentGuard);
      setNowMs(Date.now());
      setError(`Too many failed login attempts. Try again in ${secs}s.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onEmailSignIn(email, password, true);
      const resetGuard = { attempts: 0, lockedUntil: 0 };
      writeLoginGuard(resetGuard);
      setGuard(resetGuard);
    } catch (err) {
      const nextAttempts = currentGuard.attempts + 1;
      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
        const nextGuard = { attempts: nextAttempts, lockedUntil };
        writeLoginGuard(nextGuard);
        setGuard(nextGuard);
        setNowMs(Date.now());
        onBruteForceLockout?.(email.trim().toLowerCase(), nextAttempts);
        setError(
          '5 consecutive failed login attempts detected. Login is temporarily locked for 60 seconds.',
        );
      } else {
        const nextGuard = { attempts: nextAttempts, lockedUntil: 0 };
        writeLoginGuard(nextGuard);
        setGuard(nextGuard);
        const baseMsg = err instanceof Error ? err.message : 'Unable to authenticate.';
        const remainingTries = MAX_FAILED_ATTEMPTS - nextAttempts;
        setError(
          `${baseMsg} (${remainingTries} attempt${remainingTries === 1 ? '' : 's'} remaining before 60s security lock)`,
        );
      }
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
    const validation = validateStrongPassword(newPassword);
    if (!validation.valid) {
      setError(validation.error || 'Password does not meet security requirements.');
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

              {isLockedOut && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Security lock active</span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {remainingLockSeconds}s
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || isLockedOut}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLockedOut
                  ? `Locked (${remainingLockSeconds}s)`
                  : submitting
                    ? 'Authenticating...'
                    : 'Login'}
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

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      pwCheck.hasMinLength
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>8+ characters</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      pwCheck.hasLetter
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>1+ letter</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      pwCheck.hasNumber
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>1+ number</span>
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
                disabled={submitting || !pwCheck.valid || !passwordsMatch}
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
