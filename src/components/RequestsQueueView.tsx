import {
  AlertCircle,
  Copy,
  Download,
  Eye,
  Filter,
  Kanban,
  Plus,
  RotateCcw,
  Search,
  Table2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Department,
  OperationalRequest,
  Priority,
  RequestStatus,
  Role,
} from '../types/nexops';
import {
  exportRequestsCsv,
  formatCurrency,
  formatShortDate,
  getOverdueDays,
  isRequestOverdue,
  requiresTwoTierApproval,
} from '../utils/storage';
import {
  AssetLinkBadge,
  DelegatedBadge,
  OverdueBadge,
  PriorityBadge,
  ProjectLinkBadge,
  SlaCountdownPill,
  StatusBadge,
  TwoTierBadge,
} from './StatusIndicator';

interface RequestsQueueViewProps {
  requests: OperationalRequest[];
  departments: string[];
  activeRole: Role;
  approvalBudgetThresholdUsd?: number;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  statusFilter: RequestStatus | 'All';
  onStatusFilterChange: (status: RequestStatus | 'All') => void;
  departmentFilter: Department | 'All';
  onDepartmentFilterChange: (dept: Department | 'All') => void;
  priorityFilter: Priority | 'All';
  onPriorityFilterChange: (priority: Priority | 'All') => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (val: boolean) => void;
  onSelectRequest: (request: OperationalRequest) => void;
  onDuplicateRequest: (request: OperationalRequest) => void;
  onBulkUpdatePriority: (requestIds: string[], priority: Priority) => void;
  onBulkExportSuccess: (count: number) => void;
  onOpenImportModal: () => void;
  onOpenCreateModal: () => void;
}

const STATUS_TABS: (RequestStatus | 'All')[] = [
  'All',
  'Draft',
  'Submitted',
  'Under QA Review',
  'Revision Required',
  'Approved',
  'Rejected',
];

const BOARD_COLUMNS: {
  status: RequestStatus;
  accentDot: string;
  headerBg: string;
}[] = [
  { status: 'Draft', accentDot: 'bg-slate-400', headerBg: 'bg-slate-50' },
  { status: 'Submitted', accentDot: 'bg-indigo-600', headerBg: 'bg-indigo-50/60' },
  { status: 'Under QA Review', accentDot: 'bg-amber-500', headerBg: 'bg-amber-50/60' },
  { status: 'Revision Required', accentDot: 'bg-rose-600', headerBg: 'bg-rose-50/60' },
  { status: 'Approved', accentDot: 'bg-emerald-600', headerBg: 'bg-emerald-50/60' },
];

const PRIORITIES: (Priority | 'All')[] = ['All', 'Urgent', 'High', 'Medium', 'Low'];
const BULK_PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

export function RequestsQueueView({
  requests,
  departments,
  activeRole,
  approvalBudgetThresholdUsd = 5000,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  overdueOnly,
  onOverdueOnlyChange,
  onSelectRequest,
  onDuplicateRequest,
  onBulkUpdatePriority,
  onBulkExportSuccess,
  onOpenImportModal,
  onOpenCreateModal,
}: RequestsQueueViewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState<Priority>('High');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const departmentFilterOptions = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set([...departments, ...requests.map((r) => r.department).filter(Boolean)]),
      ),
    ],
    [departments, requests],
  );

  const isViewer = activeRole !== 'Admin';
  const canBulkManage = activeRole === 'Admin';

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const overdueCount = requests.filter((r) => isRequestOverdue(r)).length;

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      !normalizedSearch ||
      req.id.toLowerCase().includes(normalizedSearch) ||
      req.title.toLowerCase().includes(normalizedSearch) ||
      req.submittedBy.toLowerCase().includes(normalizedSearch) ||
      req.category.toLowerCase().includes(normalizedSearch) ||
      (req.projectCode && req.projectCode.toLowerCase().includes(normalizedSearch)) ||
      (req.projectName && req.projectName.toLowerCase().includes(normalizedSearch)) ||
      (req.assetTag && req.assetTag.toLowerCase().includes(normalizedSearch)) ||
      (req.assetName && req.assetName.toLowerCase().includes(normalizedSearch));

    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    const matchesDept = departmentFilter === 'All' || req.department === departmentFilter;
    const matchesPriority = priorityFilter === 'All' || req.priority === priorityFilter;
    const matchesOverdue = !overdueOnly || isRequestOverdue(req);

    return matchesSearch && matchesStatus && matchesDept && matchesPriority && matchesOverdue;
  });

  const filteredIds = useMemo(
    () => filteredRequests.map((r) => r.id),
    [filteredRequests],
  );

  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => filteredIds.includes(id)),
    [selectedIds, filteredIds],
  );

  const allFilteredSelected =
    filteredRequests.length > 0 && activeSelectedIds.length === filteredRequests.length;
  const someFilteredSelected =
    activeSelectedIds.length > 0 && activeSelectedIds.length < filteredRequests.length;

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    statusFilter !== 'All' ||
    departmentFilter !== 'All' ||
    priorityFilter !== 'All' ||
    overdueOnly;

  const handleResetFilters = () => {
    onSearchQueryChange('');
    onStatusFilterChange('All');
    onDepartmentFilterChange('All');
    onPriorityFilterChange('All');
    onOverdueOnlyChange(false);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredIds);
    }
  };

  const toggleSelectRow = (requestId: string) => {
    setSelectedIds((prev) =>
      prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId],
    );
  };

  const handleBulkExport = () => {
    const selectedRows = filteredRequests.filter((r) => activeSelectedIds.includes(r.id));
    if (selectedRows.length === 0) return;
    exportRequestsCsv(selectedRows);
    onBulkExportSuccess(selectedRows.length);
  };

  const handleBulkApplyPriority = () => {
    if (activeSelectedIds.length === 0) return;
    onBulkUpdatePriority(activeSelectedIds, bulkPriority);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-5">
      {/* Top Bar: Segmented Status Tabs + View Switcher + CSV Import + Create CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1"
          role="tablist"
          aria-label="Filter requests by workflow status"
        >
          {STATUS_TABS.map((status) => {
            const active = statusFilter === status;
            const count =
              status === 'All'
                ? requests.length
                : requests.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onStatusFilterChange(status)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{status}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Table / Board View Switcher */}
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            role="group"
            aria-label="Queue layout view switcher"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>Table View</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              <span>Board View</span>
            </button>
          </div>

          {!isViewer && (
            <>
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5 text-indigo-600" />
                <span>Import Requests (CSV)</span>
              </button>

              <button
                type="button"
                onClick={onOpenCreateModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Operational Request</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search & Multi-Facet Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Filter by Request ID (REQ-2026-001), Title, Category, or Submitter..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filters:</span>
          </div>

          <label htmlFor="dept-filter" className="sr-only">
            Filter by Department
          </label>
          <select
            id="dept-filter"
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value as Department | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {departmentFilterOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept === 'All' ? 'All Departments' : dept}
              </option>
            ))}
          </select>

          <label htmlFor="priority-filter" className="sr-only">
            Filter by Priority
          </label>
          <select
            id="priority-filter"
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value as Priority | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {PRIORITIES.map((prio) => (
              <option key={prio} value={prio}>
                {prio === 'All' ? 'All Priorities' : `${prio} Priority`}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={overdueOnly}
            onClick={() => onOverdueOnlyChange(!overdueOnly)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              overdueOnly
                ? 'border-rose-700 bg-rose-600 text-white'
                : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Show Overdue Only</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                overdueOnly ? 'text-rose-100' : 'text-rose-600'
              }`}
            >
              ({overdueCount})
            </span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar (Table View, Admin / Manager only when rows are selected) */}
      {viewMode === 'table' && canBulkManage && activeSelectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Bulk workflow actions"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-indigo-900 tabular-nums">
              {activeSelectedIds.length} request{activeSelectedIds.length > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <X className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label htmlFor="bulk-priority-select" className="text-xs font-semibold text-indigo-950">
                Set Priority:
              </label>
              <select
                id="bulk-priority-select"
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value as Priority)}
                className="h-8 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                {BULK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkApplyPriority}
                className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
              >
                Apply Priority
              </button>
            </div>

            <div className="h-5 w-px bg-indigo-200 hidden sm:block" aria-hidden="true" />

            <button
              type="button"
              onClick={handleBulkExport}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-indigo-600" />
              <span>Export Selected CSV</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Queue Display: Table View OR Board View */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="font-display text-sm font-semibold text-slate-900">
            No operational requests match the current filters
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try clearing active search criteria or create a new submission to enter the QA queue.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear All Filters
              </button>
            )}
            {!isViewer && (
              <button
                type="button"
                onClick={onOpenCreateModal}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                New Operational Request
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'board' ? (
        /* Kanban Board View */
        <div
          className="flex gap-4 overflow-x-auto pb-2"
          aria-label="Kanban Board View by Request Status"
        >
          {BOARD_COLUMNS.map((col) => {
            const columnItems = filteredRequests.filter((r) => r.status === col.status);
            return (
              <section
                key={col.status}
                className="flex min-h-[420px] w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-100/70 xl:min-w-[235px] xl:flex-1"
              >
                <div
                  className={`flex items-center justify-between rounded-t-xl border-b border-slate-200 px-3.5 py-3 ${col.headerBg}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${col.accentDot}`}
                      aria-hidden="true"
                    />
                    <h3 className="truncate font-display text-xs font-bold text-slate-900">
                      {col.status}
                    </h3>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                    {columnItems.length}
                  </span>
                </div>

                <div className="flex-1 space-y-2.5 p-2.5">
                  {columnItems.length === 0 ? (
                    <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/40 px-3 text-center text-[11px] text-slate-400">
                      No requests in {col.status}
                    </div>
                  ) : (
                    columnItems.map((req) => {
                      const overdue = isRequestOverdue(req);
                      const overdueDays = overdue ? getOverdueDays(req.dueDate) : 0;
                      const doneChecks = req.checklist.filter((c) => c.checked).length;
                      return (
                        <div
                          key={req.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectRequest(req)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectRequest(req);
                            }
                          }}
                          className={`group cursor-pointer rounded-xl border bg-white p-3.5 text-left transition-all hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                            overdue ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-indigo-700 tabular-nums">
                              {req.id}
                            </span>
                            <div className="flex items-center gap-1">
                              {overdue && <OverdueBadge days={overdueDays} />}
                              <PriorityBadge priority={req.priority} />
                            </div>
                          </div>

                          <p className="mt-2 line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-indigo-700">
                            {req.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {req.category}
                          </p>

                          {(req.projectCode ||
                            req.assetTag ||
                            requiresTwoTierApproval(req, approvalBudgetThresholdUsd) ||
                            req.delegatedFromReviewer ||
                            (req.estimatedCost && req.estimatedCost > 0)) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {requiresTwoTierApproval(req, approvalBudgetThresholdUsd) && (
                                <TwoTierBadge
                                  stage1Completed={
                                    Boolean(req.stage1Approval) && req.status !== 'Approved'
                                  }
                                />
                              )}
                              {req.delegatedFromReviewer && (
                                <DelegatedBadge fromName={req.delegatedFromReviewer} />
                              )}
                              {req.estimatedCost && req.estimatedCost > 0 && (
                                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                                  {formatCurrency(req.estimatedCost, req.currency || 'USD')}
                                </span>
                              )}
                              {req.projectCode && (
                                <ProjectLinkBadge code={req.projectCode} name={req.projectName} />
                              )}
                              {req.assetTag && (
                                <AssetLinkBadge tag={req.assetTag} name={req.assetName} />
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                            <span className="truncate font-medium text-slate-700">
                              {req.department}
                            </span>
                            <span className="truncate">{req.submittedBy}</span>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <SlaCountdownPill
                              dueDate={req.dueDate}
                              status={req.status}
                              nowMs={nowMs}
                            />
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-500 tabular-nums">
                                QA {doneChecks}/{req.checklist.length}
                              </span>
                              {!isViewer && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateRequest(req);
                                  }}
                                  title={`Duplicate ${req.id} as Template`}
                                  aria-label={`Duplicate ${req.id} as template`}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  {canBulkManage && (
                    <th className="w-10 py-3 pr-1 pl-4">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={toggleSelectAll}
                        aria-label="Select all filtered requests"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th className={`py-3 pr-3 ${canBulkManage ? 'pl-2' : 'pl-5'}`}>ID</th>
                  <th className="px-3 py-3">Title &amp; Category</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Submitted By</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">QA Checks</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="py-3 pr-5 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const totalChecks = req.checklist.length;
                  const doneChecks = req.checklist.filter((c) => c.checked).length;
                  const overdue = isRequestOverdue(req);
                  const overdueDays = overdue ? getOverdueDays(req.dueDate) : 0;
                  const isSelected = activeSelectedIds.includes(req.id);

                  return (
                    <tr
                      key={req.id}
                      onClick={() => onSelectRequest(req)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/50 hover:bg-indigo-50/80'
                          : overdue
                            ? 'bg-rose-50/25 hover:bg-rose-50/50'
                            : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {canBulkManage && (
                        <td
                          className="py-3.5 pr-1 pl-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(req.id)}
                            aria-label={`Select request ${req.id}`}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                      )}
                      <td
                        className={`py-3.5 pr-3 font-mono text-xs font-semibold text-indigo-700 tabular-nums whitespace-nowrap ${
                          canBulkManage ? 'pl-2' : 'pl-5'
                        }`}
                      >
                        {req.id}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="max-w-xs truncate font-semibold text-slate-900">
                          {req.title}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-500">{req.category}</span>
                          {req.estimatedCost && req.estimatedCost > 0 && (
                            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                              {formatCurrency(req.estimatedCost, req.currency || 'USD')}
                            </span>
                          )}
                          {req.projectCode && (
                            <ProjectLinkBadge code={req.projectCode} name={req.projectName} />
                          )}
                          {req.assetTag && (
                            <AssetLinkBadge tag={req.assetTag} name={req.assetName} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {req.department}
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                        <p>{req.submittedBy}</p>
                        {req.delegatedFromReviewer && (
                          <div className="mt-0.5">
                            <DelegatedBadge fromName={req.delegatedFromReviewer} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <PriorityBadge priority={req.priority} />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={req.status} />
                          {requiresTwoTierApproval(req, approvalBudgetThresholdUsd) &&
                            req.status !== 'Approved' &&
                            req.status !== 'Rejected' && (
                              <TwoTierBadge stage1Completed={Boolean(req.stage1Approval)} />
                            )}
                          {overdue && <OverdueBadge days={overdueDays} />}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {doneChecks}/{totalChecks}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              overdue ? 'font-semibold text-rose-700' : 'text-slate-600'
                            }`}
                          >
                            {formatShortDate(req.dueDate)}
                          </span>
                          <SlaCountdownPill
                            dueDate={req.dueDate}
                            status={req.status}
                            nowMs={nowMs}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 pr-5 pl-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateRequest(req);
                              }}
                              title={`Duplicate ${req.id} as Template`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              <span>Duplicate as Template</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRequest(req);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View / Review</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

