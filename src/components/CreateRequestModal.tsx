import { Copy, GitBranch, Plus, Trash2, Wallet, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  CompanyAsset,
  CompanyProject,
  CurrencyCode,
  Department,
  OperationalRequest,
  Priority,
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
  approvalBudgetThresholdUsd?: number;
  templateSource?: OperationalRequest | null;
  onClose: () => void;
  onCreate: (payload: CreateRequestPayload) => void;
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
  approvalBudgetThresholdUsd = 5000,
  templateSource = null,
  onClose,
  onCreate,
}: CreateRequestModalProps) {
  const availableCategories = Array.from(
    new Set([
      'Procurement / Asset Request',
      ...categories,
      ...(templateSource?.category ? [templateSource.category] : []),
    ]),
  );
  const availableDepartments = Array.from(
    new Set([
      ...departments,
      ...(templateSource?.department ? [templateSource.department] : []),
    ]),
  );

  const [title, setTitle] = useState(
    templateSource ? `Copy of ${templateSource.title}` : '',
  );
  const [category, setCategory] = useState(
    templateSource ? templateSource.category : availableCategories[0] ?? 'Operational Change',
  );
  const [department, setDepartment] = useState<Department>(
    templateSource ? templateSource.department : availableDepartments[0] ?? 'Engineering',
  );
  const [priority, setPriority] = useState<Priority>(
    templateSource ? templateSource.priority : 'High',
  );
  const [dueDate, setDueDate] = useState(getDefaultDueDate(7));
  const [description, setDescription] = useState(
    templateSource ? templateSource.description : '',
  );
  const [deliverableUrl, setDeliverableUrl] = useState(
    templateSource ? templateSource.deliverableUrl : 'https://internal.nexops-corp.example/specs/',
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    templateSource?.projectId ?? '',
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    templateSource?.assetId ?? '',
  );
  const [currency, setCurrency] = useState<CurrencyCode>(templateSource?.currency ?? 'USD');
  const [estimatedCost, setEstimatedCost] = useState<string>(
    templateSource?.estimatedCost ? String(templateSource.estimatedCost) : '0',
  );
  const [actualSpend, setActualSpend] = useState<string>(
    templateSource?.actualSpend ? String(templateSource.actualSpend) : '0',
  );
  const [checklistItems, setChecklistItems] = useState<{ label: string; mandatory: boolean }[]>(
    templateSource
      ? templateSource.checklist.map((c) => ({ label: c.label, mandatory: c.mandatory }))
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

    onCreate({
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
    });
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSubmit(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-request-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="create-request-title"
                className="font-display text-lg font-bold text-slate-900"
              >
                {templateSource ? 'Duplicate Request from Template' : 'New Operational Request'}
              </h2>
              <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 tabular-nums">
                {nextRequestId}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {templateSource
                ? `Pre-filled with ${templateSource.department}, ${templateSource.category}, and ${templateSource.checklist.length} QA checklist items from ${templateSource.id}`
                : 'Define deliverable details and mandatory QA verification gates'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onFormSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {templateSource && (
            <div className="flex items-center gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs text-indigo-900">
              <Copy className="h-4 w-4 shrink-0 text-indigo-600" />
              <span>
                Cloning template from <strong className="font-mono">{templateSource.id}</strong> —
                review dates and details before submitting.
              </span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="req-title" className="block text-xs font-semibold text-slate-700">
              Request Title <span className="text-rose-600">*</span>
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
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="req-category" className="block text-xs font-semibold text-slate-700">
                Category
              </label>
              <select
                id="req-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="req-dept" className="block text-xs font-semibold text-slate-700">
                Department
              </label>
              <select
                id="req-dept"
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
              <label htmlFor="req-priority" className="block text-xs font-semibold text-slate-700">
                Priority Level
              </label>
              <select
                id="req-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="req-due" className="block text-xs font-semibold text-slate-700">
                Target Due Date
              </label>
              <input
                id="req-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="req-project" className="block text-xs font-semibold text-slate-700">
              Link to Project / Client <span className="font-normal text-slate-400">(Optional)</span>
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
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
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
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900">
                  Cost-Center Budget &amp; Spend Allocation
                </h3>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                2-Tier Threshold: {formatCurrency(approvalBudgetThresholdUsd, 'USD')} eq.
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="req-currency" className="block text-[11px] font-semibold text-slate-700">
                  Currency
                </label>
                <select
                  id="req-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-est-cost" className="block text-[11px] font-semibold text-slate-700">
                  Estimated Cost / Budget
                </label>
                <input
                  id="req-est-cost"
                  type="number"
                  min={0}
                  step="any"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="req-actual-spend" className="block text-[11px] font-semibold text-slate-700">
                  Actual Spend (So Far)
                </label>
                <input
                  id="req-actual-spend"
                  type="number"
                  min={0}
                  step="any"
                  value={actualSpend}
                  onChange={(e) => setActualSpend(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {triggersTwoTier && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>
                  <strong>Two-Tier Escalated Approval Chain Enforced:</strong> Because this request is{' '}
                  {priority === 'High' || priority === 'Urgent'
                    ? `${priority} priority`
                    : `above ${formatCurrency(approvalBudgetThresholdUsd, 'USD')} eq.`}
                  , it requires <strong>Stage 1 (Manager / QA Review)</strong> followed by{' '}
                  <strong>Stage 2 (Executive / Admin Final Sign-Off)</strong>.
                </span>
              </div>
            )}
          </div>

          {category === 'Procurement / Asset Request' && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <label htmlFor="req-asset" className="block text-xs font-semibold text-indigo-950">
                Select Asset Tag from Inventory Registry{' '}
                <span className="font-normal text-indigo-700">(Auto-logs approval to asset history)</span>
              </label>
              <select
                id="req-asset"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-indigo-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
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
            <label htmlFor="req-url" className="block text-xs font-semibold text-slate-700">
              Reference URL / Deliverable Link
            </label>
            <input
              id="req-url"
              type="url"
              value={deliverableUrl}
              onChange={(e) => setDeliverableUrl(e.target.value)}
              placeholder="https://internal.nexops-corp.example/docs/..."
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="req-desc" className="block text-xs font-semibold text-slate-700">
              Detailed Description <span className="text-rose-600">*</span>
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
              className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Dynamic Checklist Builder */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  QA Verification Checklist Items
                </h3>
                <p className="text-[11px] text-slate-500">
                  Mandatory items must be verified prior to approval
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {checklistItems.length} items
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {checklistItems.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-xs font-medium text-slate-800">
                    {item.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMandatory(idx)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        item.mandatory
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {item.mandatory ? 'Mandatory' : 'Optional'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      aria-label={`Remove checklist item ${item.label}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
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
                className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Gate</span>
              </button>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Submit for QA Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
