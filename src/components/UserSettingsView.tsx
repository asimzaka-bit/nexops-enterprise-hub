import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Eye,
  EyeOff,
  FileText,
  FolderLock,
  Globe,
  HardDrive,
  IdCard,
  KeyRound,
  Landmark,
  Laptop,
  LayoutGrid,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Monitor,
  Moon,
  PenTool,
  RotateCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Tablet,
  Thermometer,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewportInfo } from '../hooks/useViewport';
import {
  Department,
  DocumentVaultFolder,
  DocumentVaultItem,
  FontStyleOption,
  InterfaceDensity,
  Role,
  TeamMember,
  TemperatureUnit,
  TextScaleOption,
  ThemePreference,
  TimeFormatOption,
  UserPreferences,
} from '../types/nexops';
import {
  calculateVaultStorageStats,
  formatStorageSize,
  isSuperAdminEmail,
  resolveFontFamilyCss,
  TEN_GB_BYTES,
} from '../utils/storage';
import { RoleBadge } from './StatusIndicator';
import { UserAvatar } from './UserAvatar';

export type SettingsTabId =
  | 'all'
  | 'appearance'
  | 'typography'
  | 'storage'
  | 'profile'
  | 'notifications'
  | 'regional';

interface UserSettingsViewProps {
  currentUser: TeamMember;
  activeRole: Role;
  departments: Department[];
  vaultDocuments: DocumentVaultItem[];
  themePreference: ThemePreference;
  isDarkMode: boolean;
  onSetThemePreference: (pref: ThemePreference) => void;
  preferences: UserPreferences;
  onUpdatePreferences: (patch: Partial<UserPreferences>, feedbackLabel?: string) => void;
  onResetPreferences: () => void;
  onOpenVault: () => void;
  onUploadAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
  onSaveSignOffTitle: (userId: string, signOffTitle: string) => void;
  onUpdateDepartment: (userId: string, department: Department) => void;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  viewport: ViewportInfo;
}

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  icon: typeof Settings;
}[] = [
  { id: 'all', label: 'All Sections', icon: LayoutGrid },
  { id: 'appearance', label: 'Appearance', icon: Sun },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'storage', label: 'Cloud Storage', icon: HardDrive },
  { id: 'profile', label: 'Profile & Security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'regional', label: 'Regional & Device', icon: Globe },
];

const FONT_STYLE_OPTIONS: {
  id: FontStyleOption;
  label: string;
  badge?: string;
  description: string;
}[] = [
  {
    id: 'calibri',
    label: 'Calibri (Default)',
    badge: 'Active Standard',
    description: 'Corporate standard typeface across NexOps Hub',
  },
  {
    id: 'segoe',
    label: 'Segoe UI',
    description: 'Crisp Windows desktop interface typography',
  },
  {
    id: 'inter',
    label: 'Inter',
    description: 'Modern neutral sans-serif optimized for screens',
  },
  {
    id: 'system',
    label: 'System Sans',
    description: 'Native operating system UI font stack',
  },
];

const TEXT_SCALE_OPTIONS: {
  id: TextScaleOption;
  label: string;
  note: string;
}[] = [
  { id: '95', label: '95%', note: 'Compact reading' },
  { id: '100', label: '100% Default', note: 'Balanced standard' },
  { id: '105', label: '105%', note: 'Enhanced legibility' },
];

const DENSITY_OPTIONS: {
  id: InterfaceDensity;
  label: string;
  description: string;
}[] = [
  { id: 'compact', label: 'Compact', description: 'Tighter table & list rows' },
  { id: 'standard', label: 'Standard', description: 'Balanced enterprise spacing' },
  { id: 'comfortable', label: 'Comfortable', description: 'Extra breathing room' },
];

const VAULT_CATEGORY_META: {
  folder: DocumentVaultFolder;
  icon: typeof FolderLock;
  colorClass: string;
}[] = [
  {
    folder: 'HR & Policies',
    icon: ShieldCheck,
    colorClass: 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
  {
    folder: 'Operations & SOPs',
    icon: Briefcase,
    colorClass: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  },
  {
    folder: 'Accounts & Finance',
    icon: Landmark,
    colorClass: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    folder: 'Client Contracts',
    icon: FileText,
    colorClass: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
];

const WEATHER_CITY_PRESETS = [
  'Lahore, Pakistan',
  'Islamabad, Pakistan',
  'Karachi, Pakistan',
  'Dubai, UAE',
  'London, UK',
  'New York, USA',
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT · UTC+05:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST · UTC+04:00)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST · UTC+03:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'America/New_York', label: 'America/New_York (EST / EDT)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · UTC+08:00)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

export function UserSettingsView({
  currentUser,
  activeRole,
  departments,
  vaultDocuments,
  themePreference,
  isDarkMode,
  onSetThemePreference,
  preferences,
  onUpdatePreferences,
  onResetPreferences,
  onOpenVault,
  onUploadAvatar,
  onRemoveAvatar,
  onSaveSignOffTitle,
  onUpdateDepartment,
  onUpdatePassword,
  viewport,
}: UserSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('all');
  const isSuperAdmin = isSuperAdminEmail(currentUser.email);

  // Profile Photo state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Digital Sign-Off Title state
  const [signOffTitle, setSignOffTitle] = useState(currentUser.signOffTitle || currentUser.title);
  const [signOffError, setSignOffError] = useState<string | null>(null);
  const [signOffSaved, setSignOffSaved] = useState(false);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Weather city draft
  const [weatherCityInput, setWeatherCityInput] = useState(preferences.weatherCity);

  useEffect(() => {
    setWeatherCityInput(preferences.weatherCity);
  }, [preferences.weatherCity]);

  useEffect(() => {
    setSignOffTitle(currentUser.signOffTitle || currentUser.title);
  }, [currentUser.signOffTitle, currentUser.title]);

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(departments.length > 0
              ? departments
              : ['Engineering', 'Operations', 'QA', 'Admin', 'Finance']),
            currentUser.department,
          ].filter(Boolean),
        ),
      ),
    [departments, currentUser.department],
  );

  const storageStats = useMemo(
    () => calculateVaultStorageStats(vaultDocuments),
    [vaultDocuments],
  );

  const categoryBreakdown = useMemo(() => {
    return VAULT_CATEGORY_META.map((meta) => {
      const items = vaultDocuments.filter((d) => d.folder === meta.folder);
      const bytes = items.reduce(
        (sum, d) => sum + (typeof d.fileSize === 'number' && d.fileSize > 0 ? d.fileSize : 0),
        0,
      );
      return {
        ...meta,
        count: items.length,
        bytes,
      };
    });
  }, [vaultDocuments]);

  const showSection = (tab: Exclude<SettingsTabId, 'all'>) =>
    activeTab === 'all' || activeTab === tab;

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
    onSaveSignOffTitle(currentUser.id, trimmed);
    setSignOffSaved(true);
    window.setTimeout(() => setSignOffSaved(false), 2400);
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
        message: 'Password updated securely and logged to audit trail.',
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

  const handleApplyWeatherCity = (e: FormEvent) => {
    e.preventDefault();
    const clean = weatherCityInput.trim();
    if (!clean) return;
    onUpdatePreferences({ weatherCity: clean }, `Default Weather City set to ${clean}`);
  };

  const DeviceIcon =
    viewport.deviceType === 'mobile'
      ? Smartphone
      : viewport.deviceType === 'tablet'
        ? Tablet
        : Laptop;

  return (
    <div className="min-w-0 w-full max-w-full space-y-6 overflow-x-hidden">
      {/* Page Hero Banner (Deep Navy #0F172A Branding) */}
      <section className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/20 text-indigo-300">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-lg font-bold text-white sm:text-xl">
                  Workspace &amp; Account Settings
                </h1>
                <span className="rounded-md border border-indigo-400/30 bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                  {isSuperAdmin ? 'Super Admin' : activeRole}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">
                Personalize theme, typography, cloud vault storage visibility, alert preferences,
                regional weather &amp; security credentials.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onResetPreferences();
              setWeatherCityInput('Lahore, Pakistan');
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Preferences</span>
          </button>
        </div>

        {/* Clean Responsive Tab Strip */}
        <div
          className="mt-5 flex flex-wrap gap-1.5 border-t border-slate-800 pt-4"
          role="tablist"
          aria-label="Settings Categories"
        >
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'border border-slate-700/80 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Responsive Settings Grid */}
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
        {/* 1. Appearance & Theme */}
        {showSection('appearance') && (
          <section
            aria-label="Appearance and Theme"
            className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 ${
              activeTab === 'all' ? 'xl:col-span-6' : 'xl:col-span-12'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-400">
                  {isDarkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Appearance &amp; Theme
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Synced automatically with top-bar toggle &amp; device OS theme
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                {themePreference === 'system'
                  ? `Auto (${isDarkMode ? 'Dark' : 'Light'})`
                  : `Manual: ${isDarkMode ? 'Dark' : 'Light'}`}
              </span>
            </div>

            {/* Theme Mode Selector */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Theme Mode
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'system',
                      label: 'System Auto-Detect',
                      desc: 'Matches device OS setting',
                      icon: Monitor,
                    },
                    {
                      id: 'light',
                      label: 'Light Mode',
                      desc: 'Crisp enterprise daylight',
                      icon: Sun,
                    },
                    {
                      id: 'dark',
                      label: 'Dark Mode',
                      desc: 'Low-glare Deep Navy UI',
                      icon: Moon,
                    },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = themePreference === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSetThemePreference(mode.id)}
                      className={`flex min-w-0 flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50/80 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/50 dark:ring-indigo-500'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <Icon
                          className={`h-4 w-4 ${
                            active
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        />
                        {active && (
                          <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                      <span className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                        {mode.label}
                      </span>
                      <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {mode.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interface Density Selector */}
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Interface Density
                </p>
                <span className="text-[11px] font-medium text-slate-500 capitalize dark:text-slate-400">
                  Active: {preferences.density}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {DENSITY_OPTIONS.map((opt) => {
                  const active = preferences.density === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdatePreferences(
                          { density: opt.id },
                          `Interface density set to ${opt.label}`,
                        )
                      }
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="block text-xs font-bold">{opt.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] ${
                          active ? 'text-slate-200 dark:text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* 2. Typography & Font Style */}
        {showSection('typography') && (
          <section
            aria-label="Typography and Font Style"
            className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 ${
              activeTab === 'all' ? 'xl:col-span-6' : 'xl:col-span-12'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-400">
                  <Type className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Typography &amp; Font Style
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Calibri is active by default across the entire hub
                  </p>
                </div>
              </div>
              {preferences.fontStyle !== 'calibri' && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences(
                      { fontStyle: 'calibri', textScale: '100' },
                      'Restored Calibri (Default) typography',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore Calibri
                </button>
              )}
            </div>

            {/* Font Style Selector */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Font Family
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FONT_STYLE_OPTIONS.map((font) => {
                  const active = preferences.fontStyle === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() =>
                        onUpdatePreferences(
                          { fontStyle: font.id },
                          `Typography updated to ${font.label}`,
                        )
                      }
                      className={`flex min-w-0 items-start justify-between gap-2 rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50/75 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/50 dark:ring-indigo-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="text-xs font-bold text-slate-900 dark:text-slate-100"
                            style={{ fontFamily: resolveFontFamilyCss(font.id) }}
                          >
                            {font.label}
                          </span>
                          {font.badge && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                              {font.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {font.description}
                        </p>
                      </div>
                      {active && (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Text Scale Selector */}
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Text Scale
                </p>
                <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {preferences.textScale}%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {TEXT_SCALE_OPTIONS.map((opt) => {
                  const active = preferences.textScale === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdatePreferences(
                          { textScale: opt.id },
                          `Text scale set to ${opt.label}`,
                        )
                      }
                      className={`rounded-lg border px-2.5 py-2 text-center transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-indigo-500 dark:bg-indigo-600'
                          : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="block text-xs font-bold tabular-nums">{opt.label}</span>
                      <span
                        className={`block text-[10px] ${
                          active ? 'text-slate-200 dark:text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {opt.note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Typography Preview */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  Live Typography Preview
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  Scale {preferences.textScale}%
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                NexOps Enterprise Hub — Operational Governance &amp; QA Review
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                Sample KPI figures: <span className="font-semibold tabular-nums">99.4%</span> SLA
                compliance · <span className="font-semibold tabular-nums">10.0 GB</span> Vault Quota.
              </p>
            </div>
          </section>
        )}

        {/* 3. Cloud Storage & Vault Quota */}
        {showSection('storage') && (
          <section
            aria-label="Cloud Storage and Vault Quota"
            className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 ${
              activeTab === 'all' ? 'xl:col-span-12' : 'xl:col-span-12'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Cloud className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Cloud Storage &amp; Vault Quota
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Live enterprise storage utilization across 10.0 GB Document Vault capacity
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenVault}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                <FolderLock className="h-3.5 w-3.5" />
                <span>Open Document Vault</span>
              </button>
            </div>

            {/* 10.0 GB Live Progress Bar */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Total Enterprise Cloud Storage
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {formatStorageSize(storageStats.usedBytes)}{' '}
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      of {formatStorageSize(TEN_GB_BYTES)} used
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums ${
                      storageStats.usedPercent >= 90
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                        : storageStats.usedPercent >= 70
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                    }`}
                  >
                    {storageStats.usedPercent.toFixed(2)}% Used
                  </span>
                  <p className="mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {formatStorageSize(storageStats.remainingBytes)} remaining ·{' '}
                    {storageStats.fileCount} files · {storageStats.linkCount} external links
                  </p>
                </div>
              </div>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    storageStats.usedPercent >= 90
                      ? 'bg-rose-600'
                      : storageStats.usedPercent >= 70
                        ? 'bg-amber-500'
                        : 'bg-indigo-600'
                  }`}
                  style={{
                    width: `${Math.max(storageStats.usedBytes > 0 ? 1.5 : 0, Math.min(100, storageStats.usedPercent))}%`,
                  }}
                />
              </div>
            </div>

            {/* 4 Vault Category Breakdown Cards */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categoryBreakdown.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.folder}
                    className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${cat.colorClass}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
                        {formatStorageSize(cat.bytes)}
                      </span>
                    </div>
                    <p className="mt-2.5 truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                      {cat.folder}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {cat.count} {cat.count === 1 ? 'document' : 'documents'}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. Profile & Account Security */}
        {showSection('profile') && (
          <section
            aria-label="Profile and Account Security"
            className={`min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 ${
              activeTab === 'all' ? 'xl:col-span-7' : 'xl:col-span-12'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Profile &amp; Account Security
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Verified identity, profile photo, digital sign-off &amp; password controls
                  </p>
                </div>
              </div>
              <RoleBadge role={activeRole} isSuperAdmin={isSuperAdmin} />
            </div>

            {/* Profile Photo Upload */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex min-w-0 items-center gap-3.5">
                <UserAvatar
                  name={currentUser.name}
                  avatarUrl={currentUser.avatarUrl}
                  sizeClass="h-14 w-14 shrink-0"
                  textClass="text-base"
                  roundedClass="rounded-xl"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                    <Camera className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Corporate Profile Photo</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    JPG, PNG, WebP or GIF up to 3 MB
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {avatarBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{currentUser.avatarUrl ? 'Update Photo' : 'Upload Photo'}</span>
                </button>
                {currentUser.avatarUrl && (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => void handleRemovePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              {avatarError && (
                <p className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                  {avatarError}
                </p>
              )}
            </div>

            {/* Verified User Metadata */}
            <div className="mt-4 grid grid-cols-1 gap-3.5 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Full Name
                </p>
                <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {currentUser.name}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Corporate Email
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {currentUser.email}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Employee ID {isSuperAdmin ? '(Exclusive Super Admin Lock)' : '(Read-Only)'}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  <IdCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{currentUser.employeeId}</span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Department {isSuperAdmin ? '(Super Admin Control)' : '(Assigned Profile)'}
                </p>
                {isSuperAdmin ? (
                  <div className="relative mt-1">
                    <Building2 className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                    <select
                      aria-label="Department"
                      value={currentUser.department}
                      onChange={(e) =>
                        onUpdateDepartment(currentUser.id, e.target.value as Department)
                      }
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {departmentOptions.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                    <Building2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    <span>{currentUser.department}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Digital Signature / Sign-Off Title */}
            <form
              onSubmit={handleSaveSignature}
              className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
            >
              <label
                htmlFor="settings-signoff-title"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
              >
                <PenTool className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Digital Signature / Sign-Off Title</span>
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Printed on audit sign-offs, official PDF exports &amp; workflow stamps
              </p>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <input
                  id="settings-signoff-title"
                  type="text"
                  value={signOffTitle}
                  onChange={(e) => setSignOffTitle(e.target.value)}
                  placeholder="e.g., Head of Operations"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0F172A] px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  {signOffSaved ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <span>Save Sign-Off</span>
                  )}
                </button>
              </div>
              {signOffError && (
                <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                  {signOffError}
                </p>
              )}
            </form>

            {/* Inline Change Password Form */}
            <form
              onSubmit={(e) => void handlePasswordSubmit(e)}
              className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50"
            >
              <div className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Change Password
                </h3>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Minimum 8 characters required; updates your corporate session credentials
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="settings-current-pw"
                    className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
                  >
                    Current Password
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="settings-current-pw"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Current password"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="settings-new-pw"
                    className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
                  >
                    New Password
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="settings-new-pw"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Min 8 characters"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="settings-confirm-pw"
                    className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
                  >
                    Confirm Password
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="settings-confirm-pw"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {passwordStatus && (
                    <p
                      className={`text-xs font-medium ${
                        passwordStatus.type === 'success'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {passwordStatus.message}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={updatingPassword}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {updatingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{updatingPassword ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* 5 & 6 Right Column on All Sections */}
        <div
          className={`min-w-0 space-y-6 ${
            activeTab === 'all' ? 'xl:col-span-5' : 'xl:col-span-12'
          }`}
        >
          {/* 5. Notifications & Workspace Alerts */}
          {showSection('notifications') && (
            <section
              aria-label="Notifications and Workspace Alerts"
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
            >
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-400">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Notifications &amp; Workspace Alerts
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Choose which real-time alerts surface in your workspace
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {(
                  [
                    {
                      key: 'teamChatAlerts',
                      label: 'Team Chat Alerts',
                      desc: 'Pop-up & live alerts for incoming DM or channel messages',
                      icon: MessageSquare,
                    },
                    {
                      key: 'mailNotifications',
                      label: 'Mail Notifications',
                      desc: 'Incoming corporate mail & thread reply notifications',
                      icon: Mail,
                    },
                    {
                      key: 'approvalLeaveAlerts',
                      label: 'Approval & Leave Status Updates',
                      desc: 'Workflow stage approvals, QA reviews & leave decisions',
                      icon: CheckCircle2,
                    },
                    {
                      key: 'calendarReminders',
                      label: 'Calendar Event Reminders',
                      desc: 'New meetings, milestones & scheduled Google Meet invites',
                      icon: CalendarClock,
                    },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const enabled = preferences[item.key];
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/50"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.desc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={item.label}
                        onClick={() =>
                          onUpdatePreferences(
                            { [item.key]: !enabled },
                            `${item.label} ${!enabled ? 'enabled' : 'muted'}`,
                          )
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                          enabled
                            ? 'border-indigo-600 bg-indigo-600'
                            : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                            enabled ? 'translate-x-5.5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 6. Regional, Weather & Device Info */}
          {showSection('regional') && (
            <section
              aria-label="Regional, Weather and Device Info"
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
            >
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-400">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    Regional, Weather &amp; Device Info
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dashboard weather location, units, time formatting &amp; live viewport status
                  </p>
                </div>
              </div>

              {/* Default Weather City */}
              <form onSubmit={handleApplyWeatherCity} className="mt-4">
                <label
                  htmlFor="settings-weather-city"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Default Weather City</span>
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="settings-weather-city"
                    type="text"
                    value={weatherCityInput}
                    onChange={(e) => setWeatherCityInput(e.target.value)}
                    placeholder="e.g., Lahore, Pakistan"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="h-9 shrink-0 rounded-lg bg-[#0F172A] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                  >
                    Apply City
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WEATHER_CITY_PRESETS.map((city) => {
                    const active =
                      preferences.weatherCity.toLowerCase() === city.toLowerCase();
                    return (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          setWeatherCityInput(city);
                          onUpdatePreferences(
                            { weatherCity: city },
                            `Default Weather City set to ${city}`,
                          );
                        }}
                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </form>

              {/* Weather Unit & Time Format */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Thermometer className="h-3.5 w-3.5 text-amber-500" />
                    <span>Weather Unit</span>
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                    {(
                      [
                        { id: 'C', label: '°C (Celsius)' },
                        { id: 'F', label: '°F (Fahrenheit)' },
                      ] as { id: TemperatureUnit; label: string }[]
                    ).map((unit) => {
                      const active = preferences.weatherUnit === unit.id;
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() =>
                            onUpdatePreferences(
                              { weatherUnit: unit.id },
                              `Temperature unit set to °${unit.id}`,
                            )
                          }
                          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-slate-900 text-white dark:bg-indigo-600'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                          }`}
                        >
                          {unit.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Time Format</span>
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                    {(
                      [
                        { id: '12h', label: '12-Hour' },
                        { id: '24h', label: '24-Hour' },
                      ] as { id: TimeFormatOption; label: string }[]
                    ).map((fmt) => {
                      const active = preferences.timeFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() =>
                            onUpdatePreferences(
                              { timeFormat: fmt.id },
                              `Time format set to ${fmt.label}`,
                            )
                          }
                          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-slate-900 text-white dark:bg-indigo-600'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Timezone Selector */}
              <div className="mt-4">
                <label
                  htmlFor="settings-timezone"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Regional Timezone
                </label>
                <select
                  id="settings-timezone"
                  value={preferences.timezone}
                  onChange={(e) =>
                    onUpdatePreferences(
                      { timezone: e.target.value },
                      `Timezone updated to ${e.target.value}`,
                    )
                  }
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Read-Only Active Viewport / Device Mode Card */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                    <DeviceIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Active Viewport / Device Mode</span>
                  </span>
                  <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold capitalize text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                    {viewport.deviceType}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                    <span className="block text-[10px] text-slate-400">Resolution</span>
                    <span className="font-mono font-bold text-slate-800 tabular-nums dark:text-slate-200">
                      {viewport.width} × {viewport.height}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                    <span className="block text-[10px] text-slate-400">Orientation</span>
                    <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                      {viewport.orientation}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                    <span className="block text-[10px] text-slate-400">Input Mode</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {viewport.isTouchDevice ? 'Touchscreen' : 'Pointer'}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
