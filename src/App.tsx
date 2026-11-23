import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { AssetsInventoryView } from './components/AssetsInventoryView';
import { AuditLogsView } from './components/AuditLogsView';
import { CreateRequestModal, CreateRequestPayload } from './components/CreateRequestModal';
import { DashboardView } from './components/DashboardView';
import { ImportedRequestRow, ImportRequestsModal } from './components/ImportRequestsModal';
import { CreateLeavePayload, LeavesView } from './components/LeavesView';
import { DepartmentVerificationScreen } from './components/DepartmentVerificationScreen';
import { InitialAdminPayload, LoginScreen, RegisterUserPayload, SignUpOutcome } from './components/LoginScreen';
import { CreateMeetingPayload, MeetingsMomView } from './components/MeetingsMomView';
import { OfficialReportModal } from './components/OfficialReportModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { ProjectsDirectoryView } from './components/ProjectsDirectoryView';
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
  CompanyAnnouncement,
  CompanyAsset,
  CompanyBrandingConfig,
  CompanyProject,
  Department,
  DocumentVaultItem,
  LeaveRequest,
  MeetingActionItem,
  MeetingMinute,
  NavSection,
  NexOpsState,
  OperationalRequest,
  PermissionMatrix,
  Priority,
  RequestStatus,
  Role,
  SopAcknowledgment,
  SopDocument,
  TableSyncStatus,
  TaskComment,
  TaskSubtask,
  TeamMember,
  ToastMessage,
  WorkspaceEmailLog,
  WorkspaceSavedLink,
  WorkspaceToolType,
} from './types/nexops';
import {
  buildMemberFromSupabaseUser,
  dataService,
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
  normalizePermissionMatrix,
  requiresTwoTierApproval,
  resolveEffectiveReviewer,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nexops_sidebar_collapsed_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      setDbConnected(false);
      const message =
        err instanceof Error
          ? err.message
          : 'Saved locally; unable to reach Supabase.';
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
                ? { ...m, ...member, lastActive: new Date().toISOString() }
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

      const nextSession: AuthSession = {
        isAuthenticated: true,
        userId: member.id,
        rememberSession: true,
        signedInAt: matchingSaved?.signedInAt ?? new Date().toISOString(),
        authProvider: 'supabase',
        employeeId: matchingSaved?.employeeId || member.employeeId,
        userName: matchingSaved?.userName || member.name,
        userEmail: member.email,
        userRole: matchingSaved?.userRole || member.role,
        approvalStatus: matchingSaved?.approvalStatus ?? member.approvalStatus,
        isSuperAdmin: member.isSuperAdmin,
        userDepartment: matchingSaved?.userDepartment || member.department,
        userTitle: matchingSaved?.userTitle || member.title,
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
        setState(remote.state);
        setBranding(remote.branding);
        setTableDiagnostics(remote.diagnostics);
        setDbConnected(remote.cloudHealthy);

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
              matchedCloudUser.id !== activeSess.userId
            ) {
              const syncedSession: AuthSession = {
                ...activeSess,
                userId: matchedCloudUser.id,
                employeeId: matchedCloudUser.employeeId,
                userName: matchedCloudUser.name,
                userDepartment: matchedCloudUser.department,
                userRole: matchedCloudUser.role,
                approvalStatus: matchedCloudUser.approvalStatus,
                isSuperAdmin: matchedCloudUser.isSuperAdmin,
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
        setDbConnected(false);
        setTableDiagnostics(dataService.getOfflineDiagnostics());
        if (showFeedbackToast) {
          const message =
            err instanceof Error
              ? err.message
              : 'Could not query Supabase cloud tables.';
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
            role: 'Admin',
            approvalStatus: 'approved',
            isSuperAdmin: true,
            active: true,
          };
        }
        return bySessionId;
      }
      const isSuper = isSuperAdminEmail(authSession.userEmail || '');
      return {
        id: authSession.userId,
        employeeId:
          authSession.employeeId ||
          `EMP-${authSession.userId.slice(0, 4).toUpperCase()}`,
        name: authSession.userName || authSession.userEmail || 'Authenticated User',
        email: authSession.userEmail || '',
        role: isSuper ? 'Admin' : authSession.userRole || 'Viewer',
        approvalStatus: isSuper
          ? 'approved'
          : authSession.approvalStatus ?? 'pending',
        isSuperAdmin: isSuper,
        department: authSession.userDepartment || branding.departments[0] || 'Operations',
        title: authSession.userTitle || authSession.userRole || 'Viewer',
        signOffTitle:
          authSession.userTitle || authSession.userRole || 'Viewer',
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

  // Non-Admins must NEVER remain on Admin-only sections (Settings or Activity Audit Trail)
  useEffect(() => {
    if ((activeSection === 'settings' || activeSection === 'audit') && currentUser.role !== 'Admin') {
      setActiveSection('dashboard');
    }
  }, [activeSection, currentUser.role]);

  useEffect(() => {
    if (
      activeSection === 'settings' &&
      currentUser.role === 'Admin' &&
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
                ? { ...m, ...user, lastActive: new Date().toISOString() }
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
    await dataService.auth.resetPasswordForEmail(email);
    pushToast(
      'Password Reset Email Sent',
      `Recovery link sent to ${email.trim()}.`,
      'info',
    );
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

  const handleSignOut = async () => {
    await dataService.auth.signOut();
    await disconnectGoogleWorkspace().catch(() => {});
    setGoogleToken(null);
    setGoogleEmail(null);
    setGoogleDisplayName(null);
    setGooglePhotoUrl(null);
    setAuthSession(null);
    setSelectedRequestId(null);
    setCreateModalOpen(false);
    setImportModalOpen(false);
    setTemplateSource(null);
    setProfileModalOpen(false);
    setReportModalState({ open: false, requestId: null });
    setMobileMenuOpen(false);
    pushToast('Signed Out', 'Corporate session closed securely.', 'info');
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
    setActiveSection('requests');
  };

  // Open Create Modal fresh or from template
  const handleOpenBlankCreateModal = () => {
    if (currentUser.role !== 'Admin') return;
    setTemplateSource(null);
    setCreateModalOpen(true);
  };

  const handleDuplicateRequest = (req: OperationalRequest) => {
    if (currentUser.role !== 'Admin') return;
    setSelectedRequestId(null);
    setTemplateSource(req);
    setCreateModalOpen(true);
  };

  // Create new request
  const handleCreateRequest = (payload: CreateRequestPayload) => {
    if (currentUser.role !== 'Admin') return;
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
    setActiveSection('requests');
    setSelectedRequestId(newId);
    pushToast(
      payload.submitImmediately ? `Submitted ${newId}` : `Saved Draft ${newId}`,
      payload.title,
      'success',
    );
  };

  // Delete operational request
  const handleDeleteRequest = (requestId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;

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
    if (currentUser.role !== 'Admin') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;
    const item = target.checklist.find((c) => c.id === itemId);
    if (!item) return;

    const now = new Date().toISOString();
    const toggledLabel = item.label;
    const nextChecked = !item.checked;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.requests.find((r) => r.id === requestId);
    if (!target) return;
    const now = new Date().toISOString();
    const cur = target.currency || 'USD';
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
    const now = new Date().toISOString();
    const newProject: CompanyProject = {
      ...projectInput,
      id: `prj-${Date.now()}`,
      updatedAt: now,
    };
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
    if (currentUser.role !== 'Admin') return;
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.assets.find((a) => a.id === assetId);
    if (!target) return;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.assets.find((a) => a.id === assetId);
    if (!target) return;
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
    if (currentUser.role !== 'Admin') return;
    const now = new Date().toISOString();
    const newSop: SopDocument = {
      ...sopInput,
      id: `sop-${Date.now()}`,
      acknowledgments: [],
      updatedAt: now,
    };
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
    if (currentUser.role !== 'Admin') return;
    const target = state.sops.find((s) => s.id === sopId);
    if (!target) return;
    const now = new Date().toISOString();
    const nextMandatory = !target.mandatoryRead;
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
    if (currentUser.role !== 'Admin') return;
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

  // Admin-Only Team, Approval & Master Key Management Handlers
  const handleUpdateMemberRole = (memberId: string, role: Role) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can modify user roles.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} is permanently locked as Admin.`, 'warning');
      return;
    }
    const auditEntry = createAuditEvent(
      'TEAM-RBAC',
      'Role Changed',
      `Updated ${target.name} (${target.email}) role from ${target.role} to ${role}.`,
      state.activeRole,
    );
    const nextMembers = state.teamMembers.map((m) =>
      m.id === memberId ? { ...m, role } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.team
      .updateMember(memberId, { role }, auditEntry, nextMembers)
      .catch(handleCloudWriteError);
    pushToast('RBAC Role Updated', `Assigned ${role} permissions.`, 'success');
  };

  const handleUpdateMemberDepartment = (memberId: string, department: Department) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can reassign departments.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const auditEntry = createAuditEvent(
      'TEAM-DEPT',
      'Team Updated',
      `Reassigned ${target.name} from ${target.department} to ${department}.`,
      state.activeRole,
    );
    const nextMembers = state.teamMembers.map((m) =>
      m.id === memberId ? { ...m, department } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.team
      .updateMember(memberId, { department }, auditEntry, nextMembers)
      .catch(handleCloudWriteError);
    pushToast('Department Updated', `Reassigned member to ${department}.`, 'success');
  };

  const handleToggleMemberActive = async (memberId: string) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can change account status.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be deactivated.`, 'warning');
      return;
    }
    const nextActiveState = !target.active;
    const nextApprovalStatus = nextActiveState ? ('approved' as const) : ('deactivated' as const);
    const now = new Date().toISOString();
    const auditEntry = createAuditEvent(
      'TEAM-STATUS',
      'Team Updated',
      `${nextActiveState ? 'Activated' : 'Deactivated'} corporate account for ${target.name} (${target.email}).`,
      state.activeRole,
    );
    const nextMembers = state.teamMembers.map((m) =>
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
    try {
      await dataService.team.updateMember(
        memberId,
        {
          active: nextActiveState,
          approvalStatus: nextApprovalStatus,
          ...(nextActiveState ? { approvedBy: currentUser.name, approvedAt: now } : {}),
        },
        auditEntry,
        nextMembers,
      );
      pushToast(
        nextActiveState ? 'Account Activated' : 'Account Deactivated',
        `${target.name} synced with Supabase (${nextApprovalStatus}).`,
        nextActiveState ? 'success' : 'warning',
      );
    } catch (err) {
      handleCloudWriteError(err);
    }
  };

  const handleRefreshUsersFromCloud = async (silent = false) => {
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') {
      throw new Error('Only verified Admins can pre-approve or add users.');
    }
    const { member, alreadyExisted, auditEntry } =
      await dataService.team.preApproveUserByEmail(
        payload,
        currentUser.name,
        currentUser.role,
        currentUser.signOffTitle || currentUser.title,
        state.teamMembers,
      );

    setState((prev) => ({
      ...prev,
      teamMembers: [
        member,
        ...prev.teamMembers.filter(
          (m) =>
            m.id !== member.id &&
            m.email.trim().toLowerCase() !== member.email.trim().toLowerCase(),
        ),
      ],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));

    pushToast(
      alreadyExisted ? `Approved ${member.email}` : `Pre-Approved ${member.email}`,
      `Assigned ${member.role} access (${member.department}) in Supabase.`,
      'success',
    );
  };

  const handleApproveUser = async (memberId: string, assignedRole: Role) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can approve pending accounts.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const effectiveRole: Role = isSuperAdminEmail(target.email) ? 'Admin' : assignedRole;
    const now = new Date().toISOString();

    const auditEntry = createAuditEvent(
      'TEAM-APPROVAL',
      'Role Changed',
      `Admin ${currentUser.name} approved ${target.name} (${target.email}) with role ${effectiveRole}.`,
      currentUser.role,
    );

    const nextMembers = state.teamMembers.map((m) =>
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

    try {
      await dataService.team.updateMember(
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
      );

      setState((prev) => ({
        ...prev,
        teamMembers: nextMembers,
        globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      }));

      pushToast(
        `Approved ${target.name}`,
        `Assigned ${effectiveRole} access (${target.email}) in Supabase.`,
        'success',
      );
    } catch (err) {
      handleCloudWriteError(err);
      throw err;
    }
  };

  const handleRejectUser = async (memberId: string) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can decline pending accounts.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be rejected.`, 'warning');
      return;
    }

    const auditEntry = createAuditEvent(
      'TEAM-APPROVAL',
      'Role Changed',
      `Admin ${currentUser.name} rejected access request for ${target.name} (${target.email}).`,
      currentUser.role,
    );

    const nextMembers = state.teamMembers.map((m) =>
      m.id === memberId
        ? {
            ...m,
            approvalStatus: 'rejected' as const,
            active: false,
          }
        : m,
    );

    try {
      await dataService.team.updateMember(
        memberId,
        {
          approvalStatus: 'rejected',
          active: false,
        },
        auditEntry,
        nextMembers,
      );

      setState((prev) => ({
        ...prev,
        teamMembers: nextMembers,
        globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      }));

      pushToast(
        `Rejected ${target.name}`,
        `Access denied for ${target.email} in Supabase.`,
        'warning',
      );
    } catch (err) {
      handleCloudWriteError(err);
      throw err;
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (currentUser.role !== 'Admin') {
      pushToast('Admin Access Required', 'Only verified Admins can delete user records.', 'error');
      return;
    }
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    if (isSuperAdminEmail(target.email)) {
      pushToast('Permanent Super Admin', `${target.email} cannot be deleted.`, 'warning');
      return;
    }

    const auditEntry = createAuditEvent(
      'TEAM-DELETE',
      'Team Updated',
      `Admin ${currentUser.name} permanently deleted user record for ${target.name} (${target.email}).`,
      currentUser.role,
    );

    const nextMembers = state.teamMembers.filter(
      (m) =>
        m.id !== memberId &&
        m.email.trim().toLowerCase() !== target.email.trim().toLowerCase(),
    );

    try {
      await dataService.team.deleteMember(memberId, target.email, auditEntry, nextMembers);
      setState((prev) => ({
        ...prev,
        teamMembers: nextMembers,
        globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      }));
      pushToast(
        `Deleted ${target.name}`,
        `Removed ${target.email} from Supabase user_access & synced directory.`,
        'success',
      );
    } catch (err) {
      handleCloudWriteError(err);
      throw err;
    }
  };

  const handleProvisionEmployee = async (payload: ProvisionEmployeePayload) => {
    if (currentUser.role !== 'Admin') {
      throw new Error('Only an authorized System Administrator can create employee accounts.');
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
    const meeting = state.meetings.find((m) => m.id === meetingId);
    const actionItem = meeting?.actionItems.find((a) => a.id === actionItemId);
    if (!meeting || !actionItem || actionItem.linkedRequestId) return;

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
    if (currentUser.role !== 'Admin') return;
    const meeting = state.meetings.find((m) => m.id === meetingId);
    const actionItem = meeting?.actionItems.find((a) => a.id === actionItemId);
    if (!meeting || !actionItem) return;

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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.subtasks.find((s) => s.id === subtaskId);
    if (!target) return;
    const now = new Date().toISOString();
    const nextCompleted = !target.completed;
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
    if (currentUser.role !== 'Admin') return;
    const target = state.subtasks.find((s) => s.id === subtaskId);
    if (!target) return;
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
    if (currentUser.role !== 'Admin') return;
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
    if (currentUser.role !== 'Admin') return;
    const auditEntry = createAuditEvent(
      'DOC-VAULT',
      'Vault Updated',
      `Added "${item.title}" to ${item.folder} (${item.accessTag}, ${item.department}).`,
    );
    setState((prev) => ({
      ...prev,
      vaultDocuments: [item, ...prev.vaultDocuments],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.documentVault
      .upsert(item, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Document Added to Vault', `${item.title} (${item.folder})`, 'success');
  };

  const handleDeleteVaultDocument = (itemId: string) => {
    if (currentUser.role !== 'Admin') return;
    const target = state.vaultDocuments.find((d) => d.id === itemId);
    if (!target) return;
    const auditEntry = createAuditEvent(
      'DOC-VAULT',
      'Vault Updated',
      `Removed "${target.title}" from ${target.folder}.`,
    );
    setState((prev) => ({
      ...prev,
      vaultDocuments: prev.vaultDocuments.filter((d) => d.id !== itemId),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.documentVault
      .remove(itemId, auditEntry)
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
    if (currentUser.role !== 'Admin') return;
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
    } else if (currentUser.role === 'Admin') {
      setActiveSection('audit');
      pushToast('Opened Audit Ledger', `${audit.actionType} · ${audit.actorName}`, 'info');
    }
  };

  // System Backup Export / Restore (Admin Only)
  const handleDownloadBackup = () => {
    if (currentUser.role !== 'Admin') return;
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
    const auditEntry = createAuditEvent(
      'SYS-BRANDING',
      'Team Updated',
      `Updated white-label branding ("${saved.companyName}"), ${saved.departments.length} departments, and ${saved.categories.length} categories.`,
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

  // Step 1 Guard: unauthenticated users see clean Login screen
  if (!authSession || !authSession.isAuthenticated) {
    return (
      <>
        <LoginScreen
          branding={branding}
          allowInitialAdminSetup={!isAdminInitialized}
          onEmailSignIn={handleEmailSignIn}
          onRegisterUser={handleRegisterUser}
          onResetPassword={handleResetPassword}
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
          initialDepartment={currentUser.department}
          initialEmployeeId={currentUser.employeeId}
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
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 text-slate-900">
      {/* Main App Shell (hidden during window.print() when OfficialReportModal is open) */}
      <div className={reportModalState.open ? 'no-print' : ''}>
        {/* Fixed Left Sidebar */}
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
          workspaceLinksCount={state.workspaceLinks.length}
          pendingUsersCount={pendingUsersCount}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Shell */}
        <div
          className={`flex min-h-screen min-w-0 max-w-full flex-col transition-all duration-200 ease-in-out ${
            sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          }`}
        >
          <TopBar
            activeSection={activeSection}
            activeRole={currentUser.role}
            currentUser={currentUser}
            departments={branding.departments}
            requests={state.requests}
            auditLogs={state.globalAuditLogs}
            dbConnected={dbConnected}
            isSyncing={isSyncing}
            onSyncNow={() => void syncFromSupabase(true, false)}
            globalSearch={searchQuery}
            onGlobalSearchChange={handleGlobalSearchChange}
            onSelectRequestById={handleInspectRequestById}
            onSelectDepartment={handleSelectDepartmentFromSearch}
            onSelectAuditMatch={handleSelectAuditFromSearch}
            notifications={state.notifications}
            onMarkAllRead={handleMarkAllRead}
            onClearNotifications={handleClearNotifications}
            onSelectNotification={handleSelectNotification}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenCreateModal={handleOpenBlankCreateModal}
            onOpenProfile={() => setProfileModalOpen(true)}
            onSignOut={handleSignOut}
            activeWorkspaceTool={activeWorkspaceTool}
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

          <main className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            {isHydrating ? (
              <WorkspaceSkeleton />
            ) : (
              <>
                {activeSection === 'dashboard' && (
                  <DashboardView
                    companyName={branding.companyName}
                    requests={state.requests}
                    projects={state.projects}
                    attendanceLogs={state.attendanceLogs}
                    announcements={state.announcements}
                    activeRole={currentUser.role}
                    departments={branding.departments}
                    onOpenRequest={(req) => setSelectedRequestId(req.id)}
                    onNavigateToQueue={handleNavigateToQueue}
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
                    approvalBudgetThresholdUsd={branding.approvalBudgetThresholdUsd ?? 5000}
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
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
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
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
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
                    onCreateMeeting={handleCreateMeeting}
                    onAddActionItem={handleAddMeetingActionItem}
                    onConvertActionToRequest={handleConvertActionToRequest}
                    onCompleteActionItem={handleCompleteMeetingActionItem}
                    onInspectRequest={handleInspectRequestById}
                  />
                )}

                {activeSection === 'audit' && currentUser.role === 'Admin' && (
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

                {activeSection === 'settings' && currentUser.role === 'Admin' && (
                  <TeamSettingsView
                    activeRole={currentUser.role}
                    branding={branding}
                    permissionMatrix={state.permissionMatrix}
                    tableDiagnostics={tableDiagnostics}
                    isCheckingHealth={isCheckingHealth}
                    teamMembers={state.teamMembers}
                    requests={state.requests}
                    auditLogs={state.globalAuditLogs}
                    notificationsCount={state.notifications.length}
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
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* Create Request Modal */}
        {createModalOpen && currentUser.role === 'Admin' && (
          <CreateRequestModal
            nextRequestId={nextRequestId}
            departments={branding.departments}
            categories={branding.categories}
            projects={state.projects}
            assets={state.assets}
            approvalBudgetThresholdUsd={branding.approvalBudgetThresholdUsd ?? 5000}
            templateSource={templateSource}
            onClose={() => {
              setCreateModalOpen(false);
              setTemplateSource(null);
            }}
            onCreate={handleCreateRequest}
          />
        )}

        {/* CSV Bulk Import Modal */}
        {importModalOpen && currentUser.role === 'Admin' && (
          <ImportRequestsModal
            nextRequestId={nextRequestId}
            departments={branding.departments}
            onClose={() => setImportModalOpen(false)}
            onImport={handleImportRequests}
          />
        )}

        {/* User Profile & Digital Sign-Off Modal */}
        {profileModalOpen && (
          <UserProfileModal
            user={currentUser}
            teamMembers={state.teamMembers}
            pendingAssignedCount={pendingAssignedCount}
            onClose={() => setProfileModalOpen(false)}
            onUploadAvatar={handleUploadAvatar}
            onRemoveAvatar={handleRemoveAvatar}
            onSaveSignOffTitle={handleSaveSignOffTitle}
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
            subtasks={state.subtasks}
            taskComments={state.taskComments}
            teamMembers={state.teamMembers}
            onClose={() => setSelectedRequestId(null)}
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
