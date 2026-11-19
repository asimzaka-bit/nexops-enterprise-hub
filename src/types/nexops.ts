export type Role = 'Admin' | 'Manager / QA Reviewer' | 'Staff / Contributor';

export type RequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under QA Review'
  | 'Revision Required'
  | 'Approved'
  | 'Rejected';

export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type Department = string;

export const DEFAULT_DEPARTMENTS: string[] = [
  'Engineering',
  'Operations',
  'QA',
  'Admin',
  'Finance',
];

export const DEFAULT_CATEGORIES: string[] = [
  'Procurement / Asset Request',
  'Security & Infrastructure',
  'Compliance & Audit',
  'FinOps & Billing',
  'Business Continuity',
  'Infrastructure Architecture',
  'Logistics Automation',
  'Procurement & CapEx',
  'Operational Change',
];

export type CurrencyCode = 'PKR' | 'USD' | 'AED';

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['PKR', 'USD', 'AED'];

export interface CompanyBrandingConfig {
  companyName: string;
  tagline: string;
  departments: string[];
  categories: string[];
  approvalBudgetThresholdUsd: number;
}

export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';
export type ProjectType = 'Internal Project' | 'Client Engagement' | 'Vendor Program';

export interface CompanyProject {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  leadManager: string;
  department: Department;
  status: ProjectStatus;
  budgetHours: number;
  currency: CurrencyCode;
  estimatedBudget: number;
  actualSpend: number;
  updatedAt: string;
}

export type AssetCategory =
  | 'IT Hardware'
  | 'Software License'
  | 'Office Equipment'
  | 'Field Gear';

export type AssetCondition = 'New' | 'Good' | 'Needs Repair';

export type AssetStatus = 'Assigned' | 'In Stock' | 'Under Maintenance';

export interface AssetHistoryEntry {
  id: string;
  timestamp: string;
  actorName: string;
  eventType:
    | 'Registered'
    | 'Assigned / Transferred'
    | 'Maintenance Logged'
    | 'Request Linked'
    | 'Request Approved';
  details: string;
  requestId?: string;
}

export interface CompanyAsset {
  id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  assignedTo: string;
  department: Department;
  condition: AssetCondition;
  status: AssetStatus;
  serialNumber?: string;
  location?: string;
  stockQuantity?: number;
  minStockThreshold?: number;
  updatedAt: string;
  history: AssetHistoryEntry[];
}

export type SopCategory =
  | 'Standard Operating Procedure'
  | 'QA Guidelines'
  | 'HR Policies'
  | 'Templates';

export interface SopAcknowledgment {
  userId: string;
  employeeId: string;
  userName: string;
  role: Role;
  signOffTitle?: string;
  department: Department;
  acknowledgedAt: string;
}

export interface SopDocument {
  id: string;
  code: string;
  title: string;
  category: SopCategory;
  version: string;
  department: Department;
  effectiveDate: string;
  mandatoryRead: boolean;
  authorName: string;
  purpose: string;
  scope: string;
  procedureSteps: string[];
  complianceRules: string[];
  acknowledgments: SopAcknowledgment[];
  updatedAt: string;
}

export type AuditActionType =
  | 'Created'
  | 'Status Changed'
  | 'Checklist Updated'
  | 'Comment Added'
  | 'Team Updated';

export type AnnouncementSeverity = 'info' | 'warning' | 'urgent';

export interface CompanyAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  publishedBy: string;
  publishedByRole: Role;
  publishedAt: string;
  archived: boolean;
}

export type MeetingActionStatus = 'Open' | 'Converted to Request' | 'Completed';

export interface MeetingActionItem {
  id: string;
  description: string;
  ownerName: string;
  department: Department;
  priority: Priority;
  dueDate: string;
  status: MeetingActionStatus;
  linkedRequestId?: string;
}

export interface MeetingMinute {
  id: string;
  code: string;
  title: string;
  meetingDate: string;
  department: Department;
  facilitator: string;
  attendees: string[];
  summary: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  createdAt: string;
  updatedAt: string;
}

export type LeaveType =
  | 'Annual Leave'
  | 'Sick Leave'
  | 'Casual / Personal'
  | 'Parental / Emergency';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  code: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  backupDelegateName?: string;
  reviewerName?: string;
  reviewerNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PermissionKey =
  | 'create_requests'
  | 'approve_requests'
  | 'manage_projects'
  | 'manage_assets'
  | 'publish_sops'
  | 'approve_leaves'
  | 'manage_meetings'
  | 'publish_announcements'
  | 'manage_admin_settings';

export type RolePermissions = Record<PermissionKey, boolean>;
export type PermissionMatrix = Record<Role, RolePermissions>;

export type SupabaseTableKey =
  | 'requests'
  | 'audit_logs'
  | 'projects'
  | 'assets'
  | 'sops'
  | 'leaves'
  | 'moms'
  | 'system_state';

export type TableConnectionHealth = 'connected' | 'error' | 'offline';

export interface TableSyncStatus {
  tableKey: SupabaseTableKey;
  tableName: string;
  moduleName: string;
  status: TableConnectionHealth;
  rowCount: number;
  lastCheckedAt: string;
  errorMessage?: string;
}

export type NavSection =
  | 'dashboard'
  | 'requests'
  | 'projects'
  | 'assets'
  | 'sops'
  | 'leaves'
  | 'meetings'
  | 'audit'
  | 'settings';

export interface ChecklistItem {
  id: string;
  label: string;
  mandatory: boolean;
  checked: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface AuditEvent {
  id: string;
  requestId: string;
  timestamp: string;
  actorName: string;
  actorRole: Role;
  actorSignOffTitle?: string;
  actionType: AuditActionType;
  details: string;
}

export interface ApprovalStageSignOff {
  actorName: string;
  actorRole: Role;
  signOffTitle?: string;
  timestamp: string;
  notes?: string;
  delegatedFrom?: string;
}

export interface OperationalRequest {
  id: string;
  title: string;
  category: string;
  department: Department;
  submittedBy: string;
  submitterId: string;
  assignedReviewer: string;
  delegatedFromReviewer?: string;
  priority: Priority;
  status: RequestStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  deliverableUrl: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  assetId?: string;
  assetTag?: string;
  assetName?: string;
  currency?: CurrencyCode;
  estimatedCost?: number;
  actualSpend?: number;
  momCode?: string;
  stage1Approval?: ApprovalStageSignOff;
  stage2Approval?: ApprovalStageSignOff;
  checklist: ChecklistItem[];
  revisionReason?: string;
  auditTrail: AuditEvent[];
}

export interface TeamMember {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  department: Department;
  title: string;
  signOffTitle: string;
  active: boolean;
  lastActive: string;
  outOfOffice?: boolean;
  delegateApproverId?: string;
  delegateApproverName?: string;
}

export interface AuthSession {
  isAuthenticated: boolean;
  userId: string;
  rememberSession: boolean;
  signedInAt: string;
  authProvider?: 'supabase' | 'local';
  employeeId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: Role;
  userDepartment?: Department;
  userTitle?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  requestId?: string;
  severity: 'info' | 'warning' | 'success' | 'danger';
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'warning' | 'info';
}

export interface NexOpsState {
  activeRole: Role;
  requests: OperationalRequest[];
  projects: CompanyProject[];
  assets: CompanyAsset[];
  sops: SopDocument[];
  leaves: LeaveRequest[];
  announcements: CompanyAnnouncement[];
  meetings: MeetingMinute[];
  teamMembers: TeamMember[];
  globalAuditLogs: AuditEvent[];
  notifications: AppNotification[];
  permissionMatrix: PermissionMatrix;
}
