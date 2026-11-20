import {
  BadgeCheck,
  Building2,
  CalendarOff,
  Camera,
  CheckCircle2,
  IdCard,
  KeyRound,
  Loader2,
  PenTool,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { TeamMember } from '../types/nexops';
import { isSuperAdminEmail } from '../utils/storage';
import { RoleBadge } from './StatusIndicator';
import { UserAvatar } from './UserAvatar';

interface UserProfileModalProps {
  user: TeamMember;
  teamMembers: TeamMember[];
  pendingAssignedCount: number;
  onClose: () => void;
  onUploadAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
  onSaveSignOffTitle: (userId: string, signOffTitle: string) => void;
  onSaveDelegation: (
    userId: string,
    outOfOffice: boolean,
    delegateApproverId?: string,
  ) => void;
  onUpdatePassword: (newPassword: string) => Promise<void>;
}

export function UserProfileModal({
  user,
  teamMembers,
  pendingAssignedCount,
  onClose,
  onUploadAvatar,
  onRemoveAvatar,
  onSaveSignOffTitle,
  onSaveDelegation,
  onUpdatePassword,
}: UserProfileModalProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [signOffTitle, setSignOffTitle] = useState(user.signOffTitle || user.title);
  const [signOffError, setSignOffError] = useState<string | null>(null);

  const canDelegateApprovals = user.role === 'Admin';
  const eligibleDelegates = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.active &&
          ((m.approvalStatus ?? 'approved') === 'approved' || isSuperAdminEmail(m.email)) &&
          m.id !== user.id &&
          m.role === 'Admin',
      ),
    [teamMembers, user.id],
  );
  const [outOfOffice, setOutOfOffice] = useState(Boolean(user.outOfOffice));
  const [delegateId, setDelegateId] = useState(
    user.delegateApproverId || eligibleDelegates[0]?.id || '',
  );
  const [delegationError, setDelegationError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await onUploadAvatar(file);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Unable to upload profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await onRemoveAvatar();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Unable to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveSignature = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = signOffTitle.trim();
    if (!trimmed) {
      setSignOffError('Digital Approval Sign-Off Title cannot be empty.');
      return;
    }
    setSignOffError(null);
    onSaveSignOffTitle(user.id, trimmed);
  };

  const handleSaveDelegation = (e: FormEvent) => {
    e.preventDefault();
    if (outOfOffice && !delegateId) {
      setDelegationError('Select an active backup Editor or Admin before enabling Out-of-Office.');
      return;
    }
    setDelegationError(null);
    onSaveDelegation(user.id, outOfOffice, outOfOffice ? delegateId : undefined);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    if (!currentPassword.trim()) {
      setPasswordStatus({ type: 'error', message: 'Enter your current password.' });
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordStatus({
        type: 'error',
        message: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: 'error',
        message: 'New password and confirmation do not match.',
      });
      return;
    }

    setUpdatingPassword(true);
    try {
      await onUpdatePassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({
        type: 'success',
        message: 'Corporate password updated and recorded in security audit log.',
      });
    } catch (err) {
      setPasswordStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update password.',
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              sizeClass="h-10 w-10"
              textClass="text-sm"
              roundedClass="rounded-xl"
            />
            <div>
              <h2
                id="profile-modal-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Corporate Profile &amp; Digital Sign-Off
              </h2>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Profile Picture Upload & Management */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <UserAvatar
                  name={user.name}
                  avatarUrl={user.avatarUrl}
                  sizeClass="h-16 w-16"
                  textClass="text-lg"
                  roundedClass="rounded-2xl"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-indigo-600" />
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Profile Picture
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Stored in Supabase <span className="font-mono">avatars</span> bucket &amp;
                    synced across the hub. Max 3 MB (JPG, PNG, WebP, GIF).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => void handleAvatarFileChange(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => avatarInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {avatarBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{user.avatarUrl ? 'Update Photo' : 'Upload Photo'}</span>
                </button>
                {user.avatarUrl && (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => void handleRemovePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
            {avatarError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {avatarError}
              </p>
            )}
          </section>

          {/* Identity Summary Grid */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Full Name</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{user.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Employee ID</p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                  <IdCard className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{user.employeeId}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Department</p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>{user.department}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Assigned RBAC Role</p>
                <div className="mt-1">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>
          </section>

          {/* Digital Approval Sign-Off Title Editor */}
          <form
            onSubmit={handleSaveSignature}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center gap-2">
              <PenTool className="h-4 w-4 text-indigo-600" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                Digital Approval Sign-Off Title
              </h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Automatically stamped on exported Official PDF Reports and newly recorded audit
              trail entries.
            </p>

            <div className="mt-3">
              <label
                htmlFor="signoff-title-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Authorized Signatory Title
              </label>
              <input
                id="signoff-title-input"
                type="text"
                value={signOffTitle}
                onChange={(e) => {
                  setSignOffTitle(e.target.value);
                  setSignOffError(null);
                }}
                placeholder="e.g., Senior QA Lead"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
              {signOffError && (
                <p className="mt-1.5 text-xs font-medium text-rose-700">{signOffError}</p>
              )}
            </div>

            {/* Live Signature Preview */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <p className="text-[11px] font-medium text-slate-500">
                Report &amp; Audit Stamp Preview
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  {user.name} · {signOffTitle.trim() || user.role} ({user.employeeId})
                </span>
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Save Sign-Off Title
              </button>
            </div>
          </form>

          {/* Out-of-Office / Delegate Approver Settings */}
          {canDelegateApprovals && (
            <form
              onSubmit={handleSaveDelegation}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-amber-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Out-of-Office &amp; Delegate Approver
                  </h3>
                </div>
                {outOfOffice && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    OOO Delegation Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Automatically route incoming and pending approval requests ({pendingAssignedCount}{' '}
                currently assigned to you) to a designated backup reviewer while on leave.
              </p>

              <label className="mt-3.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                <div>
                  <span className="block text-xs font-semibold text-slate-900">
                    Enable Out-of-Office Mode
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Pending QA &amp; approval items transfer immediately to your backup approver
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={outOfOffice}
                  onChange={(e) => {
                    setOutOfOffice(e.target.checked);
                    setDelegationError(null);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>

              <div className="mt-3">
                <label
                  htmlFor="delegate-approver-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Backup Editor / Delegate Approver
                </label>
                <select
                  id="delegate-approver-select"
                  disabled={eligibleDelegates.length === 0}
                  value={delegateId}
                  onChange={(e) => {
                    setDelegateId(e.target.value);
                    setDelegationError(null);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                >
                  {eligibleDelegates.length === 0 ? (
                    <option value="">No active backup Editors or Admins available</option>
                  ) : (
                    eligibleDelegates.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role} · {m.department})
                        {m.outOfOffice ? ' [Currently OOO]' : ''}
                      </option>
                    ))
                  )}
                </select>
                {delegationError && (
                  <p className="mt-1.5 text-xs font-medium text-rose-700">{delegationError}</p>
                )}
              </div>

              {outOfOffice && delegateId && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Approvals will route automatically to{' '}
                    <strong>
                      {eligibleDelegates.find((d) => d.id === delegateId)?.name || 'Backup Approver'}
                    </strong>
                    .
                  </span>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                >
                  Save Delegation Settings
                </button>
              </div>
            </form>
          )}

          {/* Security / Password Update Section */}
          <form
            onSubmit={handlePasswordSubmit}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-700" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                Update Account Password
              </h3>
            </div>

            {passwordStatus && (
              <div
                role="status"
                className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  passwordStatus.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {passwordStatus.type === 'success' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <span>{passwordStatus.message}</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="curr-pw"
                  className="block text-[11px] font-semibold text-slate-700"
                >
                  Current Password
                </label>
                <input
                  id="curr-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="new-pw"
                  className="block text-[11px] font-semibold text-slate-700"
                >
                  New Password
                </label>
                <input
                  id="new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="conf-pw"
                  className="block text-[11px] font-semibold text-slate-700"
                >
                  Confirm Password
                </label>
                <input
                  id="conf-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={updatingPassword}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {updatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
