export type Role = 'Admin' | 'Editor' | 'Viewer';
export type DbAccessRole = 'admin' | 'editor' | 'viewer';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface MasterKeyConfig {
  keyHash: string;
  keyHint: string;
  requireForSensitiveActions: boolean;
  updatedAt: string;
  updatedBy: string;
}

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
  | 'Team Updated'
  | 'Task Deleted'
  | 'Leave Submitted'
  | 'Leave Approved'
  | 'Leave Rejected'
  | 'Attendance Logged'
  | 'Role Changed'
  | 'Notice Posted'
  | 'Notice Updated'
  | 'Notice Deleted'
  | 'Vault Updated'
  | 'Subtask Updated';

export type AnnouncementSeverity = 'info' | 'warning' | 'urgent';
export type AnnouncementPriorityTag = 'Urgent' | 'General' | 'HR';

export interface CompanyAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  priorityTag: AnnouncementPriorityTag;
  pinned: boolean;
  publishedBy: string;
  publishedByEmail?: string;
  publishedByRole: Role;
  publishedAt: string;
  updatedAt?: string;
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
  | 'Casual'
  | 'Sick'
  | 'Annual'
  | 'Annual Leave'
  | 'Sick Leave'
  | 'Casual / Personal'
  | 'Parental / Emergency';

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  code: string;
  employeeId: string;
  employeeEmail?: string;
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

export type AttendanceStatus = 'Present' | 'Late' | 'Completed';

export interface AttendanceLog {
  id: string;
  userId: string;
  employeeId: string;
  userName: string;
  userEmail: string;
  department: Department;
  attendanceDate: string; // YYYY-MM-DD
  checkInTime: string; // ISO string
  checkOutTime?: string; // ISO string
  totalHours?: number;
  status: AttendanceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubtask {
  id: string;
  requestId: string;
  title: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  requestId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorRole: Role;
  body: string;
  mentions: string[];
  createdAt: string;
}

export type DocumentVaultFolder =
  | 'HR & Policies'
  | 'Operations & SOPs'
  | 'Accounts & Finance'
  | 'Client Contracts';

export type DocumentVaultAccessTag =
  | 'All Staff'
  | 'Department Only'
  | 'Editors & Admins'
  | 'Admin Restricted';

export type DocumentVaultSourceType = 'google_drive' | 'external_link' | 'uploaded_file';

export interface DocumentVaultItem {
  id: string;
  title: string;
  folder: DocumentVaultFolder;
  department: Department;
  description: string;
  accessTag: DocumentVaultAccessTag;
  sourceType: DocumentVaultSourceType;
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileDataUrl?: string;
  uploadedBy: string;
  uploadedByEmail: string;
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
  | 'profiles'
  | 'workspace_emails'
  | 'workspace_links'
  | 'system_state'
  | 'notifications'
  | 'attendance_logs'
  | 'leave_requests'
  | 'announcements'
  | 'task_comments'
  | 'subtasks'
  | 'document_vault';

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

export type WorkspaceToolType = 'gmail' | 'docs' | 'sheets' | 'forms';
export type WorkspaceDocToolType = 'docs' | 'sheets' | 'forms';

export interface WorkspaceEmailAttachmentMeta {
  name: string;
  size: number;
  mimeType: string;
}

export interface WorkspaceEmailLog {
  id: string;
  senderEmail: string;
  senderName: string;
  toRecipients: string;
  ccRecipients: string;
  subject: string;
  body: string;
  attachments?: WorkspaceEmailAttachmentMeta[];
  deliveryMethod: 'Gmail API' | 'Mail Client (mailto)';
  gmailMessageId?: string;
  status: 'Sent' | 'Dispatched via Mail Client';
  sentAt: string;
}

export interface WorkspaceSavedLink {
  id: string;
  toolType: WorkspaceDocToolType;
  title: string;
  url: string;
  googleFileId?: string;
  department: Department;
  notes: string;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocStudioContent {
  html: string;
  defaultFont: string;
  updatedAt: string;
  updatedBy?: string;
}

export type SheetNumberFormat = 'auto' | 'number' | 'currency' | 'percent' | 'date';

export interface SheetCellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  bgColor?: string;
  textColor?: string;
  border?: boolean;
  numberFormat?: SheetNumberFormat;
}

export interface SheetCellData {
  raw: string;
  style?: SheetCellStyle;
}

export interface SheetTabItem {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Record<string, SheetCellData>;
}

export interface SheetStudioContent {
  sheets: SheetTabItem[];
  activeSheetId: string;
  updatedAt: string;
  updatedBy?: string;
}

export type FormQuestionType =
  | 'short_answer'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'file_upload'
  | 'date_time';

export interface FormQuestionItem {
  id: string;
  title: string;
  type: FormQuestionType;
  required: boolean;
  options?: string[];
  description?: string;
}

export interface FormSubmissionItem {
  id: string;
  submittedBy: string;
  submittedAt: string;
  answers: Record<string, string | string[]>;
}

export interface FormStudioContent {
  title: string;
  description: string;
  questions: FormQuestionItem[];
  responses: FormSubmissionItem[];
  updatedAt: string;
  updatedBy?: string;
}

export type NavSection =
  | 'dashboard'
  | 'requests'
  | 'projects'
  | 'assets'
  | 'sops'
  | 'vault'
  | 'leaves'
  | 'meetings'
  | 'workspace'
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
  actorEmail?: string;
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
  approvalStatus?: ApprovalStatus;
  isSuperAdmin?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  department: Department;
  title: string;
  signOffTitle: string;
  avatarUrl?: string;
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
  approvalStatus?: ApprovalStatus;
  isSuperAdmin?: boolean;
  userDepartment?: Department;
  userTitle?: string;
  avatarUrl?: string;
  identityVerified?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  requestId?: string;
  targetSection?: NavSection;
  recipientEmail?: string;
  recipientRole?: Role | 'all';
  actorEmail?: string;
  category?: 'user_approval' | 'task' | 'leave' | 'mention' | 'system';
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
  attendanceLogs: AttendanceLog[];
  announcements: CompanyAnnouncement[];
  meetings: MeetingMinute[];
  workspaceEmails: WorkspaceEmailLog[];
  workspaceLinks: WorkspaceSavedLink[];
  teamMembers: TeamMember[];
  globalAuditLogs: AuditEvent[];
  notifications: AppNotification[];
  subtasks: TaskSubtask[];
  taskComments: TaskComment[];
  vaultDocuments: DocumentVaultItem[];
  permissionMatrix: PermissionMatrix;
}
