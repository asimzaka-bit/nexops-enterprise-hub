import {
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileEdit,
  FileText,
  History,
  LayoutGrid,
  List,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Department,
  PendingEditorChange,
  Role,
  SopCategory,
  SopDocument,
  TeamMember,
  WorkflowApprovalStatus,
} from '../types/nexops';
import { formatDateTime, formatShortDate, isSuperAdminEmail } from '../utils/storage';
import { PendingApprovalBadge } from './StatusIndicator';

export interface SopRevisionPayload {
  version: string;
  changeNote: string;
  effectiveDate: string;
  purpose: string;
  scope: string;
  procedureSteps: string[];
  complianceRules: string[];
}

interface SopVaultViewProps {
  sops: SopDocument[];
  activeRole: Role;
  currentUser: TeamMember;
  pendingEditorChanges?: PendingEditorChange[];
  departments: string[];
  teamMembers: TeamMember[];
  onPublishSop: (sop: Omit<SopDocument, 'id' | 'acknowledgments' | 'updatedAt'>) => void;
  onToggleMandatory: (sopId: string) => void;
  onAcknowledgeSop: (sopId: string) => void;
  onReviseSop?: (sopId: string, patch: SopRevisionPayload) => void;
  onStampSop?: (sopId: string) => void;
  onTransitionSopWorkflow?: (
    sopId: string,
    nextStatus: WorkflowApprovalStatus,
    reason?: string,
  ) => void;
  jumpToSopId?: string | null;
  onClearJumpSop?: () => void;
}

const SOP_CATEGORIES: SopCategory[] = [
  'Standard Operating Procedure',
  'QA Guidelines',
  'HR Policies',
  'Templates',
];

function getCategoryPrefix(category: SopCategory): string {
  switch (category) {
    case 'QA Guidelines':
      return 'SOP-QA';
    case 'HR Policies':
      return 'SOP-HR';
    case 'Templates':
      return 'TPL-OPS';
    default:
      return 'SOP-OPS';
  }
}

function generateNextSopCode(sops: SopDocument[], category: SopCategory): string {
  const prefix = getCategoryPrefix(category);
  const maxNum = sops.reduce((max, doc) => {
    const match = doc.code.match(/-(\d+)$/);
    if (match && doc.code.toUpperCase().startsWith(prefix)) {
      const n = parseInt(match[1], 10);
      return n > max ? n : max;
    }
    return max;
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;
}

function matchesMemberAck(
  ack: SopDocument['acknowledgments'][number],
  member: Pick<TeamMember, 'id' | 'employeeId' | 'name'>,
): boolean {
  return (
    ack.userId === member.id ||
    (Boolean(ack.employeeId) && ack.employeeId === member.employeeId) ||
    ack.userName.trim().toLowerCase() === member.name.trim().toLowerCase()
  );
}

function computeSopCompliance(sop: SopDocument, teamMembers: TeamMember[]) {
  const activeMembers = teamMembers.filter((m) => m.active);
  const totalTeam = Math.max(activeMembers.length, 1);
  const acknowledgedMembers = activeMembers.filter((member) =>
    sop.acknowledgments.some((ack) => matchesMemberAck(ack, member)),
  );
  const pendingMembers = activeMembers.filter(
    (member) => !sop.acknowledgments.some((ack) => matchesMemberAck(ack, member)),
  );

  // Also include any external/Supabase-registered acknowledgments not in static activeMembers list
  const extraAcks = sop.acknowledgments.filter(
    (ack) => !activeMembers.some((member) => matchesMemberAck(ack, member)),
  );

  const acknowledgedCount = acknowledgedMembers.length + extraAcks.length;
  const effectiveDenominator = Math.max(activeMembers.length + extraAcks.length, 1);
  const percent = Math.min(100, Math.round((acknowledgedCount / effectiveDenominator) * 100));

  return {
    percent,
    acknowledgedCount,
    totalCount: effectiveDenominator,
    totalTeam,
    acknowledgedMembers,
    pendingMembers,
    extraAcks,
  };
}

function suggestNextSopVersion(current?: string): string {
  const clean = (current || 'v1.0').trim().replace(/^v/i, '');
  const parts = clean.split('.').map((p) => parseInt(p, 10));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return `v${parts[0]}.${parts[1] + 1}`;
  }
  if (parts.length === 1 && Number.isFinite(parts[0])) {
    return `v${parts[0] + 1}.0`;
  }
  return 'v1.1';
}

export function SopVaultView({
  sops,
  activeRole,
  currentUser,
  pendingEditorChanges = [],
  departments,
  teamMembers,
  onPublishSop,
  onToggleMandatory,
  onAcknowledgeSop,
  onReviseSop,
  onStampSop,
  onTransitionSopWorkflow,
  jumpToSopId,
  onClearJumpSop,
}: SopVaultViewProps) {
  const isViewer = activeRole === 'Viewer';
  const canManageSops = activeRole === 'Admin' || activeRole === 'Editor';
  const isSuperAdmin = activeRole === 'Admin' && isSuperAdminEmail(currentUser.email);

  const pendingSopEditIds = useMemo(() => {
    const set = new Set<string>();
    for (const chg of pendingEditorChanges) {
      if (chg.status === 'pending' && chg.module === 'sops' && chg.action !== 'create') {
        set.add(chg.targetId);
      }
    }
    return set;
  }, [pendingEditorChanges]);

  const pendingCreatedSops = useMemo(() => {
    if (!canManageSops) return [];
    const emailLower = currentUser.email.toLowerCase();
    return pendingEditorChanges.filter(
      (chg) =>
        chg.status === 'pending' &&
        chg.module === 'sops' &&
        chg.action === 'create' &&
        (activeRole === 'Admin' || chg.editorEmail.toLowerCase() === emailLower),
    );
  }, [pendingEditorChanges, activeRole, currentUser.email, canManageSops]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SopCategory | 'All'>('All');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [pendingMineOnly, setPendingMineOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Reader, Revision & Publish modals
  const [readerSopId, setReaderSopId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [readerShowHistory, setReaderShowHistory] = useState(false);
  const [reviseModalSop, setReviseModalSop] = useState<SopDocument | null>(null);
  const [revVersion, setRevVersion] = useState('v1.1');
  const [revNote, setRevNote] = useState('');
  const [revEffectiveDate, setRevEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [revPurpose, setRevPurpose] = useState('');
  const [revScope, setRevScope] = useState('');
  const [revStepsText, setRevStepsText] = useState('');
  const [revRulesText, setRevRulesText] = useState('');
  const [revError, setRevError] = useState<string | null>(null);
  const [rejectSopTarget, setRejectSopTarget] = useState<SopDocument | null>(null);
  const [rejectSopReason, setRejectSopReason] = useState('');
  const [rejectSopError, setRejectSopError] = useState<string | null>(null);

  useEffect(() => {
    if (jumpToSopId && sops.some((s) => s.id === jumpToSopId)) {
      setReaderSopId(jumpToSopId);
      onClearJumpSop?.();
    }
  }, [jumpToSopId, sops, onClearJumpSop]);

  const getSopWorkflowStatus = (sop: SopDocument): WorkflowApprovalStatus =>
    sop.workflowStatus ?? (sop.approvalStamp ? 'Approved' : 'Submitted');

  const renderWorkflowBadge = (status: WorkflowApprovalStatus) => {
    if (status === 'Approved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    }
    if (status === 'Rejected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }
    if (status === 'Under Review') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
          <Clock className="h-3 w-3" />
          Under Review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-300">
        <Clock className="h-3 w-3" />
        Submitted
      </span>
    );
  };

  // Publish Form state
  const [pubCode, setPubCode] = useState('');
  const [pubTitle, setPubTitle] = useState('');
  const [pubCategory, setPubCategory] = useState<SopCategory>('Standard Operating Procedure');
  const [pubVersion, setPubVersion] = useState('v1.0');
  const [pubDepartment, setPubDepartment] = useState<Department>(
    departments[0] ?? 'Operations',
  );
  const [pubEffectiveDate, setPubEffectiveDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [pubMandatory, setPubMandatory] = useState(true);
  const [pubPurpose, setPubPurpose] = useState('');
  const [pubScope, setPubScope] = useState('');
  const [pubStepsText, setPubStepsText] = useState('');
  const [pubRulesText, setPubRulesText] = useState('');
  const [pubError, setPubError] = useState<string | null>(null);

  const availableDepartments = useMemo(
    () => Array.from(new Set([...departments, ...sops.map((s) => s.department)])),
    [departments, sops],
  );

  // Top KPI Metrics
  const kpiStats = useMemo(() => {
    const total = sops.length;
    const mandatorySops = sops.filter((s) => s.mandatoryRead);
    const pendingMySignOff = mandatorySops.filter(
      (s) => !s.acknowledgments.some((ack) => matchesMemberAck(ack, currentUser)),
    ).length;

    const avgCompliance =
      mandatorySops.length > 0
        ? Math.round(
            mandatorySops.reduce(
              (sum, doc) => sum + computeSopCompliance(doc, teamMembers).percent,
              0,
            ) / mandatorySops.length,
          )
        : sops.length > 0
          ? Math.round(
              sops.reduce(
                (sum, doc) => sum + computeSopCompliance(doc, teamMembers).percent,
                0,
              ) / sops.length,
            )
          : 0;

    return {
      total,
      mandatoryCount: mandatorySops.length,
      pendingMySignOff,
      avgCompliance,
    };
  }, [sops, currentUser, teamMembers]);

  const filteredSops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sops.filter((doc) => {
      const matchesCat = categoryFilter === 'All' || doc.category === categoryFilter;
      const matchesDept = departmentFilter === 'All' || doc.department === departmentFilter;
      const matchesMandatory = !mandatoryOnly || doc.mandatoryRead;
      const userSigned = doc.acknowledgments.some((ack) =>
        matchesMemberAck(ack, currentUser),
      );
      const matchesPendingMine = !pendingMineOnly || (doc.mandatoryRead && !userSigned);
      const matchesSearch =
        !q ||
        doc.code.toLowerCase().includes(q) ||
        doc.title.toLowerCase().includes(q) ||
        doc.department.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q) ||
        doc.authorName.toLowerCase().includes(q) ||
        doc.purpose.toLowerCase().includes(q);

      return (
        matchesCat &&
        matchesDept &&
        matchesMandatory &&
        matchesPendingMine &&
        matchesSearch
      );
    });
  }, [
    sops,
    searchQuery,
    categoryFilter,
    departmentFilter,
    mandatoryOnly,
    pendingMineOnly,
    currentUser,
  ]);

  const activeReaderSop = useMemo(
    () => (readerSopId ? sops.find((s) => s.id === readerSopId) ?? null : null),
    [sops, readerSopId],
  );

  const openReviseModal = (sop: SopDocument) => {
    setReviseModalSop(sop);
    setRevVersion(suggestNextSopVersion(sop.version));
    setRevNote('');
    setRevEffectiveDate(new Date().toISOString().slice(0, 10));
    setRevPurpose(sop.purpose);
    setRevScope(sop.scope);
    setRevStepsText(sop.procedureSteps.join('\n'));
    setRevRulesText(sop.complianceRules.join('\n'));
    setRevError(null);
  };

  const handleReviseSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reviseModalSop || !onReviseSop) return;
    const cleanVer = revVersion.trim();
    const steps = revStepsText
      .split('\n')
      .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    const rules = revRulesText
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);

    if (!cleanVer) {
      setRevError('Version tag is required (e.g. v1.1).');
      return;
    }
    if (!revNote.trim()) {
      setRevError('Revision change note is required.');
      return;
    }
    if (!revPurpose.trim() || !revScope.trim() || steps.length === 0 || rules.length === 0) {
      setRevError('Purpose, Scope, Procedure Steps, and Compliance Rules cannot be empty.');
      return;
    }

    onReviseSop(reviseModalSop.id, {
      version: cleanVer.startsWith('v') ? cleanVer : `v${cleanVer}`,
      changeNote: revNote.trim(),
      effectiveDate: revEffectiveDate || new Date().toISOString().slice(0, 10),
      purpose: revPurpose.trim(),
      scope: revScope.trim(),
      procedureSteps: steps,
      complianceRules: rules,
    });
    setReviseModalSop(null);
  };

  const openPublishModal = () => {
    const defaultCat: SopCategory = 'Standard Operating Procedure';
    setPubCategory(defaultCat);
    setPubCode(generateNextSopCode(sops, defaultCat));
    setPubTitle('');
    setPubVersion('v1.0');
    setPubDepartment(availableDepartments[0] ?? 'Operations');
    setPubEffectiveDate(new Date().toISOString().slice(0, 10));
    setPubMandatory(true);
    setPubPurpose('');
    setPubScope('');
    setPubStepsText('');
    setPubRulesText('');
    setPubError(null);
    setPublishOpen(true);
  };

  const handlePublishCategoryChange = (nextCat: SopCategory) => {
    const prevSuggested = generateNextSopCode(sops, pubCategory);
    setPubCategory(nextCat);
    if (!pubCode.trim() || pubCode.trim().toUpperCase() === prevSuggested) {
      setPubCode(generateNextSopCode(sops, nextCat));
    }
  };

  const handlePublishSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = pubCode.trim().toUpperCase();
    const cleanTitle = pubTitle.trim();
    const cleanVersion = pubVersion.trim() || 'v1.0';
    const cleanPurpose = pubPurpose.trim();
    const cleanScope = pubScope.trim();
    const steps = pubStepsText
      .split('\n')
      .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    const rules = pubRulesText
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);

    if (!cleanCode) {
      setPubError('Document Code is required (e.g. SOP-QA-02).');
      return;
    }
    if (sops.some((s) => s.code.toLowerCase() === cleanCode.toLowerCase())) {
      setPubError(`Document Code "${cleanCode}" already exists in the Vault.`);
      return;
    }
    if (!cleanTitle) {
      setPubError('Document Title is required.');
      return;
    }
    if (!cleanPurpose) {
      setPubError('Purpose section is required.');
      return;
    }
    if (!cleanScope) {
      setPubError('Scope section is required.');
      return;
    }
    if (steps.length === 0) {
      setPubError('Provide at least one Step-by-Step Procedure line.');
      return;
    }
    if (rules.length === 0) {
      setPubError('Provide at least one Compliance Rule line.');
      return;
    }

    onPublishSop({
      code: cleanCode,
      title: cleanTitle,
      category: pubCategory,
      version: cleanVersion.startsWith('v') ? cleanVersion : `v${cleanVersion}`,
      department: pubDepartment,
      effectiveDate: pubEffectiveDate || new Date().toISOString().slice(0, 10),
      mandatoryRead: pubMandatory,
      authorName: currentUser.name,
      purpose: cleanPurpose,
      scope: cleanScope,
      procedureSteps: steps,
      complianceRules: rules,
    });
    setPublishOpen(false);
  };

  const renderCategoryBadge = (category: SopCategory) => {
    const styles: Record<SopCategory, string> = {
      'Standard Operating Procedure':
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300',
      'QA Guidelines':
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300',
      'HR Policies':
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300',
      Templates:
        'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    };
    return (
      <span
        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${styles[category]}`}
      >
        {category}
      </span>
    );
  };

  const renderProgressBar = (percent: number) => {
    const barColor =
      percent >= 80
        ? 'bg-emerald-600'
        : percent >= 50
          ? 'bg-indigo-600'
          : 'bg-amber-500';
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top 4-Card KPI Strip */}
      <section
        aria-label="SOP Compliance Summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Vault Documents</span>
            <BookOpenCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {kpiStats.total}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">SOPs, QA guidelines, policies &amp; templates</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mandatory Read SOPs</span>
            <ShieldCheck className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {kpiStats.mandatoryCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tracked for employee digital sign-off</p>
        </div>

        <button
          type="button"
          onClick={() => setPendingMineOnly((prev) => !prev)}
          className={`rounded-xl border p-5 text-left transition-colors ${
            pendingMineOnly
              ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/35'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending My Sign-Off</span>
            <Clock
              className={`h-4 w-4 ${
                kpiStats.pendingMySignOff > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
          </div>
          <p
            className={`mt-2 font-display text-2xl font-bold tabular-nums ${
              kpiStats.pendingMySignOff > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {kpiStats.pendingMySignOff}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {pendingMineOnly
              ? 'Showing my pending items (click to clear)'
              : kpiStats.pendingMySignOff > 0
                ? 'Click to filter unread mandatory SOPs'
                : 'All mandatory documents acknowledged'}
          </p>
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Team Avg Compliance</span>
            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {kpiStats.avgCompliance}%
          </p>
          <div className="mt-2">{renderProgressBar(kpiStats.avgCompliance)}</div>
        </div>
      </section>

      {/* Filter Toolbar & Controls */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="relative w-full min-w-0 flex-1 sm:min-w-[230px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Document Code (SOP-QA-01), Title, Author, Department..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
              />
            </div>

            <select
              aria-label="Filter by Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="All">All Departments</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={mandatoryOnly}
                onChange={(e) => setMandatoryOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
              />
              <span>Mandatory Read Only</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Cards / Table View Toggle */}
            <div
              role="group"
              aria-label="SOP Library Layout"
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950"
            >
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
            </div>

            {canManageSops ? (
              <button
                type="button"
                onClick={openPublishModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Publish New SOP</span>
              </button>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-500 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <Lock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span>Read-Only Access (Viewer)</span>
              </span>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          {(['All', ...SOP_CATEGORIES] as const).map((cat) => {
            const count =
              cat === 'All'
                ? sops.length
                : sops.filter((s) => s.category === cat).length;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`rounded px-1.5 py-0.2 font-mono text-[10px] tabular-nums ${
                    active
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-200'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending Maker-Checker SOP Proposals */}
      {pendingCreatedSops.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <PendingApprovalBadge label={`${pendingCreatedSops.length} Pending Super Admin Approval`} />
            <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
              New SOP / Policy Drafts Awaiting Maker-Checker Review
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {pendingCreatedSops.map((chg) => (
              <div
                key={chg.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-amber-200/90 bg-white px-3.5 py-2.5 dark:border-amber-900/60 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                      {chg.itemLabel}
                    </span>
                    <PendingApprovalBadge compact />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{chg.summary}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    By {chg.editorName} ({chg.editorDepartment}) · {formatDateTime(chg.submittedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredSops.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            No documents match your current filters
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Reset category or search filters{canManageSops ? ', or publish a new corporate SOP' : ''}.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('All');
                setDepartmentFilter('All');
                setMandatoryOnly(false);
                setPendingMineOnly(false);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Reset Filters
            </button>
            {canManageSops && (
              <button
                type="button"
                onClick={openPublishModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Publish New SOP</span>
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        /* Categorized Card Grid */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSops.map((sop) => {
            const compliance = computeSopCompliance(sop, teamMembers);
            const myAck = sop.acknowledgments.find((ack) =>
              matchesMemberAck(ack, currentUser),
            );
            return (
              <article
                key={sop.id}
                onClick={() => setReaderSopId(sop.id)}
                className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <div>
                  {/* Top Metadata Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 tabular-nums dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {sop.code}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {sop.version}
                      </span>
                      {sop.approvalStamp && (
                        <span
                          title={`${sop.approvalStamp.badgeLabel} (${formatDateTime(sop.approvalStamp.stampedAt)})`}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
                        >
                          <BadgeCheck className="h-3 w-3" />
                          VERIFIED &amp; APPROVED
                        </span>
                      )}
                      {renderWorkflowBadge(getSopWorkflowStatus(sop))}
                      {pendingSopEditIds.has(sop.id) && <PendingApprovalBadge compact />}
                    </div>

                    {/* Mandatory Read Toggle / Badge */}
                    {canManageSops ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={sop.mandatoryRead}
                        aria-label={`Toggle mandatory read for ${sop.code}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMandatory(sop.id);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          sop.mandatoryRead
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60'
                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            sop.mandatoryRead ? 'bg-amber-600 dark:bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                        <span>{sop.mandatoryRead ? 'Mandatory' : 'Optional'}</span>
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                          sop.mandatoryRead
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {sop.mandatoryRead ? 'Mandatory Read' : 'Reference'}
                      </span>
                    )}
                  </div>

                  {/* Category & Title */}
                  <div className="mt-3">{renderCategoryBadge(sop.category)}</div>
                  <h3 className="mt-2 font-display text-sm font-bold leading-snug text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-400">
                    {sop.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {sop.purpose}
                  </p>

                  {/* Dept & Effective Date */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{sop.department}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Effective {formatShortDate(sop.effectiveDate)}</span>
                    <span aria-hidden="true">·</span>
                    <span>By {sop.authorName}</span>
                  </div>
                  {getSopWorkflowStatus(sop) === 'Rejected' && sop.rejectionReason && (
                    <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
                      <span className="font-bold">Rejected: </span>
                      <span className="line-clamp-2">{sop.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {/* Compliance Progress Bar & User Sign-Off Footer */}
                <div className="mt-4 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                      {compliance.percent}% Team Acknowledged
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {compliance.acknowledgedCount}/{compliance.totalCount} staff
                    </span>
                  </div>
                  <div className="mt-1.5">{renderProgressBar(compliance.percent)}</div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    {myAck ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Acknowledged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {sop.mandatoryRead ? 'Sign-Off Required' : 'Pending Review'}
                        </span>
                      </span>
                    )}

                    <span className="text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 whitespace-nowrap dark:text-indigo-400 dark:group-hover:text-indigo-300">
                      Read &amp; Sign →
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-3 pr-3 pl-5">Doc Code</th>
                  <th className="px-3 py-3">Document Title &amp; Category</th>
                  <th className="px-3 py-3">Version</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Effective Date</th>
                  <th className="px-3 py-3">Mandatory</th>
                  <th className="px-3 py-3">Team Compliance</th>
                  <th className="py-3 pr-5 pl-3 text-right">Sign-Off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSops.map((sop) => {
                  const compliance = computeSopCompliance(sop, teamMembers);
                  const myAck = sop.acknowledgments.find((ack) =>
                    matchesMemberAck(ack, currentUser),
                  );
                  return (
                    <tr
                      key={sop.id}
                      onClick={() => setReaderSopId(sop.id)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3.5 pr-3 pl-5 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap dark:text-indigo-400">
                        {sop.code}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{sop.title}</p>
                          {sop.approvalStamp && (
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <BadgeCheck className="h-3 w-3" />
                              VERIFIED &amp; APPROVED
                            </span>
                          )}
                          {renderWorkflowBadge(getSopWorkflowStatus(sop))}
                          {pendingSopEditIds.has(sop.id) && <PendingApprovalBadge compact />}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {renderCategoryBadge(sop.category)}
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Author: {sop.authorName}
                          </span>
                        </div>
                        {getSopWorkflowStatus(sop) === 'Rejected' && sop.rejectionReason && (
                          <p className="mt-1 max-w-md truncate text-[11px] font-medium text-rose-700 dark:text-rose-300">
                            Rejection Reason: {sop.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {sop.version}
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap dark:text-slate-300">
                        {sop.department}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap dark:text-slate-400">
                        {formatShortDate(sop.effectiveDate)}
                      </td>
                      <td
                        className="px-3 py-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canManageSops ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={sop.mandatoryRead}
                            onClick={() => onToggleMandatory(sop.id)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                              sop.mandatoryRead
                                ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60'
                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${
                                sop.mandatoryRead ? 'bg-amber-600 dark:bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            />
                            <span>{sop.mandatoryRead ? 'Mandatory' : 'Optional'}</span>
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {sop.mandatoryRead ? 'Mandatory' : 'Optional'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 min-w-[170px]">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                            {compliance.percent}% Acknowledged
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                            {compliance.acknowledgedCount}/{compliance.totalCount}
                          </span>
                        </div>
                        <div className="mt-1">{renderProgressBar(compliance.percent)}</div>
                      </td>
                      <td className="py-3.5 pr-5 pl-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReaderSopId(sop.id);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            myAck
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                              : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60'
                          }`}
                        >
                          {myAck ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Signed</span>
                            </>
                          ) : (
                            <>
                              <ClipboardList className="h-3.5 w-3.5" />
                              <span>Read &amp; Sign</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SOP Reader & Employee Compliance Sign-Off Modal */}
      {activeReaderSop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sop-reader-title"
        >
          {(() => {
            const compliance = computeSopCompliance(activeReaderSop, teamMembers);
            const myAck = activeReaderSop.acknowledgments.find((ack) =>
              matchesMemberAck(ack, currentUser),
            );
            return (
              <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700 tabular-nums dark:border-indigo-800/60 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {activeReaderSop.code}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {activeReaderSop.version}
                      </span>
                      {renderCategoryBadge(activeReaderSop.category)}
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          activeReaderSop.mandatoryRead
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {activeReaderSop.mandatoryRead ? 'Mandatory Read' : 'Reference Policy'}
                      </span>
                      {activeReaderSop.approvalStamp && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          <span>{activeReaderSop.approvalStamp.badgeLabel}</span>
                        </span>
                      )}
                      {renderWorkflowBadge(getSopWorkflowStatus(activeReaderSop))}
                    </div>
                    <h2
                      id="sop-reader-title"
                      className="mt-2 font-display text-lg font-bold text-slate-900 dark:text-slate-100"
                    >
                      {activeReaderSop.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Department: <strong className="text-slate-700 dark:text-slate-200">{activeReaderSop.department}</strong>{' '}
                      · Effective Date:{' '}
                      <strong className="font-mono text-slate-700 tabular-nums dark:text-slate-200">
                        {formatShortDate(activeReaderSop.effectiveDate)}
                      </strong>{' '}
                      · Owner: <strong className="text-slate-700 dark:text-slate-200">{activeReaderSop.authorName}</strong>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReaderShowHistory((prev) => !prev)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        readerShowHistory
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>History ({(activeReaderSop.versions?.length ?? 0) + 1})</span>
                    </button>
                    {canManageSops && onReviseSop && (
                      <button
                        type="button"
                        onClick={() => openReviseModal(activeReaderSop)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800/70 dark:bg-indigo-950/60 dark:text-indigo-300"
                      >
                        <FileEdit className="h-3.5 w-3.5" />
                        <span>New Revision</span>
                      </button>
                    )}
                    {isSuperAdmin && onTransitionSopWorkflow && (
                      <>
                        {getSopWorkflowStatus(activeReaderSop) === 'Submitted' && (
                          <button
                            type="button"
                            onClick={() => onTransitionSopWorkflow(activeReaderSop.id, 'Under Review')}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span>Under Review</span>
                          </button>
                        )}
                        {getSopWorkflowStatus(activeReaderSop) !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() => onTransitionSopWorkflow(activeReaderSop.id, 'Approved')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                        )}
                        {getSopWorkflowStatus(activeReaderSop) !== 'Rejected' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectSopTarget(activeReaderSop);
                              setRejectSopReason('');
                              setRejectSopError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        )}
                      </>
                    )}
                    {isSuperAdmin && onStampSop && !activeReaderSop.approvalStamp && (
                      <button
                        type="button"
                        onClick={() => onStampSop(activeReaderSop.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        <span>Stamp &amp; Approve</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReaderSopId(null);
                        setReaderShowHistory(false);
                      }}
                      aria-label="Close SOP reader"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                  {getSopWorkflowStatus(activeReaderSop) === 'Rejected' && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-bold">
                          SOP Sign-Off Rejected
                          {activeReaderSop.reviewedBy ? ` by ${activeReaderSop.reviewedBy}` : ''}
                          {activeReaderSop.reviewedAt ? ` · ${formatDateTime(activeReaderSop.reviewedAt)}` : ''}
                        </p>
                        <p className="text-rose-800 dark:text-rose-300">
                          <span className="font-semibold">Rejection Reason: </span>
                          {activeReaderSop.rejectionReason || 'Rejected during SOP governance review.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Structured SOP Sections */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                      <h3 className="text-xs font-bold tracking-wide text-indigo-700 dark:text-indigo-400">
                        01. PURPOSE
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {activeReaderSop.purpose}
                      </p>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                      <h3 className="text-xs font-bold tracking-wide text-indigo-700 dark:text-indigo-400">
                        02. SCOPE
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {activeReaderSop.scope}
                      </p>
                    </section>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <h3 className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100">
                      03. STEP-BY-STEP PROCEDURE
                    </h3>
                    <ol className="mt-3 space-y-2.5">
                      {activeReaderSop.procedureSteps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-50 font-mono text-[11px] font-bold text-indigo-700 tabular-nums dark:bg-indigo-950/60 dark:text-indigo-300">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <h3 className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100">
                      04. COMPLIANCE RULES &amp; GOVERNANCE CONTROLS
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {activeReaderSop.complianceRules.map((rule, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="leading-relaxed">{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* Team Compliance Progress & Sign-Off Tracking */}
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Compliance Acknowledgment Progress
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {compliance.acknowledgedCount} of {compliance.totalCount} active corporate
                          staff digitally signed off
                        </p>
                      </div>
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700 tabular-nums dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {compliance.percent}% Team Acknowledged
                      </span>
                    </div>

                    <div className="mt-2.5">{renderProgressBar(compliance.percent)}</div>

                    {/* Detailed Employee Roster for Admins & Managers */}
                    {canManageSops && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Acknowledged ({activeReaderSop.acknowledgments.length})
                          </p>
                          {activeReaderSop.acknowledgments.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No sign-offs recorded yet.</p>
                          ) : (
                            <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                              {activeReaderSop.acknowledgments.map((ack) => (
                                <li
                                  key={`${ack.userId}-${ack.acknowledgedAt}`}
                                  className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-slate-800"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                      {ack.userName}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                                      {ack.signOffTitle || ack.role} · {ack.department}
                                    </p>
                                  </div>
                                  <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                                    {formatDateTime(ack.acknowledgedAt)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            Pending Sign-Off ({compliance.pendingMembers.length})
                          </p>
                          {compliance.pendingMembers.length === 0 ? (
                            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                              100% of active staff have acknowledged.
                            </p>
                          ) : (
                            <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                              {compliance.pendingMembers.map((member) => (
                                <li
                                  key={member.id}
                                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-slate-800"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                      {member.name}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                                      {member.department} · {member.role}
                                    </p>
                                  </div>
                                  <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                                    {member.employeeId}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Version History Accordion */}
                  {readerShowHistory && (
                    <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                        <History className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>SOP Version History</span>
                      </h3>
                      <div className="mt-3 space-y-2">
                        <div className="rounded-lg border border-indigo-200 bg-white p-3 text-xs dark:border-indigo-900/60 dark:bg-slate-900">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                                {activeReaderSop.version}
                              </span>
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                Active Version
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {formatDateTime(activeReaderSop.updatedAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-slate-600 dark:text-slate-300">
                            Effective {formatShortDate(activeReaderSop.effectiveDate)} · Author: {activeReaderSop.authorName}
                          </p>
                        </div>
                        {(activeReaderSop.versions ?? [])
                          .slice()
                          .reverse()
                          .map((rev, idx) => (
                            <div
                              key={`${rev.version}-${rev.updatedAt}-${idx}`}
                              className="rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {rev.version}
                                  </span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    Archived by {rev.updatedBy}
                                  </span>
                                </div>
                                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  {formatDateTime(rev.updatedAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-600 dark:text-slate-400">
                                {rev.changeNote}
                              </p>
                            </div>
                          ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Modal Footer: Digital Sign-Off Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Signing Identity: {currentUser.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {currentUser.signOffTitle || currentUser.title} · {currentUser.employeeId}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setReaderSopId(null)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Close
                    </button>

                    {myAck ? (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          Acknowledged · {formatDateTime(myAck.acknowledgedAt)}
                        </span>
                      </div>
                    ) : isViewer ? (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        <span>Read-Only Access (Viewer)</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeSop(activeReaderSop.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>I Have Read &amp; Acknowledge Compliance</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Publish New SOP Modal (Admin / Manager Only) */}
      {publishOpen && canManageSops && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-sop-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2
                  id="publish-sop-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Publish New SOP / Governance Policy
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Author structured corporate guidance with optional mandatory employee sign-off
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                aria-label="Close publish modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handlePublishSubmit}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
            >
              {pubError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {pubError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="sop-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Document Code <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    id="sop-code"
                    type="text"
                    value={pubCode}
                    onChange={(e) => {
                      setPubCode(e.target.value);
                      setPubError(null);
                    }}
                    placeholder="SOP-QA-02"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="sop-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Document Title <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    id="sop-title"
                    type="text"
                    value={pubTitle}
                    onChange={(e) => {
                      setPubTitle(e.target.value);
                      setPubError(null);
                    }}
                    placeholder="e.g. Incident Post-Mortem & SLA Escalation Protocol"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label htmlFor="sop-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    id="sop-cat"
                    value={pubCategory}
                    onChange={(e) =>
                      handlePublishCategoryChange(e.target.value as SopCategory)
                    }
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {SOP_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sop-ver" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Version
                  </label>
                  <input
                    id="sop-ver"
                    type="text"
                    value={pubVersion}
                    onChange={(e) => setPubVersion(e.target.value)}
                    placeholder="v1.0"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label htmlFor="sop-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Effective Date
                  </label>
                  <input
                    id="sop-date"
                    type="date"
                    value={pubEffectiveDate}
                    onChange={(e) => setPubEffectiveDate(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="sop-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Owning Department
                  </label>
                  <select
                    id="sop-dept"
                    value={pubDepartment}
                    onChange={(e) => setPubDepartment(e.target.value as Department)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 dark:border-slate-700 dark:bg-slate-950">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Mandatory Employee Read &amp; Sign-Off
                    </span>
                    <input
                      type="checkbox"
                      checked={pubMandatory}
                      onChange={(e) => setPubMandatory(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="sop-purpose" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  1. Purpose <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  id="sop-purpose"
                  rows={2}
                  value={pubPurpose}
                  onChange={(e) => {
                    setPubPurpose(e.target.value);
                    setPubError(null);
                  }}
                  placeholder="Describe why this SOP or policy exists and what operational risk it mitigates..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label htmlFor="sop-scope" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Scope <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  id="sop-scope"
                  rows={2}
                  value={pubScope}
                  onChange={(e) => {
                    setPubScope(e.target.value);
                    setPubError(null);
                  }}
                  placeholder="Specify teams, systems, vendors, or request categories governed by this document..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="sop-steps" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    3. Step-by-Step Procedure <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">One step per line</span>
                </div>
                <textarea
                  id="sop-steps"
                  rows={4}
                  value={pubStepsText}
                  onChange={(e) => {
                    setPubStepsText(e.target.value);
                    setPubError(null);
                  }}
                  placeholder={
                    'Verify staging validation logs before submitting request.\nAttach asset tag or project code when applicable.\nObtain Editor / QA Reviewer sign-off prior to deployment.'
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="sop-rules" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    4. Compliance Rules <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">One rule per line</span>
                </div>
                <textarea
                  id="sop-rules"
                  rows={3}
                  value={pubRulesText}
                  onChange={(e) => {
                    setPubRulesText(e.target.value);
                    setPubError(null);
                  }}
                  placeholder={
                    'Zero mandatory QA gates may be bypassed without Admin override.\nAll deviations must be recorded in the NexOps audit trail.'
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Publish to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New SOP Revision Modal */}
      {reviseModalSop && onReviseSop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Publish New Revision — {reviseModalSop.code}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Archives {reviseModalSop.version} in Version History and updates live SOP content
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviseModalSop(null)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleReviseSubmit}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
            >
              {revError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  {revError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    New Version *
                  </label>
                  <input
                    type="text"
                    required
                    value={revVersion}
                    onChange={(e) => setRevVersion(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={revEffectiveDate}
                    onChange={(e) => setRevEffectiveDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Change Summary *
                  </label>
                  <input
                    type="text"
                    required
                    value={revNote}
                    onChange={(e) => setRevNote(e.target.value)}
                    placeholder="Reason for revision..."
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Purpose
                </label>
                <textarea
                  rows={2}
                  value={revPurpose}
                  onChange={(e) => setRevPurpose(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Scope
                </label>
                <textarea
                  rows={2}
                  value={revScope}
                  onChange={(e) => setRevScope(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step-by-Step Procedure (one per line)
                </label>
                <textarea
                  rows={4}
                  value={revStepsText}
                  onChange={(e) => setRevStepsText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Compliance Rules (one per line)
                </label>
                <textarea
                  rows={3}
                  value={revRulesText}
                  onChange={(e) => setRevRulesText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReviseModalSop(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Save Revision {revVersion}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory SOP Rejection Reason Modal */}
      {rejectSopTarget && onTransitionSopWorkflow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-label="Reject SOP Policy"
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3.5 text-white sm:px-6">
              <div className="min-w-0">
                <h2 className="truncate font-display text-sm font-bold">
                  Reject SOP · {rejectSopTarget.code}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-slate-300">
                  {rejectSopTarget.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRejectSopTarget(null);
                  setRejectSopReason('');
                  setRejectSopError(null);
                }}
                aria-label="Close rejection modal"
                className="shrink-0 rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = rejectSopReason.trim();
                if (trimmed.length < 3) {
                  setRejectSopError('Please enter a clear rejection reason (minimum 3 characters).');
                  return;
                }
                onTransitionSopWorkflow(rejectSopTarget.id, 'Rejected', trimmed);
                setRejectSopTarget(null);
                setRejectSopReason('');
                setRejectSopError(null);
              }}
              className="space-y-4 p-4 sm:p-6"
            >
              {rejectSopError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {rejectSopError}
                </div>
              )}

              <div>
                <label
                  htmlFor="sop-rejection-reason"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Rejection Reason <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <textarea
                  id="sop-rejection-reason"
                  rows={3}
                  required
                  value={rejectSopReason}
                  onChange={(e) => {
                    setRejectSopReason(e.target.value);
                    setRejectSopError(null);
                  }}
                  placeholder="Specify policy gap, compliance issue, or required revision..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Recorded in Audit Trail and shown visibly on this SOP.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setRejectSopTarget(null);
                    setRejectSopReason('');
                    setRejectSopError(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
