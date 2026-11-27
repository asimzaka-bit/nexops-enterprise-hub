export type Role = 'Admin' | 'Editor' | 'Viewer';
export type DbAccessRole = 'admin' | 'editor' | 'viewer';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'deactivated';

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

export interface SlaPolicyConfig {
  urgentHours: number;
  highHours: number;
  mediumHours: number;
  lowHours: number;
}

export const DEFAULT_SLA_POLICY: SlaPolicyConfig = {
  urgentHours: 4,
  highHours: 24,
  mediumHours: 48,
  lowHours: 48,
};

export interface DepartmentShiftConfig {
  department: string;
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  graceMinutes: number;
}

export const DEFAULT_SHIFT_CONFIG: Omit<DepartmentShiftConfig, 'department'> = {
  startTime: '09:00',
  endTime: '17:00',
  graceMinutes: 15,
};

export interface CompanyBrandingConfig {
  companyName: string;
  tagline: string;
  departments: string[];
  categories: string[];
  approvalBudgetThresholdUsd: number;
  slaPolicy?: SlaPolicyConfig;
  shiftRosters?: Record<string, DepartmentShiftConfig>;
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

export interface DocumentVersionEntry {
  version: string;
  updatedAt: string;
  updatedBy: string;
  updatedByEmail?: string;
  changeNote: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileDataUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  procedureSteps?: string[];
  complianceRules?: string[];
  purpose?: string;
  scope?: string;
}

export interface DigitalApprovalStamp {
  stampedBy: string;
  stampedByEmail: string;
  stampedByEmployeeId: string;
  stampedAt: string;
  badgeLabel: string;
}

export type WorkflowApprovalStatus = 'Submitted' | 'Under Review' | 'Approved' | 'Rejected';

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
  versions?: DocumentVersionEntry[];
  approvalStamp?: DigitalApprovalStamp;
  workflowStatus?: WorkflowApprovalStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
  | 'Subtask Updated'
  | 'Meet Session Logged'
  | 'Mail Sent'
  | 'Security Alert';

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
  expiresAt?: string;
  archived: boolean;
}

export type MeetingActionStatus =
  | 'Open'
  | 'Todo'
  | 'In Progress'
  | 'Done'
  | 'Converted to Request'
  | 'Completed';

export interface MeetingActionItem {
  id: string;
  title?: string;
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
  approvalStamp?: DigitalApprovalStamp;
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

export type LeaveStatus = 'Submitted' | 'Pending' | 'Under Review' | 'Approved' | 'Rejected';

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
  reviewerEmail?: string;
  reviewerNotes?: string;
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'Present' | 'Late' | 'Completed';

export type AttendanceTag = 'On Time' | 'Late' | 'Early Out';

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
  checkInTag?: 'On Time' | 'Late';
  checkOutTag?: 'On Time' | 'Early Out';
  shiftStartTime?: string;
  shiftEndTime?: string;
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

export type DocumentSignOffStatus =
  | 'Submitted'
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Acknowledged'
  | 'Rejected';

export interface DocumentSignOffRequest {
  id: string;
  reviewerEmail: string;
  reviewerName: string;
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: string;
  status: DocumentSignOffStatus;
  signedOffAt?: string;
  note?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

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
  storageBucket?: string;
  storagePath?: string;
  storageProvider?: 'supabase_storage' | 'cloud_metadata' | 'external_link';
  uploadedBy: string;
  uploadedByEmail: string;
  currentVersion?: string;
  versions?: DocumentVersionEntry[];
  approvalStamp?: DigitalApprovalStamp;
  workflowStatus?: WorkflowApprovalStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  expiryDate?: string;
  signOffRequests?: DocumentSignOffRequest[];
  createdAt: string;
  updatedAt: string;
}

export type RecycleBinItemType = 'vault' | 'announcement' | 'calendar' | 'meeting';

export interface RecycleBinItem {
  id: string;
  itemType: RecycleBinItemType;
  itemId: string;
  title: string;
  department?: Department;
  deletedBy: string;
  deletedByEmail: string;
  deletedAt: string;
  expiresAt: string;
  payload: DocumentVaultItem | CompanyAnnouncement | CalendarEvent | MeetingMinute;
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

export type ThemePreference = 'system' | 'light' | 'dark';

export type CalendarEventType = 'Meeting' | 'Deadline' | 'Reminder' | 'Leave';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  department: Department;
  type: CalendarEventType;
  locationOrLink?: string;
  attendees?: string[];
  description?: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuickBookmark {
  id: string;
  label: string;
  kind: 'module' | 'url';
  section?: NavSection;
  url?: string;
  createdAt: string;
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
  | 'calendar'
  | 'mailchat'
  | 'workspace'
  | 'audit'
  | 'user_settings'
  | 'settings';

export interface MeetInviteCardData {
  url: string;
  hostName: string;
  hostEmail: string;
  title: string;
  createdAt: string;
}

export interface CorporateMailMessage {
  id: string;
  threadId: string;
  parentId?: string;
  fromUserId: string;
  fromName: string;
  fromEmail: string;
  receiverEmail?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  status: 'sent' | 'draft';
  readBy: string[];
  starredBy?: string[];
  meetInvite?: MeetInviteCardData;
  deliveryMethod: 'NexOps Mail' | 'Gmail API' | 'Mail Client (mailto)';
  createdAt: string;
  updatedAt: string;
}

export interface TeamChatMessage {
  id: string;
  roomId: string;
  roomType: 'channel' | 'dm';
  roomLabel: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  receiverEmail?: string;
  senderRole: Role;
  senderDepartment: Department;
  body: string;
  meetInvite?: MeetInviteCardData;
  readBy: string[];
  createdAt: string;
}

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
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
  lastActiveAt?: string | null;
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
  lastLoginAt?: string;
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
  category?:
    | 'user_approval'
    | 'editor_approval'
    | 'task'
    | 'leave'
    | 'mention'
    | 'vault_expiry'
    | 'signoff'
    | 'system';
  severity: 'info' | 'warning' | 'success' | 'danger';
}

export type PendingEditorChangeModule =
  | 'requests'
  | 'projects'
  | 'assets'
  | 'sops'
  | 'vault'
  | 'meetings';

export type PendingEditorChangeAction = 'create' | 'update' | 'delete';

export type PendingEditorChangeStatus = 'pending' | 'approved' | 'rejected';

export interface PendingEditorChangeDiff {
  field: string;
  before: string;
  after: string;
}

export type EditorChangePayload =
  | {
      op: 'request_create';
      request: OperationalRequest;
    }
  | {
      op: 'request_bulk_import';
      requests: OperationalRequest[];
    }
  | {
      op: 'request_update';
      requestId: string;
      patch: Partial<
        Pick<
          OperationalRequest,
          | 'title'
          | 'category'
          | 'department'
          | 'priority'
          | 'dueDate'
          | 'description'
          | 'deliverableUrl'
          | 'projectId'
          | 'projectCode'
          | 'projectName'
          | 'assetId'
          | 'assetTag'
          | 'assetName'
          | 'currency'
          | 'estimatedCost'
          | 'actualSpend'
          | 'checklist'
        >
      >;
    }
  | {
      op: 'request_delete';
      requestId: string;
    }
  | {
      op: 'request_toggle_checklist';
      requestId: string;
      itemId: string;
      nextChecked: boolean;
      label: string;
    }
  | {
      op: 'request_update_financials';
      requestId: string;
      actualSpend: number;
    }
  | {
      op: 'request_add_subtask';
      requestId: string;
      title: string;
    }
  | {
      op: 'request_toggle_subtask';
      requestId: string;
      subtaskId: string;
      nextCompleted: boolean;
    }
  | {
      op: 'request_delete_subtask';
      requestId: string;
      subtaskId: string;
    }
  | {
      op: 'request_add_comment';
      requestId: string;
      comment: string;
    }
  | {
      op: 'request_add_task_comment';
      requestId: string;
      body: string;
      mentions: string[];
    }
  | {
      op: 'project_create';
      project: CompanyProject;
    }
  | {
      op: 'project_update';
      projectId: string;
      patch: Partial<Omit<CompanyProject, 'id' | 'updatedAt'>>;
    }
  | {
      op: 'project_delete';
      projectId: string;
    }
  | {
      op: 'asset_create';
      asset: CompanyAsset;
    }
  | {
      op: 'asset_transfer';
      assetId: string;
      patch: {
        assignedTo: string;
        department: Department;
        condition: AssetCondition;
        status: AssetStatus;
        notes?: string;
      };
    }
  | {
      op: 'asset_maintenance';
      assetId: string;
      patch: {
        condition: AssetCondition;
        status: AssetStatus;
        notes: string;
      };
    }
  | {
      op: 'sop_create';
      sop: SopDocument;
    }
  | {
      op: 'sop_toggle_mandatory';
      sopId: string;
      nextMandatory: boolean;
    }
  | {
      op: 'vault_create';
      document: DocumentVaultItem;
    }
  | {
      op: 'vault_delete';
      documentId: string;
    }
  | {
      op: 'meeting_create';
      meeting: MeetingMinute;
    }
  | {
      op: 'meeting_add_action';
      meetingId: string;
      actionItem: MeetingActionItem;
    }
  | {
      op: 'meeting_convert_action';
      meetingId: string;
      actionItemId: string;
    }
  | {
      op: 'meeting_complete_action';
      meetingId: string;
      actionItemId: string;
    }
  | {
      op: 'meeting_update_action_status';
      meetingId: string;
      actionItemId: string;
      nextStatus: MeetingActionStatus;
    };

export interface PendingEditorChange {
  id: string;
  module: PendingEditorChangeModule;
  moduleLabel: string;
  action: PendingEditorChangeAction;
  targetId: string;
  itemLabel: string;
  summary: string;
  diffs: PendingEditorChangeDiff[];
  editorId: string;
  editorName: string;
  editorEmail: string;
  editorDepartment: Department;
  submittedAt: string;
  status: PendingEditorChangeStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  payload: EditorChangePayload;
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
  pendingEditorChanges: PendingEditorChange[];
  corporateMails: CorporateMailMessage[];
  chatMessages: TeamChatMessage[];
  calendarEvents: CalendarEvent[];
  recycleBin: RecycleBinItem[];
  permissionMatrix: PermissionMatrix;
}

export type InterfaceDensity = 'compact' | 'standard' | 'comfortable';
export type FontStyleOption = 'calibri' | 'segoe' | 'inter' | 'system';
export type TextScaleOption = '95' | '100' | '105';
export type TemperatureUnit = 'C' | 'F';
export type TimeFormatOption = '12h' | '24h';

export interface UserPreferences {
  density: InterfaceDensity;
  fontStyle: FontStyleOption;
  textScale: TextScaleOption;
  teamChatAlerts: boolean;
  mailNotifications: boolean;
  approvalLeaveAlerts: boolean;
  calendarReminders: boolean;
  weatherCity: string;
  weatherUnit: TemperatureUnit;
  timeFormat: TimeFormatOption;
  timezone: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  density: 'standard',
  fontStyle: 'calibri',
  textScale: '100',
  teamChatAlerts: true,
  mailNotifications: true,
  approvalLeaveAlerts: true,
  calendarReminders: true,
  weatherCity: 'Lahore, Pakistan',
  weatherUnit: 'C',
  timeFormat: '12h',
  timezone: 'Asia/Karachi',
};
