import { Clock, Copy, GitBranch, Plus, Trash2, Wallet, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  CompanyAsset,
  CompanyProject,
  CurrencyCode,
  Department,
  OperationalRequest,
  Priority,
  Role,
  SUPPORTED_CURRENCIES,
} from '../types/nexops';
import { formatCurrency, requiresTwoTierApproval } from '../utils/storage';

export interface CreateRequestPayload {
  title: string;
  category: string;
  department: Department;
  priority: Priority;
  dueDate: string;
  description: string;
  deliverableUrl: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  assetId?: string;
  assetTag?: string;
  assetName?: string;
  currency: CurrencyCode;
  estimatedCost: number;
  actualSpend: number;
  checklist: { label: string; mandatory: boolean }[];
  submitImmediately: boolean;
  clonedFromId?: string;
}

interface CreateRequestModalProps {
  nextRequestId: string;
  departments: string[];
  categories: string[];
  projects: CompanyProject[];
  assets: CompanyAsset[];
  activeRole?: Role;
  approvalBudgetThresholdUsd?: number;
  templateSource?: OperationalRequest | null;
  editingRequest?: OperationalRequest | null;
  onClose: () => void;
  onCreate: (payload: CreateRequestPayload) => void;
  onEdit?: (requestId: string, payload: CreateRequestPayload) => void;
}

const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];

function getDefaultDueDate(daysAhead = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function CreateRequestModal({
  nextRequestId,
  departments,
  categories,
  projects,
  assets,
  activeRole = 'Admin',
  approvalBudgetThresholdUsd = 5000,
  templateSource = null,
  editingRequest = null,
  onClose,
  onCreate,
  onEdit,
}: CreateRequestModalProps) {
  const isEditing = Boolean(editingRequest);
  const seed = editingRequest ?? templateSource;

  const availableCategories = Array.from(
    new Set([
      'Procurement / Asset Request',
      ...categories,
      ...(seed?.category ? [seed.category] : []),
    ]),
  );
  const availableDepartments = Array.from(
    new Set([
      ...departments,
      ...(seed?.department ? [seed.department] : []),
    ]),
  );

  const [title, setTitle] = useState(
    editingRequest
      ? editingRequest.title
      : templateSource
        ? `Copy of ${templateSource.title}`
        : '',
  );
  const [category, setCategory] = useState(
    seed ? seed.category : availableCategories[0] ?? 'Operational Change',
  );
  const [department, setDepartment] = useState<Department>(
    seed ? seed.department : availableDepartments[0] ?? 'Engineering',
  );
  const [priority, setPriority] = useState<Priority>(
    seed ? seed.priority : 'High',
  );
  const [dueDate, setDueDate] = useState(
    editingRequest ? editingRequest.dueDate : getDefaultDueDate(7),
  );
  const [description, setDescription] = useState(
    seed ? seed.description : '',
  );
  const [deliverableUrl, setDeliverableUrl] = useState(
    seed ? seed.deliverableUrl : '',
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    seed?.projectId ?? '',
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    seed?.assetId ?? '',
  );
  const [currency, setCurrency] = useState<CurrencyCode>(seed?.currency ?? 'USD');
  const [estimatedCost, setEstimatedCost] = useState<string>(
    seed?.estimatedCost !== undefined ? String(seed.estimatedCost) : '0',
  );
  const [actualSpend, setActualSpend] = useState<string>(
    seed?.actualSpend !== undefined ? String(seed.actualSpend) : '0',
  );
  const [checklistItems, setChecklistItems] = useState<{ label: string; mandatory: boolean }[]>(
    seed
      ? seed.checklist.map((c) => ({ label: c.label, mandatory: c.mandatory }))
      : [
          { label: 'Pre-deployment peer review sign-off attached', mandatory: true },
          { label: 'Rollback & contingency validation documented', mandatory: true },
        ],
  );
  const [newItemLabel, setNewItemLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedEstimatedCost = Math.max(0, Number(estimatedCost) || 0);
  const parsedActualSpend = Math.max(0, Number(actualSpend) || 0);
  const triggersTwoTier = requiresTwoTierApproval(
    { priority, estimatedCost: parsedEstimatedCost, currency },
    approvalBudgetThresholdUsd,
  );

  const handleAddChecklistItem = () => {
    const trimmed = newItemLabel.trim();
    if (!trimmed) return;
    setChecklistItems((prev) => [...prev, { label: trimmed, mandatory: true }]);
    setNewItemLabel('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleMandatory = (index: number) => {
    setChecklistItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, mandatory: !item.mandatory } : item)),
    );
  };

  const handleSubmit = (submitImmediately: boolean) => {
    if (!title.trim()) {
      setError('Request title is required.');
      return;
    }
    if (!description.trim()) {
      setError('Detailed operational description is required.');
      return;
    }
    if (checklistItems.length === 0) {
      setError('Add at least one QA verification checklist item.');
      return;
    }

    const linkedProject = selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : undefined;
    const isAssetRequest =
      category === 'Procurement / Asset Request' || Boolean(selectedAssetId);
    const linkedAsset =
      isAssetRequest && selectedAssetId
        ? assets.find((a) => a.id === selectedAssetId)
        : undefined;

    const payload: CreateRequestPayload = {
      title: title.trim(),
      category: category.trim() || 'General Operations',
      department,
      priority,
      dueDate,
      description: description.trim(),
      deliverableUrl: deliverableUrl.trim(),
      projectId: linkedProject?.id,
      projectCode: linkedProject?.code,
      projectName: linkedProject?.name,
      assetId: linkedAsset?.id,
      assetTag: linkedAsset?.tag,
      assetName: linkedAsset?.name,
      currency,
      estimatedCost: Math.round(parsedEstimatedCost),
      actualSpend: Math.round(parsedActualSpend),
      checklist: checklistItems,
      submitImmediately,
      clonedFromId: templateSource?.id,
    };

    if (editingRequest && onEdit) {
      onEdit(editingRequest.id, payload);
    } else {
      onCreate(payload);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSubmit(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-request-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="create-request-title"
                className="font-display text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100"
              >
                {editingRequest
                  ? 'Edit Operational Request'
                  : templateSource
                    ? 'Duplicate Request from Template'
                    : 'New Operational Request'}
              </h2>
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 tabular-nums dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                {editingRequest ? editingRequest.id : nextRequestId}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {editingRequest
                ? `Modify operational fields, budget allocation, or QA verification gates for ${editingRequest.id}`
                : templateSource
                  ? `Pre-filled with ${templateSource.department}, ${templateSource.category}, and ${templateSource.checklist.length} QA checklist items from ${templateSource.id}`
                  : 'Define deliverable details and mandatory QA verification gates'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onFormSubmit} className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {activeRole === 'Editor' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Maker-Checker Governance:</strong> Changes submitted by an{' '}
                <strong>Editor</strong> are queued for <strong>Super Admin approval</strong> before
                updating live records.
              </span>
            </div>
          )}
          {templateSource && !isEditing && (
            <div className="flex items-center gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200">
              <Copy className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                Cloning template from <strong className="font-mono">{templateSource.id}</strong> —
                review dates and details before submitting.
              </span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="req-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Request Title <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="req-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Production KMS Key Rotation & Envelope Audit"
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="req-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                id="req-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="req-dept" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Department
              </label>
              <select
                id="req-dept"
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
              <label htmlFor="req-priority" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Priority Level
              </label>
              <select
                id="req-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="req-due" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Due Date
              </label>
              <input
                id="req-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="req-project" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Link to Project / Client <span className="font-normal text-slate-400 dark:text-slate-500">(Optional)</span>
            </label>
            <select
              id="req-project"
              value={selectedProjectId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedProjectId(nextId);
                const matched = projects.find((p) => p.id === nextId);
                if (matched?.currency) {
                  setCurrency(matched.currency);
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">Unassigned / General Operations</option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.code} — {proj.name} ({proj.status} · {proj.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Financial Cost-Center & Budget Fields */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Cost-Center Budget &amp; Spend Allocation
                </h3>
              </div>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                2-Tier Threshold: {formatCurrency(approvalBudgetThresholdUsd, 'USD')} eq.
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="req-currency" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Currency
                </label>
                <select
                  id="req-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {SUPPORTED_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-est-cost" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Estimated Cost / Budget
                </label>
                <input
                  id="req-est-cost"
                  type="number"
                  min={0}
                  step="any"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="req-actual-spend" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Actual Spend (So Far)
                </label>
                <input
                  id="req-actual-spend"
                  type="number"
                  min={0}
                  step="any"
                  value={actualSpend}
                  onChange={(e) => setActualSpend(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {triggersTwoTier && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
                <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  <strong>Two-Tier Escalated Approval Chain Enforced:</strong> Because this request is{' '}
                  {priority === 'High' || priority === 'Urgent'
                    ? `${priority} priority`
                    : `above ${formatCurrency(approvalBudgetThresholdUsd, 'USD')} eq.`}
                  , it requires <strong>Stage 1 (Editor / QA Review)</strong> followed by{' '}
                  <strong>Stage 2 (Executive / Admin Final Sign-Off)</strong>.
                </span>
              </div>
            )}
          </div>

          {category === 'Procurement / Asset Request' && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
              <label htmlFor="req-asset" className="block text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                Select Asset Tag from Inventory Registry{' '}
                <span className="font-normal text-indigo-700 dark:text-indigo-400">(Auto-logs approval to asset history)</span>
              </label>
              <select
                id="req-asset"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-indigo-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">No specific asset tag selected (New Procurement)</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.tag} — {asset.name} ({asset.status} · {asset.assignedTo})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="req-url" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reference URL / Deliverable Link
            </label>
            <input
              id="req-url"
              type="url"
              value={deliverableUrl}
              onChange={(e) => setDeliverableUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="req-desc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Detailed Description <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <textarea
              id="req-desc"
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              placeholder="Summarize scope, risk impact, and verification evidence..."
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Dynamic Checklist Builder */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  QA Verification Checklist Items
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mandatory items must be verified prior to approval
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {checklistItems.length} items
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {checklistItems.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                    {item.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMandatory(idx)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        item.mandatory
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {item.mandatory ? 'Mandatory' : 'Optional'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      aria-label={`Remove checklist item ${item.label}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddChecklistItem();
                  }
                }}
                placeholder="Add custom QA verification gate..."
                className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Gate</span>
              </button>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            {isEditing ? (
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {activeRole === 'Editor' ? 'Submit Edit for Approval' : 'Save Request Changes'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  {activeRole === 'Editor' ? 'Submit Proposal for Approval' : 'Submit for QA Review'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
