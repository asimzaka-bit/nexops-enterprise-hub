import {
  AppNotification,
  AuditEvent,
  CompanyAnnouncement,
  CompanyAsset,
  CompanyProject,
  LeaveRequest,
  MeetingMinute,
  NexOpsState,
  OperationalRequest,
  PermissionMatrix,
  SopDocument,
  TeamMember,
} from '../types/nexops';

export const INITIAL_TEAM_MEMBERS: TeamMember[] = [];

export const INITIAL_PROJECTS: CompanyProject[] = [];

export const INITIAL_ASSETS: CompanyAsset[] = [];

export const INITIAL_SOPS: SopDocument[] = [];

export const INITIAL_REQUESTS: OperationalRequest[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export const INITIAL_ANNOUNCEMENTS: CompanyAnnouncement[] = [];

export const INITIAL_MEETINGS: MeetingMinute[] = [];

export const INITIAL_LEAVES: LeaveRequest[] = [];

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  Admin: {
    create_requests: true,
    approve_requests: true,
    manage_projects: true,
    manage_assets: true,
    publish_sops: true,
    approve_leaves: true,
    manage_meetings: true,
    publish_announcements: true,
    manage_admin_settings: true,
  },
  Editor: {
    create_requests: true,
    approve_requests: true,
    manage_projects: true,
    manage_assets: true,
    publish_sops: true,
    approve_leaves: true,
    manage_meetings: true,
    publish_announcements: false,
    manage_admin_settings: false,
  },
  Viewer: {
    create_requests: false,
    approve_requests: false,
    manage_projects: false,
    manage_assets: false,
    publish_sops: false,
    approve_leaves: false,
    manage_meetings: false,
    publish_announcements: false,
    manage_admin_settings: false,
  },
};

export function buildInitialAuditLogs(requests: OperationalRequest[]): AuditEvent[] {
  const all = requests.flatMap((req) => req.auditTrail);
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function createSeedState(): NexOpsState {
  return {
    activeRole: 'Viewer',
    requests: [],
    projects: [],
    assets: [],
    sops: [],
    leaves: [],
    announcements: [],
    meetings: [],
    workspaceEmails: [],
    workspaceLinks: [],
    teamMembers: [],
    globalAuditLogs: [],
    notifications: [],
    permissionMatrix: structuredClone(DEFAULT_PERMISSION_MATRIX),
  };
}
