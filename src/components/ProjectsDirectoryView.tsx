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
import { BudgetHealthBar } from './StatusIndicator';

interface ProjectsDirectoryViewProps {
  projects: CompanyProject[];
  requests: OperationalRequest[];
  activeRole: Role;
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
  departments,
  teamMembers,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onFilterQueueByProject,
}: ProjectsDirectoryViewProps) {
  const canManage = activeRole === 'Admin' || activeRole === 'Editor';

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
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Active</span>
        </span>
      );
    }
    if (s === 'On Hold') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
          <PauseCircle className="h-3 w-3 shrink-0" />
          <span>On Hold</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
        <Clock className="h-3 w-3 shrink-0" />
        <span>Completed</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Registered Engagements</span>
            <FolderKanban className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {projects.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Projects, clients &amp; vendor programs</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Programs</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {activeCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Available for request linking</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">On Hold / Completed</span>
            <Briefcase className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {onHoldOrCompletedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Paused or archived engagements</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Portfolio Budget Utilization</span>
            <Wallet className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
              {financialRollup.utilPct}%
            </p>
            <span
              className={`font-mono text-[11px] font-semibold tabular-nums ${
                financialRollup.overBudgetCount > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {financialRollup.overBudgetCount > 0
                ? `${financialRollup.overBudgetCount} over budget`
                : 'Within budget'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
            {formatCurrency(financialRollup.totalSpendUsd, 'USD')} /{' '}
            {formatCurrency(financialRollup.totalEstUsd, 'USD')} eq.
          </p>
        </div>
      </section>

      {/* Role Notice for Staff */}
      {!canManage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Viewing directory in read-only mode as <strong>{activeRole}</strong>.{' '}
            <strong>Admin</strong> or <strong>Editor</strong> permissions are required to add,
            edit, or update project statuses.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Project Code (PRJ-101), Client Name, Lead Manager..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
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
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              );
            })}
          </div>
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            role="group"
            aria-label="Projects layout switcher"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
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
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
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

      {/* Directory Display: Cards Grid OR Table View */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="font-display text-sm font-semibold text-slate-900">
            No projects or clients match your search
          </p>
          <p className="mt-1 text-xs text-slate-500">
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
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums">
                          {proj.code}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                          {cur}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {proj.type}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-display text-sm font-bold text-slate-900">
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
                        className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
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

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-[11px] text-slate-400">Lead Manager</span>
                      <p className="font-semibold text-slate-800">{proj.leadManager}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400">Department · Hours</span>
                      <p className="font-semibold text-slate-800">
                        {proj.department} ·{' '}
                        <span className="font-mono tabular-nums">
                          {proj.budgetHours.toLocaleString()}h
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Cost-Center Budget Health Box */}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-slate-700">
                        Cost-Center Budget Utilization
                      </span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          tone === 'rose'
                            ? 'text-rose-700'
                            : tone === 'amber'
                              ? 'text-amber-800'
                              : 'text-emerald-700'
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

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600">
                      <span>
                        Actual:{' '}
                        <strong className="font-mono text-slate-900 tabular-nums">
                          {formatCurrency(spend, cur)}
                        </strong>
                      </span>
                      <span>
                        Budget:{' '}
                        <strong className="font-mono text-slate-900 tabular-nums">
                          {formatCurrency(est, cur)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div>
                    {linkedCount > 0 && onFilterQueueByProject ? (
                      <button
                        type="button"
                        onClick={() => onFilterQueueByProject(proj.code)}
                        className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-semibold text-indigo-700 tabular-nums hover:bg-indigo-100"
                      >
                        {linkedCount} linked request{linkedCount > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        0 linked requests
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(proj)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
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
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(proj.id)}
                          aria-label={`Delete ${proj.code}`}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((proj) => {
                  const linkedCount = getLinkedRequestsCount(proj);
                  const cur = proj.currency || 'USD';
                  const est = proj.estimatedBudget ?? 0;
                  const spend = proj.actualSpend ?? 0;
                  const utilPct = getBudgetUtilizationPct(est, spend);
                  return (
                    <tr key={proj.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="py-3.5 pr-3 pl-5 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                        {proj.code}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="font-semibold text-slate-900">{proj.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {proj.type} · Updated {formatDateTime(proj.updatedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-800">{proj.leadManager}</p>
                        <p className="text-[11px] text-slate-500">{proj.department}</p>
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
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
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
                      <td className="px-3 py-3.5 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                        <span className="font-semibold">{formatCurrency(spend, cur)}</span>
                        <span className="text-slate-400"> / {formatCurrency(est, cur)}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <BudgetHealthBar utilizationPct={utilPct} />
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                        {proj.budgetHours.toLocaleString()}h
                      </td>
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        {linkedCount > 0 && onFilterQueueByProject ? (
                          <button
                            type="button"
                            onClick={() => onFilterQueueByProject(proj.code)}
                            className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 tabular-nums hover:bg-indigo-100"
                          >
                            {linkedCount} req{linkedCount > 1 ? 's' : ''}
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-slate-400 tabular-nums">
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
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
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
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(proj.id)}
                                aria-label={`Delete ${proj.code}`}
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-modal-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="project-modal-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  {editingProject ? `Edit ${editingProject.code}` : 'Register Project / Client'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Associate operational requests and QA audits with active engagements
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 px-6 py-5">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="prj-code" className="block text-xs font-semibold text-slate-700">
                    Project Code <span className="text-rose-600">*</span>
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="prj-name" className="block text-xs font-semibold text-slate-700">
                    Project / Client / Vendor Name <span className="text-rose-600">*</span>
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="prj-type" className="block text-xs font-semibold text-slate-700">
                    Engagement Type
                  </label>
                  <select
                    id="prj-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as ProjectType)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {PROJECT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-dept" className="block text-xs font-semibold text-slate-700">
                    Primary Department
                  </label>
                  <select
                    id="prj-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {availableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-lead" className="block text-xs font-semibold text-slate-700">
                    Lead Manager <span className="text-rose-600">*</span>
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <datalist id="nexops-lead-managers">
                    {availableManagers.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="prj-status" className="block text-xs font-semibold text-slate-700">
                    Status
                  </label>
                  <select
                    id="prj-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
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
                  <label htmlFor="prj-currency" className="block text-xs font-semibold text-slate-700">
                    Cost-Center Currency
                  </label>
                  <select
                    id="prj-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {SUPPORTED_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prj-budget" className="block text-xs font-semibold text-slate-700">
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="prj-spend" className="block text-xs font-semibold text-slate-700">
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
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="prj-hours" className="block text-xs font-semibold text-slate-700">
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
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {editingProject ? 'Save Changes' : 'Save Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
