import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { AssetsInventoryView } from './components/AssetsInventoryView';
import { AuditLogsView } from './components/AuditLogsView';
import { CreateRequestModal, CreateRequestPayload } from './components/CreateRequestModal';
import { DashboardView } from './components/DashboardView';
import { ImportedRequestRow, ImportRequestsModal } from './components/ImportRequestsModal';
import { CreateLeavePayload, LeavesView } from './components/LeavesView';
import { InitialAdminPayload, LoginScreen, SignUpOutcome } from './components/LoginScreen';
import { CreateMeetingPayload, MeetingsMomView } from './components/MeetingsMomView';
import { OfficialReportModal } from './components/OfficialReportModal';
import { ProjectsDirectoryView } from './components/ProjectsDirectoryView';
import { RequestDetailDrawer } from './components/RequestDetailDrawer';
import { RequestsQueueView } from './components/RequestsQueueView';
import { Sidebar } from './components/Sidebar';
import { SopVaultView } from './components/SopVaultView';
import { TeamSettingsView } from './components/TeamSettingsView';
import { ToastContainer } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { UserProfileModal } from './components/UserProfileModal';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';
import { WorkspaceToolsView } from './components/WorkspaceToolsView';
import {
  AnnouncementSeverity,
  AppNotification,
  ApprovalStageSignOff,
  AssetCondition,
  AssetHistoryEntry,
  AssetStatus,
  AuditActionType,
  AuditEvent,
  AuthSession,
  CompanyAnnouncement,
  CompanyAsset,
  CompanyBrandingConfig,
  CompanyProject,
  Department,
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
  downloadSystemBackupJson,
  formatCurrency,
  generateNextRequestId,
  isAssetAlert,
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
    ) => {
      const member = buildMemberFromSupabaseUser(sbUser, dataService.loadStateSync().teamMembers);
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
        };
      });

      const nextSession: AuthSession = {
        isAuthenticated: true,
        userId: member.id,
        rememberSession: true,
        signedInAt: new Date().toISOString(),
        authProvider: 'supabase',
        employeeId: member.employeeId,
        userName: member.name,
        userEmail: member.email,
        userRole: member.role,
        userDepartment: member.department,
        userTitle: member.title,
        avatarUrl: member.avatarUrl,
      };
      dataService.auth.saveSessionSync(nextSession);
      setAuthSession(nextSession);
    };

    void client.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        applySupabaseUser(data.session.user);
      }
    });

    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        applySupabaseUser(session.user);
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

  useEffect(() => {
    if (authSession?.isAuthenticated) {
      void syncFromSupabase(false, dataService.isSupabaseConfigured());
    } else {
      setIsHydrating(false);
    }
  }, [authSession?.isAuthenticated, syncFromSupabase]);

  const currentUser: TeamMember = useMemo(() => {
    if (authSession) {
      const bySessionId = state.teamMembers.find(
        (m) =>
          m.id === authSession.userId ||
          (authSession.userEmail &&
            m.email.toLowerCase() === authSession.userEmail.toLowerCase()),
      );
      if (bySessionId) return bySessionId;
      return {
        id: authSession.userId,
        employeeId:
          authSession.employeeId ||
          `EMP-${authSession.userId.slice(0, 4).toUpperCase()}`,
        name: authSession.userName || authSession.userEmail || 'Authenticated User',
        email: authSession.userEmail || '',
        role: authSession.userRole || 'Staff / Contributor',
        department: authSession.userDepartment || branding.departments[0] || 'Operations',
        title: authSession.userTitle || authSession.userRole || 'Staff / Contributor',
        signOffTitle:
          authSession.userTitle || authSession.userRole || 'Staff / Contributor',
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
      role: 'Staff / Contributor',
      department: branding.departments[0] || 'Operations',
      title: 'Staff / Contributor',
      signOffTitle: 'Staff / Contributor',
      active: false,
      lastActive: new Date().toISOString(),
    };
  }, [authSession, state.teamMembers, branding.departments]);

  // Enforce strict role integrity from the authenticated user's profile
  useEffect(() => {
    if (authSession?.isAuthenticated && state.activeRole !== currentUser.role) {
      setState((prev) => ({ ...prev, activeRole: currentUser.role }));
    }
  }, [authSession?.isAuthenticated, currentUser.role, state.activeRole]);

  useEffect(() => {
    if (!authSession?.isAuthenticated || !supabase) return;

    const client = supabase;
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
        { event: '*', schema: 'public', table: 'nexops_requests' },
        (payload) => {
          const record = (payload.new ?? payload.old) as
            | { id?: string; title?: string; status?: RequestStatus; submitted_by?: string }
            | undefined;
          if (
            record?.id &&
            payload.eventType === 'INSERT' &&
            record.submitted_by &&
            record.submitted_by !== currentUser.name
          ) {
            const liveNotif: AppNotification = {
              id: `notif-rt-${Date.now()}`,
              title: `Live Submission: ${record.id}`,
              message: `${record.submitted_by} submitted "${record.title ?? record.id}" (${record.status ?? 'Submitted'}).`,
              timestamp: new Date().toISOString(),
              read: false,
              requestId: record.id,
              severity: 'info',
            };
            setState((prev) => ({
              ...prev,
              notifications: [liveNotif, ...prev.notifications],
            }));
            pushToast(`Live Update · ${record.id}`, `${record.submitted_by} submitted a new request.`, 'info');
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
        { event: '*', schema: 'public', table: 'profiles' },
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
  }, [authSession?.isAuthenticated, currentUser.name, pushToast, syncFromSupabase]);

  const currentActor = currentUser;

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
      actorRole: actor.role,
      actorSignOffTitle: actor.signOffTitle || actor.title,
      actionType,
      details,
    };
  };

  // Authentication Handlers (Production-Only)
  const handleEmailSignIn = async (
    email: string,
    password: string,
    rememberSession: boolean,
  ) => {
    const { user, session } = await dataService.auth.signInWithEmail(
      email,
      password,
      rememberSession,
    );
    setAuthSession(session);
    if (user.role === 'Admin') {
      setIsAdminInitialized(true);
    }
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
      };
    });
    pushToast(
      `Signed in as ${user.name}`,
      `${user.email} · ${user.role}`,
      'success',
    );
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
    setTemplateSource(null);
    setCreateModalOpen(true);
  };

  const handleDuplicateRequest = (req: OperationalRequest) => {
    setSelectedRequestId(null);
    setTemplateSource(req);
    setCreateModalOpen(true);
  };

  // Create new request
  const handleCreateRequest = (payload: CreateRequestPayload) => {
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

    const reviewerResolution = resolveEffectiveReviewer('Marcus Vance', state.teamMembers);
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

    const notification: AppNotification | null = payload.submitImmediately
      ? {
          id: `notif-${Date.now()}`,
          title: 'New Operational Submission',
          message: `${currentActor.name} submitted ${newId} (${payload.title}) for QA verification.`,
          timestamp: now,
          read: false,
          requestId: newId,
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

  // Toggle QA checklist item
  const handleToggleChecklistItem = (requestId: string, itemId: string) => {
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

  // Stage 1 Manager / QA Sign-Off for Two-Tier Escalated Approval Chain
  const handleStage1SignOff = (requestId: string, comment?: string) => {
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

      const severityMap: Record<RequestStatus, AppNotification['severity']> = {
        Approved: 'success',
        'Revision Required': 'warning',
        Rejected: 'danger',
        Submitted: 'info',
        'Under QA Review': 'info',
        Draft: 'info',
      };

      const notification: AppNotification = {
        id: `notif-${Date.now()}`,
        title: `${requestId} marked ${nextStatus}`,
        message: comment
          ? `${actor.name}: ${comment}`
          : `${actor.name} moved ${requestId} to ${nextStatus}.`,
        timestamp: now,
        read: false,
        requestId,
        severity: severityMap[nextStatus],
      };

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
        notifications: [notification, ...prev.notifications],
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

    const syncNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: `${requestId} marked ${nextStatus}`,
      message: comment
        ? `${currentUser.name}: ${comment}`
        : `${currentUser.name} moved ${requestId} to ${nextStatus}.`,
      timestamp: now,
      read: false,
      requestId,
      severity:
        nextStatus === 'Approved'
          ? 'success'
          : nextStatus === 'Revision Required'
            ? 'warning'
            : nextStatus === 'Rejected'
              ? 'danger'
              : 'info',
    };
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

  // Leave & Time-Off Approvals Handlers (`nexops_leaves`)
  const handleCreateLeave = (payload: CreateLeavePayload) => {
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
      'Created',
      `${currentUser.name} submitted ${payload.leaveType} request ${code} (${payload.startDate} to ${payload.endDate}, ${payload.totalDays}d)${payload.backupDelegateName ? ` · Backup: ${payload.backupDelegateName}` : ''}.`,
    );

    const notification: AppNotification = {
      id: `notif-lve-${Date.now()}`,
      title: `Leave Request: ${code}`,
      message: `${currentUser.name} applied for ${payload.totalDays}d ${payload.leaveType} (${payload.startDate}).`,
      timestamp: now,
      read: false,
      severity: 'info',
    };

    setState((prev) => ({
      ...prev,
      leaves: [newLeave, ...prev.leaves],
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void dataService.leaves
      .upsert(newLeave, auditEntry)
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);

    pushToast(`Submitted ${code}`, `${payload.leaveType} (${payload.totalDays} days) awaiting approval.`, 'success');
  };

  const handleDecisionLeave = (
    leaveId: string,
    decision: 'Approved' | 'Rejected',
    reviewerNotes?: string,
  ) => {
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
      'Status Changed',
      `${currentUser.name} marked leave request ${target.code} (${target.employeeName}, ${target.totalDays}d ${target.leaveType}) as ${decision}.${reviewerNotes ? ` Remarks: ${reviewerNotes}` : ''}`,
    );

    const notification: AppNotification = {
      id: `notif-lve-dec-${Date.now()}`,
      title: `${target.code} ${decision}`,
      message: `${currentUser.name} ${decision.toLowerCase()} leave for ${target.employeeName} (${target.startDate}–${target.endDate}).`,
      timestamp: now,
      read: false,
      severity: decision === 'Approved' ? 'success' : 'warning',
    };

    setState((prev) => ({
      ...prev,
      leaves: prev.leaves.map((l) => (l.id === leaveId ? updatedLeave : l)),
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
      notifications: [notification, ...prev.notifications],
    }));

    void dataService.leaves
      .upsert(updatedLeave, auditEntry)
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

  // Team management handlers
  const handleUpdateMemberRole = (memberId: string, role: Role) => {
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const auditEntry = createAuditEvent(
      'TEAM-RBAC',
      'Team Updated',
      `Updated ${target.name}'s role from ${target.role} to ${role}.`,
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

  const handleToggleMemberActive = (memberId: string) => {
    const target = state.teamMembers.find((m) => m.id === memberId);
    if (!target) return;
    const nextActiveState = !target.active;
    const auditEntry = createAuditEvent(
      'TEAM-STATUS',
      'Team Updated',
      `${nextActiveState ? 'Activated' : 'Deactivated'} corporate account for ${target.name}.`,
      state.activeRole,
    );
    const nextMembers = state.teamMembers.map((m) =>
      m.id === memberId ? { ...m, active: nextActiveState } : m,
    );
    setState((prev) => ({
      ...prev,
      teamMembers: nextMembers,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void dataService.team
      .updateMember(memberId, { active: nextActiveState }, auditEntry, nextMembers)
      .catch(handleCloudWriteError);
    pushToast(
      nextActiveState ? 'Account Activated' : 'Account Deactivated',
      target.name,
      nextActiveState ? 'success' : 'warning',
    );
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

  // Executive Announcements & Circulars Handlers
  const handlePublishAnnouncement = (payload: {
    title: string;
    message: string;
    severity: AnnouncementSeverity;
  }) => {
    const now = new Date().toISOString();
    const notice: CompanyAnnouncement = {
      id: `ann-${Date.now()}`,
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      publishedBy: currentUser.name,
      publishedByRole: currentUser.role,
      publishedAt: now,
      archived: false,
    };
    const auditEntry = createAuditEvent(
      'EXEC-CIRCULAR',
      'Team Updated',
      `Published official company circular (${payload.severity.toUpperCase()}): "${payload.title}".`,
    );
    const nextAnnouncements = [notice, ...state.announcements];
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
      globalAuditLogs: [auditEntry, ...prev.globalAuditLogs],
    }));
    void Promise.all([
      dataService.auditLogs.append(auditEntry),
      dataService.systemState.upsertKey(
        SYSTEM_STATE_KEYS.ANNOUNCEMENTS,
        nextAnnouncements,
        currentUser.name,
      ),
    ])
      .then(() => {
        if (dataService.isSupabaseConfigured()) setDbConnected(true);
      })
      .catch(handleCloudWriteError);
    pushToast('Official Circular Published', payload.title, 'success');
  };

  const handleArchiveAnnouncement = (announcementId: string) => {
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === announcementId ? { ...a, archived: true } : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
    }));
    void dataService.systemState
      .upsertKey(SYSTEM_STATE_KEYS.ANNOUNCEMENTS, nextAnnouncements, currentUser.name)
      .catch(handleCloudWriteError);
    pushToast('Circular Archived', `"${target.title}" moved to archive.`, 'info');
  };

  const handleRestoreAnnouncement = (announcementId: string) => {
    const target = state.announcements.find((a) => a.id === announcementId);
    if (!target) return;
    const nextAnnouncements = state.announcements.map((a) =>
      a.id === announcementId ? { ...a, archived: false } : a,
    );
    setState((prev) => ({
      ...prev,
      announcements: nextAnnouncements,
    }));
    void dataService.systemState
      .upsertKey(SYSTEM_STATE_KEYS.ANNOUNCEMENTS, nextAnnouncements, currentUser.name)
      .catch(handleCloudWriteError);
    pushToast('Circular Republished', `"${target.title}" restored to top notice banner.`, 'success');
  };

  // Meetings & Action Items (MoM) Tracker Handlers
  const handleCreateMeeting = (payload: CreateMeetingPayload) => {
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
    const meeting = state.meetings.find((m) => m.id === meetingId);
    const actionItem = meeting?.actionItems.find((a) => a.id === actionItemId);
    if (!meeting || !actionItem || actionItem.linkedRequestId) return;

    const now = new Date().toISOString();
    const newId = generateNextRequestId(state.requests);
    const reviewerResolution = resolveEffectiveReviewer('Marcus Vance', state.teamMembers);
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

  const handleMarkAllRead = () => {
    void dataService.notifications.markAllRead();
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
    pushToast('Notifications Cleared', 'All operational alerts marked as read.', 'info');
  };

  const handleSelectNotificationRequest = (requestId: string, notificationId: string) => {
    void dataService.notifications.markRead(notificationId);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
    setSelectedRequestId(requestId);
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
        row.assignedReviewer || 'Marcus Vance',
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
    } else {
      setActiveSection('audit');
      pushToast('Opened Audit Ledger', `${audit.actionType} · ${audit.actorName}`, 'info');
    }
  };

  // System Backup Export / Restore
  const handleDownloadBackup = () => {
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

  // White-Label Branding, Custom Lists & Permission Matrix Handlers
  const handleUpdateBranding = (nextBranding: CompanyBrandingConfig) => {
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

  // Session Route Guard: unauthenticated users cannot access internal dashboard or records
  if (!authSession || !authSession.isAuthenticated) {
    return (
      <>
        <LoginScreen
          branding={branding}
          allowInitialAdminSetup={!isAdminInitialized}
          onEmailSignIn={handleEmailSignIn}
          onResetPassword={handleResetPassword}
          onRegisterInitialAdmin={handleRegisterInitialAdmin}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
          pendingLeavesCount={pendingLeavesCount}
          openActionItemsCount={openActionItemsCount}
          workspaceLinksCount={state.workspaceLinks.length}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Shell */}
        <div
          className={`flex min-h-screen flex-col transition-all duration-200 ease-in-out ${
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
            onSelectNotificationRequest={handleSelectNotificationRequest}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenCreateModal={handleOpenBlankCreateModal}
            onOpenProfile={() => setProfileModalOpen(true)}
            onSignOut={handleSignOut}
          />

          <AnnouncementBanner
            announcements={state.announcements}
            activeRole={currentUser.role}
            onPublishAnnouncement={handlePublishAnnouncement}
            onArchiveAnnouncement={handleArchiveAnnouncement}
            onRestoreAnnouncement={handleRestoreAnnouncement}
          />

          <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {isHydrating ? (
              <WorkspaceSkeleton />
            ) : (
              <>
                {activeSection === 'dashboard' && (
                  <DashboardView
                    requests={state.requests}
                    projects={state.projects}
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

                {activeSection === 'leaves' && (
                  <LeavesView
                    leaves={state.leaves}
                    activeRole={currentUser.role}
                    currentUser={currentUser}
                    departments={branding.departments}
                    teamMembers={state.teamMembers}
                    permissionMatrix={state.permissionMatrix}
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

                {activeSection === 'audit' && (
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
                    currentUser={currentUser}
                    teamMembers={state.teamMembers}
                    departments={branding.departments}
                    emails={state.workspaceEmails}
                    links={state.workspaceLinks}
                    onSaveEmailLog={handleSaveEmailLog}
                    onSaveWorkspaceLink={handleSaveWorkspaceLink}
                    onDeleteWorkspaceLink={handleDeleteWorkspaceLink}
                    onNotify={pushToast}
                  />
                )}

                {activeSection === 'settings' && (
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
        {createModalOpen && (
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
        {importModalOpen && (
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
            onClose={() => setSelectedRequestId(null)}
            onToggleChecklistItem={handleToggleChecklistItem}
            onTransitionStatus={handleTransitionStatus}
            onStage1Approve={handleStage1SignOff}
            onUpdateRequestFinancials={handleUpdateRequestFinancials}
            onAddComment={handleAddComment}
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
