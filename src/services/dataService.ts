/**
 * ============================================================================
 * NexOps Enterprise Hub — Modular Data Persistence & Cloud Sync Service
 * ============================================================================
 *
 * Connects directly to live Supabase Auth & all 8 PostgreSQL tables:
 *   1. `nexops_requests`
 *   2. `nexops_audit_logs`
 *   3. `nexops_projects`
 *   4. `nexops_assets`
 *   5. `nexops_sops`
 *   6. `nexops_leaves`
 *   7. `nexops_moms`
 *   8. `nexops_system_state`
 * using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with automatic
 * `localStorage` offline fallback when environment variables are not configured.
 *
 * ----------------------------------------------------------------------------
 * SUPABASE POSTGRESQL SCHEMA (Run in Supabase SQL Editor)
 * ----------------------------------------------------------------------------
 *
 * -- 1. Operational Requests Table
 * CREATE TABLE IF NOT EXISTS public.nexops_requests (
 *   id TEXT PRIMARY KEY,
 *   title TEXT NOT NULL,
 *   category TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
 *   status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Under QA Review', 'Revision Required', 'Approved', 'Rejected')),
 *   due_date TEXT NOT NULL,
 *   description TEXT NOT NULL,
 *   reference_link TEXT NOT NULL DEFAULT '',
 *   submitted_by TEXT NOT NULL,
 *   checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 2. Immutable Audit Logs Table
 * CREATE TABLE IF NOT EXISTS public.nexops_audit_logs (
 *   id TEXT PRIMARY KEY,
 *   request_id TEXT NOT NULL,
 *   actor_name TEXT NOT NULL,
 *   actor_role TEXT NOT NULL CHECK (actor_role IN ('Admin', 'Editor', 'Viewer', 'Manager / QA Reviewer', 'Staff / Contributor')),
 *   action_type TEXT NOT NULL CHECK (action_type IN ('Created', 'Status Changed', 'Checklist Updated', 'Comment Added', 'Team Updated')),
 *   details TEXT NOT NULL,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 3. Projects & Clients Directory Table
 * CREATE TABLE IF NOT EXISTS public.nexops_projects (
 *   id TEXT PRIMARY KEY,
 *   code TEXT NOT NULL,
 *   name TEXT NOT NULL,
 *   type TEXT NOT NULL,
 *   lead_manager TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   status TEXT NOT NULL,
 *   budget_hours NUMERIC NOT NULL DEFAULT 0,
 *   currency TEXT NOT NULL DEFAULT 'USD',
 *   estimated_budget NUMERIC NOT NULL DEFAULT 0,
 *   actual_spend NUMERIC NOT NULL DEFAULT 0,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 4. Assets & Inventory Registry Table
 * CREATE TABLE IF NOT EXISTS public.nexops_assets (
 *   id TEXT PRIMARY KEY,
 *   tag TEXT NOT NULL,
 *   name TEXT NOT NULL,
 *   category TEXT NOT NULL,
 *   assigned_to TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   condition TEXT NOT NULL,
 *   status TEXT NOT NULL,
 *   serial_number TEXT,
 *   location TEXT,
 *   stock_quantity INTEGER DEFAULT 1,
 *   min_stock_threshold INTEGER DEFAULT 0,
 *   history JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 5. Corporate SOP & Knowledge Vault Table
 * CREATE TABLE IF NOT EXISTS public.nexops_sops (
 *   id TEXT PRIMARY KEY,
 *   code TEXT NOT NULL,
 *   title TEXT NOT NULL,
 *   category TEXT NOT NULL,
 *   version TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   effective_date TEXT NOT NULL,
 *   mandatory_read BOOLEAN NOT NULL DEFAULT true,
 *   author_name TEXT NOT NULL,
 *   purpose TEXT NOT NULL,
 *   scope TEXT NOT NULL,
 *   procedure_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   compliance_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   acknowledgments JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 6. Leave & Time-Off Approvals Table
 * CREATE TABLE IF NOT EXISTS public.nexops_leaves (
 *   id TEXT PRIMARY KEY,
 *   code TEXT NOT NULL,
 *   employee_id TEXT NOT NULL,
 *   employee_name TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   leave_type TEXT NOT NULL,
 *   start_date TEXT NOT NULL,
 *   end_date TEXT NOT NULL,
 *   total_days INTEGER NOT NULL DEFAULT 1,
 *   reason TEXT NOT NULL,
 *   status TEXT NOT NULL,
 *   backup_delegate_name TEXT,
 *   reviewer_name TEXT,
 *   reviewer_notes TEXT,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 7. Meeting Minutes & Action Items (MoM) Table
 * CREATE TABLE IF NOT EXISTS public.nexops_moms (
 *   id TEXT PRIMARY KEY,
 *   code TEXT NOT NULL,
 *   title TEXT NOT NULL,
 *   meeting_date TEXT NOT NULL,
 *   department TEXT NOT NULL,
 *   facilitator TEXT NOT NULL,
 *   attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   summary TEXT NOT NULL,
 *   decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 8. User Profiles, RBAC Roles & Admin Approval Status Table + Storage Bucket
 * CREATE TABLE IF NOT EXISTS public.profiles (
 *   id TEXT PRIMARY KEY,
 *   email TEXT UNIQUE,
 *   full_name TEXT,
 *   employee_id TEXT,
 *   role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
 *   approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
 *   is_super_admin BOOLEAN NOT NULL DEFAULT false,
 *   active BOOLEAN NOT NULL DEFAULT true,
 *   approved_by TEXT,
 *   approved_at TIMESTAMPTZ,
 *   department TEXT,
 *   title TEXT,
 *   sign_off_title TEXT,
 *   avatar_url TEXT,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_by TEXT;
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
 *
 * -- Ensure permanent Super Admin profile
 * UPDATE public.profiles
 * SET role = 'admin', approval_status = 'approved', is_super_admin = true, active = true
 * WHERE LOWER(email) = 'asim.zaka@mmpakistan.com';
 *
 * INSERT INTO storage.buckets (id, name, public)
 * VALUES ('avatars', 'avatars', true)
 * ON CONFLICT (id) DO NOTHING;
 *
 * CREATE POLICY "Public Avatar Read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
 * CREATE POLICY "Allow Avatar Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
 * CREATE POLICY "Allow Avatar Update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');
 * CREATE POLICY "Allow Avatar Delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');
 *
 * -- 9. Workspace Tools — Gmail Sent History Table
 * CREATE TABLE IF NOT EXISTS public.nexops_workspace_emails (
 *   id TEXT PRIMARY KEY,
 *   sender_email TEXT NOT NULL,
 *   sender_name TEXT NOT NULL,
 *   to_recipients TEXT NOT NULL,
 *   cc_recipients TEXT NOT NULL DEFAULT '',
 *   subject TEXT NOT NULL,
 *   body TEXT NOT NULL,
 *   delivery_method TEXT NOT NULL,
 *   gmail_message_id TEXT,
 *   status TEXT NOT NULL,
 *   sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 10. Workspace Tools — Shared Google Docs, Sheets & Forms Links Table
 * CREATE TABLE IF NOT EXISTS public.nexops_workspace_links (
 *   id TEXT PRIMARY KEY,
 *   tool_type TEXT NOT NULL CHECK (tool_type IN ('docs', 'sheets', 'forms')),
 *   title TEXT NOT NULL,
 *   url TEXT NOT NULL,
 *   google_file_id TEXT,
 *   department TEXT NOT NULL,
 *   notes TEXT NOT NULL DEFAULT '',
 *   added_by TEXT NOT NULL,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * -- 11. Key-Value System State Table (Branding, Custom Lists, Permission Matrix, Circulars, Shared Metadata)
 * CREATE TABLE IF NOT EXISTS public.nexops_system_state (
 *   state_key TEXT PRIMARY KEY,
 *   payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 *   updated_by TEXT,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_nexops_audit_request_id ON public.nexops_audit_logs(request_id);
 * CREATE INDEX IF NOT EXISTS idx_nexops_audit_created_at ON public.nexops_audit_logs(created_at DESC);
 *
 * -- Enable Row-Level Security (RLS) & Policies for Client Access across all 11 tables
 * ALTER TABLE public.nexops_requests ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_audit_logs ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_projects ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_assets ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_sops ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_leaves ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_moms ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_workspace_emails ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_workspace_links ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.nexops_system_state ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Allow all nexops_requests" ON public.nexops_requests FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_audit_logs" ON public.nexops_audit_logs FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_projects" ON public.nexops_projects FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_assets" ON public.nexops_assets FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_sops" ON public.nexops_sops FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_leaves" ON public.nexops_leaves FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_moms" ON public.nexops_moms FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_workspace_emails" ON public.nexops_workspace_emails FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_workspace_links" ON public.nexops_workspace_links FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "Allow all nexops_system_state" ON public.nexops_system_state FOR ALL USING (true) WITH CHECK (true);
 *
 * -- Enable Supabase Realtime replication across all tables for live cross-device sync
 * ALTER PUBLICATION supabase_realtime ADD TABLE
 *   public.nexops_requests,
 *   public.nexops_audit_logs,
 *   public.nexops_projects,
 *   public.nexops_assets,
 *   public.nexops_sops,
 *   public.nexops_leaves,
 *   public.nexops_moms,
 *   public.profiles,
 *   public.nexops_workspace_emails,
 *   public.nexops_workspace_links,
 *   public.nexops_system_state;
 * ============================================================================
 */

import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { createSeedState, DEFAULT_PERMISSION_MATRIX } from '../data/seedData';
import {
  AppNotification,
  ApprovalStageSignOff,
  ApprovalStatus,
  AssetCategory,
  AssetCondition,
  AssetHistoryEntry,
  AssetStatus,
  AuditEvent,
  AuthSession,
  ChecklistItem,
  CompanyAnnouncement,
  CompanyAsset,
  CompanyBrandingConfig,
  CompanyProject,
  CurrencyCode,
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS,
  Department,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  MasterKeyConfig,
  MeetingActionItem,
  MeetingMinute,
  NexOpsState,
  OperationalRequest,
  PermissionMatrix,
  ProjectStatus,
  ProjectType,
  RequestStatus,
  Role,
  SopAcknowledgment,
  SopCategory,
  SopDocument,
  SupabaseTableKey,
  TableSyncStatus,
  TeamMember,
  WorkspaceDocToolType,
  WorkspaceEmailLog,
  WorkspaceSavedLink,
} from '../types/nexops';
import {
  fromDbRole,
  isSuperAdminEmail,
  normalizeApprovalStatus,
  normalizePermissionMatrix,
  normalizeRole,
  SUPER_ADMIN_EMAIL,
  toDbRole,
} from '../utils/storage';

const STORAGE_KEY = 'nexops_enterprise_hub_state_v3';
const AUTH_SESSION_KEY = 'nexops_enterprise_auth_session_v1';
const BRANDING_STORAGE_KEY = 'nexops_enterprise_branding_v1';
const MASTER_KEY_STORAGE_KEY = 'nexops_enterprise_master_key_v1';
const REQUEST_PROJECTS_MAP_KEY = 'nexops_enterprise_request_projects_v1';
const REQUEST_ASSETS_MAP_KEY = 'nexops_enterprise_request_assets_v1';
const REQUEST_META_MAP_KEY = 'nexops_enterprise_request_meta_v1';
const LOCAL_CREDENTIALS_KEY = 'nexops_enterprise_credentials_v1';

export const DEFAULT_COMPANY_BRANDING: CompanyBrandingConfig = {
  companyName: 'NexOps Enterprise Hub',
  tagline: 'Unified Operations, QA & Approval Management System',
  departments: [...DEFAULT_DEPARTMENTS],
  categories: [...DEFAULT_CATEGORIES],
  approvalBudgetThresholdUsd: 5000,
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const hasValidSupabaseConfig =
  Boolean(SUPABASE_URL.trim()) &&
  Boolean(SUPABASE_ANON_KEY.trim()) &&
  !SUPABASE_URL.includes('YOUR_SUPABASE') &&
  !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

export const supabase: SupabaseClient | null = hasValidSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export type PersistenceMode = 'supabase' | 'local';

export function getPersistenceMode(): PersistenceMode {
  return supabase ? 'supabase' : 'local';
}

// ---------------------------------------------------------------------------
// LocalStorage Fallback Cache & Credential Helpers
// ---------------------------------------------------------------------------

async function hashCredentialSecret(email: string, password: string): Promise<string> {
  const input = `${email.trim().toLowerCase()}::${password}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function readLocalCredentials(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveLocalCredential(email: string, password: string): Promise<void> {
  try {
    const creds = readLocalCredentials();
    creds[email.trim().toLowerCase()] = await hashCredentialSecret(email, password);
    localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(creds));
  } catch {
    // Ignore storage quota restrictions
  }
}

function isLegacyDemoMember(member: TeamMember): boolean {
  const email = (member.email ?? '').toLowerCase();
  return (
    email.endsWith('@nexops-corp.example') ||
    ['usr-admin-01', 'usr-qa-01', 'usr-staff-01', 'usr-ops-02', 'usr-fin-03', 'usr-eng-04', 'usr-qa-05'].includes(
      member.id,
    )
  );
}

function enforceMemberInvariants(member: TeamMember, idx = 0): TeamMember {
  const isSuper = isSuperAdminEmail(member.email) || Boolean(member.isSuperAdmin);
  const role: Role = isSuper ? 'Admin' : normalizeRole(member.role);
  const approvalStatus: ApprovalStatus = isSuper
    ? 'approved'
    : normalizeApprovalStatus(member.approvalStatus ?? 'approved', member.email);
  return {
    ...member,
    role,
    approvalStatus,
    isSuperAdmin: isSuper,
    active: isSuper ? true : member.active !== false,
    employeeId: member.employeeId || `NX-EMP-${String(1001 + idx * 4)}`,
    signOffTitle: member.signOffTitle || member.title || role,
  };
}

function readWorkspaceState(): NexOpsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedState();
      writeWorkspaceState(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as NexOpsState;
    if (!parsed || !Array.isArray(parsed.requests) || !Array.isArray(parsed.teamMembers)) {
      const seed = createSeedState();
      writeWorkspaceState(seed);
      return seed;
    }
    const normalizedMembers = parsed.teamMembers
      .filter((m) => !isLegacyDemoMember(m))
      .map((m, idx) => enforceMemberInvariants(m, idx));

    const normalizedProjects: CompanyProject[] = Array.isArray(parsed.projects)
      ? parsed.projects.map((p) => ({
          ...p,
          currency: p.currency ?? 'USD',
          estimatedBudget: typeof p.estimatedBudget === 'number' ? p.estimatedBudget : 0,
          actualSpend: typeof p.actualSpend === 'number' ? p.actualSpend : 0,
        }))
      : [];
    const normalizedAssets: CompanyAsset[] = Array.isArray(parsed.assets) ? parsed.assets : [];
    const normalizedSops: SopDocument[] = Array.isArray(parsed.sops)
      ? parsed.sops.map((s) => ({
          ...s,
          acknowledgments: Array.isArray(s.acknowledgments)
            ? s.acknowledgments.map((ack) => ({ ...ack, role: normalizeRole(ack.role) }))
            : [],
        }))
      : [];
    const normalizedLeaves: LeaveRequest[] = Array.isArray(parsed.leaves) ? parsed.leaves : [];
    const normalizedAnnouncements: CompanyAnnouncement[] = Array.isArray(parsed.announcements)
      ? parsed.announcements.map((a) => ({
          ...a,
          publishedByRole: normalizeRole(a.publishedByRole),
        }))
      : [];
    const normalizedMeetings: MeetingMinute[] = Array.isArray(parsed.meetings)
      ? parsed.meetings
      : [];

    return {
      ...parsed,
      activeRole: normalizeRole(parsed.activeRole),
      requests: parsed.requests.map((r) => ({
        ...r,
        auditTrail: Array.isArray(r.auditTrail)
          ? r.auditTrail.map((a) => ({ ...a, actorRole: normalizeRole(a.actorRole) }))
          : [],
      })),
      projects: normalizedProjects,
      assets: normalizedAssets,
      sops: normalizedSops,
      leaves: normalizedLeaves,
      announcements: normalizedAnnouncements,
      meetings: normalizedMeetings,
      workspaceEmails: Array.isArray(parsed.workspaceEmails) ? parsed.workspaceEmails : [],
      workspaceLinks: Array.isArray(parsed.workspaceLinks) ? parsed.workspaceLinks : [],
      teamMembers: normalizedMembers,
      globalAuditLogs: Array.isArray(parsed.globalAuditLogs)
        ? parsed.globalAuditLogs.map((a) => ({ ...a, actorRole: normalizeRole(a.actorRole) }))
        : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      permissionMatrix: normalizePermissionMatrix(parsed.permissionMatrix),
    };
  } catch {
    return createSeedState();
  }
}

type RequestProjectLink = {
  projectId: string;
  projectCode: string;
  projectName: string;
};

type RequestAssetLink = {
  assetId: string;
  assetTag: string;
  assetName: string;
};

function readRequestProjectsMap(): Record<string, RequestProjectLink> {
  try {
    const raw = localStorage.getItem(REQUEST_PROJECTS_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RequestProjectLink>) : {};
  } catch {
    return {};
  }
}

function saveRequestProjectLink(requestId: string, link?: RequestProjectLink): void {
  if (!link) return;
  try {
    const map = readRequestProjectsMap();
    map[requestId] = link;
    localStorage.setItem(REQUEST_PROJECTS_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function readRequestAssetsMap(): Record<string, RequestAssetLink> {
  try {
    const raw = localStorage.getItem(REQUEST_ASSETS_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RequestAssetLink>) : {};
  } catch {
    return {};
  }
}

function saveRequestAssetLink(requestId: string, link?: RequestAssetLink): void {
  if (!link) return;
  try {
    const map = readRequestAssetsMap();
    map[requestId] = link;
    localStorage.setItem(REQUEST_ASSETS_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export type RequestExtendedMeta = {
  currency?: CurrencyCode;
  estimatedCost?: number;
  actualSpend?: number;
  momCode?: string;
  assignedReviewer?: string;
  delegatedFromReviewer?: string;
  stage1Approval?: ApprovalStageSignOff | null;
  stage2Approval?: ApprovalStageSignOff | null;
};

function readRequestMetaMap(): Record<string, RequestExtendedMeta> {
  try {
    const raw = localStorage.getItem(REQUEST_META_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, RequestExtendedMeta>) : {};
  } catch {
    return {};
  }
}

function saveRequestMeta(requestId: string, meta: RequestExtendedMeta): void {
  try {
    const map = readRequestMetaMap();
    map[requestId] = {
      ...(map[requestId] ?? {}),
      ...meta,
    };
    localStorage.setItem(REQUEST_META_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function writeWorkspaceState(state: NexOpsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function normalizeStringList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = Array.from(
    new Set(
      raw
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
  return cleaned.length > 0 ? cleaned : [...fallback];
}

function readBrandingConfig(): CompanyBrandingConfig {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COMPANY_BRANDING };
    const parsed = JSON.parse(raw) as Partial<CompanyBrandingConfig>;
    return {
      companyName:
        typeof parsed.companyName === 'string' && parsed.companyName.trim()
          ? parsed.companyName.trim()
          : DEFAULT_COMPANY_BRANDING.companyName,
      tagline:
        typeof parsed.tagline === 'string' && parsed.tagline.trim()
          ? parsed.tagline.trim()
          : DEFAULT_COMPANY_BRANDING.tagline,
      departments: normalizeStringList(parsed.departments, DEFAULT_DEPARTMENTS),
      categories: normalizeStringList(parsed.categories, DEFAULT_CATEGORIES),
      approvalBudgetThresholdUsd:
        typeof parsed.approvalBudgetThresholdUsd === 'number' &&
        Number.isFinite(parsed.approvalBudgetThresholdUsd) &&
        parsed.approvalBudgetThresholdUsd >= 0
          ? parsed.approvalBudgetThresholdUsd
          : DEFAULT_COMPANY_BRANDING.approvalBudgetThresholdUsd,
    };
  } catch {
    return { ...DEFAULT_COMPANY_BRANDING };
  }
}

function writeBrandingConfig(config: CompanyBrandingConfig): CompanyBrandingConfig {
  const normalized: CompanyBrandingConfig = {
    companyName: config.companyName.trim() || DEFAULT_COMPANY_BRANDING.companyName,
    tagline: config.tagline.trim() || DEFAULT_COMPANY_BRANDING.tagline,
    departments: normalizeStringList(config.departments, DEFAULT_DEPARTMENTS),
    categories: normalizeStringList(config.categories, DEFAULT_CATEGORIES),
    approvalBudgetThresholdUsd:
      typeof config.approvalBudgetThresholdUsd === 'number' &&
      Number.isFinite(config.approvalBudgetThresholdUsd) &&
      config.approvalBudgetThresholdUsd >= 0
        ? config.approvalBudgetThresholdUsd
        : DEFAULT_COMPANY_BRANDING.approvalBudgetThresholdUsd,
  };
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
  return normalized;
}

function defaultTitleForRole(role: Role): string {
  switch (role) {
    case 'Admin':
      return 'Operations Administrator';
    case 'Editor':
      return 'Operations Editor';
    default:
      return 'Workspace Viewer';
  }
}

function resolveRole(raw: unknown): Role {
  return normalizeRole(raw);
}

function deriveEmployeeCode(seedStr: string): string {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 9000;
  }
  return `NX-EMP-${1000 + Math.abs(hash)}`;
}

export function buildMemberFromSupabaseUser(
  user: User,
  existingMembers: TeamMember[] = [],
): TeamMember {
  const email = (user.email ?? '').trim() || `user-${user.id.slice(0, 6)}@nexops.local`;
  const isSuper = isSuperAdminEmail(email);
  const existing = existingMembers.find(
    (m) => m.id === user.id || m.email.toLowerCase() === email.toLowerCase(),
  );
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    existing?.name ||
    email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  const role: Role = isSuper
    ? 'Admin'
    : existing?.role
      ? resolveRole(existing.role)
      : meta.role
        ? resolveRole(meta.role)
        : 'Viewer';
  const approvalStatus: ApprovalStatus = isSuper
    ? 'approved'
    : existing?.approvalStatus ?? normalizeApprovalStatus(meta.approval_status, email);
  const department =
    (typeof meta.department === 'string' && meta.department.trim()) ||
    existing?.department ||
    DEFAULT_DEPARTMENTS[0];
  const title =
    (typeof meta.title === 'string' && meta.title.trim()) ||
    existing?.title ||
    (isSuper ? 'Primary Super Administrator' : defaultTitleForRole(role));
  const signOffTitle =
    (typeof meta.sign_off_title === 'string' && meta.sign_off_title.trim()) ||
    existing?.signOffTitle ||
    title;
  const employeeId =
    (typeof meta.employee_id === 'string' && meta.employee_id.trim()) ||
    existing?.employeeId ||
    deriveEmployeeCode(user.id || email);
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    existing?.avatarUrl ||
    undefined;

  return {
    id: user.id,
    employeeId,
    name: rawName,
    email,
    role,
    approvalStatus,
    isSuperAdmin: isSuper || Boolean(existing?.isSuperAdmin),
    approvedBy: existing?.approvedBy,
    approvedAt: existing?.approvedAt,
    department,
    title,
    signOffTitle,
    avatarUrl,
    active: isSuper ? true : existing?.active ?? true,
    lastActive: new Date().toISOString(),
    outOfOffice: existing?.outOfOffice,
    delegateApproverId: existing?.delegateApproverId,
    delegateApproverName: existing?.delegateApproverName,
  };
}

// ---------------------------------------------------------------------------
// Supabase Table Row Shapes & Mappers (All 8 Cloud Tables)
// ---------------------------------------------------------------------------

interface NexOpsRequestDbRow {
  id: string;
  title: string;
  category: string;
  department: Department;
  priority: OperationalRequest['priority'];
  status: RequestStatus;
  due_date: string;
  description: string;
  reference_link: string;
  submitted_by: string;
  checklist: ChecklistItem[] | string | null;
  created_at: string;
  updated_at: string;
}

interface NexOpsAuditDbRow {
  id: string;
  request_id: string;
  actor_name: string;
  actor_role: Role;
  action_type: AuditEvent['actionType'];
  details: string;
  created_at: string;
}

interface NexOpsProjectDbRow {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  lead_manager: string;
  department: Department;
  status: ProjectStatus;
  budget_hours: number;
  currency: CurrencyCode;
  estimated_budget: number;
  actual_spend: number;
  updated_at: string;
}

interface NexOpsAssetDbRow {
  id: string;
  tag: string;
  name: string;
  category: AssetCategory;
  assigned_to: string;
  department: Department;
  condition: AssetCondition;
  status: AssetStatus;
  serial_number?: string | null;
  location?: string | null;
  stock_quantity?: number | null;
  min_stock_threshold?: number | null;
  history: AssetHistoryEntry[] | string | null;
  updated_at: string;
}

interface NexOpsSopDbRow {
  id: string;
  code: string;
  title: string;
  category: SopCategory;
  version: string;
  department: Department;
  effective_date: string;
  mandatory_read: boolean;
  author_name: string;
  purpose: string;
  scope: string;
  procedure_steps: string[] | string | null;
  compliance_rules: string[] | string | null;
  acknowledgments: SopAcknowledgment[] | string | null;
  updated_at: string;
}

interface NexOpsLeaveDbRow {
  id: string;
  code: string;
  employee_id: string;
  employee_name: string;
  department: Department;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: LeaveStatus;
  backup_delegate_name?: string | null;
  reviewer_name?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface NexOpsMomDbRow {
  id: string;
  code: string;
  title: string;
  meeting_date: string;
  department: Department;
  facilitator: string;
  attendees: string[] | string | null;
  summary: string;
  decisions: string[] | string | null;
  action_items: MeetingActionItem[] | string | null;
  created_at: string;
  updated_at: string;
}

interface NexOpsProfileDbRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  employee_id?: string | null;
  role?: string | null;
  approval_status?: string | null;
  is_super_admin?: boolean | null;
  active?: boolean | null;
  approved_by?: string | null;
  approved_at?: string | null;
  department?: string | null;
  title?: string | null;
  sign_off_title?: string | null;
  avatar_url?: string | null;
  updated_at?: string;
}

interface NexOpsWorkspaceEmailDbRow {
  id: string;
  sender_email: string;
  sender_name: string;
  to_recipients: string;
  cc_recipients: string;
  subject: string;
  body: string;
  delivery_method: WorkspaceEmailLog['deliveryMethod'];
  gmail_message_id?: string | null;
  status: WorkspaceEmailLog['status'];
  sent_at: string;
}

interface NexOpsWorkspaceLinkDbRow {
  id: string;
  tool_type: WorkspaceDocToolType;
  title: string;
  url: string;
  google_file_id?: string | null;
  department: Department;
  notes: string;
  added_by: string;
  created_at: string;
  updated_at: string;
}

interface NexOpsSystemStateDbRow {
  state_key: string;
  payload: unknown;
  updated_by?: string | null;
  updated_at: string;
}

function parseJsonArrayColumn<T>(raw: T[] | string | null | undefined): T[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseChecklistColumn(raw: ChecklistItem[] | string | null | undefined): ChecklistItem[] {
  return parseJsonArrayColumn<ChecklistItem>(raw);
}

function mapDbAudit(row: NexOpsAuditDbRow, teamMembers: TeamMember[]): AuditEvent {
  const actorMatch = teamMembers.find(
    (m) => m.name.toLowerCase() === row.actor_name.toLowerCase(),
  );
  return {
    id: row.id,
    requestId: row.request_id,
    timestamp: row.created_at,
    actorName: row.actor_name,
    actorRole: normalizeRole(row.actor_role),
    actorSignOffTitle: actorMatch?.signOffTitle,
    actionType: row.action_type,
    details: row.details,
  };
}

function mapDbProject(row: NexOpsProjectDbRow): CompanyProject {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    leadManager: row.lead_manager,
    department: row.department,
    status: row.status,
    budgetHours: Number(row.budget_hours ?? 0),
    currency: row.currency ?? 'USD',
    estimatedBudget: Number(row.estimated_budget ?? 0),
    actualSpend: Number(row.actual_spend ?? 0),
    updatedAt: row.updated_at,
  };
}

function toProjectDbRow(project: CompanyProject): NexOpsProjectDbRow {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    type: project.type,
    lead_manager: project.leadManager,
    department: project.department,
    status: project.status,
    budget_hours: project.budgetHours,
    currency: project.currency ?? 'USD',
    estimated_budget: project.estimatedBudget ?? 0,
    actual_spend: project.actualSpend ?? 0,
    updated_at: project.updatedAt,
  };
}

function mapDbAsset(row: NexOpsAssetDbRow): CompanyAsset {
  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    category: row.category,
    assignedTo: row.assigned_to,
    department: row.department,
    condition: row.condition,
    status: row.status,
    serialNumber: row.serial_number ?? undefined,
    location: row.location ?? undefined,
    stockQuantity:
      typeof row.stock_quantity === 'number' ? row.stock_quantity : undefined,
    minStockThreshold:
      typeof row.min_stock_threshold === 'number' ? row.min_stock_threshold : undefined,
    history: parseJsonArrayColumn<AssetHistoryEntry>(row.history),
    updatedAt: row.updated_at,
  };
}

function toAssetDbRow(asset: CompanyAsset): NexOpsAssetDbRow {
  return {
    id: asset.id,
    tag: asset.tag,
    name: asset.name,
    category: asset.category,
    assigned_to: asset.assignedTo,
    department: asset.department,
    condition: asset.condition,
    status: asset.status,
    serial_number: asset.serialNumber ?? null,
    location: asset.location ?? null,
    stock_quantity: typeof asset.stockQuantity === 'number' ? asset.stockQuantity : 1,
    min_stock_threshold:
      typeof asset.minStockThreshold === 'number' ? asset.minStockThreshold : 0,
    history: asset.history,
    updated_at: asset.updatedAt,
  };
}

function mapDbSop(row: NexOpsSopDbRow): SopDocument {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    version: row.version,
    department: row.department,
    effectiveDate: row.effective_date,
    mandatoryRead: Boolean(row.mandatory_read),
    authorName: row.author_name,
    purpose: row.purpose,
    scope: row.scope,
    procedureSteps: parseJsonArrayColumn<string>(row.procedure_steps),
    complianceRules: parseJsonArrayColumn<string>(row.compliance_rules),
    acknowledgments: parseJsonArrayColumn<SopAcknowledgment>(row.acknowledgments),
    updatedAt: row.updated_at,
  };
}

function toSopDbRow(sop: SopDocument): NexOpsSopDbRow {
  return {
    id: sop.id,
    code: sop.code,
    title: sop.title,
    category: sop.category,
    version: sop.version,
    department: sop.department,
    effective_date: sop.effectiveDate,
    mandatory_read: sop.mandatoryRead,
    author_name: sop.authorName,
    purpose: sop.purpose,
    scope: sop.scope,
    procedure_steps: sop.procedureSteps,
    compliance_rules: sop.complianceRules,
    acknowledgments: sop.acknowledgments,
    updated_at: sop.updatedAt,
  };
}

function mapDbLeave(row: NexOpsLeaveDbRow): LeaveRequest {
  return {
    id: row.id,
    code: row.code,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    totalDays: Number(row.total_days ?? 1),
    reason: row.reason,
    status: row.status,
    backupDelegateName: row.backup_delegate_name ?? undefined,
    reviewerName: row.reviewer_name ?? undefined,
    reviewerNotes: row.reviewer_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLeaveDbRow(leave: LeaveRequest): NexOpsLeaveDbRow {
  return {
    id: leave.id,
    code: leave.code,
    employee_id: leave.employeeId,
    employee_name: leave.employeeName,
    department: leave.department,
    leave_type: leave.leaveType,
    start_date: leave.startDate,
    end_date: leave.endDate,
    total_days: leave.totalDays,
    reason: leave.reason,
    status: leave.status,
    backup_delegate_name: leave.backupDelegateName ?? null,
    reviewer_name: leave.reviewerName ?? null,
    reviewer_notes: leave.reviewerNotes ?? null,
    created_at: leave.createdAt,
    updated_at: leave.updatedAt,
  };
}

function mapDbMom(row: NexOpsMomDbRow): MeetingMinute {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    meetingDate: row.meeting_date,
    department: row.department,
    facilitator: row.facilitator,
    attendees: parseJsonArrayColumn<string>(row.attendees),
    summary: row.summary,
    decisions: parseJsonArrayColumn<string>(row.decisions),
    actionItems: parseJsonArrayColumn<MeetingActionItem>(row.action_items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMomDbRow(meeting: MeetingMinute): NexOpsMomDbRow {
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    meeting_date: meeting.meetingDate,
    department: meeting.department,
    facilitator: meeting.facilitator,
    attendees: meeting.attendees,
    summary: meeting.summary,
    decisions: meeting.decisions,
    action_items: meeting.actionItems,
    created_at: meeting.createdAt,
    updated_at: meeting.updatedAt,
  };
}

function mapDbWorkspaceEmail(row: NexOpsWorkspaceEmailDbRow): WorkspaceEmailLog {
  return {
    id: row.id,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    toRecipients: row.to_recipients,
    ccRecipients: row.cc_recipients ?? '',
    subject: row.subject,
    body: row.body,
    deliveryMethod: row.delivery_method,
    gmailMessageId: row.gmail_message_id ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
  };
}

function toWorkspaceEmailDbRow(email: WorkspaceEmailLog): NexOpsWorkspaceEmailDbRow {
  return {
    id: email.id,
    sender_email: email.senderEmail,
    sender_name: email.senderName,
    to_recipients: email.toRecipients,
    cc_recipients: email.ccRecipients ?? '',
    subject: email.subject,
    body: email.body,
    delivery_method: email.deliveryMethod,
    gmail_message_id: email.gmailMessageId ?? null,
    status: email.status,
    sent_at: email.sentAt,
  };
}

function mapDbWorkspaceLink(row: NexOpsWorkspaceLinkDbRow): WorkspaceSavedLink {
  return {
    id: row.id,
    toolType: row.tool_type,
    title: row.title,
    url: row.url,
    googleFileId: row.google_file_id ?? undefined,
    department: row.department,
    notes: row.notes ?? '',
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWorkspaceLinkDbRow(link: WorkspaceSavedLink): NexOpsWorkspaceLinkDbRow {
  return {
    id: link.id,
    tool_type: link.toolType,
    title: link.title,
    url: link.url,
    google_file_id: link.googleFileId ?? null,
    department: link.department,
    notes: link.notes ?? '',
    added_by: link.addedBy,
    created_at: link.createdAt,
    updated_at: link.updatedAt,
  };
}

function mapDbRequest(
  row: NexOpsRequestDbRow,
  audits: AuditEvent[],
  teamMembers: TeamMember[],
  projects: CompanyProject[],
  projectLinksMap: Record<string, RequestProjectLink>,
  assets: CompanyAsset[],
  assetLinksMap: Record<string, RequestAssetLink>,
  metaMap: Record<string, RequestExtendedMeta>,
): OperationalRequest {
  const requestAudits = audits
    .filter((a) => a.requestId === row.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let revisionReason: string | undefined;
  if (row.status === 'Revision Required') {
    const latestRevisionEvent = [...requestAudits]
      .reverse()
      .find(
        (a) =>
          a.actionType === 'Status Changed' &&
          a.details.includes('Revision Required') &&
          a.details.includes('Remarks:'),
      );
    if (latestRevisionEvent) {
      const idx = latestRevisionEvent.details.indexOf('Remarks:');
      if (idx !== -1) {
        revisionReason = latestRevisionEvent.details.slice(idx + 'Remarks:'.length).trim();
      }
    }
  }

  const submitterMatch = teamMembers.find(
    (m) => m.name.toLowerCase() === row.submitted_by.toLowerCase(),
  );

  let projectLink: RequestProjectLink | undefined = projectLinksMap[row.id];
  if (!projectLink) {
    for (const ev of requestAudits) {
      const match = ev.details.match(/\[Project:\s*([A-Z0-9-]+)\]/i);
      if (match) {
        const foundProj = projects.find(
          (p) => p.code.toLowerCase() === match[1].toLowerCase(),
        );
        if (foundProj) {
          projectLink = {
            projectId: foundProj.id,
            projectCode: foundProj.code,
            projectName: foundProj.name,
          };
          break;
        }
      }
    }
  }

  let assetLink: RequestAssetLink | undefined = assetLinksMap[row.id];
  if (!assetLink) {
    for (const ev of requestAudits) {
      const match = ev.details.match(/\[Asset:\s*([A-Z0-9-]+)\]/i);
      if (match) {
        const foundAsset = assets.find(
          (a) => a.tag.toLowerCase() === match[1].toLowerCase(),
        );
        if (foundAsset) {
          assetLink = {
            assetId: foundAsset.id,
            assetTag: foundAsset.tag,
            assetName: foundAsset.name,
          };
          break;
        }
      }
    }
  }

  const storedMeta = metaMap[row.id];

  // Hydrate Stage 1 / Stage 2 approval metadata from synced map or audit trail tags
  let stage1Approval: ApprovalStageSignOff | undefined =
    storedMeta?.stage1Approval === null ? undefined : storedMeta?.stage1Approval;
  let stage2Approval: ApprovalStageSignOff | undefined =
    storedMeta?.stage2Approval === null ? undefined : storedMeta?.stage2Approval;

  if (!stage1Approval && row.status !== 'Draft' && row.status !== 'Revision Required') {
    const s1Ev = [...requestAudits]
      .reverse()
      .find((a) => a.details.includes('Stage 1 Approved'));
    if (s1Ev) {
      stage1Approval = {
        actorName: s1Ev.actorName,
        actorRole: s1Ev.actorRole,
        signOffTitle: s1Ev.actorSignOffTitle,
        timestamp: s1Ev.timestamp,
      };
    }
  }
  if (!stage2Approval && row.status === 'Approved') {
    const s2Ev = [...requestAudits]
      .reverse()
      .find((a) => a.details.includes('Stage 2 Executive Final Sign-Off'));
    if (s2Ev) {
      stage2Approval = {
        actorName: s2Ev.actorName,
        actorRole: s2Ev.actorRole,
        signOffTitle: s2Ev.actorSignOffTitle,
        timestamp: s2Ev.timestamp,
      };
    }
  }

  let currency: CurrencyCode | undefined = storedMeta?.currency;
  let estimatedCost: number | undefined =
    typeof storedMeta?.estimatedCost === 'number' ? storedMeta.estimatedCost : undefined;
  let actualSpend: number | undefined =
    typeof storedMeta?.actualSpend === 'number' ? storedMeta.actualSpend : undefined;
  let momCode: string | undefined = storedMeta?.momCode;

  for (const ev of requestAudits) {
    if (!currency || typeof estimatedCost !== 'number') {
      const budgetMatch = ev.details.match(/\[Budget:\s*(PKR|USD|AED)\s*([\d,]+)\]/i);
      if (budgetMatch) {
        currency = budgetMatch[1].toUpperCase() as CurrencyCode;
        estimatedCost = Number(budgetMatch[2].replace(/,/g, ''));
      }
    }
    if (!momCode) {
      const momMatch = ev.details.match(/\[MoM:\s*([A-Z0-9-]+)\]/i);
      if (momMatch) {
        momCode = momMatch[1];
      }
    }
  }

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    department: row.department,
    submittedBy: row.submitted_by,
    submitterId: submitterMatch?.id ?? '',
    assignedReviewer: storedMeta?.assignedReviewer ?? '',
    delegatedFromReviewer: storedMeta?.delegatedFromReviewer,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    description: row.description,
    deliverableUrl: row.reference_link ?? '',
    projectId: projectLink?.projectId,
    projectCode: projectLink?.projectCode,
    projectName: projectLink?.projectName,
    assetId: assetLink?.assetId,
    assetTag: assetLink?.assetTag,
    assetName: assetLink?.assetName,
    currency,
    estimatedCost,
    actualSpend,
    momCode,
    stage1Approval,
    stage2Approval,
    checklist: parseChecklistColumn(row.checklist),
    revisionReason,
    auditTrail: requestAudits,
  };
}

function toRequestDbRow(req: OperationalRequest): NexOpsRequestDbRow {
  return {
    id: req.id,
    title: req.title,
    category: req.category,
    department: req.department,
    priority: req.priority,
    status: req.status,
    due_date: req.dueDate,
    description: req.description,
    reference_link: req.deliverableUrl ?? '',
    submitted_by: req.submittedBy,
    checklist: req.checklist,
    created_at: req.createdAt,
    updated_at: req.updatedAt,
  };
}

function toAuditDbRow(event: AuditEvent): NexOpsAuditDbRow {
  return {
    id: event.id,
    request_id: event.requestId,
    actor_name: event.actorName,
    actor_role: event.actorRole,
    action_type: event.actionType,
    details: event.details,
    created_at: event.timestamp,
  };
}

// ---------------------------------------------------------------------------
// 8-Table Metadata, Diagnostics & System-State Key Helpers
// ---------------------------------------------------------------------------

export const SUPABASE_TABLE_REGISTRY: {
  tableKey: SupabaseTableKey;
  tableName: string;
  moduleName: string;
}[] = [
  { tableKey: 'requests', tableName: 'nexops_requests', moduleName: 'Requests & Workflow Queue' },
  { tableKey: 'audit_logs', tableName: 'nexops_audit_logs', moduleName: 'Audit & Compliance Logs' },
  { tableKey: 'projects', tableName: 'nexops_projects', moduleName: 'Projects & Clients' },
  { tableKey: 'assets', tableName: 'nexops_assets', moduleName: 'Assets & Inventory' },
  { tableKey: 'sops', tableName: 'nexops_sops', moduleName: 'SOP & Policy Vault' },
  { tableKey: 'leaves', tableName: 'nexops_leaves', moduleName: 'Leaves & Time-Off' },
  { tableKey: 'moms', tableName: 'nexops_moms', moduleName: 'Meetings & MoM Tracker' },
  { tableKey: 'profiles', tableName: 'profiles', moduleName: 'User Profiles & Avatars' },
  {
    tableKey: 'workspace_emails',
    tableName: 'nexops_workspace_emails',
    moduleName: 'Workspace Gmail Sent Log',
  },
  {
    tableKey: 'workspace_links',
    tableName: 'nexops_workspace_links',
    moduleName: 'Workspace Docs, Sheets & Forms',
  },
  {
    tableKey: 'system_state',
    tableName: 'nexops_system_state',
    moduleName: 'Branding, Permissions & Circulars',
  },
];

export const SYSTEM_STATE_KEYS = {
  BRANDING: 'branding',
  PERMISSION_MATRIX: 'permission_matrix',
  ANNOUNCEMENTS: 'announcements',
  TEAM_DIRECTORY: 'team_directory',
  REQUEST_META: 'request_meta',
  WORKSPACE_GMAIL_PREFS: 'workspace_gmail_prefs',
  MASTER_KEY: 'master_key_config',
} as const;

interface SyncedRequestMetaBundle {
  projectLinks?: Record<string, RequestProjectLink>;
  assetLinks?: Record<string, RequestAssetLink>;
  extendedMeta?: Record<string, RequestExtendedMeta>;
}

function buildOfflineDiagnostics(state: NexOpsState): TableSyncStatus[] {
  const checkedAt = new Date().toISOString();
  const counts: Record<SupabaseTableKey, number> = {
    requests: state.requests.length,
    audit_logs: state.globalAuditLogs.length,
    projects: state.projects.length,
    assets: state.assets.length,
    sops: state.sops.length,
    leaves: state.leaves.length,
    moms: state.meetings.length,
    profiles: state.teamMembers.length,
    workspace_emails: state.workspaceEmails.length,
    workspace_links: state.workspaceLinks.length,
    system_state: 5,
  };
  return SUPABASE_TABLE_REGISTRY.map((entry) => ({
    ...entry,
    status: 'offline',
    rowCount: counts[entry.tableKey],
    lastCheckedAt: checkedAt,
  }));
}

function normalizeBrandingCandidate(raw: unknown, fallback: CompanyBrandingConfig): CompanyBrandingConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const parsed = raw as Partial<CompanyBrandingConfig>;
  return {
    companyName:
      typeof parsed.companyName === 'string' && parsed.companyName.trim()
        ? parsed.companyName.trim()
        : fallback.companyName,
    tagline:
      typeof parsed.tagline === 'string' && parsed.tagline.trim()
        ? parsed.tagline.trim()
        : fallback.tagline,
    departments: normalizeStringList(parsed.departments, fallback.departments),
    categories: normalizeStringList(parsed.categories, fallback.categories),
    approvalBudgetThresholdUsd:
      typeof parsed.approvalBudgetThresholdUsd === 'number' &&
      Number.isFinite(parsed.approvalBudgetThresholdUsd) &&
      parsed.approvalBudgetThresholdUsd >= 0
        ? parsed.approvalBudgetThresholdUsd
        : fallback.approvalBudgetThresholdUsd,
  };
}

function writeSyncedRequestMetaCaches(bundle: SyncedRequestMetaBundle): void {
  try {
    if (bundle.projectLinks && typeof bundle.projectLinks === 'object') {
      const merged = { ...readRequestProjectsMap(), ...bundle.projectLinks };
      localStorage.setItem(REQUEST_PROJECTS_MAP_KEY, JSON.stringify(merged));
    }
    if (bundle.assetLinks && typeof bundle.assetLinks === 'object') {
      const merged = { ...readRequestAssetsMap(), ...bundle.assetLinks };
      localStorage.setItem(REQUEST_ASSETS_MAP_KEY, JSON.stringify(merged));
    }
    if (bundle.extendedMeta && typeof bundle.extendedMeta === 'object') {
      const merged = { ...readRequestMetaMap(), ...bundle.extendedMeta };
      localStorage.setItem(REQUEST_META_MAP_KEY, JSON.stringify(merged));
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function syncRequestMetaBundleToCloud(updatedBy?: string): Promise<void> {
  if (!supabase) return;
  const bundle: SyncedRequestMetaBundle = {
    projectLinks: readRequestProjectsMap(),
    assetLinks: readRequestAssetsMap(),
    extendedMeta: readRequestMetaMap(),
  };
  const { error } = await supabase.from('nexops_system_state').upsert(
    {
      state_key: SYSTEM_STATE_KEYS.REQUEST_META,
      payload: bundle,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'state_key' },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Modular Data Service API
// ---------------------------------------------------------------------------

export interface AuthSessionResult {
  mode: PersistenceMode;
  user: User | null;
  session: Session | null;
  activeRole: Role;
}

export interface ProvisionEmployeePayload {
  fullName: string;
  email: string;
  employeeId: string;
  password: string;
  department: Department;
  role: Role;
  title?: string;
}

async function hashMasterKeySecret(rawKey: string): Promise<string> {
  const input = `nexops-master-key::${rawKey.trim()}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function readMasterKeyConfigSync(): MasterKeyConfig | null {
  try {
    const raw = localStorage.getItem(MASTER_KEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MasterKeyConfig>;
    if (!parsed || typeof parsed.keyHash !== 'string' || !parsed.keyHash) return null;
    return {
      keyHash: parsed.keyHash,
      keyHint: typeof parsed.keyHint === 'string' ? parsed.keyHint : '****',
      requireForSensitiveActions: Boolean(parsed.requireForSensitiveActions),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : 'System Admin',
    };
  } catch {
    return null;
  }
}

function writeMasterKeyConfigSync(config: MasterKeyConfig | null): void {
  try {
    if (!config) {
      localStorage.removeItem(MASTER_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(MASTER_KEY_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // Ignore storage quota restrictions
  }
}

function mapProfileRowToMember(row: NexOpsProfileDbRow, existing?: TeamMember): TeamMember {
  const email = (row.email ?? existing?.email ?? '').trim();
  const isSuper = isSuperAdminEmail(email) || Boolean(row.is_super_admin);
  const role: Role = isSuper
    ? 'Admin'
    : row.role
      ? fromDbRole(row.role)
      : existing?.role ?? 'Viewer';
  const approvalStatus: ApprovalStatus = isSuper
    ? 'approved'
    : normalizeApprovalStatus(row.approval_status ?? existing?.approvalStatus ?? 'pending', email);
  const name = (row.full_name ?? existing?.name ?? email.split('@')[0] ?? 'Team Member').trim();
  const title = (row.title ?? existing?.title ?? (isSuper ? 'Primary Super Administrator' : defaultTitleForRole(role))).trim();
  return {
    id: row.id,
    employeeId: (row.employee_id ?? existing?.employeeId ?? deriveEmployeeCode(row.id || email)).trim(),
    name,
    email,
    role,
    approvalStatus,
    isSuperAdmin: isSuper,
    approvedBy: row.approved_by ?? existing?.approvedBy,
    approvedAt: row.approved_at ?? existing?.approvedAt,
    department: (row.department ?? existing?.department ?? DEFAULT_DEPARTMENTS[0]).trim(),
    title,
    signOffTitle: (row.sign_off_title ?? existing?.signOffTitle ?? title).trim(),
    avatarUrl:
      row.avatar_url === null
        ? undefined
        : row.avatar_url || existing?.avatarUrl,
    active: isSuper ? true : row.active ?? existing?.active ?? true,
    lastActive: row.updated_at || existing?.lastActive || new Date().toISOString(),
    outOfOffice: existing?.outOfOffice,
    delegateApproverId: existing?.delegateApproverId,
    delegateApproverName: existing?.delegateApproverName,
  };
}

async function upsertProfileRecord(member: TeamMember): Promise<void> {
  if (!supabase) return;
  const isSuper = isSuperAdminEmail(member.email) || Boolean(member.isSuperAdmin);
  const role: Role = isSuper ? 'Admin' : normalizeRole(member.role);
  const approvalStatus: ApprovalStatus = isSuper
    ? 'approved'
    : normalizeApprovalStatus(member.approvalStatus ?? 'pending', member.email);
  const payload = {
    id: member.id,
    email: member.email.trim().toLowerCase(),
    full_name: member.name,
    employee_id: member.employeeId,
    role: toDbRole(role),
    approval_status: approvalStatus,
    is_super_admin: isSuper,
    active: isSuper ? true : member.active,
    approved_by: member.approvedBy ?? null,
    approved_at: member.approvedAt ?? null,
    department: member.department,
    title: member.title,
    sign_off_title: member.signOffTitle,
    avatar_url: member.avatarUrl ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) {
    // Fallback if optional RBAC columns have not yet been migrated in Supabase
    const { error: legacyErr } = await supabase.from('profiles').upsert(
      {
        id: payload.id,
        email: payload.email,
        full_name: payload.full_name,
        employee_id: payload.employee_id,
        role: payload.role,
        department: payload.department,
        title: payload.title,
        sign_off_title: payload.sign_off_title,
        avatar_url: payload.avatar_url,
        updated_at: payload.updated_at,
      },
      { onConflict: 'id' },
    );
    if (legacyErr) {
      throw legacyErr;
    }
  }
}

export interface FullWorkspaceFetchResult {
  state: NexOpsState;
  branding: CompanyBrandingConfig;
  masterKeyConfig: MasterKeyConfig | null;
  diagnostics: TableSyncStatus[];
  cloudHealthy: boolean;
}

export const dataService = {
  getMode: getPersistenceMode,

  isSupabaseConfigured(): boolean {
    return Boolean(supabase);
  },

  masterKey: {
    loadSync(): MasterKeyConfig | null {
      return readMasterKeyConfigSync();
    },

    async saveConfig(config: MasterKeyConfig, updatedBy?: string): Promise<MasterKeyConfig> {
      writeMasterKeyConfigSync(config);
      if (supabase) {
        await dataService.systemState.upsertKey(SYSTEM_STATE_KEYS.MASTER_KEY, config, updatedBy);
      }
      return config;
    },

    async generateNewKey(
      actorName: string,
      requireForSensitiveActions = true,
    ): Promise<{ plainKey: string; config: MasterKeyConfig }> {
      const randomBytes = new Uint8Array(12);
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(randomBytes);
      } else {
        for (let i = 0; i < randomBytes.length; i += 1) {
          randomBytes[i] = Math.floor(Math.random() * 256);
        }
      }
      const hex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
      const plainKey = `NXMK-${hex.slice(0, 6)}-${hex.slice(6, 12)}-${hex.slice(12, 18)}-${hex.slice(18, 24)}`;
      const keyHash = await hashMasterKeySecret(plainKey);
      const config: MasterKeyConfig = {
        keyHash,
        keyHint: `...${plainKey.slice(-6)}`,
        requireForSensitiveActions,
        updatedAt: new Date().toISOString(),
        updatedBy: actorName,
      };
      await dataService.masterKey.saveConfig(config, actorName);
      return { plainKey, config };
    },

    async verifyKey(plainKey: string, configOverride?: MasterKeyConfig | null): Promise<boolean> {
      const config = configOverride ?? readMasterKeyConfigSync();
      if (!config || !config.keyHash) return false;
      const candidateHash = await hashMasterKeySecret(plainKey);
      return candidateHash === config.keyHash;
    },
  },

  branding: {
    loadSync(): CompanyBrandingConfig {
      return readBrandingConfig();
    },

    saveSync(config: CompanyBrandingConfig): CompanyBrandingConfig {
      return writeBrandingConfig(config);
    },

    resetSync(): CompanyBrandingConfig {
      return writeBrandingConfig({ ...DEFAULT_COMPANY_BRANDING });
    },

    async saveCloud(config: CompanyBrandingConfig, updatedBy?: string): Promise<void> {
      const normalized = writeBrandingConfig(config);
      await dataService.systemState.upsertKey(SYSTEM_STATE_KEYS.BRANDING, normalized, updatedBy);
    },
  },

  loadStateSync(): NexOpsState {
    return readWorkspaceState();
  },

  saveStateSync(state: NexOpsState): void {
    writeWorkspaceState(state);
  },

  getOfflineDiagnostics(state?: NexOpsState): TableSyncStatus[] {
    return buildOfflineDiagnostics(state ?? readWorkspaceState());
  },

  /**
   * Fetches all 8 Supabase tables in parallel, merges system_state JSON keys,
   * and returns per-table connection health & live row counts.
   * Gracefully retains localStorage fallback for any table not yet migrated.
   */
  async fetchFullWorkspaceState(): Promise<FullWorkspaceFetchResult> {
    const localSnapshot = readWorkspaceState();
    const localBranding = readBrandingConfig();

    if (!supabase) {
      return {
        state: localSnapshot,
        branding: localBranding,
        masterKeyConfig: readMasterKeyConfigSync(),
        diagnostics: buildOfflineDiagnostics(localSnapshot),
        cloudHealthy: false,
      };
    }

    const checkedAt = new Date().toISOString();
    const [
      reqRes,
      auditRes,
      projRes,
      assetRes,
      sopRes,
      leaveRes,
      momRes,
      profileRes,
      emailRes,
      linkRes,
      sysRes,
    ] = await Promise.all([
      supabase.from('nexops_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('nexops_audit_logs').select('*').order('created_at', { ascending: false }),
      supabase.from('nexops_projects').select('*').order('updated_at', { ascending: false }),
      supabase.from('nexops_assets').select('*').order('updated_at', { ascending: false }),
      supabase.from('nexops_sops').select('*').order('updated_at', { ascending: false }),
      supabase.from('nexops_leaves').select('*').order('created_at', { ascending: false }),
      supabase.from('nexops_moms').select('*').order('meeting_date', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('nexops_workspace_emails').select('*').order('sent_at', { ascending: false }),
      supabase.from('nexops_workspace_links').select('*').order('updated_at', { ascending: false }),
      supabase.from('nexops_system_state').select('*'),
    ]);

    // Extract system_state rows if available
    const sysRows = !sysRes.error ? ((sysRes.data ?? []) as NexOpsSystemStateDbRow[]) : [];
    const sysMap = new Map<string, NexOpsSystemStateDbRow>();
    for (const row of sysRows) {
      sysMap.set(row.state_key, row);
    }

    const brandingRow = sysMap.get(SYSTEM_STATE_KEYS.BRANDING);
    const branding = brandingRow
      ? writeBrandingConfig(normalizeBrandingCandidate(brandingRow.payload, localBranding))
      : localBranding;

    const masterKeyRow = sysMap.get(SYSTEM_STATE_KEYS.MASTER_KEY);
    const masterKeyConfig =
      masterKeyRow && masterKeyRow.payload && typeof masterKeyRow.payload === 'object'
        ? (masterKeyRow.payload as MasterKeyConfig)
        : readMasterKeyConfigSync();
    if (masterKeyConfig) {
      writeMasterKeyConfigSync(masterKeyConfig);
    }

    const permRow = sysMap.get(SYSTEM_STATE_KEYS.PERMISSION_MATRIX);
    const permissionMatrix = permRow
      ? normalizePermissionMatrix(permRow.payload)
      : normalizePermissionMatrix(localSnapshot.permissionMatrix);

    const annRow = sysMap.get(SYSTEM_STATE_KEYS.ANNOUNCEMENTS);
    const announcements: CompanyAnnouncement[] =
      annRow && Array.isArray(annRow.payload)
        ? (annRow.payload as CompanyAnnouncement[])
        : localSnapshot.announcements;

    const baseMembers: TeamMember[] =
      sysMap.get(SYSTEM_STATE_KEYS.TEAM_DIRECTORY) &&
      Array.isArray(sysMap.get(SYSTEM_STATE_KEYS.TEAM_DIRECTORY)?.payload)
        ? (sysMap.get(SYSTEM_STATE_KEYS.TEAM_DIRECTORY)?.payload as TeamMember[])
            .filter((m) => !isLegacyDemoMember(m))
            .map((m, idx) => enforceMemberInvariants(m, idx))
        : localSnapshot.teamMembers;

    // Merge all rows from `profiles` table (authoritative DB role + approval_status + avatar_url)
    const profileRows = !profileRes.error ? ((profileRes.data ?? []) as NexOpsProfileDbRow[]) : [];
    const mergedByKey = new Map<string, TeamMember>();
    for (const member of baseMembers) {
      mergedByKey.set(member.email.trim().toLowerCase() || member.id, member);
    }
    for (const pRow of profileRows) {
      const key = (pRow.email ?? '').trim().toLowerCase() || pRow.id;
      const existing =
        mergedByKey.get(key) ??
        baseMembers.find((m) => m.id === pRow.id || m.email.toLowerCase() === key);
      if (existing && isLegacyDemoMember(existing)) continue;
      const mapped = mapProfileRowToMember(pRow, existing);
      if (!isLegacyDemoMember(mapped)) {
        mergedByKey.set((mapped.email ?? '').trim().toLowerCase() || mapped.id, mapped);
      }
    }
    const teamMembers: TeamMember[] = Array.from(mergedByKey.values()).map((m, idx) =>
      enforceMemberInvariants(m, idx),
    );

    const metaBundleRow = sysMap.get(SYSTEM_STATE_KEYS.REQUEST_META);
    if (metaBundleRow && metaBundleRow.payload && typeof metaBundleRow.payload === 'object') {
      writeSyncedRequestMetaCaches(metaBundleRow.payload as SyncedRequestMetaBundle);
    }

    const projects: CompanyProject[] = !projRes.error
      ? ((projRes.data ?? []) as NexOpsProjectDbRow[]).map(mapDbProject)
      : localSnapshot.projects;

    const assets: CompanyAsset[] = !assetRes.error
      ? ((assetRes.data ?? []) as NexOpsAssetDbRow[]).map(mapDbAsset)
      : localSnapshot.assets;

    const sops: SopDocument[] = !sopRes.error
      ? ((sopRes.data ?? []) as NexOpsSopDbRow[]).map(mapDbSop)
      : localSnapshot.sops;

    const leaves: LeaveRequest[] = !leaveRes.error
      ? ((leaveRes.data ?? []) as NexOpsLeaveDbRow[]).map(mapDbLeave)
      : localSnapshot.leaves;

    const meetings: MeetingMinute[] = !momRes.error
      ? ((momRes.data ?? []) as NexOpsMomDbRow[]).map(mapDbMom)
      : localSnapshot.meetings;

    const workspaceEmails: WorkspaceEmailLog[] = !emailRes.error
      ? ((emailRes.data ?? []) as NexOpsWorkspaceEmailDbRow[]).map(mapDbWorkspaceEmail)
      : localSnapshot.workspaceEmails;

    const workspaceLinks: WorkspaceSavedLink[] = !linkRes.error
      ? ((linkRes.data ?? []) as NexOpsWorkspaceLinkDbRow[]).map(mapDbWorkspaceLink)
      : localSnapshot.workspaceLinks;

    const globalAuditLogs: AuditEvent[] = !auditRes.error
      ? ((auditRes.data ?? []) as NexOpsAuditDbRow[]).map((row) => mapDbAudit(row, teamMembers))
      : localSnapshot.globalAuditLogs;

    const projectLinksMap = readRequestProjectsMap();
    const assetLinksMap = readRequestAssetsMap();
    const metaMap = readRequestMetaMap();

    const requests: OperationalRequest[] = !reqRes.error
      ? ((reqRes.data ?? []) as NexOpsRequestDbRow[]).map((row) =>
          mapDbRequest(
            row,
            globalAuditLogs,
            teamMembers,
            projects,
            projectLinksMap,
            assets,
            assetLinksMap,
            metaMap,
          ),
        )
      : localSnapshot.requests;

    const diagnostics: TableSyncStatus[] = [
      {
        ...SUPABASE_TABLE_REGISTRY[0],
        status: reqRes.error ? 'error' : 'connected',
        rowCount: reqRes.error ? localSnapshot.requests.length : (reqRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: reqRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[1],
        status: auditRes.error ? 'error' : 'connected',
        rowCount: auditRes.error
          ? localSnapshot.globalAuditLogs.length
          : (auditRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: auditRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[2],
        status: projRes.error ? 'error' : 'connected',
        rowCount: projRes.error ? localSnapshot.projects.length : (projRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: projRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[3],
        status: assetRes.error ? 'error' : 'connected',
        rowCount: assetRes.error ? localSnapshot.assets.length : (assetRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: assetRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[4],
        status: sopRes.error ? 'error' : 'connected',
        rowCount: sopRes.error ? localSnapshot.sops.length : (sopRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: sopRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[5],
        status: leaveRes.error ? 'error' : 'connected',
        rowCount: leaveRes.error ? localSnapshot.leaves.length : (leaveRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: leaveRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[6],
        status: momRes.error ? 'error' : 'connected',
        rowCount: momRes.error ? localSnapshot.meetings.length : (momRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: momRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[7],
        status: profileRes.error ? 'error' : 'connected',
        rowCount: profileRes.error ? localSnapshot.teamMembers.length : (profileRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: profileRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[8],
        status: emailRes.error ? 'error' : 'connected',
        rowCount: emailRes.error ? localSnapshot.workspaceEmails.length : (emailRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: emailRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[9],
        status: linkRes.error ? 'error' : 'connected',
        rowCount: linkRes.error ? localSnapshot.workspaceLinks.length : (linkRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: linkRes.error?.message,
      },
      {
        ...SUPABASE_TABLE_REGISTRY[10],
        status: sysRes.error ? 'error' : 'connected',
        rowCount: sysRes.error ? 0 : (sysRes.data ?? []).length,
        lastCheckedAt: checkedAt,
        errorMessage: sysRes.error?.message,
      },
    ];

    const cloudHealthy = diagnostics.some((d) => d.status === 'connected');
    if (reqRes.error && auditRes.error && !cloudHealthy) {
      throw reqRes.error;
    }

    const hydrated: NexOpsState = {
      activeRole: localSnapshot.activeRole,
      requests,
      projects,
      assets,
      sops,
      leaves,
      announcements,
      meetings,
      workspaceEmails,
      workspaceLinks,
      teamMembers,
      globalAuditLogs,
      notifications: localSnapshot.notifications,
      permissionMatrix,
    };

    writeWorkspaceState(hydrated);
    return {
      state: hydrated,
      branding,
      masterKeyConfig,
      diagnostics,
      cloudHealthy,
    };
  },

  async fetchWorkspaceState(): Promise<NexOpsState> {
    const res = await dataService.fetchFullWorkspaceState();
    return res.state;
  },

  diagnostics: {
    async checkAllTables(stateHint?: NexOpsState): Promise<TableSyncStatus[]> {
      const local = stateHint ?? readWorkspaceState();
      if (!supabase) {
        return buildOfflineDiagnostics(local);
      }

      const checkedAt = new Date().toISOString();
      const results = await Promise.all(
        SUPABASE_TABLE_REGISTRY.map(async (entry) => {
          const { count, error } = await supabase!
            .from(entry.tableName)
            .select('*', { count: 'exact', head: true });
          const status: TableSyncStatus = {
            ...entry,
            status: error ? 'error' : 'connected',
            rowCount: error ? 0 : count ?? 0,
            lastCheckedAt: checkedAt,
            errorMessage: error?.message,
          };
          return status;
        }),
      );
      return results;
    },
  },

  async restoreWorkspaceBackup(
    nextState: NexOpsState,
    brandingOverride?: CompanyBrandingConfig,
  ): Promise<NexOpsState> {
    writeWorkspaceState(nextState);
    if (supabase) {
      if (nextState.requests.length > 0) {
        const { error: reqErr } = await supabase
          .from('nexops_requests')
          .upsert(nextState.requests.map(toRequestDbRow), { onConflict: 'id' });
        if (reqErr) throw reqErr;
      }
      if (nextState.globalAuditLogs.length > 0) {
        const { error: audErr } = await supabase
          .from('nexops_audit_logs')
          .upsert(nextState.globalAuditLogs.map(toAuditDbRow), { onConflict: 'id' });
        if (audErr) throw audErr;
      }
      if (nextState.projects.length > 0) {
        const { error: projErr } = await supabase
          .from('nexops_projects')
          .upsert(nextState.projects.map(toProjectDbRow), { onConflict: 'id' });
        if (projErr) throw projErr;
      }
      if (nextState.assets.length > 0) {
        const { error: astErr } = await supabase
          .from('nexops_assets')
          .upsert(nextState.assets.map(toAssetDbRow), { onConflict: 'id' });
        if (astErr) throw astErr;
      }
      if (nextState.sops.length > 0) {
        const { error: sopErr } = await supabase
          .from('nexops_sops')
          .upsert(nextState.sops.map(toSopDbRow), { onConflict: 'id' });
        if (sopErr) throw sopErr;
      }
      if (nextState.leaves.length > 0) {
        const { error: lveErr } = await supabase
          .from('nexops_leaves')
          .upsert(nextState.leaves.map(toLeaveDbRow), { onConflict: 'id' });
        if (lveErr) throw lveErr;
      }
      if (nextState.meetings.length > 0) {
        const { error: momErr } = await supabase
          .from('nexops_moms')
          .upsert(nextState.meetings.map(toMomDbRow), { onConflict: 'id' });
        if (momErr) throw momErr;
      }
      if (nextState.workspaceEmails.length > 0) {
        const { error: emlErr } = await supabase
          .from('nexops_workspace_emails')
          .upsert(nextState.workspaceEmails.map(toWorkspaceEmailDbRow), { onConflict: 'id' });
        if (emlErr) throw emlErr;
      }
      if (nextState.workspaceLinks.length > 0) {
        const { error: lnkErr } = await supabase
          .from('nexops_workspace_links')
          .upsert(nextState.workspaceLinks.map(toWorkspaceLinkDbRow), { onConflict: 'id' });
        if (lnkErr) throw lnkErr;
      }

      const now = new Date().toISOString();
      const sysRows = [
        {
          state_key: SYSTEM_STATE_KEYS.PERMISSION_MATRIX,
          payload: nextState.permissionMatrix ?? DEFAULT_PERMISSION_MATRIX,
          updated_at: now,
        },
        {
          state_key: SYSTEM_STATE_KEYS.ANNOUNCEMENTS,
          payload: nextState.announcements ?? [],
          updated_at: now,
        },
        {
          state_key: SYSTEM_STATE_KEYS.TEAM_DIRECTORY,
          payload: nextState.teamMembers ?? [],
          updated_at: now,
        },
        {
          state_key: SYSTEM_STATE_KEYS.BRANDING,
          payload: brandingOverride ?? readBrandingConfig(),
          updated_at: now,
        },
      ];
      const { error: sysErr } = await supabase
        .from('nexops_system_state')
        .upsert(sysRows, { onConflict: 'state_key' });
      if (sysErr) throw sysErr;
    }
    return nextState;
  },

  // -------------------------------------------------------------------------
  // 1. Authentication & Session Persistence
  // -------------------------------------------------------------------------
  auth: {
    loadSessionSync(): AuthSession | null {
      try {
        const persistentRaw = localStorage.getItem(AUTH_SESSION_KEY);
        const tabRaw = sessionStorage.getItem(AUTH_SESSION_KEY);
        const raw = persistentRaw || tabRaw;
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AuthSession;
        if (!parsed || !parsed.isAuthenticated || !parsed.userId) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    saveSessionSync(session: AuthSession): void {
      try {
        const serialized = JSON.stringify(session);
        if (session.rememberSession) {
          localStorage.setItem(AUTH_SESSION_KEY, serialized);
          sessionStorage.removeItem(AUTH_SESSION_KEY);
        } else {
          sessionStorage.setItem(AUTH_SESSION_KEY, serialized);
          localStorage.removeItem(AUTH_SESSION_KEY);
        }
      } catch {
        // Ignore storage unavailable errors
      }
    },

    clearSessionSync(): void {
      try {
        localStorage.removeItem(AUTH_SESSION_KEY);
        sessionStorage.removeItem(AUTH_SESSION_KEY);
      } catch {
        // Ignore
      }
    },

    async getSession(): Promise<AuthSessionResult> {
      const local = readWorkspaceState();
      if (!supabase) {
        return {
          mode: 'local',
          user: null,
          session: null,
          activeRole: local.activeRole,
        };
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return {
        mode: 'supabase',
        user: data.session?.user ?? null,
        session: data.session ?? null,
        activeRole: local.activeRole,
      };
    },

    hasLocalAdminSync(membersOverride?: TeamMember[]): boolean {
      const members = membersOverride ?? readWorkspaceState().teamMembers;
      return members.some(
        (m) =>
          (isSuperAdminEmail(m.email) || m.role === 'Admin') &&
          m.active &&
          (m.approvalStatus ?? 'approved') === 'approved' &&
          !isLegacyDemoMember(m),
      );
    },

    async checkAdminInitialized(membersOverride?: TeamMember[]): Promise<boolean> {
      if (dataService.auth.hasLocalAdminSync(membersOverride)) {
        return true;
      }
      if (supabase) {
        try {
          const { data: profileAdmins, error: profErr } = await supabase
            .from('profiles')
            .select('id,email,role')
            .or(`role.eq.admin,role.eq.Admin,email.ilike.${SUPER_ADMIN_EMAIL}`)
            .limit(1);
          if (!profErr && Array.isArray(profileAdmins) && profileAdmins.length > 0) {
            return true;
          }
          const { data, error } = await supabase
            .from('nexops_audit_logs')
            .select('id')
            .eq('request_id', 'AUTH-PRIMARY-ADMIN')
            .limit(1);
          if (!error && Array.isArray(data) && data.length > 0) {
            return true;
          }
        } catch {
          // Fall back to local directory check if table is unreachable
        }
      }
      return false;
    },

    async refreshUserProfile(
      userId: string,
      email?: string,
      fallbackMember?: TeamMember,
    ): Promise<TeamMember | null> {
      const local = readWorkspaceState();
      const localMatch =
        local.teamMembers.find(
          (m) =>
            m.id === userId ||
            (email && m.email.trim().toLowerCase() === email.trim().toLowerCase()),
        ) ?? fallbackMember;

      if (!supabase) {
        return localMatch ? enforceMemberInvariants(localMatch) : null;
      }

      try {
        let row: NexOpsProfileDbRow | null = null;
        const { data: byId } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (byId) {
          row = byId as NexOpsProfileDbRow;
        } else if (email) {
          const { data: byEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', email.trim())
            .maybeSingle();
          if (byEmail) {
            row = byEmail as NexOpsProfileDbRow;
          }
        }

        if (!row) {
          return localMatch ? enforceMemberInvariants(localMatch) : null;
        }
        const mapped = enforceMemberInvariants(mapProfileRowToMember(row, localMatch));
        const nextMembers = local.teamMembers.some(
          (m) => m.id === mapped.id || m.email.toLowerCase() === mapped.email.toLowerCase(),
        )
          ? local.teamMembers.map((m) =>
              m.id === mapped.id || m.email.toLowerCase() === mapped.email.toLowerCase()
                ? mapped
                : m,
            )
          : [mapped, ...local.teamMembers];
        writeWorkspaceState({
          ...local,
          activeRole: mapped.role,
          teamMembers: nextMembers,
        });
        return mapped;
      } catch {
        return localMatch ? enforceMemberInvariants(localMatch) : null;
      }
    },

    async signInWithEmail(email: string, password: string, rememberSession = true) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password.trim()) {
        throw new Error('Corporate email and password are required.');
      }

      const local = readWorkspaceState();
      const isSuper = isSuperAdminEmail(cleanEmail);

      // Official Supabase Email & Password Sign-In
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        if (!data.user) {
          throw new Error('Supabase authentication succeeded without user profile.');
        }

        // Query authoritative profile row from Supabase `profiles`
        let dbProfileRow: NexOpsProfileDbRow | null = null;
        try {
          const { data: byId } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();
          if (byId) {
            dbProfileRow = byId as NexOpsProfileDbRow;
          } else {
            const { data: byEmail } = await supabase
              .from('profiles')
              .select('*')
              .ilike('email', cleanEmail)
              .maybeSingle();
            if (byEmail) {
              dbProfileRow = byEmail as NexOpsProfileDbRow;
            }
          }
        } catch {
          // Proceed with auth metadata if profile query fails
        }

        const existingMatch = local.teamMembers.find(
          (m) => m.id === data.user?.id || m.email.toLowerCase() === cleanEmail,
        );

        let member: TeamMember;
        if (dbProfileRow) {
          member = enforceMemberInvariants(
            mapProfileRowToMember(dbProfileRow, existingMatch ?? buildMemberFromSupabaseUser(data.user, local.teamMembers)),
          );
        } else {
          const base = buildMemberFromSupabaseUser(data.user, local.teamMembers);
          member = enforceMemberInvariants({
            ...base,
            role: isSuper ? 'Admin' : existingMatch?.role ?? 'Viewer',
            approvalStatus: isSuper ? 'approved' : existingMatch?.approvalStatus ?? 'pending',
            isSuperAdmin: isSuper,
            active: isSuper ? true : existingMatch?.active ?? true,
          });
          await upsertProfileRecord(member).catch(() => {});
        }

        if (isSuper) {
          await upsertProfileRecord(member).catch(() => {});
        }

        if (!isSuper && member.approvalStatus === 'approved' && !member.active) {
          await supabase.auth.signOut();
          throw new Error(
            `Account for ${member.name} has been deactivated. Contact your System Administrator.`,
          );
        }

        const updatedMembers = local.teamMembers.some(
          (m) => m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase(),
        )
          ? local.teamMembers.map((m) =>
              m.id === member.id || m.email.toLowerCase() === member.email.toLowerCase()
                ? { ...m, ...member, lastActive: new Date().toISOString() }
                : m,
            )
          : [member, ...local.teamMembers];

        writeWorkspaceState({
          ...local,
          activeRole: member.role,
          teamMembers: updatedMembers,
        });

        const session: AuthSession = {
          isAuthenticated: true,
          userId: member.id,
          rememberSession,
          signedInAt: new Date().toISOString(),
          authProvider: 'supabase',
          employeeId: member.employeeId,
          userName: member.name,
          userEmail: member.email,
          userRole: member.role,
          approvalStatus: member.approvalStatus,
          isSuperAdmin: member.isSuperAdmin,
          userDepartment: member.department,
          userTitle: member.title,
          avatarUrl: member.avatarUrl,
        };
        dataService.auth.saveSessionSync(session);
        return { user: member, session };
      }

      // Offline corporate credential verification when Supabase env vars are absent
      const match = local.teamMembers.find(
        (m) => m.email.toLowerCase() === cleanEmail,
      );
      if (!match) {
        throw new Error(
          'Invalid corporate credentials. Create an account or contact your System Administrator.',
        );
      }
      const normalizedMatch = enforceMemberInvariants(match);
      if (!isSuper && normalizedMatch.approvalStatus === 'approved' && !normalizedMatch.active) {
        throw new Error(
          `Account for ${normalizedMatch.name} is currently deactivated. Contact your System Administrator.`,
        );
      }

      const creds = readLocalCredentials();
      const storedHash = creds[cleanEmail];
      const enteredHash = await hashCredentialSecret(cleanEmail, password);
      if (!storedHash || storedHash !== enteredHash) {
        throw new Error('Invalid corporate email or password.');
      }

      const now = new Date().toISOString();
      const updatedMembers = local.teamMembers.map((m) =>
        m.id === normalizedMatch.id ? { ...normalizedMatch, lastActive: now } : m,
      );
      writeWorkspaceState({
        ...local,
        activeRole: normalizedMatch.role,
        teamMembers: updatedMembers,
      });

      const session: AuthSession = {
        isAuthenticated: true,
        userId: normalizedMatch.id,
        rememberSession,
        signedInAt: now,
        authProvider: 'local',
        employeeId: normalizedMatch.employeeId,
        userName: normalizedMatch.name,
        userEmail: normalizedMatch.email,
        userRole: normalizedMatch.role,
        approvalStatus: normalizedMatch.approvalStatus,
        isSuperAdmin: normalizedMatch.isSuperAdmin,
        userDepartment: normalizedMatch.department,
        userTitle: normalizedMatch.title,
        avatarUrl: normalizedMatch.avatarUrl,
      };
      dataService.auth.saveSessionSync(session);
      return { user: { ...normalizedMatch, lastActive: now }, session };
    },

    async registerUser(
      payload: {
        fullName: string;
        email: string;
        employeeId?: string;
        password: string;
        department: Department;
      },
      rememberSession = true,
    ): Promise<
      | { status: 'signed_in'; user: TeamMember; session: AuthSession }
      | { status: 'confirmation_required'; email: string; user: TeamMember }
    > {
      const cleanName = payload.fullName.trim();
      const cleanEmail = payload.email.trim().toLowerCase();
      const cleanEmployeeId =
        payload.employeeId?.trim().toUpperCase() || deriveEmployeeCode(cleanEmail);

      if (!cleanName) throw new Error('Full Name is required.');
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('A valid corporate email address is required.');
      }
      if (payload.password.trim().length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      const isSuper = isSuperAdminEmail(cleanEmail);
      const assignedRole: Role = isSuper ? 'Admin' : 'Viewer';
      const approvalStatus: ApprovalStatus = isSuper ? 'approved' : 'pending';
      const assignedTitle = isSuper ? 'Primary Super Administrator' : defaultTitleForRole(assignedRole);
      const now = new Date().toISOString();
      const local = readWorkspaceState();

      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: payload.password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : undefined,
            data: {
              full_name: cleanName,
              name: cleanName,
              employee_id: cleanEmployeeId,
              department: payload.department,
              role: toDbRole(assignedRole),
              approval_status: approvalStatus,
              is_super_admin: isSuper,
              title: assignedTitle,
              sign_off_title: assignedTitle,
            },
          },
        });
        if (error) throw error;
        if (!data.user) {
          throw new Error('Registration did not return a user profile.');
        }

        const newMember: TeamMember = enforceMemberInvariants({
          id: data.user.id,
          employeeId: cleanEmployeeId,
          name: cleanName,
          email: cleanEmail,
          role: assignedRole,
          approvalStatus,
          isSuperAdmin: isSuper,
          approvedBy: isSuper ? 'System Bootstrap' : undefined,
          approvedAt: isSuper ? now : undefined,
          department: payload.department,
          title: assignedTitle,
          signOffTitle: assignedTitle,
          active: true,
          lastActive: now,
        });

        await upsertProfileRecord(newMember).catch(() => {});

        const updatedMembers = [
          newMember,
          ...local.teamMembers.filter(
            (m) => m.id !== newMember.id && m.email.toLowerCase() !== cleanEmail,
          ),
        ];

        writeWorkspaceState({
          ...local,
          activeRole: newMember.role,
          teamMembers: updatedMembers,
        });

        if (isSuper) {
          const initAudit: AuditEvent = {
            id: `aud-reg-super-${Date.now()}`,
            requestId: 'AUTH-PRIMARY-ADMIN',
            timestamp: now,
            actorName: newMember.name,
            actorRole: 'Admin',
            actorSignOffTitle: newMember.signOffTitle,
            actionType: 'Team Updated',
            details: `Super Admin ${newMember.email} registered and verified automatically.`,
          };
          void dataService.auditLogs.append(initAudit).catch(() => {});
        }

        if (!data.session) {
          return {
            status: 'confirmation_required',
            email: cleanEmail,
            user: newMember,
          };
        }

        const session: AuthSession = {
          isAuthenticated: true,
          userId: newMember.id,
          rememberSession,
          signedInAt: now,
          authProvider: 'supabase',
          employeeId: newMember.employeeId,
          userName: newMember.name,
          userEmail: newMember.email,
          userRole: newMember.role,
          approvalStatus: newMember.approvalStatus,
          isSuperAdmin: newMember.isSuperAdmin,
          userDepartment: newMember.department,
          userTitle: newMember.title,
        };
        dataService.auth.saveSessionSync(session);
        return { status: 'signed_in', user: newMember, session };
      }

      // Offline local registration
      if (local.teamMembers.some((m) => m.email.toLowerCase() === cleanEmail)) {
        throw new Error(`An account already exists for ${cleanEmail}. Please sign in.`);
      }
      await saveLocalCredential(cleanEmail, payload.password);
      const newMember: TeamMember = enforceMemberInvariants({
        id: `usr-${Date.now()}`,
        employeeId: cleanEmployeeId,
        name: cleanName,
        email: cleanEmail,
        role: assignedRole,
        approvalStatus,
        isSuperAdmin: isSuper,
        approvedBy: isSuper ? 'System Bootstrap' : undefined,
        approvedAt: isSuper ? now : undefined,
        department: payload.department,
        title: assignedTitle,
        signOffTitle: assignedTitle,
        active: true,
        lastActive: now,
      });

      writeWorkspaceState({
        ...local,
        activeRole: newMember.role,
        teamMembers: [newMember, ...local.teamMembers],
      });

      const session: AuthSession = {
        isAuthenticated: true,
        userId: newMember.id,
        rememberSession,
        signedInAt: now,
        authProvider: 'local',
        employeeId: newMember.employeeId,
        userName: newMember.name,
        userEmail: newMember.email,
        userRole: newMember.role,
        approvalStatus: newMember.approvalStatus,
        isSuperAdmin: newMember.isSuperAdmin,
        userDepartment: newMember.department,
        userTitle: newMember.title,
      };
      dataService.auth.saveSessionSync(session);
      return { status: 'signed_in', user: newMember, session };
    },

    async resetPasswordForEmail(email: string): Promise<void> {
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Enter a valid corporate email address.');
      }
      if (!supabase) {
        throw new Error(
          'Password reset links require live Supabase Auth (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY). Contact your System Administrator to reset offline credentials.',
        );
      }
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (error) throw error;
    },

    /**
     * First-Time Setup Guard: Allowed ONLY once when zero Admin users exist.
     */
    async registerInitialAdmin(
      payload: {
        fullName: string;
        email: string;
        employeeId: string;
        password: string;
        department: Department;
      },
      rememberSession = true,
    ): Promise<
      | { status: 'signed_in'; user: TeamMember; session: AuthSession }
      | { status: 'confirmation_required'; email: string; user: TeamMember }
    > {
      const alreadyInitialized = await dataService.auth.checkAdminInitialized();
      if (alreadyInitialized) {
        throw new Error(
          'A Primary System Administrator already exists. Registration is locked to Admin-only provisioning.',
        );
      }

      const cleanName = payload.fullName.trim();
      const cleanEmail = payload.email.trim().toLowerCase();
      const cleanEmployeeId = payload.employeeId.trim().toUpperCase();

      if (!cleanName) throw new Error('Administrator Full Name is required.');
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('A valid corporate email address is required.');
      }
      if (!cleanEmployeeId) throw new Error('Employee ID (e.g., EMP-001) is required.');
      if (payload.password.trim().length < 8) {
        throw new Error('Administrator password must be at least 8 characters.');
      }

      const local = readWorkspaceState();
      const now = new Date().toISOString();
      const isSuper = isSuperAdminEmail(cleanEmail);
      const adminTitle = isSuper ? 'Primary Super Administrator' : 'Primary System Administrator';

      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: payload.password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : undefined,
            data: {
              full_name: cleanName,
              name: cleanName,
              employee_id: cleanEmployeeId,
              department: payload.department,
              role: 'admin',
              approval_status: 'approved',
              is_super_admin: isSuper,
              title: adminTitle,
              sign_off_title: adminTitle,
            },
          },
        });
        if (error) throw error;
        if (!data.user) {
          throw new Error('Failed to create Primary System Administrator account.');
        }

        const adminMember: TeamMember = {
          ...buildMemberFromSupabaseUser(data.user, local.teamMembers),
          employeeId: cleanEmployeeId,
          role: 'Admin',
          approvalStatus: 'approved',
          isSuperAdmin: isSuper,
          approvedBy: 'System Bootstrap',
          approvedAt: now,
          department: payload.department,
          title: adminTitle,
          signOffTitle: adminTitle,
          active: true,
          lastActive: now,
        };

        await upsertProfileRecord(adminMember).catch(() => {});

        const updatedMembers = [
          adminMember,
          ...local.teamMembers.filter(
            (m) =>
              m.id !== adminMember.id &&
              m.email.toLowerCase() !== adminMember.email.toLowerCase(),
          ),
        ];

        writeWorkspaceState({
          ...local,
          activeRole: 'Admin',
          teamMembers: updatedMembers,
        });

        const initAudit: AuditEvent = {
          id: `aud-init-admin-${Date.now()}`,
          requestId: 'AUTH-PRIMARY-ADMIN',
          timestamp: now,
          actorName: adminMember.name,
          actorRole: 'Admin',
          actorSignOffTitle: adminMember.signOffTitle,
          actionType: 'Team Updated',
          details: `Initialized Primary System Administrator ${adminMember.name} (${adminMember.employeeId}, ${adminMember.email}).`,
        };
        void dataService.auditLogs.append(initAudit).catch(() => {});

        if (!data.session) {
          return {
            status: 'confirmation_required',
            email: cleanEmail,
            user: adminMember,
          };
        }

        const session: AuthSession = {
          isAuthenticated: true,
          userId: adminMember.id,
          rememberSession,
          signedInAt: now,
          authProvider: 'supabase',
          employeeId: adminMember.employeeId,
          userName: adminMember.name,
          userEmail: adminMember.email,
          userRole: 'Admin',
          approvalStatus: 'approved',
          isSuperAdmin: isSuper,
          userDepartment: adminMember.department,
          userTitle: adminMember.title,
        };
        dataService.auth.saveSessionSync(session);
        return { status: 'signed_in', user: adminMember, session };
      }

      // Local persistence initialization
      await saveLocalCredential(cleanEmail, payload.password);
      const adminMember: TeamMember = {
        id: `usr-admin-${Date.now()}`,
        employeeId: cleanEmployeeId,
        name: cleanName,
        email: cleanEmail,
        role: 'Admin',
        approvalStatus: 'approved',
        isSuperAdmin: isSuper,
        approvedBy: 'System Bootstrap',
        approvedAt: now,
        department: payload.department,
        title: adminTitle,
        signOffTitle: adminTitle,
        active: true,
        lastActive: now,
      };

      writeWorkspaceState({
        ...local,
        activeRole: 'Admin',
        teamMembers: [adminMember, ...local.teamMembers],
      });

      const session: AuthSession = {
        isAuthenticated: true,
        userId: adminMember.id,
        rememberSession,
        signedInAt: now,
        authProvider: 'local',
        employeeId: adminMember.employeeId,
        userName: adminMember.name,
        userEmail: adminMember.email,
        userRole: 'Admin',
        approvalStatus: 'approved',
        isSuperAdmin: isSuper,
        userDepartment: adminMember.department,
        userTitle: adminMember.title,
      };
      dataService.auth.saveSessionSync(session);
      return { status: 'signed_in', user: adminMember, session };
    },

    /**
     * Admin-Only Employee Account Provisioning / Invitation.
     * Uses a non-persisting ephemeral Supabase client so the active Admin session is never replaced.
     */
    async provisionEmployeeAccount(
      payload: ProvisionEmployeePayload,
      existingMembers?: TeamMember[],
    ): Promise<{ member: TeamMember; emailConfirmationPending: boolean }> {
      const cleanName = payload.fullName.trim();
      const cleanEmail = payload.email.trim().toLowerCase();
      const cleanEmpId = payload.employeeId.trim().toUpperCase();
      const isSuper = isSuperAdminEmail(cleanEmail);
      const effectiveRole: Role = isSuper ? 'Admin' : normalizeRole(payload.role);
      const cleanTitle = payload.title?.trim() || defaultTitleForRole(effectiveRole);

      if (!cleanName) throw new Error('Employee Full Name is required.');
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('A valid corporate email address is required.');
      }
      if (!cleanEmpId) throw new Error('Employee ID (e.g., EMP-105) is required.');
      if (payload.password.trim().length < 8) {
        throw new Error('Temporary password must be at least 8 characters.');
      }

      const local = readWorkspaceState();
      const directory = existingMembers ?? local.teamMembers;
      if (directory.some((m) => m.email.toLowerCase() === cleanEmail)) {
        throw new Error(`An employee account already exists for ${cleanEmail}.`);
      }
      if (directory.some((m) => m.employeeId.toLowerCase() === cleanEmpId.toLowerCase())) {
        throw new Error(`Employee ID ${cleanEmpId} is already assigned.`);
      }

      const now = new Date().toISOString();
      let newUserId = `usr-${Date.now()}`;
      let emailConfirmationPending = false;

      if (supabase && hasValidSupabaseConfig) {
        const provisioningClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data, error } = await provisioningClient.auth.signUp({
          email: cleanEmail,
          password: payload.password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : undefined,
            data: {
              full_name: cleanName,
              name: cleanName,
              employee_id: cleanEmpId,
              department: payload.department,
              role: toDbRole(effectiveRole),
              approval_status: 'approved',
              is_super_admin: isSuper,
              title: cleanTitle,
              sign_off_title: cleanTitle,
            },
          },
        });
        if (error) throw error;
        if (data.user?.id) {
          newUserId = data.user.id;
        }
        emailConfirmationPending = !data.session;
      } else {
        await saveLocalCredential(cleanEmail, payload.password);
      }

      const member: TeamMember = {
        id: newUserId,
        employeeId: cleanEmpId,
        name: cleanName,
        email: cleanEmail,
        role: effectiveRole,
        approvalStatus: 'approved',
        isSuperAdmin: isSuper,
        approvedBy: 'Admin Provisioned',
        approvedAt: now,
        department: payload.department,
        title: cleanTitle,
        signOffTitle: cleanTitle,
        active: true,
        lastActive: now,
      };

      await upsertProfileRecord(member).catch(() => {});

      return { member, emailConfirmationPending };
    },

    async updatePassword(newPassword: string, userEmail?: string): Promise<void> {
      if (newPassword.trim().length < 8) {
        throw new Error('New corporate password must be at least 8 characters.');
      }
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) throw error;
          return;
        }
      }
      if (userEmail) {
        await saveLocalCredential(userEmail, newPassword);
      }
    },

    async signOut() {
      dataService.auth.clearSessionSync();
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.signOut();
      }
    },
  },

  // -------------------------------------------------------------------------
  // 2. Operational Requests (`nexops_requests`)
  // -------------------------------------------------------------------------
  requests: {
    async list(): Promise<OperationalRequest[]> {
      if (!supabase) {
        return readWorkspaceState().requests;
      }
      const state = await dataService.fetchWorkspaceState();
      return state.requests;
    },

    async create(
      newRequest: OperationalRequest,
      auditEntry: AuditEvent,
      _notification: AppNotification | null,
    ): Promise<void> {
      if (newRequest.projectId && newRequest.projectCode && newRequest.projectName) {
        saveRequestProjectLink(newRequest.id, {
          projectId: newRequest.projectId,
          projectCode: newRequest.projectCode,
          projectName: newRequest.projectName,
        });
      }
      if (newRequest.assetId && newRequest.assetTag && newRequest.assetName) {
        saveRequestAssetLink(newRequest.id, {
          assetId: newRequest.assetId,
          assetTag: newRequest.assetTag,
          assetName: newRequest.assetName,
        });
      }
      saveRequestMeta(newRequest.id, {
        currency: newRequest.currency,
        estimatedCost: newRequest.estimatedCost,
        actualSpend: newRequest.actualSpend,
        momCode: newRequest.momCode,
        assignedReviewer: newRequest.assignedReviewer,
        delegatedFromReviewer: newRequest.delegatedFromReviewer,
        stage1Approval: newRequest.stage1Approval ?? null,
        stage2Approval: newRequest.stage2Approval ?? null,
      });

      if (!supabase) {
        return;
      }

      const { error: reqError } = await supabase
        .from('nexops_requests')
        .insert(toRequestDbRow(newRequest));
      if (reqError) throw reqError;

      await Promise.all([
        dataService.auditLogs.append(auditEntry),
        syncRequestMetaBundleToCloud(newRequest.submittedBy),
      ]);
    },

    updateMetaSync(requestId: string, meta: RequestExtendedMeta): void {
      saveRequestMeta(requestId, meta);
    },

    async syncMetaCloud(requestId: string, meta: RequestExtendedMeta, updatedBy?: string): Promise<void> {
      saveRequestMeta(requestId, meta);
      await syncRequestMetaBundleToCloud(updatedBy);
    },

    async syncRequestMetaBundle(updatedBy?: string): Promise<void> {
      await syncRequestMetaBundleToCloud(updatedBy);
    },

    async escalateToAdmin(
      requestId: string,
      updatedAt: string,
      auditEntry: AuditEvent,
    ): Promise<void> {
      if (!supabase) {
        return;
      }

      const { error } = await supabase
        .from('nexops_requests')
        .update({
          priority: 'Urgent',
          updated_at: updatedAt,
        })
        .eq('id', requestId);
      if (error) throw error;

      await dataService.auditLogs.append(auditEntry);
    },

    async updateStatus(
      requestId: string,
      nextStatus: RequestStatus,
      _revisionReason: string | undefined,
      updatedAt: string,
      auditEntry: AuditEvent,
      _notification: AppNotification,
    ): Promise<void> {
      if (!supabase) {
        return;
      }

      const { error } = await supabase
        .from('nexops_requests')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', requestId);
      if (error) throw error;

      await Promise.all([
        dataService.auditLogs.append(auditEntry),
        syncRequestMetaBundleToCloud(auditEntry.actorName),
      ]);
    },

    async bulkCreate(
      newRequests: OperationalRequest[],
      auditEntries: AuditEvent[],
      _notification: AppNotification | null,
    ): Promise<void> {
      if (!supabase || newRequests.length === 0) {
        return;
      }

      const { error: reqError } = await supabase
        .from('nexops_requests')
        .insert(newRequests.map(toRequestDbRow));
      if (reqError) throw reqError;

      if (auditEntries.length > 0) {
        const { error: audError } = await supabase
          .from('nexops_audit_logs')
          .insert(auditEntries.map(toAuditDbRow));
        if (audError) throw audError;
      }
    },

    async bulkUpdatePriority(
      requestIds: string[],
      nextPriority: OperationalRequest['priority'],
      updatedAt: string,
      auditEntries: AuditEvent[],
    ): Promise<void> {
      if (!supabase || requestIds.length === 0) {
        return;
      }

      const { error } = await supabase
        .from('nexops_requests')
        .update({ priority: nextPriority, updated_at: updatedAt })
        .in('id', requestIds);
      if (error) throw error;

      if (auditEntries.length > 0) {
        const { error: audError } = await supabase
          .from('nexops_audit_logs')
          .insert(auditEntries.map(toAuditDbRow));
        if (audError) throw audError;
      }
    },
  },

  // -------------------------------------------------------------------------
  // 3. QA Verification Checklists (JSONB `checklist` column on `nexops_requests`)
  // -------------------------------------------------------------------------
  checklists: {
    async updateRequestChecklist(
      requestId: string,
      updatedChecklist: ChecklistItem[],
      updatedAt: string,
      auditEntry: AuditEvent,
    ): Promise<void> {
      if (!supabase) {
        return;
      }

      const { error } = await supabase
        .from('nexops_requests')
        .update({
          checklist: updatedChecklist,
          updated_at: updatedAt,
        })
        .eq('id', requestId);
      if (error) throw error;

      await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 4. Immutable Audit Logs (`nexops_audit_logs`)
  // -------------------------------------------------------------------------
  auditLogs: {
    async list(): Promise<AuditEvent[]> {
      if (!supabase) {
        return readWorkspaceState().globalAuditLogs;
      }
      const { data, error } = await supabase
        .from('nexops_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const members = readWorkspaceState().teamMembers;
      return ((data ?? []) as NexOpsAuditDbRow[]).map((row) => mapDbAudit(row, members));
    },

    async append(event: AuditEvent): Promise<void> {
      if (!supabase) {
        return;
      }
      const { error } = await supabase
        .from('nexops_audit_logs')
        .insert(toAuditDbRow(event));
      if (error) throw error;
    },
  },

  // -------------------------------------------------------------------------
  // 5. Projects & Clients (`nexops_projects`)
  // -------------------------------------------------------------------------
  projects: {
    async upsert(project: CompanyProject, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_projects')
        .upsert(toProjectDbRow(project), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },

    async remove(projectId: string, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 6. Assets & Inventory (`nexops_assets`)
  // -------------------------------------------------------------------------
  assets: {
    async upsert(asset: CompanyAsset, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_assets')
        .upsert(toAssetDbRow(asset), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 7. Corporate SOP & Knowledge Vault (`nexops_sops`)
  // -------------------------------------------------------------------------
  sops: {
    async upsert(sop: SopDocument, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_sops')
        .upsert(toSopDbRow(sop), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 8. Leave & Time-Off Approvals (`nexops_leaves`)
  // -------------------------------------------------------------------------
  leaves: {
    async upsert(leave: LeaveRequest, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_leaves')
        .upsert(toLeaveDbRow(leave), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 9. Meeting Minutes & Action Items (`nexops_moms`)
  // -------------------------------------------------------------------------
  meetings: {
    async upsert(meeting: MeetingMinute, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_moms')
        .upsert(toMomDbRow(meeting), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 10. System State Key-Value Store (`nexops_system_state`)
  // -------------------------------------------------------------------------
  systemState: {
    async getKey<T = unknown>(stateKey: string): Promise<T | null> {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('nexops_system_state')
        .select('payload')
        .eq('state_key', stateKey)
        .maybeSingle();
      if (error) return null;
      return (data?.payload as T) ?? null;
    },

    async upsertKey(stateKey: string, payload: unknown, updatedBy?: string): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase.from('nexops_system_state').upsert(
        {
          state_key: stateKey,
          payload,
          updated_by: updatedBy ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'state_key' },
      );
      if (error) throw error;
    },
  },

  // -------------------------------------------------------------------------
  // 10b. Workspace Interactive Studio Persistence (Docs / Sheets / Forms)
  // -------------------------------------------------------------------------
  workspaceStudio: {
    loadLocal<T>(toolType: string, docId: string): T | null {
      try {
        const raw = localStorage.getItem(`nexops_studio_${toolType}_${docId}`);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async fetchCloud<T>(toolType: string, docId: string): Promise<T | null> {
      const key = `nexops_studio_${toolType}_${docId}`;
      const cloud = await dataService.systemState.getKey<T>(key);
      if (cloud) {
        try {
          localStorage.setItem(key, JSON.stringify(cloud));
        } catch {
          // Ignore quota error
        }
      }
      return cloud;
    },

    async save<T>(toolType: string, docId: string, content: T, updatedBy?: string): Promise<void> {
      const key = `nexops_studio_${toolType}_${docId}`;
      try {
        localStorage.setItem(key, JSON.stringify(content));
      } catch {
        // Ignore quota error
      }
      if (supabase) {
        await dataService.systemState.upsertKey(key, content, updatedBy).catch(() => {});
      }
    },
  },

  // -------------------------------------------------------------------------
  // 11. User Profiles & Supabase Storage Avatars (`profiles` + `avatars` bucket)
  // -------------------------------------------------------------------------
  profile: {
    async uploadAvatar(
      user: TeamMember,
      file: File,
      nextDirectoryBuilder?: (avatarUrl: string) => TeamMember[],
    ): Promise<string> {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a JPG, PNG, WebP, or GIF image file.');
      }
      if (file.size > 3 * 1024 * 1024) {
        throw new Error('Profile picture must be 3 MB or smaller.');
      }

      if (!supabase) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Failed to read image file.'));
          };
          reader.onerror = () => reject(new Error('Failed to read image file.'));
          reader.readAsDataURL(file);
        });
        return dataUrl;
      }

      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = `${safeUserId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from('avatars').upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type,
      });
      if (uploadErr) {
        throw new Error(`Avatar upload failed (${uploadErr.message}). Ensure the public "avatars" storage bucket exists in Supabase.`);
      }

      const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = pubData?.publicUrl;
      if (!publicUrl) {
        throw new Error('Uploaded image to avatars bucket but could not resolve public URL.');
      }

      try {
        await upsertProfileRecord({ ...user, avatarUrl: publicUrl });
      } catch (profileErr) {
        const msg = profileErr instanceof Error ? profileErr.message : String(profileErr);
        throw new Error(`Uploaded image, but failed saving avatar_url to profiles table: ${msg}`);
      }

      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        if (sessionRes.session) {
          await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
        }
      } catch {
        // Non-blocking auth metadata update
      }

      if (nextDirectoryBuilder) {
        await dataService.systemState.upsertKey(
          SYSTEM_STATE_KEYS.TEAM_DIRECTORY,
          nextDirectoryBuilder(publicUrl),
          user.name,
        );
      }

      return publicUrl;
    },

    async removeAvatar(user: TeamMember, nextDirectory?: TeamMember[]): Promise<void> {
      if (!supabase) return;

      const currentUrl = user.avatarUrl || '';
      const marker = '/storage/v1/object/public/avatars/';
      const idx = currentUrl.indexOf(marker);
      if (idx !== -1) {
        const objectPath = decodeURIComponent(currentUrl.slice(idx + marker.length).split('?')[0]);
        if (objectPath) {
          await supabase.storage.from('avatars').remove([objectPath]).catch(() => {});
        }
      }

      try {
        await upsertProfileRecord({ ...user, avatarUrl: undefined });
      } catch (profileErr) {
        const msg = profileErr instanceof Error ? profileErr.message : String(profileErr);
        throw new Error(`Failed clearing avatar_url in profiles table: ${msg}`);
      }

      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        if (sessionRes.session) {
          await supabase.auth.updateUser({ data: { avatar_url: null } });
        }
      } catch {
        // Non-blocking auth metadata clear
      }

      if (nextDirectory) {
        await dataService.systemState.upsertKey(
          SYSTEM_STATE_KEYS.TEAM_DIRECTORY,
          nextDirectory,
          user.name,
        );
      }
    },
  },

  // -------------------------------------------------------------------------
  // 12. Workspace Tools — Gmail Sent Logs (`nexops_workspace_emails`)
  // -------------------------------------------------------------------------
  workspaceEmails: {
    async append(emailLog: WorkspaceEmailLog, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_workspace_emails')
        .upsert(toWorkspaceEmailDbRow(emailLog), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 13. Workspace Tools — Shared Google Docs, Sheets & Forms (`nexops_workspace_links`)
  // -------------------------------------------------------------------------
  workspaceLinks: {
    async upsert(link: WorkspaceSavedLink, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_workspace_links')
        .upsert(toWorkspaceLinkDbRow(link), { onConflict: 'id' });
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },

    async remove(linkId: string, auditEntry?: AuditEvent): Promise<void> {
      if (!supabase) return;
      const { error } = await supabase
        .from('nexops_workspace_links')
        .delete()
        .eq('id', linkId);
      if (error) throw error;
      if (auditEntry) await dataService.auditLogs.append(auditEntry);
    },
  },

  // -------------------------------------------------------------------------
  // 14. Team Directory, RBAC Roles & Admin Approvals (`profiles` + `nexops_system_state`)
  // -------------------------------------------------------------------------
  team: {
    async updateMember(
      memberId: string,
      patch: Partial<
        Pick<
          TeamMember,
          | 'role'
          | 'approvalStatus'
          | 'approvedBy'
          | 'approvedAt'
          | 'department'
          | 'active'
          | 'signOffTitle'
          | 'avatarUrl'
          | 'outOfOffice'
          | 'delegateApproverId'
          | 'delegateApproverName'
        >
      >,
      auditEntry: AuditEvent,
      nextDirectory?: TeamMember[],
    ): Promise<void> {
      if (!supabase) return;
      const tasks: Promise<void>[] = [dataService.auditLogs.append(auditEntry)];
      const targetMember = nextDirectory?.find((m) => m.id === memberId);
      if (targetMember) {
        tasks.push(upsertProfileRecord(targetMember).catch(() => {}));
      } else {
        const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (patch.role !== undefined) dbPatch.role = toDbRole(patch.role);
        if (patch.approvalStatus !== undefined) dbPatch.approval_status = patch.approvalStatus;
        if (patch.approvedBy !== undefined) dbPatch.approved_by = patch.approvedBy;
        if (patch.approvedAt !== undefined) dbPatch.approved_at = patch.approvedAt;
        if (patch.department !== undefined) dbPatch.department = patch.department;
        if (patch.active !== undefined) dbPatch.active = patch.active;
        if (patch.signOffTitle !== undefined) dbPatch.sign_off_title = patch.signOffTitle;
        if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl;
        tasks.push(
          (async () => {
            await supabase!.from('profiles').update(dbPatch).eq('id', memberId);
          })(),
        );
      }
      if (nextDirectory) {
        tasks.push(
          dataService.systemState.upsertKey(
            SYSTEM_STATE_KEYS.TEAM_DIRECTORY,
            nextDirectory,
            auditEntry.actorName,
          ),
        );
      }
      await Promise.all(tasks);
    },

    async createMember(
      member: TeamMember,
      auditEntry: AuditEvent,
      nextDirectory?: TeamMember[],
    ): Promise<void> {
      if (!supabase) return;
      const tasks: Promise<void>[] = [
        dataService.auditLogs.append(auditEntry),
        upsertProfileRecord(member).catch(() => {}),
      ];
      if (nextDirectory) {
        tasks.push(
          dataService.systemState.upsertKey(
            SYSTEM_STATE_KEYS.TEAM_DIRECTORY,
            nextDirectory,
            auditEntry.actorName,
          ),
        );
      }
      await Promise.all(tasks);
    },
  },

  notifications: {
    async markRead(_notificationId: string): Promise<void> {
      // Handled via localStorage state snapshot
    },

    async markAllRead(): Promise<void> {
      // Handled via localStorage state snapshot
    },
  },
};
