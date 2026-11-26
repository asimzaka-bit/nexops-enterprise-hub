import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { AssetsInventoryView } from './components/AssetsInventoryView';
import { AuditLogsView } from './components/AuditLogsView';
import { CalendarView } from './components/CalendarView';
import { CreateRequestModal, CreateRequestPayload } from './components/CreateRequestModal';
import { DashboardView } from './components/DashboardView';
import { ImportedRequestRow, ImportRequestsModal } from './components/ImportRequestsModal';
import { CreateLeavePayload, LeavesView } from './components/LeavesView';
import { DepartmentVerificationScreen } from './components/DepartmentVerificationScreen';
import { LoginScreen, InitialAdminPayload, RegisterUserPayload, SignUpOutcome } from './components/LoginScreen';
import {
  MailChatHubView,
  SaveCorporateDraftPayload,
  SendChatMessagePayload,
  SendCorporateMailPayload,
  StartGoogleMeetPayload,
} from './components/MailChatHubView';
import { CreateMeetingPayload, MeetingsMomView } from './components/MeetingsMomView';
import { OfficialReportModal } from './components/OfficialReportModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { ProjectsDirectoryView } from './components/ProjectsDirectoryView';
import { QuickChatDrawer } from './components/QuickChatDrawer';
import { RequestDetailDrawer } from './components/RequestDetailDrawer';
import { RequestsQueueView } from './components/RequestsQueueView';
import { Sidebar } from './components/Sidebar';
import { SopVaultView } from './components/SopVaultView';
import { TeamSettingsView } from './components/TeamSettingsView';
import { ToastContainer } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { UserProfileModal } from './components/UserProfileModal';
import { DocumentVaultView } from './components/DocumentVaultView';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';
import { WorkspaceToolsView } from './components/WorkspaceToolsView';
import { useViewport } from './hooks/useViewport';
import {
  AnnouncementPriorityTag,
  AnnouncementSeverity,
  AppNotification,
  ApprovalStageSignOff,
  AssetCondition,
  AssetHistoryEntry,
  AssetStatus,
  AttendanceLog,
  AuditActionType,
  AuditEvent,
  AuthSession,
  CalendarEvent,
  CompanyAnnouncement,
  CompanyAsset,
  CompanyBrandingConfig,
  CompanyProject,
  CorporateMailMessage,
  DEFAULT_SLA_POLICY,
  Department,
  DocumentVaultItem,
  EditorChangePayload,
  LeaveRequest,
  MeetingActionItem,
  MeetingMinute,
  NavSection,
  NexOpsState,
  OperationalRequest,
  PendingEditorChange,
  PendingEditorChangeAction,
  PendingEditorChangeDiff,
  PendingEditorChangeModule,
  PermissionMatrix,
  Priority,
  RequestStatus,
  Role,
  SopAcknowledgment,
  SopDocument,
  TableSyncStatus,
  TaskComment,
  TaskSubtask,
  TeamChatMessage,
  TeamMember,
  ThemePreference,
  ToastMessage,
  WorkspaceEmailLog,
  WorkspaceSavedLink,
  WorkspaceToolType,
} from './types/nexops';
import {
  buildMemberFromSupabaseUser,
  dataService,
  extractSupabaseErrorMessage,
  mergeCalendarEvents,
  mergeChatMessages,
  mergeCorporateMails,
  mergeMeetings,
  ProvisionEmployeePayload,
  supabase,
  SYSTEM_STATE_KEYS,
} from './services/dataService';
import {
  disconnectGoogleWorkspace,
  getCurrentGoogleUser,
  getGoogleWorkspaceAccessToken,
  initGoogleWorkspaceAuth,
  signInWithGoogleWorkspace,
} from './services/googleWorkspaceService';
import {
  downloadSystemBackupJson,
  formatCurrency,
  generateNextRequestId,
  getTodayDateString,
  isAssetAlert,
  isSuperAdminEmail,
  isSuperAdminEmployeeId,
  normalizePermissionMatrix,
  normalizeRole,
  requiresTwoTierApproval,
  resolveEffectiveReviewer,
  SUPER_ADMIN_EMPLOYEE_ID,
} from './utils/storage';

export default function App() {
  const [state, setState] = useState<NexOpsState>(() => dataService.loadStateSync());
  const [branding, setBranding] = useState<CompanyBrandingConfig>(() =>
    dataService.branding.loadSync(),
  );
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    dataService.auth.loadSessionSync(),
  );
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [activeWorkspaceTool, setActiveWorkspaceTool] = useState<WorkspaceToolType>('gmail');
  const viewport = useViewport();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nexops_sidebar_collapsed_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (viewport.isDesktop && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [viewport.isDesktop, mobileMenuOpen]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem('nexops_theme_preference_v1');
      if (saved === 'light' || saved === 'dark') return saved;
      return 'system';
    } catch {
      return 'system';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const isDarkMode = themePreference === 'system' ? systemPrefersDark : themePreference === 'dark';

  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', isDarkMode);
      localStorage.setItem('nexops_theme_preference_v1', themePreference);
      localStorage.setItem('nexops_theme_v1', isDarkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage restrictions
    }
  }, [isDarkMode, themePreference]);

  // Queue filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'All'>('All');
  const [departmentFilter, setDepartmentFilter] = useState<Department | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Modals & Drawers
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [templateSource, setTemplateSource] = useState<OperationalRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<OperationalRequest | null>(null);
  const [reportModalState, setReportModalState] = useState<{
    open: boolean;
    requestId: string | null;
  }>({ open: false, requestId: null });

  // Toast Queue, Hydration & Cloud Sync State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isHydrating, setIsHydrating] = useState(
    () => dataService.isSupabaseConfigured(),
  );
  const [dbConnected, setDbConnected] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [tableDiagnostics, setTableDiagnostics] = useState<TableSyncStatus[]>(() =>
    dataService.getOfflineDiagnostics(),
  );
  const [isAdminInitialized, setIsAdminInitialized] = useState(() =>
    dataService.auth.hasLocalAdminSync(dataService.loadStateSync().teamMembers),
  );
  const realtimeTimerRef = useRef<number | null>(null);
  const isSigningInRef = useRef(false);
  const [onlinePresenceKeys, setOnlinePresenceKeys] = useState<Set<string>>(() => new Set());
  const [recentlyOfflineKeys, setRecentlyOfflineKeys] = useState<Set<string>>(() => new Set());
  const presenceChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const commsChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const deletedMailIdsRef = useRef<Set<string>>(new Set());
  const deletedCalendarIdsRef = useRef<Set<string>>(new Set());
  const recentlyOfflineTimersRef = useRef<Map<string, number>>(new Map());
  const [passwordRecoveryState, setPasswordRecoveryState] = useState<{
    active: boolean;
    email: string;
  }>({ active: false, email: '' });

  // Unified Google Workspace OAuth session state shared across Gmail, Docs, Sheets & Forms
  const [googleToken, setGoogleToken] = useState<string | null>(() =>
    getGoogleWorkspaceAccessToken(),
  );
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    () => getCurrentGoogleUser()?.email ?? null,
  );
  const [googleDisplayName, setGoogleDisplayName] = useState<string | null>(
    () => getCurrentGoogleUser()?.displayName ?? null,
  );
  const [googlePhotoUrl, setGooglePhotoUrl] = useState<string | null>(
    () => getCurrentGoogleUser()?.photoURL ?? null,
  );
  const [googleConnecting, setGoogleConnecting] = useState(false);

  useEffect(() => {
    dataService.saveStateSync(state);
  }, [state]);

  useEffect(() => {
    document.title = `${branding.companyName} — ${branding.tagline}`;
  }, [branding.companyName, branding.tagline]);

  useEffect(() => {
    try {
      localStorage.setItem('nexops_sidebar_collapsed_v1', String(sidebarCollapsed));
    } catch {
      // Ignore storage quota errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (user, token) => {
        setGoogleToken(token);
        setGoogleEmail(user.email ?? null);
        setGoogleDisplayName(user.displayName ?? null);
        setGooglePhotoUrl(user.photoURL ?? null);
      },
      () => {
        const cur = getCurrentGoogleUser();
        setGoogleToken(getGoogleWorkspaceAccessToken());
        setGoogleEmail(cur?.email ?? null);
        setGoogleDisplayName(cur?.displayName ?? null);
        setGooglePhotoUrl(cur?.photoURL ?? null);
      },
    );
    return unsubscribe;
  }, []);

  const pushToast = useCallback(
    (title: string, description?: string, variant: ToastMessage['variant'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleCloudWriteError = useCallback(
    (err: unknown) => {
      const message = extractSupabaseErrorMessage(err);
      console.error('[NexOps Cloud Sync Error]', message, err);
      setLastSyncError(message);
      pushToast('Cloud Sync Warning', message, 'warning');
    },
    [pushToast],
  );

  // Hydrate live Supabase Auth user on mount & auth state changes
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const applySupabaseUser = (
      sbUser: Parameters<typeof buildMemberFromSupabaseUser>[0],
      isInitialHydration = false,
    ) => {
      const savedSession = dataService.auth.loadSessionSync();
      const member = buildMemberFromSupabaseUser(sbUser, dataService.loadStateSync().teamMembers);
      const isNewPendingUser =
        !dataService
          .loadStateSync()
          .teamMembers.some(
            (m) => m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase(),
          ) &&
        !isSuperAdminEmail(member.email) &&
        (member.approvalStatus ?? 'pending') === 'pending';

      const pendingAdminNotif: AppNotification | null = isNewPendingUser
        ? {
            id: `notif-reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: 'New User Awaiting Approval',
            message: `${member.name} (${member.email}) signed up and requires Admin access approval.`,
            timestamp: new Date().toISOString(),
            read: false,
            targetSection: 'settings',
            recipientRole: 'Admin',
            actorEmail: member.email,
            category: 'user_approval',
            severity: 'warning',
          }
        : null;

      setState((prev) => {
        const exists = prev.teamMembers.some(
          (m) => m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase(),
        );
        const nextMembers = exists
          ? prev.teamMembers.map((m) =>
              m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase()
                ? {
                    ...m,
                    ...member,
                    lastActive: new Date().toISOString(),
                    lastActiveAt: new Date().toISOString(),
                  }
                : m,
            )
          : [member, ...prev.teamMembers];
        return {
          ...prev,
          activeRole: member.role,
          teamMembers: nextMembers,
          notifications: pendingAdminNotif
            ? [pendingAdminNotif, ...prev.notifications]
            : prev.notifications,
        };
      });
      if (pendingAdminNotif) {
        void dataService.notifications.create(pendingAdminNotif);
      }

      const matchingSaved =
        savedSession &&
        savedSession.isAuthenticated &&
        (savedSession.userId === member.id ||
          (savedSession.userEmail &&
            savedSession.userEmail.toLowerCase() === member.email.toLowerCase()))
          ? savedSession
          : null;

      const preservedIdentityVerified = isInitialHydration
        ? matchingSaved
          ? matchingSaved.identityVerified ?? true
          : false
        : matchingSaved?.identityVerified ?? false;

      const isSuper = isSuperAdminEmail(member.email);
      const resolvedRole: Role = isSuper
        ? 'Admin'
        : member.role === 'Editor'
          ? 'Editor'
          : 'Viewer';
      const savedClampedRole: Role | undefined = matchingSaved?.userRole
        ? matchingSaved.userRole === 'Editor'
          ? 'Editor'
          : 'Viewer'
        : undefined;
      const nextSession: AuthSession = {
        isAuthenticated: true,
        userId: member.id,
        rememberSession: true,
        signedInAt: matchingSaved?.signedInAt ?? new Date().toISOString(),
        authProvider: 'supabase',
        employeeId: isSuper
          ? SUPER_ADMIN_EMPLOYEE_ID
          : matchingSaved?.employeeId || member.employeeId,
        userName: matchingSaved?.userName || member.name,
        userEmail: member.email,
        userRole: isSuper ? 'Admin' : savedClampedRole || resolvedRole,
        approvalStatus: isSuper
          ? 'approved'
          : matchingSaved?.approvalStatus ?? member.approvalStatus,
        isSuperAdmin: isSuper,
        userDepartment: matchingSaved?.userDepartment || member.department,
        userTitle: isSuper
          ? 'Primary Super Administrator'
          : matchingSaved?.userTitle === 'Primary Super Administrator'
            ? member.title
            : matchingSaved?.userTitle || member.title,
        avatarUrl: matchingSaved?.avatarUrl || member.avatarUrl,
        identityVerified: preservedIdentityVerified,
      };
      dataService.auth.saveSessionSync(nextSession);
      setAuthSession(nextSession);
    };

    void client.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        applySupabaseUser(data.session.user, true);
      }
    });

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryState({
          active: true,
          email: session?.user?.email ?? '',
        });
        setAuthSession(null);
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        if (isSigningInRef.current) return;
        applySupabaseUser(session.user, false);
      } else if (event === 'SIGNED_OUT') {
        setAuthSession((prev) => {
          if (prev?.authProvider === 'supabase') {
            dataService.auth.clearSessionSync();
            return null;
          }
          return prev;
        });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Verify First-Time Admin Setup Guard against both local directory & Supabase audit ledger
  useEffect(() => {
    let active = true;
    void dataService.auth.checkAdminInitialized(state.teamMembers).then((initialized) => {
      if (active) {
        setIsAdminInitialized(initialized);
      }
    });
    return () => {
      active = false;
    };
  }, [state.teamMembers]);

  const syncFromSupabase = useCallback(
    async (showFeedbackToast = false, showSkeleton = false) => {
      if (!dataService.isSupabaseConfigured()) {
        setDbConnected(false);
        setIsHydrating(false);
        setTableDiagnostics(dataService.getOfflineDiagnostics());
        if (showFeedbackToast) {
          pushToast(
            'Offline Storage Active',
            'Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect live Supabase.',
            'info',
          );
        }
        return;
      }

      if (showSkeleton) {
        setIsHydrating(true);
      }
      setIsSyncing(true);

      try {
        const remote = await dataService.fetchFullWorkspaceState();
        setState((prev) => ({
          ...remote.state,
          corporateMails: mergeCorporateMails(
            remote.state.corporateMails,
            prev.corporateMails,
            deletedMailIdsRef.current,
          ),
          chatMessages: mergeChatMessages(remote.state.chatMessages, prev.chatMessages),
          meetings: mergeMeetings(remote.state.meetings, prev.meetings),
          calendarEvents: mergeCalendarEvents(
            remote.state.calendarEvents,
            prev.calendarEvents,
            deletedCalendarIdsRef.current,
          ),
        }));
        setBranding(remote.branding);
        setTableDiagnostics(remote.diagnostics);
        setDbConnected(remote.cloudHealthy);
        if (remote.cloudHealthy) {
          setLastSyncError(null);
        }

        // Keep active authSession strictly synchronized with authoritative `user_access` cloud state
        const profilesHealthy =
          remote.diagnostics.find((d) => d.tableKey === 'profiles')?.status === 'connected';
        const activeSess = dataService.auth.loadSessionSync();
        if (profilesHealthy && activeSess?.isAuthenticated) {
          const cleanSessEmail = activeSess.userEmail?.trim().toLowerCase();
          const matchedCloudUser = remote.state.teamMembers.find(
            (m) =>
              m.id === activeSess.userId ||
              (cleanSessEmail && m.email.trim().toLowerCase() === cleanSessEmail),
          );
          if (matchedCloudUser) {
            if (
              matchedCloudUser.approvalStatus !== activeSess.approvalStatus ||
              matchedCloudUser.role !== activeSess.userRole ||
              matchedCloudUser.department !== activeSess.userDepartment ||
              matchedCloudUser.employeeId !== activeSess.employeeId ||
              matchedCloudUser.id !== activeSess.userId ||
              Boolean(matchedCloudUser.isSuperAdmin) !== Boolean(activeSess.isSuperAdmin)
            ) {
              const syncedSession: AuthSession = {
                ...activeSess,
                userId: matchedCloudUser.id,
                employeeId: matchedCloudUser.employeeId,
                userName: matchedCloudUser.name,
                userDepartment: matchedCloudUser.department,
                userRole: matchedCloudUser.role,
                approvalStatus: matchedCloudUser.approvalStatus,
                isSuperAdmin: isSuperAdminEmail(matchedCloudUser.email),
                userTitle: matchedCloudUser.title,
              };
              dataService.auth.saveSessionSync(syncedSession);
              setAuthSession(syncedSession);
            }
          } else if (cleanSessEmail && !isSuperAdminEmail(cleanSessEmail)) {
            // User was permanently deleted from `user_access` on another device
            void dataService.auth.signOut().finally(() => {
              setAuthSession(null);
              pushToast(
                'Access Record Removed',
                'Your user record was removed by an Administrator. Sign in again to submit a fresh approval request.',
                'warning',
              );
            });
          }
        }

        if (showFeedbackToast) {
          const healthyCount = remote.diagnostics.filter((d) => d.status === 'connected').length;
          pushToast(
            'Cloud Synced with Supabase',
            `Synced ${healthyCount}/${remote.diagnostics.length} tables (${remote.state.requests.length} requests, ${remote.state.projects.length} projects, ${remote.state.assets.length} assets).`,
            'success',
          );
        }
      } catch (err) {
        const message = extractSupabaseErrorMessage(err);
        console.error('[NexOps Cloud Sync Error] Full workspace sync failed:', message, err);
        setDbConnected(false);
        setLastSyncError(message);
        setTableDiagnostics(dataService.getOfflineDiagnostics());
        if (showFeedbackToast) {
          pushToast('Supabase Sync Failed', message, 'warning');
        }
      } finally {
        setIsSyncing(false);
        setIsHydrating(false);
      }
    },
    [pushToast],
  );

  const handleRunHealthCheck = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const results = await dataService.diagnostics.checkAllTables(state);
      setTableDiagnostics(results);
      const connectedCount = results.filter((r) => r.status === 'connected').length;
      const anyConnected = connectedCount > 0;
      setDbConnected(anyConnected);
      pushToast(
        anyConnected ? 'Database Health Check Complete' : 'Offline Diagnostics Complete',
        anyConnected
          ? `${connectedCount}/${results.length} Supabase tables healthy.`
          : 'Supabase env vars not configured; running in local fallback mode.',
        anyConnected && connectedCount === results.length ? 'success' : 'info',
      );
    } catch (err) {
      pushToast(
        'Health Check Error',
        err instanceof Error ? err.message : 'Unable to query table diagnostics.',
        'warning',
      );
    } finally {
      setIsCheckingHealth(false);
    }
  }, [pushToast, state]);

  const currentUser: TeamMember = useMemo(() => {
    if (authSession) {
      const bySessionId = state.teamMembers.find(
        (m) =>
          m.id === authSession.userId ||
          (authSession.userEmail &&
            m.email.toLowerCase() === authSession.userEmail.toLowerCase()),
      );
      if (bySessionId) {
        if (isSuperAdminEmail(bySessionId.email)) {
          return {
            ...bySessionId,
            employeeId: SUPER_ADMIN_EMPLOYEE_ID,
            role: 'Admin',
            approvalStatus: 'approved',
            isSuperAdmin: true,
            active: true,
          };
        }
        return {
          ...bySessionId,
          role: bySessionId.role === 'Editor' ? 'Editor' : 'Viewer',
          isSuperAdmin: false,
        };
      }
      const isSuper = isSuperAdminEmail(authSession.userEmail || '');
      const fallbackRole: Role = isSuper
        ? 'Admin'
        : authSession.userRole === 'Editor'
          ? 'Editor'
          : 'Viewer';
      return {
        id: authSession.userId,
        employeeId: isSuper
          ? SUPER_ADMIN_EMPLOYEE_ID
          : authSession.employeeId ||
            `EMP-${authSession.userId.slice(0, 4).toUpperCase()}`,
        name: authSession.userName || authSession.userEmail || 'Authenticated User',
        email: authSession.userEmail || '',
        role: fallbackRole,
        approvalStatus: isSuper
          ? 'approved'
          : authSession.approvalStatus ?? 'pending',
        isSuperAdmin: isSuper,
        department: authSession.userDepartment || branding.departments[0] || 'Operations',
        title:
          isSuper
            ? 'Primary Super Administrator'
            : authSession.userTitle === 'Primary Super Administrator'
              ? fallbackRole === 'Editor'
                ? 'Operations Editor'
                : 'Workspace Viewer'
              : authSession.userTitle || fallbackRole,
        signOffTitle:
          isSuper
            ? 'Primary Super Administrator'
            : authSession.userTitle === 'Primary Super Administrator'
              ? fallbackRole === 'Editor'
                ? 'Operations Editor'
                : 'Workspace Viewer'
              : authSession.userTitle || fallbackRole,
        avatarUrl: authSession.avatarUrl,
        active: true,
        lastActive: authSession.signedInAt,
      };
    }

    return {
      id: 'unauthenticated',
      employeeId: 'EMP-000',
      name: 'Unauthenticated',
      email: '',
      role: 'Viewer',
      approvalStatus: 'pending',
      isSuperAdmin: false,
      department: branding.departments[0] || 'Operations',
      title: 'Viewer',
      signOffTitle: 'Viewer',
      active: false,
      lastActive: new Date().toISOString(),
    };
  }, [authSession, state.teamMembers, branding.departments]);

  const isSuperAdminOperator = Boolean(
    authSession?.isAuthenticated &&
      currentUser.role === 'Admin' &&
      isSuperAdminEmail(currentUser.email) &&
      isSuperAdminEmployeeId(currentUser.employeeId),
  );

  const isApprovedUser = Boolean(
    authSession?.isAuthenticated &&
      (isSuperAdminEmail(currentUser.email) ||
        ((currentUser.approvalStatus ?? 'pending') === 'approved' && currentUser.active)),
  );

  const pendingUsersCount = useMemo(
    () =>
      state.teamMembers.filter(
        (m) =>
          !isSuperAdminEmail(m.email) &&
          (m.approvalStatus ?? (m.active ? 'approved' : 'pending')) === 'pending',
      ).length,
    [state.teamMembers],
  );

  const pendingEditorChangesCount = useMemo(
    () => state.pendingEditorChanges.filter((c) => c.status === 'pending').length,
    [state.pendingEditorChanges],
  );

  useEffect(() => {
    if (
      authSession?.isAuthenticated &&
      authSession.identityVerified !== false &&
      isApprovedUser
    ) {
      void syncFromSupabase(false, dataService.isSupabaseConfigured());
    } else if (authSession?.isAuthenticated && !isApprovedUser) {
      setIsHydrating(false);
      void dataService.auth
        .refreshUserProfile(authSession.userId, authSession.userEmail, currentUser)
        .then((refreshed) => {
          if (!refreshed) return;
          setState((prev) => ({
            ...prev,
            teamMembers: prev.teamMembers.some(
              (m) =>
                m.id === refreshed.id ||
                m.email.toLowerCase() === refreshed.email.toLowerCase(),
            )
              ? prev.teamMembers.map((m) =>
                  m.id === refreshed.id ||
                  m.email.toLowerCase() === refreshed.email.toLowerCase()
                    ? refreshed
                    : m,
                )
              : [refreshed, ...prev.teamMembers],
          }));
          if (
            refreshed.approvalStatus !== authSession.approvalStatus ||
            refreshed.role !== authSession.userRole ||
            refreshed.department !== authSession.userDepartment ||
            refreshed.employeeId !== authSession.employeeId
          ) {
            const nextSession: AuthSession = {
              ...authSession,
              userId: refreshed.id,
              employeeId: refreshed.employeeId,
              userName: refreshed.name,
              userDepartment: refreshed.department,
              userRole: refreshed.role,
              approvalStatus: refreshed.approvalStatus,
              isSuperAdmin: refreshed.isSuperAdmin,
            };
            dataService.auth.saveSessionSync(nextSession);
            setAuthSession(nextSession);
          }
        });
    } else {
      setIsHydrating(false);
    }
  }, [authSession?.isAuthenticated, authSession?.identityVerified, isApprovedUser, syncFromSupabase]);

  // Enforce strict role integrity from the authenticated user's profile
  useEffect(() => {
    if (authSession?.isAuthenticated && state.activeRole !== currentUser.role) {
      setState((prev) => ({ ...prev, activeRole: currentUser.role }));
    }
  }, [authSession?.isAuthenticated, currentUser.role, state.activeRole]);

  // Non-Super-Admins must NEVER remain on Admin-only sections (Settings or Activity Audit Trail)
  useEffect(() => {
    if ((activeSection === 'settings' || activeSection === 'audit') && !isSuperAdminOperator) {
      setActiveSection('dashboard');
    }
  }, [activeSection, isSuperAdminOperator]);

  useEffect(() => {
    if (
      activeSection === 'settings' &&
      isSuperAdminOperator &&
      authSession?.isAuthenticated &&
      isApprovedUser &&
      dataService.isSupabaseConfigured()
    ) {
      void dataService.team
        .fetchProfilesFromCloud()
        .then((freshMembers) => {
          setState((prev) => ({
            ...prev,
            teamMembers: freshMembers,
          }));
        })
        .catch(() => {});
    }
  }, [activeSection, currentUser.role, authSession?.isAuthenticated, isApprovedUser]);

  // Instant Real-Time Presence (Supabase Realtime Presence WebSocket + 15s Heartbeat + Tab-Close Beacon)
  useEffect(() => {
    if (
      !authSession?.isAuthenticated ||
      authSession.identityVerified === false ||
      !isApprovedUser ||
      currentUser.id === 'unauthenticated'
    ) {
      setOnlinePresenceKeys(new Set());
      return;
    }

    const cleanSelfEmail = currentUser.email.trim().toLowerCase();
    const userSnapshot = {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
    };

    const applyLocalTimestamp = (nowIso: string) => {
      setState((prev) => ({
        ...prev,
        teamMembers: prev.teamMembers.map((m) =>
          m.id === userSnapshot.id ||
          (cleanSelfEmail && m.email.trim().toLowerCase() === cleanSelfEmail)
            ? { ...m, lastActive: nowIso, lastActiveAt: nowIso }
            : m,
        ),
      }));
    };

    const sendHeartbeat = () => {
      const nowIso = new Date().toISOString();
      applyLocalTimestamp(nowIso);
      void dataService.team
        .sendPresenceHeartbeat(userSnapshot)
        .then((savedIso) => {
          applyLocalTimestamp(savedIso);
        })
        .catch(() => {});
    };

    const markKeysOnline = (keys: string[]) => {
      if (keys.length === 0) return;
      for (const k of keys) {
        const existingTimer = recentlyOfflineTimersRef.current.get(k);
        if (existingTimer !== undefined) {
          window.clearTimeout(existingTimer);
          recentlyOfflineTimersRef.current.delete(k);
        }
      }
      setRecentlyOfflineKeys((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const k of keys) {
          if (next.delete(k)) changed = true;
        }
        return changed ? next : prev;
      });
    };

    const markKeysRecentlyOffline = (keys: string[]) => {
      if (keys.length === 0) return;
      setRecentlyOfflineKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      });
      for (const k of keys) {
        const existingTimer = recentlyOfflineTimersRef.current.get(k);
        if (existingTimer !== undefined) {
          window.clearTimeout(existingTimer);
        }
        const timeoutId = window.setTimeout(() => {
          recentlyOfflineTimersRef.current.delete(k);
          setRecentlyOfflineKeys((prev) => {
            if (!prev.has(k)) return prev;
            const next = new Set(prev);
            next.delete(k);
            return next;
          });
        }, 30_000);
        recentlyOfflineTimersRef.current.set(k, timeoutId);
      }
    };

    const extractKeysFromPresences = (
      key: string,
      presences: Array<Record<string, unknown>>,
    ): string[] => {
      const out = new Set<string>();
      const cleanKey = key.trim().toLowerCase();
      if (cleanKey) out.add(cleanKey);
      for (const p of presences) {
        if (typeof p.user_id === 'string' && p.user_id.trim()) out.add(p.user_id.trim());
        if (typeof p.email === 'string' && p.email.trim()) {
          out.add(p.email.trim().toLowerCase());
        }
      }
      return Array.from(out);
    };

    const collectPresenceKeys = (
      stateMap: Record<string, Array<Record<string, unknown>>>,
    ): Set<string> => {
      const keys = new Set<string>();
      for (const [presenceKey, list] of Object.entries(stateMap)) {
        for (const k of extractKeysFromPresences(presenceKey, list)) {
          keys.add(k);
        }
      }
      return keys;
    };

    sendHeartbeat();

    const client = supabase;
    let presenceChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    const presencePayload = {
      user_id: currentUser.id,
      email: cleanSelfEmail,
      name: currentUser.name,
      department: currentUser.department,
      online_at: new Date().toISOString(),
    };

    if (client) {
      presenceChannel = client.channel('nexops-online-presence', {
        config: {
          presence: {
            key: cleanSelfEmail || currentUser.id,
          },
        },
      });
      presenceChannelRef.current = presenceChannel;

      const syncFromChannel = () => {
        if (!presenceChannel) return new Set<string>();
        const activeKeys = collectPresenceKeys(
          presenceChannel.presenceState() as Record<string, Array<Record<string, unknown>>>,
        );
        setOnlinePresenceKeys(activeKeys);
        return activeKeys;
      };

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const activeKeys = syncFromChannel();
          markKeysOnline(Array.from(activeKeys));
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          const joined = extractKeysFromPresences(
            key,
            newPresences as Array<Record<string, unknown>>,
          );
          markKeysOnline(joined);
          syncFromChannel();
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          const activeKeys = syncFromChannel();
          const leftKeys = extractKeysFromPresences(
            key,
            leftPresences as Array<Record<string, unknown>>,
          ).filter((k) => !activeKeys.has(k));

          if (leftKeys.length > 0) {
            const leftIso = new Date().toISOString();
            markKeysRecentlyOffline(leftKeys);
            setState((prev) => ({
              ...prev,
              teamMembers: prev.teamMembers.map((m) =>
                leftKeys.includes(m.id) ||
                (m.email && leftKeys.includes(m.email.trim().toLowerCase()))
                  ? { ...m, lastActive: leftIso, lastActiveAt: leftIso }
                  : m,
              ),
            }));
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && document.visibilityState === 'visible') {
            markKeysOnline([currentUser.id, cleanSelfEmail].filter(Boolean));
            void presenceChannel?.track({
              ...presencePayload,
              online_at: new Date().toISOString(),
            });
          }
        });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markKeysOnline([currentUser.id, cleanSelfEmail].filter(Boolean));
        void presenceChannelRef.current?.track({
          ...presencePayload,
          online_at: new Date().toISOString(),
        });
        sendHeartbeat();
      } else {
        void presenceChannelRef.current?.untrack();
        const nowIso = dataService.team.sendPresenceBeacon(userSnapshot);
        applyLocalTimestamp(nowIso);
      }
    };

    const handlePageUnload = () => {
      void presenceChannelRef.current?.untrack();
      dataService.team.sendPresenceBeacon(userSnapshot);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('beforeunload', handlePageUnload);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    }, 15_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageUnload);
      window.removeEventListener('beforeunload', handlePageUnload);
      window.clearInterval(heartbeatTimer);
      if (presenceChannel && client) {
        void presenceChannel.untrack();
        void client.removeChannel(presenceChannel);
      }
      if (presenceChannelRef.current === presenceChannel) {
        presenceChannelRef.current = null;
      }
    };
  }, [
    authSession?.isAuthenticated,
    authSession?.identityVerified,
    isApprovedUser,
    currentUser.id,
    currentUser.email,
    currentUser.name,
    currentUser.department,
  ]);

  useEffect(() => {
    if (!authSession?.isAuthenticated || !supabase) return;

    const client = supabase;

    if (!isApprovedUser) {
      const checkPendingProfile = () => {
        void dataService.auth
          .refreshUserProfile(authSession.userId, authSession.userEmail, currentUser)
          .then((refreshed) => {
            if (!refreshed) return;
            setState((prev) => ({
              ...prev,
              teamMembers: prev.teamMembers.some(
                (m) =>
                  m.id === refreshed.id ||
                  m.email.toLowerCase() === refreshed.email.toLowerCase(),
              )
                ? prev.teamMembers.map((m) =>
                    m.id === refreshed.id ||
                    m.email.toLowerCase() === refreshed.email.toLowerCase()
                      ? refreshed
                      : m,
                  )
                : [refreshed, ...prev.teamMembers],
            }));
            if (
              refreshed.approvalStatus !== authSession.approvalStatus ||
              refreshed.role !== authSession.userRole ||
              refreshed.id !== authSession.userId ||
              refreshed.department !== authSession.userDepartment ||
              refreshed.employeeId !== authSession.employeeId
            ) {
              const nextSession: AuthSession = {
                ...authSession,
                userId: refreshed.id,
                employeeId: refreshed.employeeId,
                userName: refreshed.name,
                userDepartment: refreshed.department,
                userRole: refreshed.role,
                approvalStatus: refreshed.approvalStatus,
                isSuperAdmin: refreshed.isSuperAdmin,
              };
              dataService.auth.saveSessionSync(nextSession);
              setAuthSession(nextSession);
            }
          });
      };

      const pendingChannel = client
        .channel('nexops-pending-profile-watch')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_access' },
          checkPendingProfile,
        )
        .subscribe();

      const pollTimer = window.setInterval(checkPendingProfile, 10000);

      return () => {
        window.clearInterval(pollTimer);
        void client.removeChannel(pendingChannel);
      };
    }
    const scheduleRealtimeRefresh = () => {
      if (realtimeTimerRef.current !== null) {
        window.clearTimeout(realtimeTimerRef.current);
      }
      realtimeTimerRef.current = window.setTimeout(() => {
        realtimeTimerRef.current = null;
        void syncFromSupabase(false, false);
      }, 220);
    };

    const channel = client
      .channel('nexops-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operations_data' },
        (payload) => {
          const record = (payload.new ?? payload.old) as
            | { id?: string; title?: string; status?: RequestStatus; created_by?: string }
            | undefined;
          if (
            record?.id &&
            payload.eventType === 'INSERT' &&
            record.created_by &&
            record.created_by !== currentUser.name
          ) {
            const liveNotif: AppNotification = {
              id: `notif-rt-${Date.now()}`,
              title: `Live Submission: ${record.id}`,
              message: `${record.created_by} submitted "${record.title ?? record.id}" (${record.status ?? 'Submitted'}).`,
              timestamp: new Date().toISOString(),
              read: false,
              requestId: record.id,
              severity: 'info',
            };
            setState((prev) => ({
              ...prev,
              notifications: [liveNotif, ...prev.notifications],
            }));
            pushToast(`Live Update · ${record.id}`, `${record.created_by} submitted a new request.`, 'info');
          } else if (
            record?.id &&
            payload.eventType === 'UPDATE' &&
            record.status
          ) {
            setDbConnected(true);
          }
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_audit_logs' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_projects' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_assets' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_sops' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_leaves' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_moms' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_system_state' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_access' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_workspace_emails' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nexops_workspace_links' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audit_logs' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subtasks' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_vault' },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setDbConnected(true);
        }
      });

    return () => {
      if (realtimeTimerRef.current !== null) {
        window.clearTimeout(realtimeTimerRef.current);
      }
      void client.removeChannel(channel);
    };
  }, [authSession, isApprovedUser, currentUser, pushToast, syncFromSupabase]);

  // Sub-second Supabase Realtime Broadcast channel for Live Team Chat, Corporate Mail & Google Meet
  useEffect(() => {
    const client = supabase;
    if (!client || !authSession?.isAuthenticated || !isApprovedUser) {
      commsChannelRef.current = null;
      return;
    }

    const commsChannel = client
      .channel('nexops-live-comms', {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'chat:message' }, ({ payload }) => {
        const incoming = payload as TeamChatMessage | undefined;
        if (!incoming?.id) return;
        setState((prev) => ({
          ...prev,
          chatMessages: mergeChatMessages(prev.chatMessages, [incoming]),
        }));
      })
      .on('broadcast', { event: 'mail:upsert' }, ({ payload }) => {
        const incoming = payload as CorporateMailMessage | undefined;
        if (!incoming?.id || incoming.status !== 'sent') return;
        setState((prev) => ({
          ...prev,
          corporateMails: mergeCorporateMails(
            prev.corporateMails,
            [incoming],
            deletedMailIdsRef.current,
          ),
        }));
      })
      .on('broadcast', { event: 'meet:invite' }, ({ payload }) => {
        const incomingMeeting = payload as MeetingMinute | undefined;
        if (!incomingMeeting?.id) return;
        setState((prev) => ({
          ...prev,
          meetings: mergeMeetings(prev.meetings, [incomingMeeting]),
        }));
      })
      .on('broadcast', { event: 'calendar:upsert' }, ({ payload }) => {
        const incomingEvent = payload as CalendarEvent | undefined;
        if (!incomingEvent?.id) return;
        deletedCalendarIdsRef.current.delete(incomingEvent.id);
        setState((prev) => ({
          ...prev,
          calendarEvents: mergeCalendarEvents(
            prev.calendarEvents,
            [incomingEvent],
            deletedCalendarIdsRef.current,
          ),
        }));
      })
      .on('broadcast', { event: 'calendar:delete' }, ({ payload }) => {
        const deletedId = (payload as { id?: string } | undefined)?.id;
        if (!deletedId) return;
        deletedCalendarIdsRef.current.add(deletedId);
        setState((prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents.filter((ev) => ev.id !== deletedId),
        }));
      })
      .subscribe();

    commsChannelRef.current = commsChannel;

    return () => {
      if (commsChannelRef.current === commsChannel) {
        commsChannelRef.current = null;
      }
      void client.removeChannel(commsChannel);
    };
  }, [authSession?.isAuthenticated, isApprovedUser]);

  const currentActor = currentUser;

  const defaultReviewerName = useMemo(() => {
    const reviewer = state.teamMembers.find(
      (m) =>
        m.active &&
        (m.approvalStatus ?? 'approved') === 'approved' &&
        m.role === 'Admin',
    );
    return reviewer?.name || currentUser.name || '';
  }, [state.teamMembers, currentUser.name]);

  const selectedRequest = useMemo(
    () => state.requests.find((r) => r.id === selectedRequestId) ?? null,
    [state.requests, selectedRequestId],
  );

  const pendingQueueCount = useMemo(
    () =>
      state.requests.filter(
        (r) =>
          r.status === 'Submitted' ||
          r.status === 'Under QA Review' ||
          r.status === 'Revision Required',
      ).length,
    [state.requests],
  );

  const nextRequestId = useMemo(
    () => generateNextRequestId(state.requests),
    [state.requests],
  );

  const activeProjectsCount = useMemo(
    () => state.projects.filter((p) => p.status === 'Active').length,
    [state.projects],
  );

  const assetAlertsCount = useMemo(
    () => state.assets.filter((a) => isAssetAlert(a)).length,
    [state.assets],
  );

  const pendingSopsCount = useMemo(
    () =>
      state.sops.filter(
        (sop) =>
          sop.mandatoryRead &&
          !sop.acknowledgments.some(
            (ack) =>
              ack.userId === currentUser.id ||
              (Boolean(ack.employeeId) && ack.employeeId === currentUser.employeeId) ||
              ack.userName.trim().toLowerCase() === currentUser.name.trim().toLowerCase(),
          ),
      ).length,
    [state.sops, currentUser],
  );

  const pendingLeavesCount = useMemo(
    () => state.leaves.filter((l) => l.status === 'Pending').length,
    [state.leaves],
  );

  const openActionItemsCount = useMemo(
    () =>
      state.meetings.reduce(
        (sum, m) => sum + m.actionItems.filter((a) => a.status === 'Open').length,
        0,
      ),
    [state.meetings],
  );

  const upcomingCalendarCount = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return state.calendarEvents.filter((ev) => ev.date >= todayIso).length;
  }, [state.calendarEvents]);

  const unreadCommsCount = useMemo(() => {
    const selfEmailLower = currentUser.email.trim().toLowerCase();
    const deptAlias = `dept:${currentUser.department.toLowerCase()}@nexops.company`;
    const unreadMail = state.corporateMails.filter((m) => {
      if (m.status !== 'sent') return false;
      const recipients = [...m.toEmails, ...m.ccEmails].map((e) => e.trim().toLowerCase());
      const addressed =
        recipients.includes(selfEmailLower) ||
        recipients.includes('all@nexops.company') ||
        recipients.includes(deptAlias);
      if (!addressed) return false;
      return !m.readBy.some((e) => e.trim().toLowerCase() === selfEmailLower);
    }).length;

    const unreadChat = state.chatMessages.filter(
      (msg) =>
        msg.senderEmail.trim().toLowerCase() !== selfEmailLower &&
        !msg.readBy.some((e) => e.trim().toLowerCase() === selfEmailLower),
    ).length;

    return unreadMail + unreadChat;
  }, [state.corporateMails, state.chatMessages, currentUser.email, currentUser.department]);

  const pendingAssignedCount = useMemo(
    () =>
      state.requests.filter(
        (r) =>
          (r.status === 'Submitted' || r.status === 'Under QA Review') &&
          r.assignedReviewer.trim().toLowerCase() === currentUser.name.trim().toLowerCase(),
      ).length,
    [state.requests, currentUser.name],
  );

  const getActorForRole = useCallback(
    (role: Role, members: TeamMember[] = state.teamMembers) => {
      if (authSession) {
        const sessionUser = members.find(
          (m) =>
            m.id === authSession.userId ||
            (authSession.userEmail &&
              m.email.toLowerCase() === authSession.userEmail.toLowerCase()),
        );
        if (sessionUser) {
          return sessionUser;
        }
      }
      return {
        ...currentUser,
        role: currentUser.role || role,
      };
    },
    [authSession, state.teamMembers, currentUser],
  );

  const createAuditEvent = (
    requestId: string,
    actionType: AuditActionType,
    details: string,
    role: Role = currentUser.role,
    membersOverride?: TeamMember[],
  ): AuditEvent => {
    const actor = getActorForRole(role, membersOverride);
    return {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      requestId,
      timestamp: new Date().toISOString(),
      actorName: actor.name,
      actorEmail: actor.email || currentUser.email || undefined,
      actorRole: actor.role,
      actorSignOffTitle: actor.signOffTitle || actor.title,
      actionType,
      details,
    };
  };

  // Authentication Handlers (Production-Only, 2-Step Login)
  const handleEmailSignIn = async (
    email: string,
    password: string,
    rememberSession: boolean,
  ) => {
    isSigningInRef.current = true;
    try {
      const { user, session, wasInsertedPending } = await dataService.auth.signInWithEmail(
        email,
        password,
        rememberSession,
      );
      const step1Session: AuthSession = {
        ...session,
        identityVerified: false,
      };
      dataService.auth.saveSessionSync(step1Session);
      setAuthSession(step1Session);
      if (user.role === 'Admin') {
        setIsAdminInitialized(true);
      }
      const pendingNotif: AppNotification | null = wasInsertedPending
        ? {
            id: `notif-relogin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: 'New User Awaiting Approval',
            message: `${user.name} (${user.email}) requested workspace access and awaits Admin approval.`,
            timestamp: new Date().toISOString(),
            read: false,
            targetSection: 'settings',
            recipientRole: 'Admin',
            actorEmail: user.email,
            category: 'user_approval',
            severity: 'warning',
          }
        : null;
      setState((prev) => {
        const exists = prev.teamMembers.some(
          (m) => m.id === user.id || m.email.toLowerCase() === user.email.toLowerCase(),
        );
        const nextMembers = exists
          ? prev.teamMembers.map((m) =>
              m.id === user.id || m.email.toLowerCase() === user.email.toLowerCase()
                ? {
                    ...m,
                    ...user,
                    lastActive: new Date().toISOString(),
                    lastActiveAt: new Date().toISOString(),
                  }
                : m,
            )
          : [user, ...prev.teamMembers];
        return {
          ...prev,
          activeRole: user.role,
          teamMembers: nextMembers,
          notifications: pendingNotif
            ? [pendingNotif, ...prev.notifications]
            : prev.notifications,
        };
      });
      if (pendingNotif) {
        void dataService.notifications.create(pendingNotif);
      }
    } finally {
      isSigningInRef.current = false;
    }
  };

  const handleCompleteIdentityStep = async ({
    department,
    employeeId,
  }: {
    department: Department;
    employeeId: string;
  }) => {
    if (!authSession) return;
    const { member: updatedUser, wasInsertedPending } =
      await dataService.auth.updateUserIdentity(
        currentUser,
        department,
        employeeId,
        state.teamMembers,
      );
    const nextSession: AuthSession = {
      ...authSession,
      userId: updatedUser.id,
      employeeId: updatedUser.employeeId,
      userName: updatedUser.name,
      userEmail: updatedUser.email,
      userRole: updatedUser.role,
      approvalStatus: updatedUser.approvalStatus,
      isSuperAdmin: updatedUser.isSuperAdmin,
      userDepartment: updatedUser.department,
      userTitle: updatedUser.title,
      avatarUrl: updatedUser.avatarUrl,
      identityVerified: true,
    };
    dataService.auth.saveSessionSync(nextSession);
    setAuthSession(nextSession);
    const pendingNotif: AppNotification | null = wasInsertedPending
      ? {
          id: `notif-step2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: 'New User Awaiting Approval',
          message: `${updatedUser.name} (${updatedUser.email}) submitted access request (${updatedUser.department} · ${updatedUser.employeeId}).`,
          timestamp: new Date().toISOString(),
          read: false,
          targetSection: 'settings',
          recipientRole: 'Admin',
          actorEmail: updatedUser.email,
          category: 'user_approval',
          severity: 'warning',
        }
      : null;
    setState((prev) => ({
      ...prev,
      activeRole: updatedUser.role,
      teamMembers: prev.teamMembers.some(
        (m) =>
          m.id === updatedUser.id ||
          m.email.toLowerCase() === updatedUser.email.toLowerCase(),
      )
        ? prev.teamMembers.map((m) =>
            m.id === updatedUser.id ||
            m.email.toLowerCase() === updatedUser.email.toLowerCase()
              ? updatedUser
              : m,
          )
        : [updatedUser, ...prev.teamMembers],
      notifications: pendingNotif
        ? [pendingNotif, ...prev.notifications]
        : prev.notifications,
    }));
    if (pendingNotif) {
      void dataService.notifications.create(pendingNotif);
    }
    pushToast(
      `Welcome, ${updatedUser.name}`,
      updatedUser.approvalStatus === 'approved' || isSuperAdminEmail(updatedUser.email)
        ? `${updatedUser.department} · ${updatedUser.employeeId} · ${updatedUser.role}`
        : updatedUser.approvalStatus === 'deactivated'
          ? `${updatedUser.department} · ${updatedUser.employeeId} · Account Deactivated`
          : updatedUser.approvalStatus === 'rejected'
            ? `${updatedUser.department} · ${updatedUser.employeeId} · Access Declined`
            : `${updatedUser.department} · ${updatedUser.employeeId} · Account Pending Admin Approval`,
      updatedUser.approvalStatus === 'approved' || isSuperAdminEmail(updatedUser.email)
        ? 'success'
        : 'info',
    );
  };

  const handleRegisterUser = async (
    payload: RegisterUserPayload,
    rememberSession: boolean,
  ): Promise<SignUpOutcome> => {
    const result = await dataService.auth.registerUser(payload, rememberSession);
    const registered = result.user;

    const pendingAdminNotif: AppNotification | null =
      !isSuperAdminEmail(registered.email) && (registered.approvalStatus ?? 'pending') === 'pending'
        ? {
            id: `notif-reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: 'New User Awaiting Approval',
            message: `${registered.name} (${registered.email}) registered and awaits Admin approval.`,
            timestamp: new Date().toISOString(),
            read: false,
            targetSection: 'settings',
            recipientRole: 'Admin',
            actorEmail: registered.email,
            category: 'user_approval',
            severity: 'warning',
          }
        : null;

    setState((prev) => ({
      ...prev,
      teamMembers: [
        registered,
        ...prev.teamMembers.filter(
          (m) =>
            m.id !== registered.id &&
            m.email.toLowerCase() !== registered.email.toLowerCase(),
        ),
      ],
      notifications: pendingAdminNotif
        ? [pendingAdminNotif, ...prev.notifications]
        : prev.notifications,
    }));

    if (pendingAdminNotif) {
      void dataService.notifications.create(pendingAdminNotif);
    }

    if (result.status === 'confirmation_required') {
      pushToast(
        'Account Registered (Pending Verification)',
        `Verify ${result.email} and wait for Admin approval before accessing company data.`,
        'info',
      );
      return { status: 'confirmation_required', email: result.email };
    }

    setAuthSession(result.session);
    if (registered.role === 'Admin') {
      setIsAdminInitialized(true);
    }
    pushToast(
      isSuperAdminEmail(registered.email)
        ? 'Super Admin Verified'
        : 'Account Pending Admin Approval',
      isSuperAdminEmail(registered.email)
        ? `${registered.email} signed in with permanent Super Admin rights.`
        : 'Please contact your administrator to approve your account and assign your role.',
      isSuperAdminEmail(registered.email) ? 'success' : 'info',
    );
    return { status: 'signed_in' };
  };

  const handleRefreshApprovalStatus = async () => {
    if (!authSession) return;
    let refreshed: TeamMember | null = null;
    try {
      refreshed = await dataService.auth.refreshUserProfile(
        authSession.userId,
        authSession.userEmail,
        currentUser,
        true,
      );
    } catch (err) {
      pushToast(
        'Unable to Check Cloud Status',
        err instanceof Error ? err.message : 'Could not reach Supabase profiles table.',
        'error',
      );
      return;
    }

    if (!refreshed) {
      pushToast(
        'No Active Access Record Found',
        'Sign out and log in again to submit a fresh approval request.',
        'info',
      );
      return;
    }

    setState((prev) => ({
      ...prev,
      activeRole: refreshed.role,
      teamMembers: prev.teamMembers.some(
        (m) =>
          m.id === refreshed.id ||
          m.email.toLowerCase() === refreshed.email.toLowerCase(),
      )
        ? prev.teamMembers.map((m) =>
            m.id === refreshed.id ||
            m.email.toLowerCase() === refreshed.email.toLowerCase()
              ? refreshed
              : m,
          )
        : [refreshed, ...prev.teamMembers],
    }));

    const updatedSession: AuthSession = {
      ...authSession,
      userId: refreshed.id,
      employeeId: refreshed.employeeId,
      userName: refreshed.name,
      userDepartment: refreshed.department,
      userRole: refreshed.role,
      approvalStatus: refreshed.approvalStatus,
      isSuperAdmin: refreshed.isSuperAdmin,
    };
    dataService.auth.saveSessionSync(updatedSession);
    setAuthSession(updatedSession);

    if (refreshed.approvalStatus === 'approved' && refreshed.active) {
      pushToast(
        'Account Approved',
        `Access granted as ${refreshed.role}. Loading NexOps workspace...`,
        'success',
      );
      void syncFromSupabase(false, true);
    } else if (refreshed.approvalStatus === 'rejected') {
      pushToast(
        'Access Request Declined',
        'Please contact your System Administrator.',
        'error',
      );
    } else {
      pushToast(
        'Still Pending Admin Approval',
        'Your administrator has not approved this account yet.',
        'info',
      );
    }
  };

  const handleResetPassword = async (email: string) => {
    const res = await dataService.auth.resetPasswordForEmail(email);
    pushToast(
      res.emailSent ? 'Password Reset Email Sent' : 'Password Recovery Ready',
      res.message,
      'info',
    );
    return res;
  };

  const handleCompletePasswordReset = async (email: string, newPassword: string) => {
    const res = await dataService.auth.completePasswordReset(email, newPassword);
    setPasswordRecoveryState({ active: false, email: '' });
    pushToast(
      'Password Updated',
      res.cloudUpdated
        ? `Supabase password updated for ${email.trim().toLowerCase()}.`
        : `New password saved for ${email.trim().toLowerCase()}.`,
      'success',
    );
    return res;
  };

  const handleRegisterInitialAdmin = async (
    payload: InitialAdminPayload,
    rememberSession: boolean,
  ): Promise<SignUpOutcome> => {
    const result = await dataService.auth.registerInitialAdmin(payload, rememberSession);
    const adminUser = result.user;

    const initAudit: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      requestId: 'AUTH-PRIMARY-ADMIN',
      timestamp: new Date().toISOString(),
      actorName: adminUser.name,
      actorRole: 'Admin',
      actorSignOffTitle: adminUser.signOffTitle || adminUser.title,
      actionType: 'Team Updated',
      details: `Initialized Primary System Administrator ${adminUser.name} (${adminUser.employeeId}, ${adminUser.email}). Registration locked to Admin-only.`,
    };

    setIsAdminInitialized(true);

    if (result.status === 'confirmation_required') {
      setState((prev) => ({
        ...prev,
        teamMembers: [
          adminUser,
          ...prev.teamMembers.filter(
            (m) =>
              m.id !== adminUser.id &&
              m.email.toLowerCase() !== adminUser.email.toLowerCase(),
          ),
        ],
        globalAuditLogs: [initAudit, ...prev.globalAuditLogs],
      }));
      pushToast(
        'Administrator Created',
        `Confirm ${result.email} to activate your session. Public registration is now locked.`,
        'info',
      );
      return { status: 'confirmation_required', email: result.email };
    }

    setAuthSession(result.session);
    setState((prev) => {
      const filtered = prev.teamMembers.filter(
        (m) =>
          m.id !== adminUser.id &&
          m.email.toLowerCase() !== adminUser.email.toLowerCase(),
      );
      return {
        ...prev,
        activeRole: 'Admin',
        teamMembers: [adminUser, ...filtered],
        globalAuditLogs: [initAudit, ...prev.globalAuditLogs],
      };
    });
    void dataService.auditLogs.append(initAudit).catch(handleCloudWriteError);
    pushToast(
      'Primary Administrator Initialized',
      `${adminUser.name} (${adminUser.employeeId}) signed in. Registration locked to Admin-only.`,
      'success',
    );
    return { status: 'signed_in' };
  };

  const handleSignOut = () => {
    if (currentUser.id !== 'unauthenticated') {
      void presenceChannelRef.current?.untrack();
      dataService.team.sendPresenceBeacon({
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
      });
    }
    setOnlinePresenceKeys(new Set());
    setGoogleToken(null);
    setGoogleEmail(null);
    setGoogleDisplayName(null);
    setGooglePhotoUrl(null);
    setAuthSession(null);
    setSelectedRequestId(null);
    setCreateModalOpen(false);
    setImportModalOpen(false);
    setTemplateSource(null);
    setEditingRequest(null);
    setProfileModalOpen(false);
    setReportModalState({ open: false, requestId: null });
    setMobileMenuOpen(false);
    pushToast('Signed Out', 'Corporate session closed securely.', 'info');
    void dataService.auth.signOut().catch(() => {});
    void disconnectGoogleWorkspace().catch(() => {});
  };

  const handleGoogleWorkspaceSignIn = async () => {
    setGoogleConnecting(true);
    try {
      const { user, accessToken } = await signInWithGoogleWorkspace();
      setGoogleToken(accessToken);
      setGoogleEmail(user.email ?? null);
      setGoogleDisplayName(user.displayName ?? null);
      setGooglePhotoUrl(user.photoURL ?? null);
      pushToast(
        'Google Workspace Verified',
        `Connected as ${user.email || 'Google Account'} across Gmail, Docs, Sheets & Forms.`,
        'success',
      );
    } catch (err) {
      pushToast(
        'Google Verification Cancelled or Failed',
        err instanceof Error ? err.message : 'Unable to verify Google account.',
        'warning',
      );
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleGoogleWorkspaceDisconnect = async () => {
    await disconnectGoogleWorkspace();
    setGoogleToken(null);
    setGoogleEmail(null);
    setGoogleDisplayName(null);
    setGooglePhotoUrl(null);
    pushToast('Google Account Disconnected', 'Cleared active Google Workspace access token.', 'info');
  };

  // Global search from TopBar
  const handleGlobalSearchChange = (val: string) => {
    setSearchQuery(val);
    if (val.trim().length > 0 && activeSection !== 'requests') {
      setActiveSection('requests');
    }
  };

  // Navigate to queue with optional status preset
  const handleNavigateToQueue = (status: RequestStatus | 'All' = 'All') => {
    setStatusFilter(status);
    setOverdueOnly(false);
    setActiveSection('requests');
  };

  // Maker-Checker Governance Helper for Editor Role
  const submitEditorChangeProposal = (params: {
    module: PendingEditorChangeModule;
    moduleLabel: string;
    action: PendingEditorChangeAction;
    targetId: string;
    itemLabel: string;
    summary: string;
    diffs: PendingEditorChangeDiff[];
    payload: EditorChangePayload;
  }) => {
    const now = new Date().toISOString();
    const changeId = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pendingChange: PendingEditorChange = {
      id: changeId,
      module: params.module,
      moduleLabel: params.moduleLabel,
      action: params.action,
      targetId: params.targetId,
      itemLabel: params.itemLabel,
      summary: params.summary,
      diffs: params.diffs,
      editorId: currentUser.id,
      editorName: currentUser.name,
      editorEmail: currentUser.email,
      editorDepartment: currentUser.department,
      submittedAt: now,
      status: 'pending',
      payload: params.payload,
    };

    const adminNotif: AppNotification = {
      id: `notif-ed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Editor Approval Needed · ${params.moduleLabel}`,
      message: `${currentUser.name} proposed: ${params.summary}`,
      timestamp: now,
      read: false,
      targetSection: 'settings',
      recipientRole: 'Admin',
      actorEmail: currentUser.email,
      category: 'editor_approval',
      severity: 'warning',
    };

    const auditEntry = createAuditEvent(
      params.targetId || params.module.toUpperCase(),
      'Team Updated',
      `[Maker-Checker Pending] Editor ${currentUser.name} (${currentUser.email}) submitted ${params.action} proposal in ${params.moduleLabel}: ${params.summary}`,
    );

    const nextPendingChanges = [pendingChange, ...state.pendingEditorChanges];
    setState((prev) => ({
      ...prev,
      pendingEditorChanges: [pendingChange, ...prev.pendingEditorChanges],
      notifications: [adminNotif, ...prev.notifications],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void Promise.all([
      dataService.editorChanges.saveAll(nextPendingChanges, currentUser.name, auditEntry),
      dataService.notifications.create(adminNotif),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      'Submitted!',
      'Your edit has been sent to the Super Admin for approval.',
      'info',
    );
  };

  // Open Create / Edit Modal fresh, from template, or in Edit mode
  const handleOpenBlankCreateModal = () => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    setEditingRequest(null);
    setTemplateSource(null);
    setCreateModalOpen(true);
  };

  const handleDuplicateRequest = (req: OperationalRequest) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    setSelectedRequestId(null);
    setEditingRequest(null);
    setTemplateSource(req);
    setCreateModalOpen(true);
  };

  const handleOpenEditRequestModal = (req: OperationalRequest) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    setSelectedRequestId(null);
    setTemplateSource(null);
    setEditingRequest(req);
    setCreateModalOpen(true);
  };

  // Create new request (Admin direct or Editor Maker-Checker)
  const handleCreateRequest = (payload: CreateRequestPayload) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const now = new Date().toISOString();
    const newId = generateNextRequestId(state.requests);
    const initialStatus: RequestStatus = payload.submitImmediately ? 'Submitted' : 'Draft';

    const templateNote = payload.clonedFromId
      ? ` (duplicated from template ${payload.clonedFromId})`
      : '';
    const projectNote = payload.projectCode ? ` [Project: ${payload.projectCode}]` : '';
    const assetNote = payload.assetTag ? ` [Asset: ${payload.assetTag}]` : '';
    const budgetNote =
      payload.estimatedCost > 0
        ? ` [Budget: ${payload.currency} ${payload.estimatedCost.toLocaleString()}]`
        : '';

    const reviewerResolution = resolveEffectiveReviewer(defaultReviewerName, state.teamMembers);
    const delegateNote = reviewerResolution.delegatedFromReviewer
      ? ` (Auto-delegated from ${reviewerResolution.delegatedFromReviewer} OOO to ${reviewerResolution.assignedReviewer})`
      : '';

    const auditEntry = createAuditEvent(
      newId,
      'Created',
      payload.submitImmediately
        ? `Created operational request ${newId}${templateNote}${projectNote}${assetNote}${budgetNote} and submitted directly for QA review.${delegateNote}`
        : `Saved draft operational request ${newId}${templateNote}${projectNote}${assetNote}${budgetNote}.${delegateNote}`,
    );

    const newRequest: OperationalRequest = {
      id: newId,
      title: payload.title,
      category: payload.category,
      department: payload.department,
      submittedBy: currentActor.name,
      submitterId: currentActor.id,
      assignedReviewer: reviewerResolution.assignedReviewer,
      delegatedFromReviewer: reviewerResolution.delegatedFromReviewer,
      priority: payload.priority,
      status: initialStatus,
      dueDate: payload.dueDate,
      createdAt: now,
      updatedAt: now,
      description: payload.description,
      deliverableUrl: payload.deliverableUrl,
      projectId: payload.projectId,
      projectCode: payload.projectCode,
      projectName: payload.projectName,
      assetId: payload.assetId,
      assetTag: payload.assetTag,
      assetName: payload.assetName,
      currency: payload.currency,
      estimatedCost: payload.estimatedCost,
      actualSpend: payload.actualSpend,
      checklist: payload.checklist.map((item, idx) => ({
        id: `chk-${newId}-${idx + 1}`,
        label: item.label,
        mandatory: item.mandatory,
        checked: false,
      })),
      auditTrail: [auditEntry],
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'create',
        targetId: newId,
        itemLabel: `${newId} · ${payload.title}`,
        summary: `Create operational request "${payload.title}" (${payload.department}, Priority: ${payload.priority}, Status: ${initialStatus})`,
        diffs: [
          { field: 'Title', before: '— (New Request)', after: payload.title },
          { field: 'Department', before: '—', after: payload.department },
          { field: 'Category', before: '—', after: payload.category },
          { field: 'Priority', before: '—', after: payload.priority },
          { field: 'Due Date', before: '—', after: payload.dueDate },
          ...(payload.estimatedCost > 0
            ? [
                {
                  field: 'Estimated Budget',
                  before: '—',
                  after: formatCurrency(payload.estimatedCost, payload.currency),
                },
              ]
            : []),
        ],
        payload: {
          op: 'request_create',
          request: newRequest,
        },
      });
      setCreateModalOpen(false);
      setTemplateSource(null);
      setEditingRequest(null);
      setActiveSection('requests');
      return;
    }

    const reviewerMember = state.teamMembers.find(
      (m) => m.name.trim().toLowerCase() === reviewerResolution.assignedReviewer.trim().toLowerCase(),
    );

    const notification: AppNotification | null =
      payload.submitImmediately || reviewerMember
        ? {
            id: `notif-${Date.now()}`,
            title: payload.submitImmediately
              ? `Task Assigned & Submitted: ${newId}`
              : `Draft Task Assigned: ${newId}`,
            message: `${currentActor.name} created ${newId} ("${payload.title}") assigned to ${reviewerResolution.assignedReviewer || 'Operations QA'}.`,
            timestamp: now,
            read: false,
            requestId: newId,
            targetSection: 'requests',
            recipientEmail: reviewerMember?.email,
            recipientRole: reviewerMember ? undefined : 'Admin',
            actorEmail: currentActor.email,
            category: 'task',
            severity: payload.priority === 'Urgent' ? 'warning' : 'info',
          }
        : null;

    const linkedUpdatedAsset: CompanyAsset | undefined = payload.assetId
      ? state.assets.find((ast) => ast.id === payload.assetId || ast.tag === payload.assetTag)
      : undefined;

    const updatedAssetWithHistory: CompanyAsset | undefined = linkedUpdatedAsset
      ? {
          ...linkedUpdatedAsset,
          updatedAt: now,
          history: [
            {
              id: `ah-req-${Date.now()}`,
              timestamp: now,
              actorName: currentActor.name,
              eventType: 'Request Linked',
              details: `Linked to ${payload.category} ${newId} ("${payload.title}") — Status: ${initialStatus}.`,
              requestId: newId,
            },
            ...linkedUpdatedAsset.history,
          ],
        }
      : undefined;

    setState((prev) => ({
      ...prev,
      requests: [newRequest, ...prev.requests],
      assets: updatedAssetWithHistory
        ? prev.assets.map((ast) =>
            ast.id === updatedAssetWithHistory.id ? updatedAssetWithHistory : ast,
          )
        : prev.assets,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: notification ? [notification, ...prev.notifications] : prev.notifications,
    }));

    void Promise.all([
      dataService.requests.create(newRequest, auditEntry, notification),
      notification ? dataService.notifications.create(notification) : Promise.resolve(),
      updatedAssetWithHistory
        ? dataService.assets.upsert(updatedAssetWithHistory)
        : Promise.resolve(),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    setCreateModalOpen(false);
    setTemplateSource(null);
    setEditingRequest(null);
    setActiveSection('requests');
    setSelectedRequestId(newId);
    pushToast(
      payload.submitImmediately ? `Submitted ${newId}` : `Saved Draft ${newId}`,
      payload.title,
      'success',
    );
  };

  // Edit existing operational request (Admin direct or Editor Maker-Checker)
  const handleEditRequest = (requestId: string, payload: CreateRequestPayload) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;

    const nextChecklist = payload.checklist.map((item, idx) => {
      const existing = target.checklist.find(
        (c) => c.label.trim().toLowerCase() === item.label.trim().toLowerCase(),
      );
      return (
        existing ?? {
          id: `chk-${requestId}-${Date.now()}-${idx + 1}`,
          label: item.label,
          mandatory: item.mandatory,
          checked: false,
        }
      );
    });

    const diffs: PendingEditorChangeDiff[] = [];
    if (target.title !== payload.title) {
      diffs.push({ field: 'Title', before: target.title, after: payload.title });
    }
    if (target.category !== payload.category) {
      diffs.push({ field: 'Category', before: target.category, after: payload.category });
    }
    if (target.department !== payload.department) {
      diffs.push({ field: 'Department', before: target.department, after: payload.department });
    }
    if (target.priority !== payload.priority) {
      diffs.push({ field: 'Priority', before: target.priority, after: payload.priority });
    }
    if (target.dueDate !== payload.dueDate) {
      diffs.push({ field: 'Due Date', before: target.dueDate, after: payload.dueDate });
    }
    if (target.description !== payload.description) {
      diffs.push({
        field: 'Description',
        before: target.description.slice(0, 80) || '—',
        after: payload.description.slice(0, 80) || '—',
      });
    }
    if ((target.deliverableUrl || '') !== (payload.deliverableUrl || '')) {
      diffs.push({
        field: 'Deliverable URL',
        before: target.deliverableUrl || '—',
        after: payload.deliverableUrl || '—',
      });
    }
    if ((target.projectCode || '') !== (payload.projectCode || '')) {
      diffs.push({
        field: 'Linked Project',
        before: target.projectCode || 'None',
        after: payload.projectCode || 'None',
      });
    }
    if ((target.assetTag || '') !== (payload.assetTag || '')) {
      diffs.push({
        field: 'Linked Asset',
        before: target.assetTag || 'None',
        after: payload.assetTag || 'None',
      });
    }
    if ((target.currency || 'USD') !== payload.currency) {
      diffs.push({
        field: 'Currency',
        before: target.currency || 'USD',
        after: payload.currency,
      });
    }
    if ((target.estimatedCost ?? 0) !== payload.estimatedCost) {
      diffs.push({
        field: 'Estimated Budget',
        before: formatCurrency(target.estimatedCost ?? 0, target.currency || 'USD'),
        after: formatCurrency(payload.estimatedCost, payload.currency),
      });
    }
    if ((target.actualSpend ?? 0) !== payload.actualSpend) {
      diffs.push({
        field: 'Actual Spend',
        before: formatCurrency(target.actualSpend ?? 0, target.currency || 'USD'),
        after: formatCurrency(payload.actualSpend, payload.currency),
      });
    }
    const prevChecklistSig = target.checklist.map((c) => `${c.label}:${c.mandatory}`).join('|');
    const nextChecklistSig = nextChecklist.map((c) => `${c.label}:${c.mandatory}`).join('|');
    if (prevChecklistSig !== nextChecklistSig) {
      diffs.push({
        field: 'QA Checklist Gates',
        before: `${target.checklist.length} gates`,
        after: `${nextChecklist.length} gates`,
      });
    }

    if (diffs.length === 0) {
      setCreateModalOpen(false);
      setEditingRequest(null);
      pushToast('No Changes Detected', `${requestId} details remain unchanged.`, 'info');
      return;
    }

    const patch = {
      title: payload.title,
      category: payload.category,
      department: payload.department,
      priority: payload.priority,
      dueDate: payload.dueDate,
      description: payload.description,
      deliverableUrl: payload.deliverableUrl,
      projectId: payload.projectId,
      projectCode: payload.projectCode,
      projectName: payload.projectName,
      assetId: payload.assetId,
      assetTag: payload.assetTag,
      assetName: payload.assetName,
      currency: payload.currency,
      estimatedCost: payload.estimatedCost,
      actualSpend: payload.actualSpend,
      checklist: nextChecklist,
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · ${target.title}`,
        summary: `Edit ${requestId} (${diffs.map((d) => d.field).join(', ')})`,
        diffs,
        payload: {
          op: 'request_update',
          requestId,
          patch,
        },
      });
      setCreateModalOpen(false);
      setEditingRequest(null);
      return;
    }

    const now = new Date().toISOString();
    const auditEntry = createAuditEvent(
      requestId,
      'Comment Added',
      `Updated request ${requestId} fields (${diffs.map((d) => d.field).join(', ')}).`,
    );
    const updatedRequest: OperationalRequest = {
      ...target,
      ...patch,
      updatedAt: now,
      auditTrail: [...target.auditTrail, auditEntry],
    };

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((r) => (r.id === requestId ? updatedRequest : r)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.requests
      .updateContent(updatedRequest, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    setCreateModalOpen(false);
    setEditingRequest(null);
    setSelectedRequestId(requestId);
    pushToast(`Updated ${requestId}`, `Saved ${diffs.length} field update(s).`, 'success');
  };

  // Delete operational request
  const handleDeleteRequest = (requestId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'delete',
        targetId: requestId,
        itemLabel: `${requestId} · ${target.title}`,
        summary: `Delete operational request ${requestId} ("${target.title}")`,
        diffs: [
          {
            field: 'Record Status',
            before: `${target.status} (${target.department})`,
            after: 'Delete Requested',
          },
        ],
        payload: {
          op: 'request_delete',
          requestId,
        },
      });
      if (selectedRequestId === requestId) {
        setSelectedRequestId(null);
      }
      return;
    }

    const auditEntry = createAuditEvent(
      requestId,
      'Task Deleted',
      `Deleted operational request ${requestId} ("${target.title}", Department: ${target.department}, Status: ${target.status}).`,
    );

    setState((prev) => ({
      ...prev,
      requests: prev.requests.filter((r) => r.id !== requestId),
      subtasks: prev.subtasks.filter((st) => st.requestId !== requestId),
      taskComments: prev.taskComments.filter((cmt) => cmt.requestId !== requestId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    if (selectedRequestId === requestId) {
      setSelectedRequestId(null);
    }

    void dataService.requests
      .remove(requestId, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(`Deleted ${requestId}`, `"${target.title}" removed from queue.`, 'info');
  };

  // Toggle QA checklist item
  const handleToggleChecklistItem = (requestId: string, itemId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;
    const item = target.checklist.find((c) => c.id === itemId);
    if (!item) return;

    const toggledLabel = item.label;
    const nextChecked = !item.checked;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · QA Gate`,
        summary: `${nextChecked ? 'Verify' : 'Uncheck'} QA gate "${toggledLabel}" on ${requestId}`,
        diffs: [
          {
            field: `QA Gate: ${toggledLabel}`,
            before: item.checked ? 'Verified' : 'Unchecked',
            after: nextChecked ? 'Verified' : 'Unchecked',
          },
        ],
        payload: {
          op: 'request_toggle_checklist',
          requestId,
          itemId,
          nextChecked,
          label: toggledLabel,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const verifier = getActorForRole(state.activeRole, state.teamMembers);

    const updatedChecklist = target.checklist.map((chk) =>
      chk.id === itemId
        ? {
            ...chk,
            checked: nextChecked,
            verifiedBy: nextChecked ? verifier.name : undefined,
            verifiedAt: nextChecked ? now : undefined,
          }
        : chk,
    );

    const auditEntry = createAuditEvent(
      requestId,
      'Checklist Updated',
      `${nextChecked ? 'Verified' : 'Unchecked'} QA gate: "${toggledLabel}"`,
      state.activeRole,
      state.teamMembers,
    );

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((req) =>
        req.id === requestId
          ? {
              ...req,
              updatedAt: now,
              checklist: updatedChecklist,
              auditTrail: [...req.auditTrail, auditEntry],
            }
          : req,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.checklists
      .updateRequestChecklist(requestId, updatedChecklist, now, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      nextChecked ? 'QA Gate Verified' : 'QA Gate Unchecked',
      toggledLabel,
      nextChecked ? 'success' : 'info',
    );
  };

  // Stage 1 Editor / QA Sign-Off for Two-Tier Escalated Approval Chain
  const handleStage1SignOff = (requestId: string, comment?: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const now = new Date().toISOString();

    const stage1SignOff: ApprovalStageSignOff = {
      actorName: actor.name,
      actorRole: actor.role,
      signOffTitle: actor.signOffTitle || actor.title,
      timestamp: now,
    };

    const detailText = comment
      ? `Stage 1 Approved (Manager / QA Review) by ${actor.name}. Awaiting Executive / Admin Stage 2 Final Sign-Off. Remarks: ${comment}`
      : `Stage 1 Approved (Manager / QA Review) by ${actor.name}. Routed to Executive / Admin for Stage 2 Final Sign-Off.`;

    const auditEntry = createAuditEvent(requestId, 'Status Changed', detailText, state.activeRole);
    const notification: AppNotification = {
      id: `notif-s1-${Date.now()}`,
      title: `${requestId} Stage 1 Approved`,
      message: `${actor.name} completed QA Stage 1 review. Awaiting Executive / Admin final sign-off.`,
      timestamp: now,
      read: false,
      requestId,
      severity: 'info',
    };

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((req) =>
        req.id === requestId
          ? {
              ...req,
              status: 'Under QA Review',
              updatedAt: now,
              stage1Approval: stage1SignOff,
              auditTrail: [...req.auditTrail, auditEntry],
            }
          : req,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    dataService.requests.updateMetaSync(requestId, { stage1Approval: stage1SignOff });
    void dataService.requests
      .updateStatus(requestId, 'Under QA Review', undefined, now, auditEntry, notification)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      `Stage 1 Signed Off · ${requestId}`,
      'Routed to Executive / Admin for Stage 2 final approval.',
      'info',
    );
  };

  // Update Cost-Center Actual Spend on an individual request
  const handleUpdateRequestFinancials = (requestId: string, actualSpend: number) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;
    const cur = target.currency || 'USD';

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · Financials`,
        summary: `Update actual spend on ${requestId} to ${formatCurrency(actualSpend, cur)}`,
        diffs: [
          {
            field: 'Actual Spend',
            before: formatCurrency(target.actualSpend ?? 0, cur),
            after: formatCurrency(actualSpend, cur),
          },
        ],
        payload: {
          op: 'request_update_financials',
          requestId,
          actualSpend,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const auditEntry = createAuditEvent(
      requestId,
      'Comment Added',
      `Updated cost-center actual spend on ${requestId} to ${formatCurrency(actualSpend, cur)} (Estimated Budget: ${formatCurrency(target.estimatedCost ?? 0, cur)}).`,
      state.activeRole,
    );

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((req) =>
        req.id === requestId
          ? {
              ...req,
              actualSpend,
              updatedAt: now,
              auditTrail: [...req.auditTrail, auditEntry],
            }
          : req,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    dataService.requests.updateMetaSync(requestId, { actualSpend });
    void Promise.all([
      dataService.auditLogs.append(auditEntry),
      dataService.requests.syncMetaCloud(requestId, { actualSpend }, currentUser.name),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      `Actual Spend Updated · ${requestId}`,
      `Recorded ${formatCurrency(actualSpend, cur)}.`,
      'success',
    );
  };

  // Transition request workflow status
  const handleTransitionStatus = (
    requestId: string,
    nextStatus: RequestStatus,
    comment?: string,
  ) => {
    if (currentUser.role !== 'Admin') return;
    const targetBefore = state.requests.find((r) => r.id === requestId);
    if (!targetBefore) return;

    const thresholdUsd = branding.approvalBudgetThresholdUsd ?? 5000;
    const isTwoTier = requiresTwoTierApproval(targetBefore, thresholdUsd);

    if (nextStatus === 'Approved' && isTwoTier) {
      if (!targetBefore.stage1Approval) {
        pushToast(
          'Two-Tier Approval Enforced',
          `Complete Stage 1 (Manager / QA Review) before granting final approval on ${requestId}.`,
          'warning',
        );
        return;
      }
      if (currentUser.role !== 'Admin') {
        pushToast(
          'Admin Sign-Off Required',
          `Stage 2 Executive Final Sign-Off on ${requestId} requires an Admin account.`,
          'warning',
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const stage2SignOff: ApprovalStageSignOff | undefined =
      nextStatus === 'Approved' && isTwoTier
        ? {
            actorName: actor.name,
            actorRole: actor.role,
            signOffTitle: actor.signOffTitle || actor.title,
            timestamp: now,
          }
        : undefined;
    const shouldClearStages =
      nextStatus === 'Revision Required' || nextStatus === 'Submitted' || nextStatus === 'Draft';

    const detailText =
      nextStatus === 'Approved' && isTwoTier
        ? `Stage 2 Executive Final Sign-Off & Approved from ${targetBefore.status} by ${actor.name}.${comment ? ` Remarks: ${comment}` : ''}`
        : comment
          ? `Transitioned status from ${targetBefore.status} to ${nextStatus}. Remarks: ${comment}`
          : `Transitioned status from ${targetBefore.status} to ${nextStatus}.`;

    const syncAudit = createAuditEvent(requestId, 'Status Changed', detailText, state.activeRole);

    const submitterMember = state.teamMembers.find(
      (m) =>
        m.id === targetBefore.submitterId ||
        m.name.trim().toLowerCase() === targetBefore.submittedBy.trim().toLowerCase(),
    );

    const statusNotifId = `notif-${Date.now()}`;
    const statusNotifSeverity: AppNotification['severity'] =
      nextStatus === 'Approved'
        ? 'success'
        : nextStatus === 'Revision Required'
          ? 'warning'
          : nextStatus === 'Rejected'
            ? 'danger'
            : 'info';

    const syncNotif: AppNotification = {
      id: statusNotifId,
      title:
        nextStatus === 'Approved'
          ? `Task Completed: ${requestId}`
          : `${requestId} marked ${nextStatus}`,
      message: comment
        ? `${actor.name}: ${comment}`
        : `${actor.name} moved ${requestId} ("${targetBefore.title}") to ${nextStatus}.`,
      timestamp: now,
      read: false,
      requestId,
      targetSection: 'requests',
      recipientEmail: submitterMember?.email,
      actorEmail: actor.email,
      category: 'task',
      severity: statusNotifSeverity,
    };

    setState((prev) => {
      const target = prev.requests.find((r) => r.id === requestId);
      if (!target) return prev;

      const updatedRequests = prev.requests.map((req) => {
        if (req.id !== requestId) return req;
        return {
          ...req,
          status: nextStatus,
          updatedAt: now,
          stage1Approval: shouldClearStages ? undefined : req.stage1Approval,
          stage2Approval: shouldClearStages
            ? undefined
            : stage2SignOff ?? req.stage2Approval,
          revisionReason:
            nextStatus === 'Revision Required'
              ? comment
              : nextStatus === 'Submitted' || nextStatus === 'Approved'
                ? undefined
                : req.revisionReason,
          auditTrail: [...req.auditTrail, syncAudit],
        };
      });

      const shouldLogAssetApproval =
        nextStatus === 'Approved' && Boolean(target.assetId || target.assetTag);

      const updatedAssets = shouldLogAssetApproval
        ? prev.assets.map((ast) => {
            if (ast.id !== target.assetId && ast.tag !== target.assetTag) return ast;
            const historyEntry: AssetHistoryEntry = {
              id: `ah-app-${Date.now()}`,
              timestamp: now,
              actorName: actor.name,
              eventType: 'Request Approved',
              details: `Approved ${target.category} ${requestId} ("${target.title}") for ${target.submittedBy}${comment ? ` — Remarks: ${comment}` : '.'}`,
              requestId,
            };
            return {
              ...ast,
              updatedAt: now,
              history: [historyEntry, ...ast.history],
            };
          })
        : prev.assets;

      return {
        ...prev,
        requests: updatedRequests,
        assets: updatedAssets,
        globalAuditLogs: [syncAudit, ...prev.globalAuditLogs],
        notifications: [syncNotif, ...prev.notifications],
      };
    });

    if (shouldClearStages) {
      dataService.requests.updateMetaSync(requestId, {
        stage1Approval: null,
        stage2Approval: null,
      });
    } else if (stage2SignOff) {
      dataService.requests.updateMetaSync(requestId, {
        stage2Approval: stage2SignOff,
      });
    }

    const approvedLinkedAssetBefore =
      nextStatus === 'Approved' && (targetBefore.assetId || targetBefore.assetTag)
        ? state.assets.find(
            (ast) => ast.id === targetBefore.assetId || ast.tag === targetBefore.assetTag,
          )
        : undefined;
    const approvedLinkedAssetNext: CompanyAsset | undefined = approvedLinkedAssetBefore
      ? {
          ...approvedLinkedAssetBefore,
          updatedAt: now,
          history: [
            {
              id: `ah-app-${Date.now()}`,
              timestamp: now,
              actorName: actor.name,
              eventType: 'Request Approved',
              details: `Approved ${targetBefore.category} ${requestId} ("${targetBefore.title}") for ${targetBefore.submittedBy}${comment ? ` — Remarks: ${comment}` : '.'}`,
              requestId,
            },
            ...approvedLinkedAssetBefore.history,
          ],
        }
      : undefined;

    void Promise.all([
      dataService.requests.updateStatus(
        requestId,
        nextStatus,
        nextStatus === 'Revision Required' ? comment : undefined,
        now,
        syncAudit,
        syncNotif,
      ),
      dataService.notifications.create(syncNotif),
      approvedLinkedAssetNext
        ? dataService.assets.upsert(approvedLinkedAssetNext)
        : Promise.resolve(),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    const toastVariant: ToastMessage['variant'] =
      nextStatus === 'Approved'
        ? 'success'
        : nextStatus === 'Rejected'
          ? 'error'
          : nextStatus === 'Revision Required'
            ? 'warning'
            : 'info';

    pushToast(`${requestId} → ${nextStatus}`, comment || 'Workflow state updated and logged.', toastVariant);
  };

  // Add comment to audit trail
  const handleAddComment = (requestId: string, comment: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    if (currentUser.role === 'Editor') {
      const target = state.requests.find((r) => r.id === requestId);
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · Audit Note`,
        summary: `Add audit note to ${requestId}: "${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}"`,
        diffs: [{ field: 'Audit Trail Note', before: '—', after: comment }],
        payload: {
          op: 'request_add_comment',
          requestId,
          comment,
        },
      });
      if (target) return;
      return;
    }
    const now = new Date().toISOString();
    setState((prev) => {
      const auditEntry = createAuditEvent(
        requestId,
        'Comment Added',
        comment,
        prev.activeRole,
      );
      return {
        ...prev,
        requests: prev.requests.map((req) =>
          req.id === requestId
            ? { ...req, updatedAt: now, auditTrail: [...req.auditTrail, auditEntry] }
            : req,
        ),
        globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      };
    });
    const syncAudit = createAuditEvent(requestId, 'Comment Added', comment, state.activeRole);
    void dataService.auditLogs
      .append(syncAudit)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Audit Note Recorded', `Comment added to ${requestId}`, 'info');
  };

  // Escalate high-priority or overdue request to Admin
  const handleEscalateRequest = (requestId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;

    const now = new Date().toISOString();
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const auditEntry = createAuditEvent(
      requestId,
      'Status Changed',
      `Escalated ${requestId} to System Admin by ${actor.name} (${actor.role}). Priority elevated from ${target.priority} to Urgent for immediate SLA resolution.`,
      state.activeRole,
      state.teamMembers,
    );

    const escalationNotification: AppNotification = {
      id: `notif-esc-${Date.now()}`,
      title: `SLA Escalation: ${requestId}`,
      message: `${actor.name} escalated "${target.title}" to Admin (Priority: Urgent, Due: ${target.dueDate}).`,
      timestamp: now,
      read: false,
      requestId,
      severity: 'danger',
    };

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((req) =>
        req.id === requestId
          ? {
              ...req,
              priority: 'Urgent',
              updatedAt: now,
              auditTrail: [...req.auditTrail, auditEntry],
            }
          : req,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [escalationNotification, ...prev.notifications],
    }));

    void dataService.requests
      .escalateToAdmin(requestId, now, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      `Escalated ${requestId} to Admin`,
      'Priority set to Urgent, audit event logged, and high-priority alert dispatched.',
      'warning',
    );
  };

  // Projects & Clients Directory Handlers
  const handleCreateProject = (
    projectInput: Omit<CompanyProject, 'id' | 'updatedAt'>,
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const now = new Date().toISOString();
    const newProject: CompanyProject = {
      ...projectInput,
      id: `prj-${Date.now()}`,
      updatedAt: now,
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'projects',
        moduleLabel: 'Projects & Clients',
        action: 'create',
        targetId: newProject.id,
        itemLabel: `${newProject.code} · ${newProject.name}`,
        summary: `Register ${newProject.type} ${newProject.code} ("${newProject.name}")`,
        diffs: [
          { field: 'Project Code', before: '— (New Project)', after: newProject.code },
          { field: 'Name', before: '—', after: newProject.name },
          { field: 'Department', before: '—', after: newProject.department },
          { field: 'Lead Manager', before: '—', after: newProject.leadManager },
          {
            field: 'Estimated Budget',
            before: '—',
            after: formatCurrency(newProject.estimatedBudget, newProject.currency),
          },
        ],
        payload: {
          op: 'project_create',
          project: newProject,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      'PRJ-DIRECTORY',
      'Team Updated',
      `Registered ${newProject.type} ${newProject.code} ("${newProject.name}", Lead: ${newProject.leadManager}, Budget: ${newProject.budgetHours}h).`,
    );
    setState((prev) => ({
      ...prev,
      projects: [newProject, ...prev.projects],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.projects
      .upsert(newProject, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Registered ${newProject.code}`,
      `${newProject.name} added to Projects & Clients directory.`,
      'success',
    );
  };

  const handleUpdateProject = (
    projectId: string,
    patch: Partial<Omit<CompanyProject, 'id' | 'updatedAt'>>,
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;

    if (currentUser.role === 'Editor') {
      const diffs: PendingEditorChangeDiff[] = [];
      if (patch.name !== undefined && patch.name !== target.name) {
        diffs.push({ field: 'Project Name', before: target.name, after: patch.name });
      }
      if (patch.status !== undefined && patch.status !== target.status) {
        diffs.push({ field: 'Status', before: target.status, after: patch.status });
      }
      if (patch.leadManager !== undefined && patch.leadManager !== target.leadManager) {
        diffs.push({ field: 'Lead Manager', before: target.leadManager, after: patch.leadManager });
      }
      if (patch.department !== undefined && patch.department !== target.department) {
        diffs.push({ field: 'Department', before: target.department, after: patch.department });
      }
      if (patch.budgetHours !== undefined && patch.budgetHours !== target.budgetHours) {
        diffs.push({
          field: 'Budget Hours',
          before: `${target.budgetHours}h`,
          after: `${patch.budgetHours}h`,
        });
      }
      if (patch.estimatedBudget !== undefined && patch.estimatedBudget !== target.estimatedBudget) {
        diffs.push({
          field: 'Estimated Budget',
          before: formatCurrency(target.estimatedBudget, target.currency),
          after: formatCurrency(patch.estimatedBudget, patch.currency ?? target.currency),
        });
      }
      if (patch.actualSpend !== undefined && patch.actualSpend !== target.actualSpend) {
        diffs.push({
          field: 'Actual Spend',
          before: formatCurrency(target.actualSpend, target.currency),
          after: formatCurrency(patch.actualSpend, patch.currency ?? target.currency),
        });
      }
      if (diffs.length === 0) {
        diffs.push({ field: 'Project Record', before: target.status, after: patch.status ?? target.status });
      }
      submitEditorChangeProposal({
        module: 'projects',
        moduleLabel: 'Projects & Clients',
        action: 'update',
        targetId: projectId,
        itemLabel: `${target.code} · ${target.name}`,
        summary: `Update project ${target.code} (${diffs.map((d) => d.field).join(', ')})`,
        diffs,
        payload: {
          op: 'project_update',
          projectId,
          patch,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedProject: CompanyProject = {
      ...target,
      ...patch,
      updatedAt: now,
    };
    const auditEntry = createAuditEvent(
      'PRJ-DIRECTORY',
      'Team Updated',
      `Updated project ${updatedProject.code} ("${updatedProject.name}") — Status: ${updatedProject.status}, Lead: ${updatedProject.leadManager}, Budget: ${updatedProject.budgetHours}h.`,
    );
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === projectId ? updatedProject : p)),
      requests: prev.requests.map((r) =>
        r.projectId === projectId
          ? {
              ...r,
              projectCode: updatedProject.code,
              projectName: updatedProject.name,
            }
          : r,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.projects
      .upsert(updatedProject, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Updated ${updatedProject.code}`,
      `${updatedProject.name} (${updatedProject.status}).`,
      'success',
    );
  };

  const handleDeleteProject = (projectId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'projects',
        moduleLabel: 'Projects & Clients',
        action: 'delete',
        targetId: projectId,
        itemLabel: `${target.code} · ${target.name}`,
        summary: `Delete project ${target.code} ("${target.name}")`,
        diffs: [
          {
            field: 'Project Status',
            before: `${target.status} (${target.department})`,
            after: 'Delete Requested',
          },
        ],
        payload: {
          op: 'project_delete',
          projectId,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      'PRJ-DIRECTORY',
      'Team Updated',
      `Removed ${target.code} ("${target.name}") from Projects & Clients directory.`,
    );
    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== projectId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.projects
      .remove(projectId, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(`Removed ${target.code}`, `${target.name} removed from directory.`, 'info');
  };

  // Assets & Inventory Management Handlers
  const handleRegisterAsset = (
    assetInput: Omit<CompanyAsset, 'id' | 'updatedAt' | 'history'>,
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const now = new Date().toISOString();
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const initialHistory: AssetHistoryEntry = {
      id: `ah-reg-${Date.now()}`,
      timestamp: now,
      actorName: actor.name,
      eventType: 'Registered',
      details: `Registered ${assetInput.category} asset ${assetInput.tag} ("${assetInput.name}") as ${assetInput.status} (${assetInput.condition}).`,
    };
    const newAsset: CompanyAsset = {
      ...assetInput,
      id: `ast-${Date.now()}`,
      updatedAt: now,
      history: [initialHistory],
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'assets',
        moduleLabel: 'Assets & Inventory',
        action: 'create',
        targetId: newAsset.id,
        itemLabel: `${newAsset.tag} · ${newAsset.name}`,
        summary: `Register asset ${newAsset.tag} ("${newAsset.name}", ${newAsset.category})`,
        diffs: [
          { field: 'Asset Tag', before: '— (New Asset)', after: newAsset.tag },
          { field: 'Name', before: '—', after: newAsset.name },
          { field: 'Category', before: '—', after: newAsset.category },
          { field: 'Assigned To', before: '—', after: newAsset.assignedTo || 'Inventory' },
          { field: 'Status', before: '—', after: `${newAsset.status} (${newAsset.condition})` },
        ],
        payload: {
          op: 'asset_create',
          asset: newAsset,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      newAsset.tag,
      'Team Updated',
      `Registered inventory asset ${newAsset.tag} ("${newAsset.name}", ${newAsset.category}, Status: ${newAsset.status}).`,
    );

    setState((prev) => ({
      ...prev,
      assets: [newAsset, ...prev.assets],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.assets
      .upsert(newAsset, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Registered ${newAsset.tag}`,
      `${newAsset.name} added to Assets & Inventory registry.`,
      'success',
    );
  };

  const handleTransferAsset = (
    assetId: string,
    payload: {
      assignedTo: string;
      department: Department;
      condition: AssetCondition;
      status: AssetStatus;
      notes?: string;
    },
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.assets.find((a) => a.id === assetId);
    if (!target) return;

    if (currentUser.role === 'Editor') {
      const diffs: PendingEditorChangeDiff[] = [];
      if (target.assignedTo !== payload.assignedTo) {
        diffs.push({ field: 'Custodian', before: target.assignedTo, after: payload.assignedTo });
      }
      if (target.department !== payload.department) {
        diffs.push({ field: 'Department', before: target.department, after: payload.department });
      }
      if (target.status !== payload.status) {
        diffs.push({ field: 'Status', before: target.status, after: payload.status });
      }
      if (target.condition !== payload.condition) {
        diffs.push({ field: 'Condition', before: target.condition, after: payload.condition });
      }
      if (payload.notes) {
        diffs.push({ field: 'Transfer Notes', before: '—', after: payload.notes });
      }
      submitEditorChangeProposal({
        module: 'assets',
        moduleLabel: 'Assets & Inventory',
        action: 'update',
        targetId: assetId,
        itemLabel: `${target.tag} · ${target.name}`,
        summary: `Transfer/update custody for ${target.tag} to ${payload.assignedTo} (${payload.status})`,
        diffs: diffs.length > 0 ? diffs : [{ field: 'Custodian', before: target.assignedTo, after: payload.assignedTo }],
        payload: {
          op: 'asset_transfer',
          assetId,
          patch: payload,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const noteSuffix = payload.notes ? ` Note: ${payload.notes}` : '';
    const detailMsg = `Custody updated from "${target.assignedTo}" to "${payload.assignedTo}" (${payload.department}, Status: ${payload.status}, Condition: ${payload.condition}).${noteSuffix}`;

    const historyEntry: AssetHistoryEntry = {
      id: `ah-tx-${Date.now()}`,
      timestamp: now,
      actorName: actor.name,
      eventType: 'Assigned / Transferred',
      details: detailMsg,
    };

    const auditEntry = createAuditEvent(
      target.tag,
      'Team Updated',
      `${target.tag} (${target.name}): ${detailMsg}`,
    );

    const updatedAsset: CompanyAsset = {
      ...target,
      assignedTo: payload.assignedTo,
      department: payload.department,
      condition: payload.condition,
      status: payload.status,
      updatedAt: now,
      history: [historyEntry, ...target.history],
    };

    setState((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === assetId ? updatedAsset : a)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.assets
      .upsert(updatedAsset, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Updated Custody · ${target.tag}`,
      `Assigned to ${payload.assignedTo} (${payload.status}).`,
      'success',
    );
  };

  const handleLogAssetMaintenance = (
    assetId: string,
    payload: {
      condition: AssetCondition;
      status: AssetStatus;
      notes: string;
    },
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.assets.find((a) => a.id === assetId);
    if (!target) return;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'assets',
        moduleLabel: 'Assets & Inventory',
        action: 'update',
        targetId: assetId,
        itemLabel: `${target.tag} · ${target.name}`,
        summary: `Log maintenance on ${target.tag} (${payload.status}, ${payload.condition})`,
        diffs: [
          { field: 'Status', before: target.status, after: payload.status },
          { field: 'Condition', before: target.condition, after: payload.condition },
          { field: 'Maintenance Notes', before: '—', after: payload.notes },
        ],
        payload: {
          op: 'asset_maintenance',
          assetId,
          patch: payload,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const actor = getActorForRole(state.activeRole, state.teamMembers);
    const detailMsg = `Maintenance log (${payload.status} · Condition: ${payload.condition}): ${payload.notes}`;

    const historyEntry: AssetHistoryEntry = {
      id: `ah-mnt-${Date.now()}`,
      timestamp: now,
      actorName: actor.name,
      eventType: 'Maintenance Logged',
      details: detailMsg,
    };

    const auditEntry = createAuditEvent(
      target.tag,
      'Team Updated',
      `${target.tag} (${target.name}): ${detailMsg}`,
    );

    const updatedAsset: CompanyAsset = {
      ...target,
      condition: payload.condition,
      status: payload.status,
      updatedAt: now,
      history: [historyEntry, ...target.history],
    };

    setState((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === assetId ? updatedAsset : a)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.assets
      .upsert(updatedAsset, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Maintenance Logged · ${target.tag}`,
      `${payload.status} (${payload.condition})`,
      payload.status === 'Under Maintenance' ? 'warning' : 'success',
    );
  };

  // Corporate SOP & Knowledge Vault Handlers
  const handlePublishSop = (
    sopInput: Omit<SopDocument, 'id' | 'acknowledgments' | 'updatedAt'>,
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const now = new Date().toISOString();
    const newSop: SopDocument = {
      ...sopInput,
      id: `sop-${Date.now()}`,
      acknowledgments: [],
      updatedAt: now,
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'sops',
        moduleLabel: 'SOP & Policy Vault',
        action: 'create',
        targetId: newSop.id,
        itemLabel: `${newSop.code} · ${newSop.title}`,
        summary: `Publish ${newSop.category} ${newSop.code} ${newSop.version} ("${newSop.title}")`,
        diffs: [
          { field: 'SOP Code', before: '— (New Policy)', after: `${newSop.code} (${newSop.version})` },
          { field: 'Title', before: '—', after: newSop.title },
          { field: 'Department', before: '—', after: newSop.department },
          { field: 'Mandatory Read', before: '—', after: newSop.mandatoryRead ? 'Yes' : 'No' },
        ],
        payload: {
          op: 'sop_create',
          sop: newSop,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      newSop.code,
      'Team Updated',
      `Published ${newSop.category} ${newSop.code} ${newSop.version} ("${newSop.title}", Dept: ${newSop.department}, Mandatory: ${newSop.mandatoryRead ? 'Yes' : 'No'}).`,
    );

    setState((prev) => ({
      ...prev,
      sops: [newSop, ...prev.sops],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.sops
      .upsert(newSop, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Published ${newSop.code}`,
      `${newSop.title} (${newSop.version}) added to Knowledge Vault.`,
      'success',
    );
  };

  const handleToggleSopMandatory = (sopId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.sops.find((s) => s.id === sopId);
    if (!target) return;
    const nextMandatory = !target.mandatoryRead;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'sops',
        moduleLabel: 'SOP & Policy Vault',
        action: 'update',
        targetId: sopId,
        itemLabel: `${target.code} · ${target.title}`,
        summary: `Set ${target.code} read policy to ${nextMandatory ? 'Mandatory Read' : 'Optional Reference'}`,
        diffs: [
          {
            field: 'Mandatory Read',
            before: target.mandatoryRead ? 'Mandatory Read' : 'Optional Reference',
            after: nextMandatory ? 'Mandatory Read' : 'Optional Reference',
          },
        ],
        payload: {
          op: 'sop_toggle_mandatory',
          sopId,
          nextMandatory,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const auditEntry = createAuditEvent(
      target.code,
      'Team Updated',
      `Updated ${target.code} ("${target.title}") read requirement to ${nextMandatory ? 'Mandatory Read' : 'Optional Reference'}.`,
    );

    const updatedSop: SopDocument = {
      ...target,
      mandatoryRead: nextMandatory,
      updatedAt: now,
    };

    setState((prev) => ({
      ...prev,
      sops: prev.sops.map((s) => (s.id === sopId ? updatedSop : s)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.sops
      .upsert(updatedSop, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `${target.code} Updated`,
      nextMandatory
        ? 'Marked as Mandatory Read with employee compliance tracking.'
        : 'Marked as Optional Reference.',
      'info',
    );
  };

  const handleAcknowledgeSop = (sopId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.sops.find((s) => s.id === sopId);
    if (!target) return;

    const alreadySigned = target.acknowledgments.some(
      (ack) =>
        ack.userId === currentUser.id ||
        (Boolean(ack.employeeId) && ack.employeeId === currentUser.employeeId) ||
        ack.userName.trim().toLowerCase() === currentUser.name.trim().toLowerCase(),
    );
    if (alreadySigned) return;

    const now = new Date().toISOString();
    const acknowledgment: SopAcknowledgment = {
      userId: currentUser.id,
      employeeId: currentUser.employeeId,
      userName: currentUser.name,
      role: currentUser.role,
      signOffTitle: currentUser.signOffTitle || currentUser.title,
      department: currentUser.department,
      acknowledgedAt: now,
    };

    const auditEntry = createAuditEvent(
      target.code,
      'Team Updated',
      `${currentUser.name} (${currentUser.signOffTitle || currentUser.role}) digitally acknowledged compliance for ${target.code} ${target.version} ("${target.title}").`,
    );

    const updatedSop: SopDocument = {
      ...target,
      updatedAt: now,
      acknowledgments: [acknowledgment, ...target.acknowledgments],
    };

    setState((prev) => ({
      ...prev,
      sops: prev.sops.map((s) => (s.id === sopId ? updatedSop : s)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.sops
      .upsert(updatedSop, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Compliance Signed · ${target.code}`,
      `Recorded digital sign-off for ${currentUser.name}.`,
      'success',
    );
  };

  // Staff Attendance (Clock-In / Clock-Out) & Leave Management Handlers
  const handleClockIn = () => {
    if (currentUser.role !== 'Admin') return;
    const today = getTodayDateString();
    const existing = state.attendanceLogs.find(
      (log) =>
        log.attendanceDate === today &&
        (log.userEmail.toLowerCase() === currentUser.email.toLowerCase() ||
          log.userId === currentUser.id),
    );
    if (existing) {
      pushToast('Already Clocked In', 'Attendance log already started for today.', 'info');
      return;
    }

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const hour = nowDate.getHours();
    const minute = nowDate.getMinutes();
    const isLate = hour > 9 || (hour === 9 && minute > 30);
    const status = isLate ? 'Late' : 'Present';

    const newLog: AttendanceLog = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: currentUser.id,
      employeeId: currentUser.employeeId,
      userName: currentUser.name,
      userEmail: currentUser.email,
      department: currentUser.department,
      attendanceDate: today,
      checkInTime: nowIso,
      status,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const auditEntry = createAuditEvent(
      `ATT-${today}`,
      'Attendance Logged',
      `${currentUser.name} (${currentUser.email}) clocked in at ${nowDate.toLocaleTimeString()} — Status: ${status}.`,
    );

    setState((prev) => ({
      ...prev,
      attendanceLogs: [newLog, ...prev.attendanceLogs],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.attendance
      .upsert(newLog, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(`Clocked In · ${status}`, `Recorded check-in for ${today}.`, isLate ? 'warning' : 'success');
  };

  const handleClockOut = (attendanceId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.attendanceLogs.find((a) => a.id === attendanceId);
    if (!target || target.checkOutTime) return;

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const inMs = new Date(target.checkInTime).getTime();
    const outMs = nowDate.getTime();
    const totalHours = Number(Math.max(0, (outMs - inMs) / 3600000).toFixed(2));

    const updatedLog: AttendanceLog = {
      ...target,
      checkOutTime: nowIso,
      totalHours,
      status: 'Completed',
      updatedAt: nowIso,
    };

    const auditEntry = createAuditEvent(
      `ATT-${target.attendanceDate}`,
      'Attendance Logged',
      `${target.userName} (${target.userEmail}) clocked out at ${nowDate.toLocaleTimeString()} — Total Worked: ${totalHours.toFixed(2)}h.`,
    );

    setState((prev) => ({
      ...prev,
      attendanceLogs: prev.attendanceLogs.map((a) => (a.id === attendanceId ? updatedLog : a)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.attendance
      .upsert(updatedLog, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast('Clocked Out', `Completed shift (${totalHours.toFixed(2)} hrs logged).`, 'success');
  };

  // Leave & Time-Off Approvals Handlers (`leave_requests` + `nexops_leaves`)
  const handleCreateLeave = (payload: CreateLeavePayload) => {
    if (currentUser.role !== 'Admin') return;
    const now = new Date().toISOString();
    const maxNum = state.leaves.reduce((max, l) => {
      const match = l.code.match(/^LVE-\d{4}-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const code = `LVE-2026-${String(maxNum + 1).padStart(3, '0')}`;
    const newLeave: LeaveRequest = {
      id: `lve-${Date.now()}`,
      code,
      employeeId: currentUser.employeeId,
      employeeEmail: currentUser.email,
      employeeName: currentUser.name,
      department: currentUser.department,
      leaveType: payload.leaveType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      totalDays: payload.totalDays,
      reason: payload.reason,
      status: 'Pending',
      backupDelegateName: payload.backupDelegateName,
      createdAt: now,
      updatedAt: now,
    };

    const auditEntry = createAuditEvent(
      code,
      'Leave Submitted',
      `${currentUser.name} (${currentUser.email}) submitted ${payload.leaveType} leave ${code} (${payload.startDate} to ${payload.endDate}, ${payload.totalDays}d)${payload.backupDelegateName ? ` · Backup: ${payload.backupDelegateName}` : ''}.`,
    );

    const notification: AppNotification = {
      id: `notif-lve-${Date.now()}`,
      title: `Leave Request Submitted: ${code}`,
      message: `${currentUser.name} applied for ${payload.totalDays}d ${payload.leaveType} (${payload.startDate}–${payload.endDate}).`,
      timestamp: now,
      read: false,
      targetSection: 'leaves',
      recipientRole: 'Admin',
      actorEmail: currentUser.email,
      category: 'leave',
      severity: 'info',
    };

    setState((prev) => ({
      ...prev,
      leaves: [newLeave, ...prev.leaves],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void Promise.all([
      dataService.leaves.upsert(newLeave, auditEntry),
      dataService.notifications.create(notification),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(`Submitted ${code}`, `${payload.leaveType} (${payload.totalDays} days) awaiting Admin approval.`, 'success');
  };

  const handleDecisionLeave = (
    leaveId: string,
    decision: 'Approved' | 'Rejected',
    reviewerNotes?: string,
  ) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only Admins can approve or reject leave requests.', 'error');
      return;
    }
    const target = state.leaves.find((l) => l.id === leaveId);
    if (!target) return;
    const now = new Date().toISOString();
    const updatedLeave: LeaveRequest = {
      ...target,
      status: decision,
      reviewerName: currentUser.name,
      reviewerNotes,
      updatedAt: now,
    };

    const auditEntry = createAuditEvent(
      target.code,
      decision === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
      `${currentUser.name} marked leave request ${target.code} (${target.employeeName}, ${target.totalDays}d ${target.leaveType}) as ${decision}.${reviewerNotes ? ` Remarks: ${reviewerNotes}` : ''}`,
    );

    const employeeMember = state.teamMembers.find(
      (m) =>
        (target.employeeEmail && m.email.toLowerCase() === target.employeeEmail.toLowerCase()) ||
        m.employeeId === target.employeeId ||
        m.name.trim().toLowerCase() === target.employeeName.trim().toLowerCase(),
    );

    const notification: AppNotification = {
      id: `notif-lve-dec-${Date.now()}`,
      title: `Leave ${decision}: ${target.code}`,
      message: `${currentUser.name} ${decision.toLowerCase()} your ${target.leaveType} leave (${target.startDate}–${target.endDate}).`,
      timestamp: now,
      read: false,
      targetSection: 'leaves',
      recipientEmail: target.employeeEmail || employeeMember?.email,
      actorEmail: currentUser.email,
      category: 'leave',
      severity: decision === 'Approved' ? 'success' : 'warning',
    };

    setState((prev) => ({
      ...prev,
      leaves: prev.leaves.map((l) => (l.id === leaveId ? updatedLeave : l)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void Promise.all([
      dataService.leaves.upsert(updatedLeave, auditEntry),
      dataService.notifications.create(notification),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      `${target.code} ${decision}`,
      `${target.employeeName} (${target.totalDays}d ${target.leaveType})`,
      decision === 'Approved' ? 'success' : 'warning',
    );
  };

  // Admin-Only Team, Approval & Master Key Management Handlers (Zero-Lag Optimistic UI + Rollback)
  const handleUpdateMemberRole = (memberId: string, role: Role) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the verified Super Admin can modify user roles.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} is permanently locked as Admin.`, 'warning');
      return;
    }
    const effectiveRole: Role = role === 'Editor' ? 'Editor' : 'Viewer';
    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const auditEntry = createAuditEvent(
      'TEAM-RBAC',
      'Role Changed',
      `Updated ${target.name} (${target.email}) role from ${target.role} to ${effectiveRole}.`,
      state.activeRole,
    );
    const nextMembers = prevMembers.map((m) =>
      m.id === memberId ? { ...m, role: effectiveRole } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    pushToast('RBAC Role Updated', `Assigned ${effectiveRole} permissions.`, 'success');
    void dataService.team
      .updateMember(memberId, { role: effectiveRole }, auditEntry, nextMembers)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleUpdateMemberDepartment = (memberId: string, department: Department) => {
    if (currentUser.role !== 'Admin' || !isSuperAdminEmail(currentUser.email)) {
      pushToast(
        'Super Admin Access Required',
        'Only the Super Admin can reassign user departments.',
        'error',
      );
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const auditEntry = createAuditEvent(
      'TEAM-DEPT',
      'Team Updated',
      `Reassigned ${target.name} from ${target.department} to ${department}.`,
      state.activeRole,
    );
    const nextMembers = prevMembers.map((m) =>
      m.id === memberId ? { ...m, department } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    if (
      authSession &&
      (memberId === authSession.userId ||
        target.email.trim().toLowerCase() === (authSession.userEmail ?? '').trim().toLowerCase())
    ) {
      const updatedSession: AuthSession = {
        ...authSession,
        userDepartment: department,
      };
      dataService.auth.saveSessionSync(updatedSession);
      setAuthSession(updatedSession);
    }
    pushToast('Department Updated', `Reassigned member to ${department}.`, 'success');
    void dataService.team
      .updateMember(memberId, { department }, auditEntry, nextMembers)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleToggleMemberActive = (memberId: string) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the verified Super Admin can change account status.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be deactivated.`, 'warning');
      return;
    }
    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const nextActiveState = !target.active;
    const nextApprovalStatus = nextActiveState ? ('approved' as const) : ('deactivated' as const);
    const now = new Date().toISOString();
    const auditEntry = createAuditEvent(
      'TEAM-STATUS',
      'Team Updated',
      `${nextActiveState ? 'Activated' : 'Deactivated'} corporate account for ${target.name} (${target.email}).`,
      state.activeRole,
    );
    const nextMembers = prevMembers.map((m) =>
      m.id === memberId
        ? {
            ...m,
            active: nextActiveState,
            approvalStatus: nextApprovalStatus,
            ...(nextActiveState ? { approvedBy: currentUser.name, approvedAt: now } : {}),
          }
        : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    pushToast(
      nextActiveState ? 'Account Activated' : 'Account Deactivated',
      `${target.name} status updated (${nextApprovalStatus}).`,
      nextActiveState ? 'success' : 'warning',
    );
    void dataService.team
      .updateMember(
        memberId,
        {
          active: nextActiveState,
          approvalStatus: nextApprovalStatus,
          ...(nextActiveState ? { approvedBy: currentUser.name, approvedAt: now } : {}),
        },
        auditEntry,
        nextMembers,
      )
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleRefreshUsersFromCloud = async (silent = false) => {
    if (!isSuperAdminOperator) return;
    try {
      const freshMembers = await dataService.team.fetchProfilesFromCloud(state.teamMembers);
      setState((prev) => ({
        ...prev,
        teamMembers: freshMembers,
      }));
      if (!silent) {
        const pendingCount = freshMembers.filter(
          (m) =>
            !isSuperAdminEmail(m.email) &&
            (m.approvalStatus ?? (m.active ? 'approved' : 'pending')) === 'pending',
        ).length;
        pushToast(
          'Users Synced from Supabase',
          `Loaded ${freshMembers.length} registered profiles (${pendingCount} pending approval).`,
          'success',
        );
      }
    } catch (err) {
      if (!silent) {
        handleCloudWriteError(err);
      }
    }
  };

  const handlePreApproveUser = async (payload: {
    email: string;
    fullName?: string;
    department: Department;
    role: Role;
  }) => {
    if (!isSuperAdminOperator) {
      throw new Error('Only the verified Super Admin can pre-approve or add users.');
    }
    const cleanEmail = payload.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('A valid corporate email address is required.');
    }

    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const isSuper = isSuperAdminEmail(cleanEmail);
    const requestedRole = normalizeRole(payload.role);
    const effectiveRole: Role = isSuper
      ? 'Admin'
      : requestedRole === 'Editor'
        ? 'Editor'
        : 'Viewer';
    const now = new Date().toISOString();
    const localExisting = prevMembers.find(
      (m) => m.email.trim().toLowerCase() === cleanEmail,
    );
    const optimisticMember: TeamMember = {
      id:
        localExisting?.id ||
        `pre-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      employeeId:
        localExisting?.employeeId ||
        `EMP-${String(100 + (prevMembers.length % 899)).padStart(3, '0')}`,
      name: payload.fullName?.trim() || localExisting?.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      role: effectiveRole,
      approvalStatus: 'approved',
      isSuperAdmin: isSuper,
      approvedBy: currentUser.name,
      approvedAt: now,
      department: payload.department || localExisting?.department || branding.departments[0],
      title:
        isSuper
          ? 'Primary Super Administrator'
          : effectiveRole === 'Admin'
            ? 'Operations Administrator'
            : effectiveRole === 'Editor'
              ? 'Operations Editor'
              : 'Workspace Viewer',
      signOffTitle: localExisting?.signOffTitle || currentUser.signOffTitle,
      avatarUrl: localExisting?.avatarUrl,
      active: true,
      lastActive: localExisting?.lastActiveAt || '',
      lastActiveAt: localExisting?.lastActiveAt,
    };

    const optimisticAudit = createAuditEvent(
      'TEAM-PREAPPROVE',
      'Role Changed',
      localExisting
        ? `Admin ${currentUser.name} approved & assigned ${effectiveRole} access for ${optimisticMember.name} (${cleanEmail}).`
        : `Admin ${currentUser.name} pre-approved ${cleanEmail} (${effectiveRole} · ${optimisticMember.department}).`,
      currentUser.role,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: [
        optimisticMember,
        ...prev.teamMembers.filter(
          (m) =>
            m.id !== optimisticMember.id &&
            m.email.trim().toLowerCase() !== cleanEmail,
        ),
      ],
      globalAuditLogs: [optimisticAudit, ...prev.globalAuditLogs],
    }));

    pushToast(
      localExisting ? `Approved ${cleanEmail}` : `Pre-Approved ${cleanEmail}`,
      `Assigned ${effectiveRole} access (${optimisticMember.department}).`,
      'success',
    );

    void dataService.team
      .preApproveUserByEmail(
        payload,
        currentUser.name,
        currentUser.role,
        currentUser.signOffTitle || currentUser.title,
        prevMembers,
      )
      .then(({ member }) => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
        setState((prev) => ({
          ...prev,
          teamMembers: [
            member,
            ...prev.teamMembers.filter(
              (m) =>
                m.id !== optimisticMember.id &&
                m.id !== member.id &&
                m.email.trim().toLowerCase() !== cleanEmail,
            ),
          ],
        }));
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleApproveUser = (memberId: string, assignedRole: Role) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the verified Super Admin can approve pending accounts.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const effectiveRole: Role = isSuperAdminEmail(target.email)
      ? 'Admin'
      : assignedRole === 'Editor'
        ? 'Editor'
        : 'Viewer';
    const now = new Date().toISOString();

    const auditEntry = createAuditEvent(
      'TEAM-APPROVAL',
      'Role Changed',
      `Admin ${currentUser.name} approved ${target.name} (${target.email}) with role ${effectiveRole}.`,
      currentUser.role,
    );

    const nextMembers = prevMembers.map((m) =>
      m.id === memberId
        ? {
            ...m,
            role: effectiveRole,
            approvalStatus: 'approved' as const,
            active: true,
            approvedBy: currentUser.name,
            approvedAt: now,
          }
        : m,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    pushToast(
      `Approved ${target.name}`,
      `Assigned ${effectiveRole} access (${target.email}).`,
      'success',
    );

    void dataService.team
      .updateMember(
        memberId,
        {
          role: effectiveRole,
          approvalStatus: 'approved',
          active: true,
          approvedBy: currentUser.name,
          approvedAt: now,
        },
        auditEntry,
        nextMembers,
      )
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleRejectUser = (memberId: string) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the verified Super Admin can decline pending accounts.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be rejected.`, 'warning');
      return;
    }

    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const auditEntry = createAuditEvent(
      'TEAM-APPROVAL',
      'Role Changed',
      `Admin ${currentUser.name} rejected access request for ${target.name} (${target.email}).`,
      currentUser.role,
    );

    const nextMembers = prevMembers.map((m) =>
      m.id === memberId
        ? {
            ...m,
            approvalStatus: 'rejected' as const,
            active: false,
          }
        : m,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    pushToast(
      `Rejected ${target.name}`,
      `Access denied for ${target.email}.`,
      'warning',
    );

    void dataService.team
      .updateMember(
        memberId,
        {
          approvalStatus: 'rejected',
          active: false,
        },
        auditEntry,
        nextMembers,
      )
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleDeleteMember = (memberId: string) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the verified Super Admin can delete user records.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be deleted.`, 'warning');
      return;
    }

    const prevMembers = state.teamMembers;
    const prevAudits = state.globalAuditLogs;
    const auditEntry = createAuditEvent(
      'TEAM-DELETE',
      'Team Updated',
      `Admin ${currentUser.name} permanently deleted user record for ${target.name} (${target.email}).`,
      currentUser.role,
    );

    const nextMembers = prevMembers.filter(
      (m) =>
        m.id !== memberId &&
        m.email.trim().toLowerCase() !== target.email.trim().toLowerCase(),
    );

    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    pushToast(
      `Deleted ${target.name}`,
      `Removed ${target.email} from directory.`,
      'success',
    );

    void dataService.team
      .deleteMember(memberId, target.email, auditEntry, nextMembers)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          teamMembers: prevMembers,
          globalAuditLogs: prevAudits,
        }));
        handleCloudWriteError(err);
      });
  };

  const handleProvisionEmployee = async (payload: ProvisionEmployeePayload) => {
    if (!isSuperAdminOperator) {
      throw new Error('Only the authorized Super Admin can create employee accounts.');
    }

    const { member, emailConfirmationPending } =
      await dataService.auth.provisionEmployeeAccount(payload, state.teamMembers);

    const auditEntry = createAuditEvent(
      'TEAM-PROVISION',
      'Team Updated',
      `Admin ${currentUser.name} provisioned employee account for ${member.name} (${member.employeeId}, ${member.email}, ${member.role}, ${member.department}).`,
      currentUser.role,
    );

    const nextMembers = [member, ...state.teamMembers];
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.team
      .createMember(member, auditEntry, nextMembers)
      .catch(handleCloudWriteError);

    pushToast(
      `Employee Account Created (${member.employeeId})`,
      emailConfirmationPending
        ? `Verification invite dispatched to ${member.email} (${member.role}).`
        : `${member.name} (${member.role} · ${member.department}) can now sign in.`,
      'success',
    );
  };

  // Profile Digital Approval Sign-Off Title & Password Handlers
  const handleSaveSignOffTitle = (userId: string, signOffTitle: string) => {
    const auditEntry: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      requestId: 'PROFILE-SIGNOFF',
      timestamp: new Date().toISOString(),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actorSignOffTitle: signOffTitle,
      actionType: 'Team Updated',
      details: `Updated Digital Approval Sign-Off Title for ${currentUser.name} (${currentUser.employeeId}) to "${signOffTitle}".`,
    };
    const nextMembers = state.teamMembers.map((m) =>
      m.id === userId ? { ...m, signOffTitle } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.team
      .updateMember(userId, { signOffTitle }, auditEntry, nextMembers)
      .catch(handleCloudWriteError);
    pushToast(
      'Digital Sign-Off Title Saved',
      `Reports and audit logs will now show "${signOffTitle}".`,
      'success',
    );
  };

  const handleSaveDelegation = (
    userId: string,
    outOfOffice: boolean,
    delegateApproverId?: string,
  ) => {
    const target = state.teamMembers.find((m) => m.id === userId) ?? currentUser;
    const delegate = delegateApproverId
      ? state.teamMembers.find((m) => m.id === delegateApproverId)
      : undefined;

    if (outOfOffice && !delegate) return;

    const now = new Date().toISOString();
    const reassignedIds: string[] = [];

    const nextRequests = state.requests.map((req) => {
      const isPending = req.status === 'Submitted' || req.status === 'Under QA Review';
      if (!isPending) return req;

      if (
        outOfOffice &&
        delegate &&
        req.assignedReviewer.trim().toLowerCase() === target.name.trim().toLowerCase()
      ) {
        reassignedIds.push(req.id);
        dataService.requests.updateMetaSync(req.id, {
          assignedReviewer: delegate.name,
          delegatedFromReviewer: target.name,
        });
        return {
          ...req,
          assignedReviewer: delegate.name,
          delegatedFromReviewer: target.name,
          updatedAt: now,
        };
      }

      if (
        !outOfOffice &&
        req.delegatedFromReviewer?.trim().toLowerCase() === target.name.trim().toLowerCase()
      ) {
        reassignedIds.push(req.id);
        dataService.requests.updateMetaSync(req.id, {
          assignedReviewer: target.name,
          delegatedFromReviewer: undefined,
        });
        return {
          ...req,
          assignedReviewer: target.name,
          delegatedFromReviewer: undefined,
          updatedAt: now,
        };
      }

      return req;
    });

    const auditEntry = createAuditEvent(
      'PROFILE-DELEGATION',
      'Team Updated',
      outOfOffice && delegate
        ? `${target.name} enabled Out-of-Office mode. Delegated approvals to ${delegate.name} (${reassignedIds.length} pending item${reassignedIds.length === 1 ? '' : 's'} reassigned).`
        : `${target.name} disabled Out-of-Office mode and resumed direct approval duties (${reassignedIds.length} item${reassignedIds.length === 1 ? '' : 's'} restored).`,
    );

    const notification: AppNotification | null =
      outOfOffice && delegate
        ? {
            id: `notif-ooo-${Date.now()}`,
            title: `OOO Delegation Active · ${target.name}`,
            message: `Approvals routed to ${delegate.name}${reassignedIds.length > 0 ? ` (${reassignedIds.length} pending transferred)` : ''}.`,
            timestamp: now,
            read: false,
            severity: 'info',
          }
        : null;

    const nextMembers = state.teamMembers.map((m) =>
      m.id === userId
        ? {
            ...m,
            outOfOffice,
            delegateApproverId: outOfOffice && delegate ? delegate.id : undefined,
            delegateApproverName: outOfOffice && delegate ? delegate.name : undefined,
          }
        : m,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      requests: nextRequests,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: notification ? [notification, ...prev.notifications] : prev.notifications,
    }));

    void Promise.all([
      dataService.team.updateMember(
        userId,
        {
          outOfOffice,
          delegateApproverId: outOfOffice && delegate ? delegate.id : undefined,
          delegateApproverName: outOfOffice && delegate ? delegate.name : undefined,
        },
        auditEntry,
        nextMembers,
      ),
      reassignedIds.length > 0
        ? dataService.requests.syncRequestMetaBundle(currentUser.name)
        : Promise.resolve(),
    ]).catch(handleCloudWriteError);

    pushToast(
      outOfOffice ? 'Out-of-Office Delegation Enabled' : 'Out-of-Office Disabled',
      outOfOffice && delegate
        ? `Approvals routed to ${delegate.name} (${reassignedIds.length} pending transferred).`
        : 'Direct approval routing restored.',
      outOfOffice ? 'info' : 'success',
    );
  };

  // Company Notice Board & Announcements Handlers (Admin Only)
  const handlePublishAnnouncement = (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
    priorityTag: AnnouncementPriorityTag;
    pinned: boolean;
  }) => {
    if (currentUser.role !== 'Admin') return;
    const now = new Date().toISOString();
    const notice: CompanyAnnouncement = {
      id: `ann-${Date.now()}`,
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      priorityTag: payload.priorityTag,
      pinned: payload.pinned,
      publishedBy: currentUser.name,
      publishedByEmail: currentUser.email,
      publishedByRole: currentUser.role,
      publishedAt: now,
      updatedAt: now,
      archived: false,
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Posted',
      `Posted company notice [${payload.priorityTag}${payload.pinned ? ' · Pinned' : ''}]: "${payload.title}".`,
    );
    const nextAnnouncements = [notice, ...state.announcements];
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .upsert(notice, nextAnnouncements, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Company Notice Posted', payload.title, 'success');
  };

  const handleEditAnnouncement = (updatedNotice: CompanyAnnouncement) => {
    if (currentUser.role !== 'Admin') return;
    const now = new Date().toISOString();
    const nextNotice: CompanyAnnouncement = {
      ...updatedNotice,
      updatedAt: now,
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Updated',
      `Updated company notice "${nextNotice.title}" [${nextNotice.priorityTag}${nextNotice.pinned ? ' · Pinned' : ''}].`,
    );
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === nextNotice.id ? nextNotice : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .upsert(nextNotice, nextAnnouncements, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Notice Updated', nextNotice.title, 'success');
  };

  const handleTogglePinAnnouncement = (announcementId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const nextPinned = !target.pinned;
    const now = new Date().toISOString();
    const nextNotice: CompanyAnnouncement = {
      ...target,
      pinned: nextPinned,
      updatedAt: now,
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Updated',
      `${nextPinned ? 'Pinned' : 'Unpinned'} company notice "${target.title}".`,
    );
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === announcementId ? nextNotice : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .upsert(nextNotice, nextAnnouncements, auditEntry)
      .catch(handleCloudWriteError);
    pushToast(nextPinned ? 'Notice Pinned' : 'Notice Unpinned', target.title, 'info');
  };

  const handleDeleteAnnouncement = (announcementId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Deleted',
      `Deleted company notice "${target.title}".`,
    );
    const nextAnnouncements = state.announcements.filter((a) => a.id !== announcementId);
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .remove(announcementId, nextAnnouncements, currentUser.name, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Notice Deleted', target.title, 'info');
  };

  const handleArchiveAnnouncement = (announcementId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const nextNotice: CompanyAnnouncement = {
      ...target,
      archived: true,
      updatedAt: new Date().toISOString(),
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Updated',
      `Archived company notice "${target.title}".`,
    );
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === announcementId ? nextNotice : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .upsert(nextNotice, nextAnnouncements, auditEntry)
      .catch(handleCloudWriteError);
    pushToast('Circular Archived', `"${target.title}" moved to archive.`, 'info');
  };

  const handleRestoreAnnouncement = (announcementId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const nextNotice: CompanyAnnouncement = {
      ...target,
      archived: false,
      updatedAt: new Date().toISOString(),
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Notice Updated',
      `Restored company notice "${target.title}" to banner.`,
    );
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === announcementId ? nextNotice : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.announcements
      .upsert(nextNotice, nextAnnouncements, auditEntry)
      .catch(handleCloudWriteError);
    pushToast('Circular Republished', `"${target.title}" restored to top notice banner.`, 'success');
  };

  // Meetings & Action Items (MoM) Tracker Handlers
  const handleCreateMeeting = (payload: CreateMeetingPayload) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const now = new Date().toISOString();
    const maxNum = state.meetings.reduce((max, m) => {
      const match = m.code.match(/^MOM-\d{4}-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const code = `MOM-2026-${String(maxNum + 1).padStart(3, '0')}`;
    const newMeeting: MeetingMinute = {
      id: `mom-${Date.now()}`,
      code,
      title: payload.title,
      meetingDate: payload.meetingDate,
      department: payload.department,
      facilitator: payload.facilitator,
      attendees: payload.attendees,
      summary: payload.summary,
      decisions: payload.decisions,
      actionItems: payload.actionItems.map((item, idx) => ({
        id: `act-${Date.now()}-${idx + 1}`,
        description: item.description,
        ownerName: item.ownerName,
        department: item.department,
        priority: item.priority,
        dueDate: item.dueDate,
        status: 'Open',
      })),
      createdAt: now,
      updatedAt: now,
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'meetings',
        moduleLabel: 'Meetings & MoM',
        action: 'create',
        targetId: newMeeting.id,
        itemLabel: `${code} · ${payload.title}`,
        summary: `Log Meeting Minutes ${code} ("${payload.title}", ${newMeeting.actionItems.length} action items)`,
        diffs: [
          { field: 'MoM Code', before: '— (New Meeting)', after: code },
          { field: 'Title', before: '—', after: payload.title },
          { field: 'Department', before: '—', after: payload.department },
          { field: 'Meeting Date', before: '—', after: payload.meetingDate },
          { field: 'Action Items', before: '—', after: `${newMeeting.actionItems.length} item(s)` },
        ],
        payload: {
          op: 'meeting_create',
          meeting: newMeeting,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      code,
      'Team Updated',
      `Logged Meeting Minutes ${code} ("${payload.title}", ${payload.department}, ${newMeeting.actionItems.length} action item${newMeeting.actionItems.length === 1 ? '' : 's'}).`,
    );

    setState((prev) => ({
      ...prev,
      meetings: [newMeeting, ...prev.meetings],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.meetings
      .upsert(newMeeting, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(`Meeting Logged · ${code}`, payload.title, 'success');
  };

  const handleAddMeetingActionItem = (
    meetingId: string,
    item: {
      description: string;
      ownerName: string;
      department: Department;
      priority: Priority;
      dueDate: string;
    },
  ) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const meeting = state.meetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    const newAction: MeetingActionItem = {
      id: `act-${Date.now()}`,
      description: item.description,
      ownerName: item.ownerName,
      department: item.department,
      priority: item.priority,
      dueDate: item.dueDate,
      status: 'Open',
    };

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'meetings',
        moduleLabel: 'Meetings & MoM',
        action: 'update',
        targetId: meetingId,
        itemLabel: `${meeting.code} · New Action Item`,
        summary: `Add action item to ${meeting.code}: "${item.description}" (Owner: ${item.ownerName})`,
        diffs: [
          { field: 'Action Item', before: '—', after: item.description },
          { field: 'Owner', before: '—', after: item.ownerName },
          { field: 'Priority / Due', before: '—', after: `${item.priority} · ${item.dueDate}` },
        ],
        payload: {
          op: 'meeting_add_action',
          meetingId,
          actionItem: newAction,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      meeting.code,
      'Team Updated',
      `Added MoM action item to ${meeting.code}: "${item.description}" (Owner: ${item.ownerName}).`,
    );
    const now = new Date().toISOString();
    const updatedMeeting: MeetingMinute = {
      ...meeting,
      updatedAt: now,
      actionItems: [...meeting.actionItems, newAction],
    };
    setState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) => (m.id === meetingId ? updatedMeeting : m)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.meetings
      .upsert(updatedMeeting, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(`Action Item Added · ${meeting.code}`, item.description, 'success');
  };

  const handleConvertActionToRequest = (meetingId: string, actionItemId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const meeting = state.meetings.find((m) => m.id === meetingId);
    const actionItem = meeting?.actionItems.find((a) => a.id === actionItemId);
    if (!meeting || !actionItem || actionItem.linkedRequestId) return;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'meetings',
        moduleLabel: 'Meetings & MoM',
        action: 'update',
        targetId: meetingId,
        itemLabel: `${meeting.code} · Convert Action`,
        summary: `Convert ${meeting.code} action item "${actionItem.description}" into an operational request`,
        diffs: [
          { field: 'Action Status', before: actionItem.status, after: 'Converted to Request' },
          { field: 'Action Description', before: actionItem.description, after: `${actionItem.description} (Owner: ${actionItem.ownerName})` },
        ],
        payload: {
          op: 'meeting_convert_action',
          meetingId,
          actionItemId,
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const newId = generateNextRequestId(state.requests);
    const reviewerResolution = resolveEffectiveReviewer(defaultReviewerName, state.teamMembers);
    const ownerMember = state.teamMembers.find(
      (m) => m.name.toLowerCase() === actionItem.ownerName.toLowerCase(),
    );

    const auditEntry = createAuditEvent(
      newId,
      'Created',
      `Converted MoM action item from ${meeting.code} ("${meeting.title}") into tracked operational request ${newId} [MoM: ${meeting.code}]. Assigned to ${actionItem.ownerName}.`,
    );

    const newRequest: OperationalRequest = {
      id: newId,
      title: actionItem.description,
      category: branding.categories[0] || 'Operational Change',
      department: actionItem.department,
      submittedBy: actionItem.ownerName,
      submitterId: ownerMember?.id || currentUser.id,
      assignedReviewer: reviewerResolution.assignedReviewer,
      delegatedFromReviewer: reviewerResolution.delegatedFromReviewer,
      priority: actionItem.priority,
      status: 'Submitted',
      dueDate: actionItem.dueDate,
      createdAt: now,
      updatedAt: now,
      description: `Converted from Executive Meeting Minutes ${meeting.code} (${meeting.title}, held ${meeting.meetingDate}).\n\nMeeting Summary: ${meeting.summary}`,
      deliverableUrl: '',
      momCode: meeting.code,
      checklist: [
        {
          id: `chk-${newId}-1`,
          label: `MoM ${meeting.code} action item execution verified`,
          mandatory: true,
          checked: false,
        },
        {
          id: `chk-${newId}-2`,
          label: 'Department Lead & QA sign-off attached',
          mandatory: true,
          checked: false,
        },
      ],
      auditTrail: [auditEntry],
    };

    const notification: AppNotification = {
      id: `notif-mom-${Date.now()}`,
      title: `MoM Action Converted: ${newId}`,
      message: `${meeting.code} action "${actionItem.description}" is now tracked as ${newId}.`,
      timestamp: now,
      read: false,
      requestId: newId,
      severity: actionItem.priority === 'Urgent' ? 'warning' : 'info',
    };

    const updatedMeeting: MeetingMinute = {
      ...meeting,
      updatedAt: now,
      actionItems: meeting.actionItems.map((a) =>
        a.id === actionItemId
          ? { ...a, status: 'Converted to Request', linkedRequestId: newId }
          : a,
      ),
    };

    setState((prev) => ({
      ...prev,
      requests: [newRequest, ...prev.requests],
      meetings: prev.meetings.map((m) => (m.id === meetingId ? updatedMeeting : m)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void Promise.all([
      dataService.requests.create(newRequest, auditEntry, notification),
      dataService.meetings.upsert(updatedMeeting),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      `Converted to ${newId}`,
      `Action item from ${meeting.code} is now live in Requests & Queue.`,
      'success',
    );
  };

  const handleCompleteMeetingActionItem = (meetingId: string, actionItemId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const meeting = state.meetings.find((m) => m.id === meetingId);
    const actionItem = meeting?.actionItems.find((a) => a.id === actionItemId);
    if (!meeting || !actionItem) return;

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'meetings',
        moduleLabel: 'Meetings & MoM',
        action: 'update',
        targetId: meetingId,
        itemLabel: `${meeting.code} · Complete Action`,
        summary: `Mark MoM action item completed in ${meeting.code}: "${actionItem.description}"`,
        diffs: [
          {
            field: actionItem.description,
            before: actionItem.status,
            after: 'Completed',
          },
        ],
        payload: {
          op: 'meeting_complete_action',
          meetingId,
          actionItemId,
        },
      });
      return;
    }

    const auditEntry = createAuditEvent(
      meeting.code,
      'Team Updated',
      `Marked MoM action item completed in ${meeting.code}: "${actionItem.description}".`,
    );

    const now = new Date().toISOString();
    const updatedMeeting: MeetingMinute = {
      ...meeting,
      updatedAt: now,
      actionItems: meeting.actionItems.map((a) =>
        a.id === actionItemId ? { ...a, status: 'Completed' } : a,
      ),
    };
    setState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) => (m.id === meetingId ? updatedMeeting : m)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.meetings
      .upsert(updatedMeeting, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(`Action Completed · ${meeting.code}`, actionItem.description, 'success');
  };

  const handleUpdatePassword = async (newPassword: string) => {
    await dataService.auth.updatePassword(newPassword, currentUser.email);
    const auditEntry = createAuditEvent(
      'AUTH-CREDENTIAL',
      'Team Updated',
      `Updated corporate account password for ${currentUser.name} (${currentUser.employeeId}).`,
      currentUser.role,
    );
    setState((prev) => ({
      ...prev,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    await dataService.auditLogs.append(auditEntry).catch(handleCloudWriteError);
    pushToast('Password Updated', 'Corporate credentials updated securely.', 'success');
  };

  // Profile Picture Upload & Removal (Supabase Storage `avatars` + `profiles.avatar_url`)
  const handleUploadAvatar = async (file: File) => {
    const publicUrl = await dataService.profile.uploadAvatar(
      currentUser,
      file,
      (resolvedUrl) =>
        state.teamMembers.map((m) =>
          m.id === currentUser.id ||
          (currentUser.email &&
            m.email.toLowerCase() === currentUser.email.toLowerCase())
            ? { ...m, avatarUrl: resolvedUrl }
            : m,
        ),
    );

    const auditEntry = createAuditEvent(
      'PROFILE-AVATAR',
      'Team Updated',
      `Updated corporate profile picture for ${currentUser.name} (${currentUser.employeeId}).`,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m) =>
        m.id === currentUser.id ||
        (currentUser.email &&
          m.email.toLowerCase() === currentUser.email.toLowerCase())
          ? { ...m, avatarUrl: publicUrl }
          : m,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    setAuthSession((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, avatarUrl: publicUrl };
      dataService.auth.saveSessionSync(updated);
      return updated;
    });

    void dataService.auditLogs.append(auditEntry).catch(handleCloudWriteError);
    if (dataService.isSupabaseConfigured()) setDbConnected(true);
    pushToast('Profile Picture Updated', 'Synced across header, sidebar, and team directory.', 'success');
  };

  const handleRemoveAvatar = async () => {
    const nextMembers = state.teamMembers.map((m) =>
      m.id === currentUser.id ||
      (currentUser.email &&
        m.email.toLowerCase() === currentUser.email.toLowerCase())
        ? { ...m, avatarUrl: undefined }
        : m,
    );

    await dataService.profile.removeAvatar(currentUser, nextMembers);

    const auditEntry = createAuditEvent(
      'PROFILE-AVATAR',
      'Team Updated',
      `Removed profile picture for ${currentUser.name} (${currentUser.employeeId}).`,
    );

    setState((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m) =>
        m.id === currentUser.id ||
        (currentUser.email &&
          m.email.toLowerCase() === currentUser.email.toLowerCase())
          ? { ...m, avatarUrl: undefined }
          : m,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    setAuthSession((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, avatarUrl: undefined };
      dataService.auth.saveSessionSync(updated);
      return updated;
    });

    void dataService.auditLogs.append(auditEntry).catch(handleCloudWriteError);
    pushToast('Profile Picture Removed', 'Reverted to corporate initials badge.', 'info');
  };

  // Workspace Tools Handlers (Gmail, Google Docs, Google Sheets, Google Forms)
  const handleSaveEmailLog = (emailLog: WorkspaceEmailLog) => {
    if (!isApprovedUser) return;
    const auditEntry = createAuditEvent(
      'WORKSPACE-GMAIL',
      'Team Updated',
      `Sent corporate email via ${emailLog.deliveryMethod} to ${emailLog.toRecipients} ("${emailLog.subject}").`,
    );

    setState((prev) => ({
      ...prev,
      workspaceEmails: [emailLog, ...prev.workspaceEmails],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.workspaceEmails
      .append(emailLog, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      'Corporate Email Recorded',
      `${emailLog.subject} → ${emailLog.toRecipients}`,
      'success',
    );
  };

  // Unified Mail, Live Team Chat & Google Meet Hub Handlers (Available to ALL Signed-In Users)
  const handleSendCorporateMail = (payload: SendCorporateMailPayload) => {
    if (!isApprovedUser) return;
    const now = new Date().toISOString();
    const selfEmailLower = currentUser.email.trim().toLowerCase();
    const messageId =
      payload.draftId || `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newMail: CorporateMailMessage = {
      id: messageId,
      threadId: payload.threadId || `thr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      parentId: payload.parentId,
      fromUserId: currentUser.id,
      fromName: currentUser.name,
      fromEmail: currentUser.email,
      toEmails: payload.toEmails,
      ccEmails: payload.ccEmails,
      subject: payload.subject,
      body: payload.body,
      status: 'sent',
      readBy: [selfEmailLower],
      meetInvite: payload.meetInvite,
      deliveryMethod: payload.deliveryMethod,
      createdAt: now,
      updatedAt: now,
    };

    const auditEntry = createAuditEvent(
      'MAIL-HUB',
      'Mail Sent',
      `${currentUser.name} (${currentUser.role}) sent email "${payload.subject}" to ${payload.toEmails.join(', ')} via ${payload.deliveryMethod}.`,
    );

    const nextMails = mergeCorporateMails(
      state.corporateMails,
      [newMail],
      deletedMailIdsRef.current,
    );

    setState((prev) => ({
      ...prev,
      corporateMails: mergeCorporateMails(prev.corporateMails, [newMail], deletedMailIdsRef.current),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void commsChannelRef.current?.send({
      type: 'broadcast',
      event: 'mail:upsert',
      payload: newMail,
    });

    void dataService.comms
      .saveCorporateMails(nextMails, currentUser.name, auditEntry, Array.from(deletedMailIdsRef.current))
      .then((syncedMails) => {
        if (dataService.isSupabaseConfigured()) {
          setDbConnected(true);
          setLastSyncError(null);
        }
        setState((prev) => ({
          ...prev,
          corporateMails: mergeCorporateMails(
            syncedMails,
            prev.corporateMails,
            deletedMailIdsRef.current,
          ),
        }));
      })
      .catch(handleCloudWriteError);

    pushToast('Email Sent', `"${payload.subject}" delivered to ${payload.toEmails.join(', ')}`, 'success');
  };

  const handleSaveCorporateDraft = (payload: SaveCorporateDraftPayload) => {
    if (!isApprovedUser) return;
    const now = new Date().toISOString();
    const selfEmailLower = currentUser.email.trim().toLowerCase();
    const draftId =
      payload.draftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = state.corporateMails.find((m) => m.id === draftId);
    const draft: CorporateMailMessage = {
      id: draftId,
      threadId: payload.threadId || existing?.threadId || `thr-${Date.now()}`,
      parentId: payload.parentId || existing?.parentId,
      fromUserId: currentUser.id,
      fromName: currentUser.name,
      fromEmail: currentUser.email,
      toEmails: payload.toEmails,
      ccEmails: payload.ccEmails,
      subject: payload.subject,
      body: payload.body,
      status: 'draft',
      readBy: [selfEmailLower],
      meetInvite: payload.meetInvite,
      deliveryMethod: 'NexOps Mail',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    deletedMailIdsRef.current.delete(draftId);
    const nextMails = mergeCorporateMails(
      state.corporateMails,
      [draft],
      deletedMailIdsRef.current,
    );

    setState((prev) => ({
      ...prev,
      corporateMails: mergeCorporateMails(prev.corporateMails, [draft], deletedMailIdsRef.current),
    }));

    void dataService.comms
      .saveCorporateMails(nextMails, currentUser.name, undefined, Array.from(deletedMailIdsRef.current))
      .then(() => {
        if (dataService.isSupabaseConfigured()) {
          setDbConnected(true);
          setLastSyncError(null);
        }
      })
      .catch(handleCloudWriteError);

    pushToast('Draft Saved', payload.subject || 'Untitled Draft', 'info');
  };

  const handleDeleteCorporateDraft = (draftId: string) => {
    if (!isApprovedUser) return;
    deletedMailIdsRef.current.add(draftId);
    const nextMails = state.corporateMails.filter((m) => m.id !== draftId);
    setState((prev) => ({
      ...prev,
      corporateMails: prev.corporateMails.filter((m) => m.id !== draftId),
    }));
    void dataService.comms
      .saveCorporateMails(nextMails, currentUser.name, undefined, Array.from(deletedMailIdsRef.current))
      .then(() => {
        if (dataService.isSupabaseConfigured()) {
          setDbConnected(true);
          setLastSyncError(null);
        }
      })
      .catch(handleCloudWriteError);
    pushToast('Draft Deleted', 'Removed draft from Mail & Chat Hub.', 'info');
  };

  const handleMarkMailRead = useCallback(
    (mailId: string) => {
      const selfEmailLower = currentUser.email.trim().toLowerCase();
      if (!selfEmailLower) return;
      let changed = false;
      let nextSnapshot: CorporateMailMessage[] = [];
      setState((prev) => {
        const nextMails = prev.corporateMails.map((m) => {
          if (m.id !== mailId) return m;
          if (m.readBy.some((e) => e.trim().toLowerCase() === selfEmailLower)) return m;
          changed = true;
          return { ...m, readBy: [...m.readBy, selfEmailLower] };
        });
        nextSnapshot = nextMails;
        return changed ? { ...prev, corporateMails: nextMails } : prev;
      });
      if (changed) {
        void dataService.comms
          .saveCorporateMails(
            nextSnapshot,
            currentUser.name,
            undefined,
            Array.from(deletedMailIdsRef.current),
          )
          .catch(() => {});
      }
    },
    [currentUser.email, currentUser.name],
  );

  const handleSendChatMessage = (payload: SendChatMessagePayload) => {
    if (!isApprovedUser) return;
    const now = new Date().toISOString();
    const selfEmailLower = currentUser.email.trim().toLowerCase();
    const msg: TeamChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      roomId: payload.roomId,
      roomType: payload.roomType,
      roomLabel: payload.roomLabel,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderEmail: currentUser.email,
      senderRole: currentUser.role,
      senderDepartment: currentUser.department,
      body: payload.body,
      meetInvite: payload.meetInvite,
      readBy: [selfEmailLower],
      createdAt: now,
    };

    const nextMessages = mergeChatMessages(state.chatMessages, [msg]);
    setState((prev) => ({
      ...prev,
      chatMessages: mergeChatMessages(prev.chatMessages, [msg]),
    }));

    void commsChannelRef.current?.send({
      type: 'broadcast',
      event: 'chat:message',
      payload: msg,
    });

    void dataService.comms
      .saveChatMessages(nextMessages, currentUser.name)
      .then((syncedMessages) => {
        if (dataService.isSupabaseConfigured()) {
          setDbConnected(true);
          setLastSyncError(null);
        }
        setState((prev) => ({
          ...prev,
          chatMessages: mergeChatMessages(syncedMessages, prev.chatMessages),
        }));
      })
      .catch(handleCloudWriteError);
  };

  const handleMarkChatRoomRead = useCallback(
    (roomId: string) => {
      const selfEmailLower = currentUser.email.trim().toLowerCase();
      if (!selfEmailLower) return;
      let changed = false;
      let nextSnapshot: TeamChatMessage[] = [];
      setState((prev) => {
        const nextMessages = prev.chatMessages.map((msg) => {
          if (msg.roomId !== roomId) return msg;
          if (msg.readBy.some((e) => e.trim().toLowerCase() === selfEmailLower)) return msg;
          changed = true;
          return { ...msg, readBy: [...msg.readBy, selfEmailLower] };
        });
        nextSnapshot = nextMessages;
        return changed ? { ...prev, chatMessages: nextMessages } : prev;
      });
      if (changed) {
        void dataService.comms
          .saveChatMessages(nextSnapshot, currentUser.name)
          .catch(() => {});
      }
    },
    [currentUser.email, currentUser.name],
  );

  const handleStartGoogleMeetSession = (payload: StartGoogleMeetPayload) => {
    if (!isApprovedUser) return;
    const now = new Date().toISOString();
    const maxNum = state.meetings.reduce((max, m) => {
      const match = m.code.match(/^MOM-\d{4}-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    const code = `MOM-2026-${String(maxNum + 1).padStart(3, '0')}`;
    const newMeeting: MeetingMinute = {
      id: `mom-meet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code,
      title: payload.title,
      meetingDate: getTodayDateString(),
      department: payload.department || currentUser.department,
      facilitator: currentUser.name,
      attendees: payload.attendees.length > 0 ? payload.attendees : [currentUser.name],
      summary: `Google Meet video call launched from ${payload.sourceLabel}.\nMeet Link: ${payload.meetUrl}`,
      decisions: [`Google Meet URL: ${payload.meetUrl}`],
      actionItems: [],
      createdAt: now,
      updatedAt: now,
    };

    const auditEntry = createAuditEvent(
      code,
      'Meet Session Logged',
      `${currentUser.name} started Google Meet "${payload.title}" (${payload.meetUrl}) from ${payload.sourceLabel} and logged MoM ${code}.`,
    );

    setState((prev) => ({
      ...prev,
      meetings: mergeMeetings(prev.meetings, [newMeeting]),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void commsChannelRef.current?.send({
      type: 'broadcast',
      event: 'meet:invite',
      payload: newMeeting,
    });

    void dataService.comms
      .saveMeetSession(newMeeting, currentUser.name, auditEntry)
      .then((syncedMeetings) => {
        if (dataService.isSupabaseConfigured()) {
          setDbConnected(true);
          setLastSyncError(null);
        }
        setState((prev) => ({
          ...prev,
          meetings: mergeMeetings(syncedMeetings, prev.meetings),
        }));
      })
      .catch(handleCloudWriteError);

    pushToast(
      `Google Meet Logged · ${code}`,
      `Opened Meet and recorded session in Meetings & MoM.`,
      'success',
    );
  };

  const handleSaveWorkspaceLink = (link: WorkspaceSavedLink) => {
    if (currentUser.role !== 'Admin') return;
    const toolLabel =
      link.toolType === 'docs'
        ? 'Google Docs'
        : link.toolType === 'sheets'
          ? 'Google Sheets'
          : 'Google Forms';
    const auditEntry = createAuditEvent(
      `WORKSPACE-${link.toolType.toUpperCase()}`,
      'Team Updated',
      `Added ${toolLabel} link "${link.title}" (${link.department}) to Workspace Tools.`,
    );

    setState((prev) => ({
      ...prev,
      workspaceLinks: [
        link,
        ...prev.workspaceLinks.filter((existing) => existing.id !== link.id),
      ],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.workspaceLinks
      .upsert(link, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(`${toolLabel} Linked`, link.title, 'success');
  };

  const handleDeleteWorkspaceLink = (linkId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.workspaceLinks.find((l) => l.id === linkId);
    if (!target) return;
    const auditEntry = createAuditEvent(
      `WORKSPACE-${target.toolType.toUpperCase()}`,
      'Team Updated',
      `Removed shared link "${target.title}" from Workspace Tools.`,
    );

    setState((prev) => ({
      ...prev,
      workspaceLinks: prev.workspaceLinks.filter((l) => l.id !== linkId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    void dataService.workspaceLinks
      .remove(linkId, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast('Workspace Link Removed', target.title, 'info');
  };

  // Task Sub-Tasks Checklist & Threaded Team Comments (@mentions)
  const handleAddSubtask = (requestId: string, title: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · Sub-Task`,
        summary: `Add sub-task "${title}" to ${requestId}`,
        diffs: [{ field: 'New Sub-Task', before: '—', after: title }],
        payload: {
          op: 'request_add_subtask',
          requestId,
          title,
        },
      });
      return;
    }
    const now = new Date().toISOString();
    const subtask: TaskSubtask = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId,
      title,
      completed: false,
      createdBy: currentUser.name,
      createdAt: now,
    };
    const auditEntry = createAuditEvent(
      requestId,
      'Subtask Updated',
      `Added sub-task "${title}" to ${requestId}.`,
    );
    setState((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, subtask],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.subtasks
      .upsert(subtask, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Sub-Task Added', title, 'success');
  };

  const handleToggleSubtask = (subtaskId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.subtasks.find((s) => s.id === subtaskId);
    if (!target) return;
    const nextCompleted = !target.completed;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: target.requestId,
        itemLabel: `${target.requestId} · Sub-Task`,
        summary: `${nextCompleted ? 'Complete' : 'Reopen'} sub-task "${target.title}" on ${target.requestId}`,
        diffs: [
          {
            field: target.title,
            before: target.completed ? 'Completed' : 'Open',
            after: nextCompleted ? 'Completed' : 'Open',
          },
        ],
        payload: {
          op: 'request_toggle_subtask',
          requestId: target.requestId,
          subtaskId,
          nextCompleted,
        },
      });
      return;
    }
    const now = new Date().toISOString();
    const updatedSubtask: TaskSubtask = {
      ...target,
      completed: nextCompleted,
      completedBy: nextCompleted ? currentUser.name : undefined,
      completedAt: nextCompleted ? now : undefined,
    };
    const auditEntry = createAuditEvent(
      target.requestId,
      'Subtask Updated',
      `${nextCompleted ? 'Completed' : 'Reopened'} sub-task "${target.title}" on ${target.requestId}.`,
    );
    setState((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((s) => (s.id === subtaskId ? updatedSubtask : s)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.subtasks
      .upsert(updatedSubtask, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.subtasks.find((s) => s.id === subtaskId);
    if (!target) return;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: target.requestId,
        itemLabel: `${target.requestId} · Sub-Task`,
        summary: `Remove sub-task "${target.title}" from ${target.requestId}`,
        diffs: [{ field: 'Sub-Task', before: target.title, after: 'Delete Requested' }],
        payload: {
          op: 'request_delete_subtask',
          requestId: target.requestId,
          subtaskId,
        },
      });
      return;
    }
    const auditEntry = createAuditEvent(
      target.requestId,
      'Subtask Updated',
      `Removed sub-task "${target.title}" from ${target.requestId}.`,
    );
    setState((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((s) => s.id !== subtaskId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.subtasks
      .remove(subtaskId, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
  };

  const handleAddTaskComment = (requestId: string, body: string, mentions: string[]) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'update',
        targetId: requestId,
        itemLabel: `${requestId} · Discussion Comment`,
        summary: `Post discussion comment on ${requestId}: "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}"`,
        diffs: [{ field: 'Discussion Comment', before: '—', after: body }],
        payload: {
          op: 'request_add_task_comment',
          requestId,
          body,
          mentions,
        },
      });
      return;
    }
    const now = new Date().toISOString();
    const comment: TaskComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requestId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorEmail: currentUser.email,
      authorRole: currentUser.role,
      body,
      mentions,
      createdAt: now,
    };
    const auditEntry = createAuditEvent(
      requestId,
      'Comment Added',
      `${currentUser.name} posted team discussion comment on ${requestId}: "${body.slice(0, 120)}${body.length > 120 ? '...' : ''}"`,
    );

    const uniqueMentionEmails = Array.from(
      new Set(
        mentions
          .map((m) => m.trim().toLowerCase())
          .filter((email) => email && email !== currentUser.email.trim().toLowerCase()),
      ),
    );

    const mentionNotifs: AppNotification[] = uniqueMentionEmails.map((recipientEmail, idx) => ({
      id: `notif-mnt-${Date.now()}-${idx}`,
      title: `Mentioned in ${requestId}`,
      message: `${currentUser.name} mentioned you: "${body.slice(0, 100)}${body.length > 100 ? '...' : ''}"`,
      timestamp: now,
      read: false,
      requestId,
      targetSection: 'requests',
      recipientEmail,
      actorEmail: currentUser.email,
      category: 'mention',
      severity: 'info',
    }));

    setState((prev) => ({
      ...prev,
      taskComments: [...prev.taskComments, comment],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [...mentionNotifs, ...prev.notifications],
    }));

    void Promise.all([
      dataService.taskComments.create(comment, auditEntry),
      mentionNotifs.length > 0
        ? dataService.notifications.createMany(mentionNotifs)
        : Promise.resolve(),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(
      'Comment Posted',
      mentionNotifs.length > 0
        ? `Notified ${mentionNotifs.length} mentioned teammate${mentionNotifs.length === 1 ? '' : 's'}.`
        : `Added discussion note to ${requestId}.`,
      'success',
    );
  };

  // Department Document Vault Handlers
  const handleAddVaultDocument = (item: DocumentVaultItem) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'vault',
        moduleLabel: 'Document Vault',
        action: 'create',
        targetId: item.id,
        itemLabel: item.title,
        summary: `Add document "${item.title}" to ${item.folder} (${item.accessTag}, ${item.department})`,
        diffs: [
          { field: 'Title', before: '— (New Document)', after: item.title },
          { field: 'Folder', before: '—', after: item.folder },
          { field: 'Department', before: '—', after: item.department },
          { field: 'Access Policy', before: '—', after: item.accessTag },
          ...(item.fileName ? [{ field: 'File Name', before: '—', after: item.fileName }] : []),
        ],
        payload: {
          op: 'vault_create',
          document: item,
        },
      });
      return;
    }
    const auditEntry = createAuditEvent(
      'DOC-VAULT',
      'Vault Updated',
      `Added "${item.title}" to ${item.folder} (${item.accessTag}, ${item.department}).`,
    );
    const nextVaultDocs = [item, ...state.vaultDocuments];
    setState((prev) => ({
      ...prev,
      vaultDocuments: [item, ...prev.vaultDocuments],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.documentVault
      .upsert(item, auditEntry, nextVaultDocs)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Document Added to Vault', `${item.title} (${item.folder})`, 'success');
  };

  const handleDeleteVaultDocument = (itemId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    const target = state.vaultDocuments.find((d) => d.id === itemId);
    if (!target) return;
    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'vault',
        moduleLabel: 'Document Vault',
        action: 'delete',
        targetId: itemId,
        itemLabel: target.title,
        summary: `Delete document "${target.title}" from ${target.folder}`,
        diffs: [
          {
            field: 'Document Record',
            before: `${target.title} (${target.folder})`,
            after: 'Delete Requested',
          },
        ],
        payload: {
          op: 'vault_delete',
          documentId: itemId,
        },
      });
      return;
    }
    const auditEntry = createAuditEvent(
      'DOC-VAULT',
      'Vault Updated',
      `Removed "${target.title}" from ${target.folder}.`,
    );
    const remainingVaultDocs = state.vaultDocuments.filter((d) => d.id !== itemId);
    setState((prev) => ({
      ...prev,
      vaultDocuments: prev.vaultDocuments.filter((d) => d.id !== itemId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.documentVault
      .remove(itemId, auditEntry, target, remainingVaultDocs)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Document Removed', target.title, 'info');
  };

  const getScopedNotificationIds = () => {
    const userEmail = currentUser.email.trim().toLowerCase();
    return state.notifications
      .filter((n) => {
        if (n.recipientEmail) {
          return n.recipientEmail.trim().toLowerCase() === userEmail;
        }
        if (n.recipientRole && n.recipientRole !== 'all') {
          return n.recipientRole === currentUser.role;
        }
        return true;
      })
      .map((n) => n.id);
  };

  const handleMarkAllRead = () => {
    const visibleIds = getScopedNotificationIds();
    if (visibleIds.length === 0) return;
    void dataService.notifications.markAllRead(visibleIds);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        visibleIds.includes(n.id) ? { ...n, read: true } : n,
      ),
    }));
    pushToast('Notifications Read', 'All notifications marked as read.', 'info');
  };

  const handleClearNotifications = () => {
    const visibleIds = getScopedNotificationIds();
    if (visibleIds.length === 0) return;
    void dataService.notifications.clearAll(visibleIds);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => !visibleIds.includes(n.id)),
    }));
    pushToast('Notifications Cleared', 'Cleared your notification feed.', 'info');
  };

  const handleSelectNotification = (notification: AppNotification) => {
    void dataService.notifications.markRead(notification.id);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notification.id ? { ...n, read: true } : n,
      ),
    }));
    if (notification.requestId) {
      setActiveSection('requests');
      setSelectedRequestId(notification.requestId);
    } else if (notification.targetSection) {
      if (
        (notification.targetSection === 'settings' || notification.targetSection === 'audit') &&
        currentUser.role !== 'Admin'
      ) {
        return;
      }
      setActiveSection(notification.targetSection);
    }
  };

  const handleInspectRequestById = (requestId: string) => {
    const found = state.requests.find((r) => r.id === requestId);
    if (found) {
      setActiveSection('requests');
      setSelectedRequestId(found.id);
    } else {
      pushToast('Request Not Found', `${requestId} is not present in the active queue.`, 'warning');
    }
  };

  // Bulk Priority Update
  const handleBulkUpdatePriority = (requestIds: string[], nextPriority: Priority) => {
    if (currentUser.role !== 'Admin') return;
    if (requestIds.length === 0) return;
    const now = new Date().toISOString();
    const auditEntries: AuditEvent[] = [];

    setState((prev) => {
      const updatedRequests = prev.requests.map((req) => {
        if (!requestIds.includes(req.id)) return req;
        const entry = createAuditEvent(
          req.id,
          'Status Changed',
          `Bulk priority update: ${req.priority} → ${nextPriority}.`,
          prev.activeRole,
          prev.teamMembers,
        );
        auditEntries.push(entry);
        return {
          ...req,
          priority: nextPriority,
          updatedAt: now,
          auditTrail: [...req.auditTrail, entry],
        };
      });

      return {
        ...prev,
        requests: updatedRequests,
        globalAuditLogs: [...auditEntries.slice().reverse(), ...prev.globalAuditLogs],
      };
    });

    const syncEntries = requestIds.map((id) =>
      createAuditEvent(
        id,
        'Status Changed',
        `Bulk priority update to ${nextPriority}.`,
        state.activeRole,
      ),
    );
    void dataService.requests
      .bulkUpdatePriority(requestIds, nextPriority, now, syncEntries)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      `Updated ${requestIds.length} Request${requestIds.length > 1 ? 's' : ''}`,
      `Assigned ${nextPriority} priority and recorded audit entries.`,
      'success',
    );
  };

  // Bulk CSV Import
  const handleImportRequests = (rows: ImportedRequestRow[]) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') return;
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const baseId = generateNextRequestId(state.requests);
    const idMatch = baseId.match(/^(REQ-\d{4}-)(\d+)$/);
    const startNumber = idMatch ? parseInt(idMatch[2], 10) : 1;
    const prefix = idMatch ? idMatch[1] : 'REQ-2026-';

    const newRequests: OperationalRequest[] = [];
    const auditEntries: AuditEvent[] = [];

    rows.forEach((row, idx) => {
      const newId = `${prefix}${String(startNumber + idx).padStart(3, '0')}`;
      const reviewerResolution = resolveEffectiveReviewer(
        row.assignedReviewer || defaultReviewerName,
        state.teamMembers,
      );
      const auditEntry = createAuditEvent(
        newId,
        'Created',
        `Imported operational request ${newId} ("${row.title}") via CSV bulk upload (${row.status}).`,
      );
      const newReq: OperationalRequest = {
        id: newId,
        title: row.title,
        category: row.category,
        department: row.department,
        submittedBy: row.submittedBy || currentActor.name,
        submitterId: currentActor.id,
        assignedReviewer: reviewerResolution.assignedReviewer,
        delegatedFromReviewer: reviewerResolution.delegatedFromReviewer,
        priority: row.priority,
        status: row.status,
        dueDate: row.dueDate,
        createdAt: now,
        updatedAt: now,
        description: row.description,
        deliverableUrl: row.deliverableUrl,
        checklist: row.checklist.map((item, cIdx) => ({
          id: `chk-${newId}-${cIdx + 1}`,
          label: item.label,
          mandatory: item.mandatory,
          checked: false,
        })),
        auditTrail: [auditEntry],
      };
      newRequests.push(newReq);
      auditEntries.push(auditEntry);
    });

    if (currentUser.role === 'Editor') {
      submitEditorChangeProposal({
        module: 'requests',
        moduleLabel: 'Operational Requests',
        action: 'create',
        targetId: newRequests[0]?.id || 'CSV-IMPORT',
        itemLabel: `CSV Bulk Import (${newRequests.length} Requests)`,
        summary: `Import ${newRequests.length} operational request(s) via CSV (${newRequests[0]?.id}–${newRequests[newRequests.length - 1]?.id})`,
        diffs: [
          {
            field: 'Batch Size',
            before: '— (CSV Import)',
            after: `${newRequests.length} operational requests`,
          },
          ...newRequests.slice(0, 4).map((r) => ({
            field: r.id,
            before: '—',
            after: `${r.title} (${r.department} · ${r.priority})`,
          })),
        ],
        payload: {
          op: 'request_bulk_import',
          requests: newRequests,
        },
      });
      setImportModalOpen(false);
      setActiveSection('requests');
      return;
    }

    const notification: AppNotification = {
      id: `notif-${Date.now()}`,
      title: `CSV Bulk Import (${newRequests.length} Requests)`,
      message: `${currentActor.name} imported ${newRequests.length} operational requests (${newRequests[0].id}–${newRequests[newRequests.length - 1].id}).`,
      timestamp: now,
      read: false,
      requestId: newRequests[0].id,
      severity: 'info',
    };

    setState((prev) => ({
      ...prev,
      requests: [...newRequests, ...prev.requests],
      globalAuditLogs: [...auditEntries, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void dataService.requests
      .bulkCreate(newRequests, auditEntries, notification)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    setImportModalOpen(false);
    setActiveSection('requests');
    pushToast(
      `Imported ${newRequests.length} Requests`,
      `Assigned IDs ${newRequests[0].id} through ${newRequests[newRequests.length - 1].id}.`,
      'success',
    );
  };

  // Super Admin Maker-Checker Approval & Rejection Handlers
  const handleApproveEditorChange = (changeId: string) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the Super Admin can approve Editor changes.', 'error');
      return;
    }
    const chg = state.pendingEditorChanges.find((c) => c.id === changeId);
    if (!chg || chg.status !== 'pending') return;

    const now = new Date().toISOString();
    const targetSectionMap: Record<PendingEditorChangeModule, NavSection> = {
      requests: 'requests',
      projects: 'projects',
      assets: 'assets',
      sops: 'sops',
      vault: 'vault',
      meetings: 'meetings',
    };

    const approvalAudit = createAuditEvent(
      chg.targetId || chg.module.toUpperCase(),
      'Team Updated',
      `Approved & applied Editor proposal by ${chg.editorName} (${chg.editorEmail}) in ${chg.moduleLabel}: ${chg.summary}`,
    );

    const editorNotif: AppNotification = {
      id: `notif-ed-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Edit Approved · ${chg.moduleLabel}`,
      message: `${currentUser.name} approved and published your change: ${chg.summary}`,
      timestamp: now,
      read: false,
      targetSection: targetSectionMap[chg.module],
      recipientEmail: chg.editorEmail,
      actorEmail: currentUser.email,
      category: 'editor_approval',
      severity: 'success',
    };

    const nextPendingChanges: PendingEditorChange[] = state.pendingEditorChanges.map((c) =>
      c.id === changeId
        ? { ...c, status: 'approved', reviewedBy: currentUser.name, reviewedAt: now }
        : c,
    );

    let nextRequests = state.requests;
    let nextProjects = state.projects;
    let nextAssets = state.assets;
    let nextSops = state.sops;
    let nextVault = state.vaultDocuments;
    let nextMeetings = state.meetings;
    let nextSubtasks = state.subtasks;
    let nextTaskComments = state.taskComments;
    const extraNotifications: AppNotification[] = [editorNotif];
    const cloudTasks: Promise<unknown>[] = [
      dataService.editorChanges.saveAll(nextPendingChanges, currentUser.name, approvalAudit),
      dataService.notifications.create(editorNotif),
    ];

    const p = chg.payload;
    switch (p.op) {
      case 'request_create': {
        const collision = state.requests.some((r) => r.id === p.request.id);
        const resolvedId = collision ? generateNextRequestId(state.requests) : p.request.id;
        const createdReq: OperationalRequest = {
          ...p.request,
          id: resolvedId,
          updatedAt: now,
          checklist: p.request.checklist.map((c, idx) => ({
            ...c,
            id: collision ? `chk-${resolvedId}-${idx + 1}` : c.id,
          })),
          auditTrail: [...p.request.auditTrail, approvalAudit],
        };
        nextRequests = [createdReq, ...state.requests];
        if (createdReq.assetId || createdReq.assetTag) {
          const linkedAsset = state.assets.find(
            (ast) => ast.id === createdReq.assetId || ast.tag === createdReq.assetTag,
          );
          if (linkedAsset) {
            const updatedAst: CompanyAsset = {
              ...linkedAsset,
              updatedAt: now,
              history: [
                {
                  id: `ah-req-${Date.now()}`,
                  timestamp: now,
                  actorName: chg.editorName,
                  eventType: 'Request Linked',
                  details: `Linked to ${createdReq.category} ${resolvedId} ("${createdReq.title}") — Approved by ${currentUser.name}.`,
                  requestId: resolvedId,
                },
                ...linkedAsset.history,
              ],
            };
            nextAssets = state.assets.map((ast) => (ast.id === updatedAst.id ? updatedAst : ast));
            cloudTasks.push(dataService.assets.upsert(updatedAst));
          }
        }
        cloudTasks.push(dataService.requests.create(createdReq, approvalAudit, null));
        break;
      }
      case 'request_bulk_import': {
        const baseId = generateNextRequestId(state.requests);
        const idMatch = baseId.match(/^(REQ-\d{4}-)(\d+)$/);
        const startNum = idMatch ? parseInt(idMatch[2], 10) : 1;
        const prefix = idMatch ? idMatch[1] : 'REQ-2026-';
        const importedReqs = p.requests.map((r, idx) => {
          const exists = state.requests.some((ex) => ex.id === r.id);
          const resolvedId = exists ? `${prefix}${String(startNum + idx).padStart(3, '0')}` : r.id;
          return {
            ...r,
            id: resolvedId,
            updatedAt: now,
            checklist: r.checklist.map((c, cIdx) => ({
              ...c,
              id: exists ? `chk-${resolvedId}-${cIdx + 1}` : c.id,
            })),
            auditTrail: [...r.auditTrail, approvalAudit],
          };
        });
        nextRequests = [...importedReqs, ...state.requests];
        cloudTasks.push(dataService.requests.bulkCreate(importedReqs, [approvalAudit], null));
        break;
      }
      case 'request_update': {
        const target = state.requests.find((r) => r.id === p.requestId);
        if (target) {
          const updatedReq: OperationalRequest = {
            ...target,
            ...p.patch,
            updatedAt: now,
            auditTrail: [...target.auditTrail, approvalAudit],
          };
          nextRequests = state.requests.map((r) => (r.id === p.requestId ? updatedReq : r));
          cloudTasks.push(dataService.requests.updateContent(updatedReq, approvalAudit));
        }
        break;
      }
      case 'request_delete': {
        nextRequests = state.requests.filter((r) => r.id !== p.requestId);
        nextSubtasks = state.subtasks.filter((st) => st.requestId !== p.requestId);
        nextTaskComments = state.taskComments.filter((cmt) => cmt.requestId !== p.requestId);
        if (selectedRequestId === p.requestId) setSelectedRequestId(null);
        cloudTasks.push(dataService.requests.remove(p.requestId, approvalAudit));
        break;
      }
      case 'request_toggle_checklist': {
        const target = state.requests.find((r) => r.id === p.requestId);
        if (target) {
          const updatedChecklist = target.checklist.map((chk) =>
            chk.id === p.itemId
              ? {
                  ...chk,
                  checked: p.nextChecked,
                  verifiedBy: p.nextChecked ? `${chg.editorName} (Approved by ${currentUser.name})` : undefined,
                  verifiedAt: p.nextChecked ? now : undefined,
                }
              : chk,
          );
          nextRequests = state.requests.map((r) =>
            r.id === p.requestId
              ? { ...r, updatedAt: now, checklist: updatedChecklist, auditTrail: [...r.auditTrail, approvalAudit] }
              : r,
          );
          cloudTasks.push(
            dataService.checklists.updateRequestChecklist(
              p.requestId,
              updatedChecklist,
              now,
              approvalAudit,
            ),
          );
        }
        break;
      }
      case 'request_update_financials': {
        const target = state.requests.find((r) => r.id === p.requestId);
        if (target) {
          nextRequests = state.requests.map((r) =>
            r.id === p.requestId
              ? { ...r, actualSpend: p.actualSpend, updatedAt: now, auditTrail: [...r.auditTrail, approvalAudit] }
              : r,
          );
          dataService.requests.updateMetaSync(p.requestId, { actualSpend: p.actualSpend });
          cloudTasks.push(
            dataService.requests.syncMetaCloud(p.requestId, { actualSpend: p.actualSpend }, currentUser.name),
          );
        }
        break;
      }
      case 'request_add_subtask': {
        const subtask: TaskSubtask = {
          id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          requestId: p.requestId,
          title: p.title,
          completed: false,
          createdBy: chg.editorName,
          createdAt: now,
        };
        nextSubtasks = [...state.subtasks, subtask];
        cloudTasks.push(dataService.subtasks.upsert(subtask, approvalAudit));
        break;
      }
      case 'request_toggle_subtask': {
        const target = state.subtasks.find((s) => s.id === p.subtaskId);
        if (target) {
          const updatedSubtask: TaskSubtask = {
            ...target,
            completed: p.nextCompleted,
            completedBy: p.nextCompleted ? chg.editorName : undefined,
            completedAt: p.nextCompleted ? now : undefined,
          };
          nextSubtasks = state.subtasks.map((s) => (s.id === p.subtaskId ? updatedSubtask : s));
          cloudTasks.push(dataService.subtasks.upsert(updatedSubtask, approvalAudit));
        }
        break;
      }
      case 'request_delete_subtask': {
        nextSubtasks = state.subtasks.filter((s) => s.id !== p.subtaskId);
        cloudTasks.push(dataService.subtasks.remove(p.subtaskId, approvalAudit));
        break;
      }
      case 'request_add_comment': {
        nextRequests = state.requests.map((r) =>
          r.id === p.requestId
            ? {
                ...r,
                updatedAt: now,
                auditTrail: [
                  ...r.auditTrail,
                  {
                    ...approvalAudit,
                    actionType: 'Comment Added',
                    actorName: chg.editorName,
                    actorEmail: chg.editorEmail,
                    actorRole: 'Editor',
                    details: `${p.comment} (Approved by ${currentUser.name})`,
                  },
                ],
              }
            : r,
        );
        break;
      }
      case 'request_add_task_comment': {
        const comment: TaskComment = {
          id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          requestId: p.requestId,
          authorId: chg.editorId,
          authorName: chg.editorName,
          authorEmail: chg.editorEmail,
          authorRole: 'Editor',
          body: p.body,
          mentions: p.mentions,
          createdAt: now,
        };
        nextTaskComments = [...state.taskComments, comment];
        const uniqueMentionEmails = Array.from(
          new Set(
            p.mentions
              .map((m) => m.trim().toLowerCase())
              .filter((email) => email && email !== chg.editorEmail.trim().toLowerCase()),
          ),
        );
        const mentionNotifs: AppNotification[] = uniqueMentionEmails.map((recipientEmail, idx) => ({
          id: `notif-mnt-${Date.now()}-${idx}`,
          title: `Mentioned in ${p.requestId}`,
          message: `${chg.editorName} mentioned you: "${p.body.slice(0, 100)}${p.body.length > 100 ? '...' : ''}"`,
          timestamp: now,
          read: false,
          requestId: p.requestId,
          targetSection: 'requests',
          recipientEmail,
          actorEmail: chg.editorEmail,
          category: 'mention',
          severity: 'info',
        }));
        extraNotifications.push(...mentionNotifs);
        cloudTasks.push(dataService.taskComments.create(comment, approvalAudit));
        if (mentionNotifs.length > 0) {
          cloudTasks.push(dataService.notifications.createMany(mentionNotifs));
        }
        break;
      }
      case 'project_create': {
        const createdProject: CompanyProject = { ...p.project, updatedAt: now };
        nextProjects = [createdProject, ...state.projects];
        cloudTasks.push(dataService.projects.upsert(createdProject, approvalAudit));
        break;
      }
      case 'project_update': {
        const target = state.projects.find((pr) => pr.id === p.projectId);
        if (target) {
          const updatedProject: CompanyProject = { ...target, ...p.patch, updatedAt: now };
          nextProjects = state.projects.map((pr) => (pr.id === p.projectId ? updatedProject : pr));
          nextRequests = state.requests.map((r) =>
            r.projectId === p.projectId
              ? { ...r, projectCode: updatedProject.code, projectName: updatedProject.name }
              : r,
          );
          cloudTasks.push(dataService.projects.upsert(updatedProject, approvalAudit));
        }
        break;
      }
      case 'project_delete': {
        nextProjects = state.projects.filter((pr) => pr.id !== p.projectId);
        cloudTasks.push(dataService.projects.remove(p.projectId, approvalAudit));
        break;
      }
      case 'asset_create': {
        const createdAsset: CompanyAsset = { ...p.asset, updatedAt: now };
        nextAssets = [createdAsset, ...state.assets];
        cloudTasks.push(dataService.assets.upsert(createdAsset, approvalAudit));
        break;
      }
      case 'asset_transfer': {
        const target = state.assets.find((a) => a.id === p.assetId);
        if (target) {
          const noteSuffix = p.patch.notes ? ` Note: ${p.patch.notes}` : '';
          const historyEntry: AssetHistoryEntry = {
            id: `ah-tx-${Date.now()}`,
            timestamp: now,
            actorName: `${chg.editorName} (Approved by ${currentUser.name})`,
            eventType: 'Assigned / Transferred',
            details: `Custody updated from "${target.assignedTo}" to "${p.patch.assignedTo}" (${p.patch.department}, Status: ${p.patch.status}, Condition: ${p.patch.condition}).${noteSuffix}`,
          };
          const updatedAsset: CompanyAsset = {
            ...target,
            assignedTo: p.patch.assignedTo,
            department: p.patch.department,
            condition: p.patch.condition,
            status: p.patch.status,
            updatedAt: now,
            history: [historyEntry, ...target.history],
          };
          nextAssets = state.assets.map((a) => (a.id === p.assetId ? updatedAsset : a));
          cloudTasks.push(dataService.assets.upsert(updatedAsset, approvalAudit));
        }
        break;
      }
      case 'asset_maintenance': {
        const target = state.assets.find((a) => a.id === p.assetId);
        if (target) {
          const historyEntry: AssetHistoryEntry = {
            id: `ah-mnt-${Date.now()}`,
            timestamp: now,
            actorName: `${chg.editorName} (Approved by ${currentUser.name})`,
            eventType: 'Maintenance Logged',
            details: `Maintenance log (${p.patch.status} · Condition: ${p.patch.condition}): ${p.patch.notes}`,
          };
          const updatedAsset: CompanyAsset = {
            ...target,
            condition: p.patch.condition,
            status: p.patch.status,
            updatedAt: now,
            history: [historyEntry, ...target.history],
          };
          nextAssets = state.assets.map((a) => (a.id === p.assetId ? updatedAsset : a));
          cloudTasks.push(dataService.assets.upsert(updatedAsset, approvalAudit));
        }
        break;
      }
      case 'sop_create': {
        const createdSop: SopDocument = { ...p.sop, updatedAt: now };
        nextSops = [createdSop, ...state.sops];
        cloudTasks.push(dataService.sops.upsert(createdSop, approvalAudit));
        break;
      }
      case 'sop_toggle_mandatory': {
        const target = state.sops.find((s) => s.id === p.sopId);
        if (target) {
          const updatedSop: SopDocument = {
            ...target,
            mandatoryRead: p.nextMandatory,
            updatedAt: now,
          };
          nextSops = state.sops.map((s) => (s.id === p.sopId ? updatedSop : s));
          cloudTasks.push(dataService.sops.upsert(updatedSop, approvalAudit));
        }
        break;
      }
      case 'vault_create': {
        const createdDoc: DocumentVaultItem = { ...p.document, updatedAt: now };
        nextVault = [createdDoc, ...state.vaultDocuments];
        cloudTasks.push(dataService.documentVault.upsert(createdDoc, approvalAudit, nextVault));
        break;
      }
      case 'vault_delete': {
        const target = state.vaultDocuments.find((d) => d.id === p.documentId);
        nextVault = state.vaultDocuments.filter((d) => d.id !== p.documentId);
        cloudTasks.push(dataService.documentVault.remove(p.documentId, approvalAudit, target, nextVault));
        break;
      }
      case 'meeting_create': {
        const createdMeeting: MeetingMinute = { ...p.meeting, updatedAt: now };
        nextMeetings = [createdMeeting, ...state.meetings];
        cloudTasks.push(dataService.meetings.upsert(createdMeeting, approvalAudit));
        break;
      }
      case 'meeting_add_action': {
        const target = state.meetings.find((m) => m.id === p.meetingId);
        if (target) {
          const updatedMeeting: MeetingMinute = {
            ...target,
            updatedAt: now,
            actionItems: [...target.actionItems, p.actionItem],
          };
          nextMeetings = state.meetings.map((m) => (m.id === p.meetingId ? updatedMeeting : m));
          cloudTasks.push(dataService.meetings.upsert(updatedMeeting, approvalAudit));
        }
        break;
      }
      case 'meeting_convert_action': {
        const targetMeeting = state.meetings.find((m) => m.id === p.meetingId);
        const actionItem = targetMeeting?.actionItems.find((a) => a.id === p.actionItemId);
        if (targetMeeting && actionItem && !actionItem.linkedRequestId) {
          const newId = generateNextRequestId(state.requests);
          const reviewerResolution = resolveEffectiveReviewer(defaultReviewerName, state.teamMembers);
          const ownerMember = state.teamMembers.find(
            (m) => m.name.toLowerCase() === actionItem.ownerName.toLowerCase(),
          );
          const newRequest: OperationalRequest = {
            id: newId,
            title: actionItem.description,
            category: branding.categories[0] || 'Operational Change',
            department: actionItem.department,
            submittedBy: actionItem.ownerName,
            submitterId: ownerMember?.id || chg.editorId,
            assignedReviewer: reviewerResolution.assignedReviewer,
            delegatedFromReviewer: reviewerResolution.delegatedFromReviewer,
            priority: actionItem.priority,
            status: 'Submitted',
            dueDate: actionItem.dueDate,
            createdAt: now,
            updatedAt: now,
            description: `Converted from Executive Meeting Minutes ${targetMeeting.code} (${targetMeeting.title}, held ${targetMeeting.meetingDate}).\n\nMeeting Summary: ${targetMeeting.summary}`,
            deliverableUrl: '',
            momCode: targetMeeting.code,
            checklist: [
              {
                id: `chk-${newId}-1`,
                label: `MoM ${targetMeeting.code} action item execution verified`,
                mandatory: true,
                checked: false,
              },
              {
                id: `chk-${newId}-2`,
                label: 'Department Lead & QA sign-off attached',
                mandatory: true,
                checked: false,
              },
            ],
            auditTrail: [approvalAudit],
          };
          const updatedMeeting: MeetingMinute = {
            ...targetMeeting,
            updatedAt: now,
            actionItems: targetMeeting.actionItems.map((a) =>
              a.id === p.actionItemId
                ? { ...a, status: 'Converted to Request', linkedRequestId: newId }
                : a,
            ),
          };
          nextRequests = [newRequest, ...state.requests];
          nextMeetings = state.meetings.map((m) => (m.id === p.meetingId ? updatedMeeting : m));
          cloudTasks.push(
            dataService.requests.create(newRequest, approvalAudit, null),
            dataService.meetings.upsert(updatedMeeting),
          );
        }
        break;
      }
      case 'meeting_complete_action': {
        const target = state.meetings.find((m) => m.id === p.meetingId);
        if (target) {
          const updatedMeeting: MeetingMinute = {
            ...target,
            updatedAt: now,
            actionItems: target.actionItems.map((a) =>
              a.id === p.actionItemId ? { ...a, status: 'Completed' } : a,
            ),
          };
          nextMeetings = state.meetings.map((m) => (m.id === p.meetingId ? updatedMeeting : m));
          cloudTasks.push(dataService.meetings.upsert(updatedMeeting, approvalAudit));
        }
        break;
      }
    }

    setState((prev) => ({
      ...prev,
      requests: nextRequests,
      projects: nextProjects,
      assets: nextAssets,
      sops: nextSops,
      vaultDocuments: nextVault,
      meetings: nextMeetings,
      subtasks: nextSubtasks,
      taskComments: nextTaskComments,
      pendingEditorChanges: nextPendingChanges,
      globalAuditLogs: [approvalAudit, ...prev.globalAuditLogs],
      notifications: [...extraNotifications, ...prev.notifications],
    }));

    void Promise.all(cloudTasks)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast('Change Approved & Applied', `${chg.itemLabel} published live.`, 'success');
  };

  const handleRejectEditorChange = (changeId: string, reason?: string) => {
    if (!isSuperAdminOperator) {
      pushToast('Super Admin Required', 'Only the Super Admin can reject Editor changes.', 'error');
      return;
    }
    const chg = state.pendingEditorChanges.find((c) => c.id === changeId);
    if (!chg || chg.status !== 'pending') return;

    const now = new Date().toISOString();
    const cleanReason = reason?.trim() || undefined;
    const targetSectionMap: Record<PendingEditorChangeModule, NavSection> = {
      requests: 'requests',
      projects: 'projects',
      assets: 'assets',
      sops: 'sops',
      vault: 'vault',
      meetings: 'meetings',
    };

    const rejectionAudit = createAuditEvent(
      chg.targetId || chg.module.toUpperCase(),
      'Team Updated',
      `Declined Editor proposal by ${chg.editorName} (${chg.editorEmail}) in ${chg.moduleLabel}: ${chg.summary}${cleanReason ? ` — Reason: ${cleanReason}` : ''}`,
    );

    const editorNotif: AppNotification = {
      id: `notif-ed-rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Edit Declined · ${chg.moduleLabel}`,
      message: `${currentUser.name} declined your proposed edit (${chg.itemLabel})${cleanReason ? `: ${cleanReason}` : '.'}`,
      timestamp: now,
      read: false,
      targetSection: targetSectionMap[chg.module],
      recipientEmail: chg.editorEmail,
      actorEmail: currentUser.email,
      category: 'editor_approval',
      severity: 'warning',
    };

    const nextPendingChanges: PendingEditorChange[] = state.pendingEditorChanges.map((c) =>
      c.id === changeId
        ? {
            ...c,
            status: 'rejected',
            reviewedBy: currentUser.name,
            reviewedAt: now,
            rejectionReason: cleanReason,
          }
        : c,
    );

    setState((prev) => ({
      ...prev,
      pendingEditorChanges: nextPendingChanges,
      globalAuditLogs: [rejectionAudit, ...prev.globalAuditLogs],
      notifications: [editorNotif, ...prev.notifications],
    }));

    void Promise.all([
      dataService.editorChanges.saveAll(nextPendingChanges, currentUser.name, rejectionAudit),
      dataService.notifications.create(editorNotif),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast('Editor Proposal Declined', `${chg.itemLabel} was not applied.`, 'warning');
  };

  // Command Search Quick Actions
  const handleSelectDepartmentFromSearch = (department: Department) => {
    setDepartmentFilter(department);
    setStatusFilter('All');
    setSearchQuery('');
    setActiveSection('requests');
    pushToast('Department Filtered', `Showing operational requests for ${department}.`, 'info');
  };

  const handleSelectAuditFromSearch = (audit: AuditEvent) => {
    const matchedRequest = state.requests.find((r) => r.id === audit.requestId);
    if (matchedRequest) {
      setSelectedRequestId(matchedRequest.id);
    } else if (isSuperAdminOperator) {
      setActiveSection('audit');
      pushToast('Opened Audit Ledger', `${audit.actionType} · ${audit.actorName}`, 'info');
    }
  };

  // System Backup Export / Restore (Super Admin Only)
  const handleDownloadBackup = () => {
    if (!isSuperAdminOperator) return;
    downloadSystemBackupJson(state, `${currentUser.name} (${currentUser.employeeId})`);
    const auditEntry = createAuditEvent(
      'SYS-BACKUP',
      'Team Updated',
      `Exported full JSON workspace backup (${state.requests.length} requests, ${state.globalAuditLogs.length} audit logs).`,
    );
    setState((prev) => ({
      ...prev,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.auditLogs.append(auditEntry).catch(handleCloudWriteError);
    pushToast(
      'System Backup Downloaded',
      'Full workspace snapshot saved as JSON.',
      'success',
    );
  };

  const handleRestoreBackup = async (restoredState: NexOpsState) => {
    if (currentUser.role !== 'Admin') return;
    const restoreEvent = createAuditEvent(
      'SYS-RESTORE',
      'Team Updated',
      `Restored workspace from JSON backup (${restoredState.requests.length} requests, ${restoredState.teamMembers.length} team members).`,
    );
    const mergedState: NexOpsState = {
      ...restoredState,
      globalAuditLogs: [restoreEvent, ...restoredState.globalAuditLogs],
    };
    try {
      await dataService.restoreWorkspaceBackup(mergedState, branding);
      if (dataService.isSupabaseConfigured()) {
        setDbConnected(true);
        void handleRunHealthCheck();
      }
    } catch (err) {
      handleCloudWriteError(err);
    }
    setState(mergedState);
    setSelectedRequestId(null);
    setSearchQuery('');
    setStatusFilter('All');
    setDepartmentFilter('All');
    setPriorityFilter('All');
    setOverdueOnly(false);
    pushToast(
      'Workspace Backup Restored',
      `Loaded ${mergedState.requests.length} requests and ${mergedState.teamMembers.length} directory accounts.`,
      'success',
    );
  };

  // White-Label Branding, Custom Lists & Permission Matrix Handlers (Admin Only)
  const handleUpdateBranding = (nextBranding: CompanyBrandingConfig) => {
    if (currentUser.role !== 'Admin') return;
    const saved = dataService.branding.saveSync(nextBranding);
    setBranding(saved);
    const sla = saved.slaPolicy ?? DEFAULT_SLA_POLICY;
    const auditEntry = createAuditEvent(
      'SYS-BRANDING',
      'Team Updated',
      `Updated white-label branding ("${saved.companyName}"), ${saved.departments.length} departments, ${saved.categories.length} categories, and SLA windows (${sla.urgentHours}h/${sla.highHours}h/${sla.mediumHours}h/${sla.lowHours}h).`,
    );
    setState((prev) => ({
      ...prev,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void Promise.all([
      dataService.auditLogs.append(auditEntry),
      dataService.branding.saveCloud(saved, currentUser.name),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      'Company Branding Saved',
      `${saved.companyName} synced across Login, Sidebar, Forms, and Reports.`,
      'success',
    );
  };

  const handleResetBranding = () => {
    if (currentUser.role !== 'Admin') return;
    const defaults = dataService.branding.resetSync();
    setBranding(defaults);
    void dataService.branding.saveCloud(defaults, currentUser.name).catch(handleCloudWriteError);
    pushToast(
      'Branding Restored to Defaults',
      'Restored default NexOps Enterprise Hub branding, departments, and categories.',
      'info',
    );
  };

  const handleUpdatePermissionMatrix = (nextMatrix: PermissionMatrix) => {
    if (currentUser.role !== 'Admin') return;
    const normalized = normalizePermissionMatrix(nextMatrix);
    const auditEntry = createAuditEvent(
      'SYS-RBAC-MATRIX',
      'Team Updated',
      `Updated Role Permission Matrix across corporate RBAC tiers by ${currentUser.name}.`,
    );
    setState((prev) => ({
      ...prev,
      permissionMatrix: normalized,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void Promise.all([
      dataService.auditLogs.append(auditEntry),
      dataService.systemState.upsertKey(
        SYSTEM_STATE_KEYS.PERMISSION_MATRIX,
        normalized,
        currentUser.name,
      ),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast(
      'Permission Matrix Saved',
      'Role capabilities synced across all connected devices.',
      'success',
    );
  };

  // Enterprise Calendar Event Handlers
  const handleSaveCalendarEvent = (event: CalendarEvent) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') {
      pushToast('Permission Required', 'Viewers have read-only access to the Calendar.', 'warning');
      return;
    }
    const isEdit = state.calendarEvents.some((ev) => ev.id === event.id);
    deletedCalendarIdsRef.current.delete(event.id);
    const nextEvents = mergeCalendarEvents(
      state.calendarEvents,
      [event],
      deletedCalendarIdsRef.current,
    );
    const auditEntry = createAuditEvent(
      event.id,
      'Team Updated',
      `${isEdit ? 'Updated' : 'Scheduled'} ${event.type} calendar event "${event.title}" on ${event.date} at ${event.time} (${event.department}).`,
    );

    setState((prev) => ({
      ...prev,
      calendarEvents: mergeCalendarEvents(
        prev.calendarEvents,
        [event],
        deletedCalendarIdsRef.current,
      ),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    if (commsChannelRef.current) {
      void commsChannelRef.current.send({
        type: 'broadcast',
        event: 'calendar:upsert',
        payload: event,
      });
    }

    void dataService.calendar
      .saveEvents(
        nextEvents,
        currentUser.name,
        auditEntry,
        Array.from(deletedCalendarIdsRef.current),
      )
      .then((synced) => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
        setLastSyncError(null);
        setState((prev) => ({
          ...prev,
          calendarEvents: mergeCalendarEvents(
            synced,
            prev.calendarEvents,
            deletedCalendarIdsRef.current,
          ),
        }));
      })
      .catch(handleCloudWriteError);

    pushToast(
      isEdit ? 'Calendar Event Updated' : 'Calendar Event Scheduled',
      `${event.title} · ${event.date} at ${event.time}`,
      'success',
    );
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') {
      pushToast('Permission Required', 'Viewers cannot delete calendar events.', 'warning');
      return;
    }
    const target = state.calendarEvents.find((ev) => ev.id === eventId);
    if (!target) return;
    deletedCalendarIdsRef.current.add(eventId);
    const remaining = state.calendarEvents.filter((ev) => ev.id !== eventId);
    const auditEntry = createAuditEvent(
      eventId,
      'Team Updated',
      `Removed calendar event "${target.title}" (${target.date}).`,
    );

    setState((prev) => ({
      ...prev,
      calendarEvents: prev.calendarEvents.filter((ev) => ev.id !== eventId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    if (commsChannelRef.current) {
      void commsChannelRef.current.send({
        type: 'broadcast',
        event: 'calendar:delete',
        payload: { id: eventId },
      });
    }

    void dataService.calendar
      .saveEvents(
        remaining,
        currentUser.name,
        auditEntry,
        Array.from(deletedCalendarIdsRef.current),
      )
      .then((synced) => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
        setLastSyncError(null);
        setState((prev) => ({
          ...prev,
          calendarEvents: synced,
        }));
      })
      .catch(handleCloudWriteError);

    pushToast('Calendar Event Deleted', `${target.title} removed from schedule.`, 'info');
  };

  // Step 1 Guard: unauthenticated users (or active password recovery redirect) see Login / Recovery screen
  if (!authSession || !authSession.isAuthenticated || passwordRecoveryState.active) {
    return (
      <>
        <LoginScreen
          branding={branding}
          allowInitialAdminSetup={!isAdminInitialized}
          initialRecoveryMode={passwordRecoveryState.active}
          initialRecoveryEmail={passwordRecoveryState.email}
          onClearRecoveryMode={() =>
            setPasswordRecoveryState({ active: false, email: '' })
          }
          onEmailSignIn={handleEmailSignIn}
          onRegisterUser={handleRegisterUser}
          onResetPassword={handleResetPassword}
          onCompletePasswordReset={handleCompletePasswordReset}
          onRegisterInitialAdmin={handleRegisterInitialAdmin}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Step 2 Guard: authenticated users confirm Department & Employee ID before proceeding
  if (authSession.identityVerified === false) {
    return (
      <>
        <DepartmentVerificationScreen
          branding={branding}
          userEmail={currentUser.email}
          initialDepartment={currentUser.department}
          assignedEmployeeId={currentUser.employeeId}
          teamMembers={state.teamMembers}
          onContinue={handleCompleteIdentityStep}
          onBackToLogin={handleSignOut}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Pending / Rejected Approval Gate: block company workspace & records until Admin approves
  if (!isApprovedUser) {
    return (
      <>
        <PendingApprovalScreen
          branding={branding}
          user={currentUser}
          onRefreshStatus={handleRefreshApprovalStatus}
          onSignOut={handleSignOut}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Main App Shell (hidden during window.print() when OfficialReportModal is open) */}
      <div className={reportModalState.open ? 'no-print' : ''}>
        {/* Fixed Left Sidebar (Desktop >= 1024px) & Slide-Over Drawer (Mobile/Tablet < 1024px) */}
        <Sidebar
          branding={branding}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          activeWorkspaceTool={activeWorkspaceTool}
          onSelectWorkspaceTool={(tool) => {
            setActiveWorkspaceTool(tool);
            setActiveSection('workspace');
          }}
          activeRole={currentUser.role}
          currentUser={currentUser}
          pendingQueueCount={pendingQueueCount}
          activeProjectsCount={activeProjectsCount}
          assetAlertsCount={assetAlertsCount}
          pendingSopsCount={pendingSopsCount}
          vaultCount={state.vaultDocuments.length}
          pendingLeavesCount={pendingLeavesCount}
          openActionItemsCount={openActionItemsCount}
          upcomingCalendarCount={upcomingCalendarCount}
          unreadCommsCount={unreadCommsCount}
          workspaceLinksCount={state.workspaceLinks.length}
          pendingUsersCount={pendingUsersCount}
          pendingEditorChangesCount={pendingEditorChangesCount}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          viewport={viewport}
        />

        {/* Main Content Shell */}
        <div
          className={`flex min-h-screen w-full min-w-0 max-w-full flex-col transition-all duration-200 ease-in-out ${
            sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          }`}
        >
          <TopBar
            activeSection={activeSection}
            activeRole={currentUser.role}
            currentUser={currentUser}
            teamMembers={state.teamMembers}
            onlinePresenceKeys={onlinePresenceKeys}
            recentlyOfflineKeys={recentlyOfflineKeys}
            departments={branding.departments}
            requests={state.requests}
            auditLogs={state.globalAuditLogs}
            pendingEditorChanges={state.pendingEditorChanges}
            dbConnected={dbConnected}
            lastSyncError={lastSyncError}
            isSyncing={isSyncing}
            onSyncNow={() => void syncFromSupabase(true, false)}
            globalSearch={searchQuery}
            onGlobalSearchChange={handleGlobalSearchChange}
            onSelectRequestById={handleInspectRequestById}
            onSelectDepartment={handleSelectDepartmentFromSearch}
            onSelectAuditMatch={handleSelectAuditFromSearch}
            onSelectSection={setActiveSection}
            notifications={state.notifications}
            onMarkAllRead={handleMarkAllRead}
            onClearNotifications={handleClearNotifications}
            onSelectNotification={handleSelectNotification}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenCreateModal={handleOpenBlankCreateModal}
            onOpenProfile={() => setProfileModalOpen(true)}
            onSignOut={handleSignOut}
            activeWorkspaceTool={activeWorkspaceTool}
            unreadCommsCount={unreadCommsCount}
            slaPolicy={branding.slaPolicy ?? DEFAULT_SLA_POLICY}
            isDarkMode={isDarkMode}
            themePreference={themePreference}
            onToggleDarkMode={() => setThemePreference(isDarkMode ? 'light' : 'dark')}
            onSetThemePreference={setThemePreference}
            viewport={viewport}
            onSelectWorkspaceTool={(tool) => {
              setActiveWorkspaceTool(tool);
              setActiveSection('workspace');
            }}
          />

          <AnnouncementBanner
            announcements={state.announcements}
            activeRole={currentUser.role}
            onPublishAnnouncement={handlePublishAnnouncement}
            onArchiveAnnouncement={handleArchiveAnnouncement}
            onRestoreAnnouncement={handleRestoreAnnouncement}
          />

          <main className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            {isHydrating ? (
              <WorkspaceSkeleton />
            ) : (
              <>
                {activeSection === 'dashboard' && (
                  <DashboardView
                    companyName={branding.companyName}
                    currentUser={currentUser}
                    teamMembers={state.teamMembers}
                    onlinePresenceKeys={onlinePresenceKeys}
                    recentlyOfflineKeys={recentlyOfflineKeys}
                    requests={state.requests}
                    projects={state.projects}
                    attendanceLogs={state.attendanceLogs}
                    announcements={state.announcements}
                    activeRole={currentUser.role}
                    departments={branding.departments}
                    slaPolicy={branding.slaPolicy ?? DEFAULT_SLA_POLICY}
                    onOpenRequest={(req) => setSelectedRequestId(req.id)}
                    onNavigateToQueue={handleNavigateToQueue}
                    onNavigateToOverdueQueue={() => {
                      setStatusFilter('All');
                      setOverdueOnly(true);
                      setActiveSection('requests');
                    }}
                    onNavigateToProjects={() => setActiveSection('projects')}
                    onOpenExecutiveReport={() =>
                      setReportModalState({ open: true, requestId: null })
                    }
                    onExportScorecardSuccess={(deptCount) =>
                      pushToast(
                        'Department Scorecard Exported',
                        `Downloaded performance CSV across ${deptCount} corporate departments.`,
                        'success',
                      )
                    }
                    onPublishAnnouncement={handlePublishAnnouncement}
                    onEditAnnouncement={handleEditAnnouncement}
                    onDeleteAnnouncement={handleDeleteAnnouncement}
                    onTogglePinAnnouncement={handleTogglePinAnnouncement}
                  />
                )}

                {activeSection === 'requests' && (
                  <RequestsQueueView
                    requests={state.requests}
                    departments={branding.departments}
                    activeRole={currentUser.role}
                    currentUserEmail={currentUser.email}
                    approvalBudgetThresholdUsd={branding.approvalBudgetThresholdUsd ?? 5000}
                    slaPolicy={branding.slaPolicy ?? DEFAULT_SLA_POLICY}
                    pendingEditorChanges={state.pendingEditorChanges}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    departmentFilter={departmentFilter}
                    onDepartmentFilterChange={setDepartmentFilter}
                    priorityFilter={priorityFilter}
                    onPriorityFilterChange={setPriorityFilter}
                    overdueOnly={overdueOnly}
                    onOverdueOnlyChange={setOverdueOnly}
                    onSelectRequest={(req) => setSelectedRequestId(req.id)}
                    onDuplicateRequest={handleDuplicateRequest}
                    onBulkUpdatePriority={handleBulkUpdatePriority}
                    onBulkExportSuccess={(count) =>
                      pushToast(
                        'CSV Export Complete',
                        `Exported ${count} selected operational request${count > 1 ? 's' : ''}.`,
                        'success',
                      )
                    }
                    onOpenImportModal={() => setImportModalOpen(true)}
                    onOpenCreateModal={handleOpenBlankCreateModal}
                  />
                )}

                {activeSection === 'projects' && (
                  <ProjectsDirectoryView
                    projects={state.projects}
                    requests={state.requests}
                    activeRole={currentUser.role}
                    currentUserEmail={currentUser.email}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onCreateProject={handleCreateProject}
                    onUpdateProject={handleUpdateProject}
                    onDeleteProject={handleDeleteProject}
                    onFilterQueueByProject={(projectCode) => {
                      setSearchQuery(projectCode);
                      setStatusFilter('All');
                      setDepartmentFilter('All');
                      setPriorityFilter('All');
                      setOverdueOnly(false);
                      setActiveSection('requests');
                    }}
                  />
                )}

                {activeSection === 'assets' && (
                  <AssetsInventoryView
                    assets={state.assets}
                    activeRole={currentUser.role}
                    currentUserEmail={currentUser.email}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onRegisterAsset={handleRegisterAsset}
                    onTransferAsset={handleTransferAsset}
                    onLogMaintenance={handleLogAssetMaintenance}
                    onExportSuccess={(count) =>
                      pushToast(
                        'Asset Ledger Exported',
                        `Downloaded ${count} inventory asset record${count === 1 ? '' : 's'} as CSV.`,
                        'success',
                      )
                    }
                    onInspectRequest={handleInspectRequestById}
                  />
                )}

                {activeSection === 'sops' && (
                  <SopVaultView
                    sops={state.sops}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onPublishSop={handlePublishSop}
                    onToggleMandatory={handleToggleSopMandatory}
                    onAcknowledgeSop={handleAcknowledgeSop}
                  />
                )}

                {activeSection === 'vault' && (
                  <DocumentVaultView
                    documents={state.vaultDocuments}
                    departments={branding.departments}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onAddDocument={handleAddVaultDocument}
                    onDeleteDocument={handleDeleteVaultDocument}
                  />
                )}

                {activeSection === 'leaves' && (
                  <LeavesView
                    leaves={state.leaves}
                    attendanceLogs={state.attendanceLogs}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    permissionMatrix={state.permissionMatrix}
                    onClockIn={handleClockIn}
                    onClockOut={handleClockOut}
                    onCreateLeave={handleCreateLeave}
                    onDecisionLeave={handleDecisionLeave}
                  />
                )}

                {activeSection === 'meetings' && (
                  <MeetingsMomView
                    meetings={state.meetings}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onCreateMeeting={handleCreateMeeting}
                    onAddActionItem={handleAddMeetingActionItem}
                    onConvertActionToRequest={handleConvertActionToRequest}
                    onCompleteActionItem={handleCompleteMeetingActionItem}
                    onInspectRequest={handleInspectRequestById}
                  />
                )}

                {activeSection === 'calendar' && (
                  <CalendarView
                    calendarEvents={state.calendarEvents}
                    meetings={state.meetings}
                    leaves={state.leaves}
                    departments={branding.departments}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    onSaveEvent={handleSaveCalendarEvent}
                    onDeleteEvent={handleDeleteCalendarEvent}
                  />
                )}

                {activeSection === 'audit' && isSuperAdminOperator && (
                  <AuditLogsView
                    logs={state.globalAuditLogs}
                    onInspectRequest={handleInspectRequestById}
                    onExportSuccess={(count) =>
                      pushToast(
                        'CSV Compliance Report Exported',
                        `Downloaded ${count} filtered audit records.`,
                        'success',
                      )
                    }
                  />
                )}

                {activeSection === 'mailchat' && (
                  <MailChatHubView
                    currentUser={currentUser}
                    activeRole={currentUser.role}
                    teamMembers={state.teamMembers}
                    departments={branding.departments}
                    onlinePresenceKeys={onlinePresenceKeys}
                    recentlyOfflineKeys={recentlyOfflineKeys}
                    corporateMails={state.corporateMails}
                    chatMessages={state.chatMessages}
                    googleToken={googleToken}
                    googleEmail={googleEmail}
                    googleConnecting={googleConnecting}
                    onGoogleSignIn={handleGoogleWorkspaceSignIn}
                    onSendMail={handleSendCorporateMail}
                    onSaveDraft={handleSaveCorporateDraft}
                    onDeleteDraft={handleDeleteCorporateDraft}
                    onMarkMailRead={handleMarkMailRead}
                    onSendChatMessage={handleSendChatMessage}
                    onMarkChatRoomRead={handleMarkChatRoomRead}
                    onStartGoogleMeetSession={handleStartGoogleMeetSession}
                    onNotify={pushToast}
                  />
                )}

                {activeSection === 'workspace' && (
                  <WorkspaceToolsView
                    activeTool={activeWorkspaceTool}
                    onSelectTool={setActiveWorkspaceTool}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    teamMembers={state.teamMembers}
                    departments={branding.departments}
                    emails={state.workspaceEmails}
                    links={state.workspaceLinks}
                    googleToken={googleToken}
                    googleEmail={googleEmail}
                    googleDisplayName={googleDisplayName}
                    googlePhotoUrl={googlePhotoUrl}
                    googleConnecting={googleConnecting}
                    onGoogleSignIn={handleGoogleWorkspaceSignIn}
                    onGoogleDisconnect={handleGoogleWorkspaceDisconnect}
                    onSaveEmailLog={handleSaveEmailLog}
                    onSaveWorkspaceLink={handleSaveWorkspaceLink}
                    onDeleteWorkspaceLink={handleDeleteWorkspaceLink}
                    onNotify={pushToast}
                  />
                )}

                {activeSection === 'settings' && isSuperAdminOperator && (
                  <TeamSettingsView
                    activeRole={currentUser.role}
                    currentUserEmail={currentUser.email}
                    branding={branding}
                    permissionMatrix={state.permissionMatrix}
                    tableDiagnostics={tableDiagnostics}
                    isCheckingHealth={isCheckingHealth}
                    teamMembers={state.teamMembers}
                    onlinePresenceKeys={onlinePresenceKeys}
                    recentlyOfflineKeys={recentlyOfflineKeys}
                    requests={state.requests}
                    auditLogs={state.globalAuditLogs}
                    notificationsCount={state.notifications.length}
                    vaultDocuments={state.vaultDocuments}
                    dbConnected={dbConnected}
                    onUpdateBranding={handleUpdateBranding}
                    onResetBranding={handleResetBranding}
                    onUpdatePermissionMatrix={handleUpdatePermissionMatrix}
                    onRunHealthCheck={() => void handleRunHealthCheck()}
                    onUpdateMemberRole={handleUpdateMemberRole}
                    onUpdateMemberDepartment={handleUpdateMemberDepartment}
                    onToggleMemberActive={handleToggleMemberActive}
                    onApproveUser={handleApproveUser}
                    onRejectUser={handleRejectUser}
                    onDeleteMember={handleDeleteMember}
                    onRefreshUsers={() => handleRefreshUsersFromCloud(false)}
                    onPreApproveUser={handlePreApproveUser}
                    onProvisionEmployee={handleProvisionEmployee}
                    onDownloadBackup={handleDownloadBackup}
                    onRestoreBackup={handleRestoreBackup}
                    onBackupError={(msg) => pushToast('Backup Restore Failed', msg, 'error')}
                    pendingEditorChanges={state.pendingEditorChanges}
                    onApproveEditorChange={handleApproveEditorChange}
                    onRejectEditorChange={handleRejectEditorChange}
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* Create / Edit Request Modal */}
        {createModalOpen && (currentUser.role === 'Admin' || currentUser.role === 'Editor') && (
          <CreateRequestModal
            nextRequestId={nextRequestId}
            departments={branding.departments}
            categories={branding.categories}
            projects={state.projects}
            assets={state.assets}
            activeRole={currentUser.role}
            approvalBudgetThresholdUsd={branding.approvalBudgetThresholdUsd ?? 5000}
            templateSource={templateSource}
            editingRequest={editingRequest}
            onClose={() => {
              setCreateModalOpen(false);
              setTemplateSource(null);
              setEditingRequest(null);
            }}
            onCreate={handleCreateRequest}
            onEdit={handleEditRequest}
          />
        )}

        {/* CSV Bulk Import Modal */}
        {importModalOpen && (currentUser.role === 'Admin' || currentUser.role === 'Editor') && (
          <ImportRequestsModal
            nextRequestId={nextRequestId}
            departments={branding.departments}
            activeRole={currentUser.role}
            onClose={() => setImportModalOpen(false)}
            onImport={handleImportRequests}
          />
        )}

        {/* User Profile & Digital Sign-Off Modal */}
        {profileModalOpen && (
          <UserProfileModal
            user={currentUser}
            teamMembers={state.teamMembers}
            departments={branding.departments}
            pendingAssignedCount={pendingAssignedCount}
            onlinePresenceKeys={onlinePresenceKeys}
            recentlyOfflineKeys={recentlyOfflineKeys}
            onClose={() => setProfileModalOpen(false)}
            onUploadAvatar={handleUploadAvatar}
            onRemoveAvatar={handleRemoveAvatar}
            onSaveSignOffTitle={handleSaveSignOffTitle}
            onUpdateDepartment={handleUpdateMemberDepartment}
            onSaveDelegation={handleSaveDelegation}
            onUpdatePassword={handleUpdatePassword}
          />
        )}

        {/* Detailed Record Drawer */}
        {selectedRequest && (
          <RequestDetailDrawer
            request={selectedRequest}
            activeRole={currentUser.role}
            approvalBudgetThresholdUsd={branding.approvalBudgetThresholdUsd ?? 5000}
            slaPolicy={branding.slaPolicy ?? DEFAULT_SLA_POLICY}
            pendingEditorChanges={state.pendingEditorChanges}
            subtasks={state.subtasks}
            taskComments={state.taskComments}
            teamMembers={state.teamMembers}
            onClose={() => setSelectedRequestId(null)}
            onEditRequest={handleOpenEditRequestModal}
            onToggleChecklistItem={handleToggleChecklistItem}
            onTransitionStatus={handleTransitionStatus}
            onStage1Approve={handleStage1SignOff}
            onUpdateRequestFinancials={handleUpdateRequestFinancials}
            onAddComment={handleAddComment}
            onDeleteRequest={handleDeleteRequest}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            onAddTaskComment={handleAddTaskComment}
            onExportReport={(requestId) =>
              setReportModalState({ open: true, requestId })
            }
            onDuplicateRequest={handleDuplicateRequest}
            onEscalateRequest={handleEscalateRequest}
          />
        )}

        {/* Quick-Access Floating Team Chat & Google Meet Drawer */}
        {activeSection !== 'mailchat' && (
          <QuickChatDrawer
            currentUser={currentUser}
            teamMembers={state.teamMembers}
            departments={branding.departments}
            onlinePresenceKeys={onlinePresenceKeys}
            recentlyOfflineKeys={recentlyOfflineKeys}
            chatMessages={state.chatMessages}
            onSendChatMessage={handleSendChatMessage}
            onMarkChatRoomRead={handleMarkChatRoomRead}
            onStartGoogleMeetSession={handleStartGoogleMeetSession}
            onOpenFullHub={() => setActiveSection('mailchat')}
            viewport={viewport}
          />
        )}

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>

      {/* Print-Ready Official Report Modal */}
      {reportModalState.open && (
        <OfficialReportModal
          branding={branding}
          requests={state.requests}
          attendanceLogs={state.attendanceLogs}
          initialRequestId={reportModalState.requestId}
          currentUser={currentUser}
          onClose={() => setReportModalState({ open: false, requestId: null })}
          onPrintTriggered={(reportTitle) =>
            pushToast('Print Dialog Opened', `Preparing ${reportTitle} for PDF/Print.`, 'info')
          }
        />
      )}
    </div>
  );
}
