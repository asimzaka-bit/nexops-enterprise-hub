import {
  Briefcase,
  CheckCircle2,
  Clock,
  Edit3,
  FolderKanban,
  LayoutGrid,
  PauseCircle,
  Plus,
  Search,
  ShieldAlert,
  Table2,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  CompanyProject,
  CurrencyCode,
  Department,
  OperationalRequest,
  PendingEditorChange,
  ProjectStatus,
  ProjectType,
  Role,
  SUPPORTED_CURRENCIES,
  TeamMember,
} from '../types/nexops';
import {
  formatCurrency,
  formatDateTime,
  getBudgetHealthTone,
  getBudgetUtilizationPct,
  toUsdEquivalent,
} from '../utils/storage';
import { BudgetHealthBar, PendingApprovalBadge } from './StatusIndicator';

interface ProjectsDirectoryViewProps {
  projects: CompanyProject[];
  requests: OperationalRequest[];
  activeRole: Role;
  currentUserEmail?: string;
  pendingEditorChanges?: PendingEditorChange[];
  departments: string[];
  teamMembers: TeamMember[];
  onCreateProject: (project: Omit<CompanyProject, 'id' | 'updatedAt'>) => void;
  onUpdateProject: (
    projectId: string,
    patch: Partial<Omit<CompanyProject, 'id' | 'updatedAt'>>,
  ) => void;
  onDeleteProject: (projectId: string) => void;
  onFilterQueueByProject?: (projectCode: string) => void;
}

const PROJECT_TYPES: ProjectType[] = [
  'Internal Project',
  'Client Engagement',
  'Vendor Program',
];

const PROJECT_STATUSES: ProjectStatus[] = ['Active', 'On Hold', 'Completed'];

function generateNextProjectCode(projects: CompanyProject[]): string {
  const maxNum = projects.reduce((max, p) => {
    const match = p.code.match(/^PRJ-(\d+)$/i);
    if (match) {
      const n = parseInt(match[1], 10);
      return n > max ? n : max;
    }
    return max;
  }, 100);
  return `PRJ-${maxNum + 1}`;
}

export function ProjectsDirectoryView({
  projects,
  requests,
  activeRole,
  currentUserEmail,
  pendingEditorChanges = [],
  departments,
  teamMembers,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onFilterQueueByProject,
}: ProjectsDirectoryViewProps) {
  const canManage = activeRole === 'Admin' || activeRole === 'Editor';

  const pendingProjectEditIds = useMemo(() => {
    const set = new Set<string>();
    for (const chg of pendingEditorChanges) {
      if (chg.status === 'pending' && chg.module === 'projects' && chg.action !== 'create') {
        set.add(chg.targetId);
      }
    }
    return set;
  }, [pendingEditorChanges]);

  const pendingCreatedProjects = useMemo(() => {
    if (!canManage) return [];
    const emailLower = (currentUserEmail ?? '').toLowerCase();
    return pendingEditorChanges.filter(
      (chg) =>
        chg.status === 'pending' &&
        chg.module === 'projects' &&
        chg.action === 'create' &&
        (activeRole === 'Admin' || chg.editorEmail.toLowerCase() === emailLower),
    );
  }, [pendingEditorChanges, activeRole, currentUserEmail, canManage]);

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'All'>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<CompanyProject | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('Internal Project');
  const [leadManager, setLeadManager] = useState('');
  const [department, setDepartment] = useState<Department>(departments[0] ?? 'Engineering');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [budgetHours, setBudgetHours] = useState('400');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [estimatedBudget, setEstimatedBudget] = useState('50000');
  const [actualSpend, setActualSpend] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);

  const availableManagers = useMemo(() => {
    return Array.from(
      new Set([
        ...teamMembers.filter((m) => m.active).map((m) => m.name),
        ...projects.map((p) => p.leadManager),
      ]),
    ).filter(Boolean);
  }, [teamMembers, projects]);

  const availableDepartments = useMemo(
    () => Array.from(new Set([...departments, ...projects.map((p) => p.department)])),
    [departments, projects],
  );

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.leadManager.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [projects, searchQuery, statusFilter]);

  const activeCount = projects.filter((p) => p.status === 'Active').length;
  const onHoldOrCompletedCount = projects.filter((p) => p.status !== 'Active').length;

  const financialRollup = useMemo(() => {
    const totalEstUsd = projects.reduce(
      (sum, p) => sum + toUsdEquivalent(p.estimatedBudget || 0, p.currency || 'USD'),
      0,
    );
    const totalSpendUsd = projects.reduce(
      (sum, p) => sum + toUsdEquivalent(p.actualSpend || 0, p.currency || 'USD'),
      0,
    );
    const utilPct = getBudgetUtilizationPct(totalEstUsd, totalSpendUsd);
    const overBudgetCount = projects.filter(
      (p) => getBudgetUtilizationPct(p.estimatedBudget || 0, p.actualSpend || 0) > 100,
    ).length;
    return { totalEstUsd, totalSpendUsd, utilPct, overBudgetCount };
  }, [projects]);

  const getLinkedRequestsCount = (proj: CompanyProject) =>
    requests.filter(
      (r) =>
        r.projectId === proj.id ||
        (r.projectCode && r.projectCode.toLowerCase() === proj.code.toLowerCase()),
    ).length;

  const openCreateModal = () => {
    setEditingProject(null);
    setCode(generateNextProjectCode(projects));
    setName('');
    setType('Internal Project');
    setLeadManager(availableManagers[0] ?? '');
    setDepartment(availableDepartments[0] ?? 'Engineering');
    setStatus('Active');
    setBudgetHours('400');
    setCurrency('USD');
    setEstimatedBudget('50000');
    setActualSpend('0');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (proj: CompanyProject) => {
    setEditingProject(proj);
    setCode(proj.code);
    setName(proj.name);
    setType(proj.type);
    setLeadManager(proj.leadManager);
    setDepartment(proj.department);
    setStatus(proj.status);
    setBudgetHours(String(proj.budgetHours));
    setCurrency(proj.currency || 'USD');
    setEstimatedBudget(String(proj.estimatedBudget ?? 0));
    setActualSpend(String(proj.actualSpend ?? 0));
    setFormError(null);
    setModalOpen(true);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanLead = leadManager.trim();
    const parsedHours = Number(budgetHours);
    const parsedEstBudget = Number(estimatedBudget);
    const parsedActualSpend = Number(actualSpend);

    if (!cleanCode) {
      setFormError('Project code is required (e.g. PRJ-106).');
      return;
    }
    if (!cleanName) {
      setFormError('Project, Client, or Vendor name is required.');
      return;
    }
    if (!cleanLead) {
      setFormError('Lead Manager is required.');
      return;
    }
    if (Number.isNaN(parsedHours) || parsedHours < 0) {
      setFormError('Budget / Target Hours must be a non-negative number.');
      return;
    }
    if (Number.isNaN(parsedEstBudget) || parsedEstBudget < 0) {
      setFormError('Estimated Cost / Budget must be a non-negative number.');
      return;
    }
    if (Number.isNaN(parsedActualSpend) || parsedActualSpend < 0) {
      setFormError('Actual Spend must be a non-negative number.');
      return;
    }

    const duplicateCode = projects.some(
      (p) =>
        p.code.toLowerCase() === cleanCode.toLowerCase() &&
        (!editingProject || p.id !== editingProject.id),
    );
    if (duplicateCode) {
      setFormError(`Project code "${cleanCode}" already exists in the directory.`);
      return;
    }

    if (editingProject) {
      onUpdateProject(editingProject.id, {
        code: cleanCode,
        name: cleanName,
        type,
        leadManager: cleanLead,
        department,
        status,
        budgetHours: Math.round(parsedHours),
        currency,
        estimatedBudget: Math.round(parsedEstBudget),
        actualSpend: Math.round(parsedActualSpend),
      });
    } else {
      onCreateProject({
        code: cleanCode,
        name: cleanName,
        type,
        leadManager: cleanLead,
        department,
        status,
        budgetHours: Math.round(parsedHours),
        currency,
        estimatedBudget: Math.round(parsedEstBudget),
        actualSpend: Math.round(parsedActualSpend),
      });
    }
    setModalOpen(false);
  };

  const renderStatusBadge = (s: ProjectStatus) => {
    if (s === 'Active') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Active</span>
        </span>
      );
    }
    if (s === 'On Hold') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
          <PauseCircle className="h-3 w-3 shrink-0" />
          <span>On Hold</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Clock className="h-3 w-3 shrink-0" />
        <span>Completed</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Registered Engagements</span>
            <FolderKanban className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {projects.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Projects, clients &amp; vendor programs</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Programs</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Available for request linking</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">On Hold / Completed</span>
            <Briefcase className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {onHoldOrCompletedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Paused or archived engagements</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Portfolio Budget Utilization</span>
            <Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {financialRollup.utilPct}%
            </p>
            <span
              className={`font-mono text-[11px] font-semibold tabular-nums ${
                financialRollup.overBudgetCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {financialRollup.overBudgetCount > 0
                ? `${financialRollup.overBudgetCount} over budget`
                : 'Within budget'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
            {formatCurrency(financialRollup.totalSpendUsd, 'USD')} /{' '}
            {formatCurrency(financialRollup.totalEstUsd, 'USD')} eq.
          </p>
        </div>
      </section>

      {/* Role Notice for Staff */}
      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Viewing directory in read-only mode as <strong>{activeRole}</strong>.{' '}
            <strong>Admin</strong> or <strong>Editor</strong> permissions are required to add,
            edit, or update project statuses.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px]">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Project Code (PRJ-101), Client Name, Lead Manager..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
            />
          </div>

          <div
            className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950"
            role="tablist"
            aria-label="Filter projects by status"
          >
            {(['All', ...PROJECT_STATUSES] as (ProjectStatus | 'All')[]).map((st) => {
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-indigo-600'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950"
            role="group"
            aria-label="Projects layout switcher"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Project / Client</span>
          </button>
        )}
      </div>

      {/* Pending Maker-Checker Project Proposals */}
      {pendingCreatedProjects.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <PendingApprovalBadge label={`${pendingCreatedProjects.length} Pending Super Admin Approval`} />
            <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
              New Project / Client Submissions Awaiting Maker-Checker Review
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {pendingCreatedProjects.map((chg) => (
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

      {/* Directory Display: Cards Grid OR Table View */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            No projects or clients match your search
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Adjust your status filter or register a new corporate project or vendor program.
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((proj) => {
            const linkedCount = getLinkedRequestsCount(proj);
            const cur = proj.currency || 'USD';
            const est = proj.estimatedBudget ?? 0;
            const spend = proj.actualSpend ?? 0;
            const utilPct = getBudgetUtilizationPct(est, spend);
            const tone = getBudgetHealthTone(utilPct);
            const variance = est - spend;

            return (
              <article
                key={proj.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums dark:text-indigo-400">
                          {proj.code}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {cur}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {proj.type}
                        </span>
                        {pendingProjectEditIds.has(proj.id) && <PendingApprovalBadge compact />}
                      </div>
                      <h3 className="mt-1.5 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        {proj.name}
                      </h3>
                    </div>

                    {canManage ? (
                      <select
                        aria-label={`Status for ${proj.code}`}
                        value={proj.status}
                        onChange={(e) =>
                          onUpdateProject(proj.id, {
                            status: e.target.value as ProjectStatus,
                          })
                        }
                        className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {PROJECT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    ) : (
                      renderStatusBadge(proj.status)
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">Lead Manager</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{proj.leadManager}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">Department · Hours</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {proj.department} ·{' '}
                        <span className="font-mono tabular-nums">
                          {proj.budgetHours.toLocaleString()}h
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Cost-Center Budget Health Box */}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Cost-Center Budget Utilization
                      </span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          tone === 'rose'
                            ? 'text-rose-700 dark:text-rose-400'
                            : tone === 'amber'
                              ? 'text-amber-800 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {variance >= 0
                          ? `${formatCurrency(variance, cur)} remaining`
                          : `${formatCurrency(Math.abs(variance), cur)} over`}
                      </span>
                    </div>

                    <div className="mt-2">
                      <BudgetHealthBar utilizationPct={utilPct} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                      <span>
                        Actual:{' '}
                        <strong className="font-mono text-slate-900 tabular-nums dark:text-slate-100">
                          {formatCurrency(spend, cur)}
                        </strong>
                      </span>
                      <span>
                        Budget:{' '}
                        <strong className="font-mono text-slate-900 tabular-nums dark:text-slate-100">
                          {formatCurrency(est, cur)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    {linkedCount > 0 && onFilterQueueByProject ? (
                      <button
                        type="button"
                        onClick={() => onFilterQueueByProject(proj.code)}
                        className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-semibold text-indigo-700 tabular-nums hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                      >
                        {linkedCount} linked request{linkedCount > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                        0 linked requests
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(proj)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      {confirmDeleteId === proj.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProject(proj.id);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(proj.id)}
                          aria-label={`Delete ${proj.code}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="py-3 pr-3 pl-5">Project Code</th>
                  <th className="px-3 py-3">Project / Client / Vendor</th>
                  <th className="px-3 py-3">Lead &amp; Dept</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Cost-Center Spend / Budget</th>
                  <th className="px-3 py-3 w-40">Budget Health</th>
                  <th className="px-3 py-3 text-right">Target Hours</th>
                  <th className="px-3 py-3 text-right">Linked Requests</th>
                  {canManage && <th className="py-3 pr-5 pl-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProjects.map((proj) => {
                  const linkedCount = getLinkedRequestsCount(proj);
                  const cur = proj.currency || 'USD';
                  const est = proj.estimatedBudget ?? 0;
                  const spend = proj.actualSpend ?? 0;
                  const utilPct = getBudgetUtilizationPct(est, spend);
                  return (
                    <tr key={proj.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="py-3.5 pr-3 pl-5 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap dark:text-indigo-400">
                        {proj.code}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{proj.name}</p>
                          {pendingProjectEditIds.has(proj.id) && <PendingApprovalBadge compact />}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {proj.type} · Updated {formatDateTime(proj.updatedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{proj.leadManager}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{proj.department}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        {canManage ? (
                          <select
                            aria-label={`Status for ${proj.code}`}
                            value={proj.status}
                            onChange={(e) =>
                              onUpdateProject(proj.id, {
                                status: e.target.value as ProjectStatus,
                              })
                            }
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                          >
                            {PROJECT_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        ) : (
                          renderStatusBadge(proj.status)
                        )}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                        <span className="font-semibold">{formatCurrency(spend, cur)}</span>
                        <span className="text-slate-400 dark:text-slate-500"> / {formatCurrency(est, cur)}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <BudgetHealthBar utilizationPct={utilPct} />
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {proj.budgetHours.toLocaleString()}h
                      </td>
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        {linkedCount > 0 && onFilterQueueByProject ? (
                          <button
                            type="button"
                            onClick={() => onFilterQueueByProject(proj.code)}
                            className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 tabular-nums hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                          >
                            {linkedCount} req{linkedCount > 1 ? 's' : ''}
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-slate-400 tabular-nums dark:text-slate-500">
                            {linkedCount}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-3.5 pr-5 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(proj)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            {confirmDeleteId === proj.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteProject(proj.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(proj.id)}
                                aria-label={`Delete ${proj.code}`}
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Project Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-modal-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2
                  id="project-modal-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {editingProject ? `Edit ${editingProject.code}` : 'Register Project / Client'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Associate operational requests and QA audits with active engagements
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="prj-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Project Code <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    id="prj-code"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="PRJ-106"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="prj-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Project / Client / Vendor Name <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    id="prj-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="e.g. Northstar Enterprise Cloud Migration"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="prj-type" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Engagement Type
                  </label>
                  <select
                    id="prj-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as ProjectType)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {PROJECT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Primary Department
                  </label>
                  <select
                    id="prj-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {availableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-lead" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lead Manager <span className="text-rose-600 dark:text-rose-400">*</span>
                  </label>
                  <input
                    id="prj-lead"
                    type="text"
                    list="nexops-lead-managers"
                    value={leadManager}
                    onChange={(e) => {
                      setLeadManager(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="Select or enter lead manager name"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <datalist id="nexops-lead-managers">
                    {availableManagers.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="prj-status" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Status
                  </label>
                  <select
                    id="prj-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {PROJECT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="prj-currency" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cost-Center Currency
                  </label>
                  <select
                    id="prj-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {SUPPORTED_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-budget" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Estimated Budget ({currency})
                  </label>
                  <input
                    id="prj-budget"
                    type="number"
                    min={0}
                    step="any"
                    value={estimatedBudget}
                    onChange={(e) => {
                      setEstimatedBudget(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="prj-spend" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Actual Spend ({currency})
                  </label>
                  <input
                    id="prj-spend"
                    type="number"
                    min={0}
                    step="any"
                    value={actualSpend}
                    onChange={(e) => {
                      setActualSpend(e.target.value);
                      setFormError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="prj-hours" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Allocated Target Hours
                </label>
                <input
                  id="prj-hours"
                  type="number"
                  min={0}
                  step={10}
                  value={budgetHours}
                  onChange={(e) => {
                    setBudgetHours(e.target.value);
                    setFormError(null);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {activeRole === 'Editor'
                    ? 'Submit for Approval'
                    : editingProject
                      ? 'Save Changes'
                      : 'Save Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
