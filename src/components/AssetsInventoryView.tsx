import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Download,
  History,
  PackageCheck,
  Plus,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  AssetCategory,
  AssetCondition,
  AssetStatus,
  CompanyAsset,
  Department,
  Role,
  TeamMember,
} from '../types/nexops';
import {
  exportAssetsCsv,
  formatDateTime,
  isAssetAlert,
} from '../utils/storage';

interface AssetsInventoryViewProps {
  assets: CompanyAsset[];
  activeRole: Role;
  departments: string[];
  teamMembers: TeamMember[];
  onRegisterAsset: (
    asset: Omit<CompanyAsset, 'id' | 'updatedAt' | 'history'>,
  ) => void;
  onTransferAsset: (
    assetId: string,
    payload: {
      assignedTo: string;
      department: Department;
      condition: AssetCondition;
      status: AssetStatus;
      notes?: string;
    },
  ) => void;
  onLogMaintenance: (
    assetId: string,
    payload: {
      condition: AssetCondition;
      status: AssetStatus;
      notes: string;
    },
  ) => void;
  onExportSuccess: (count: number) => void;
  onInspectRequest?: (requestId: string) => void;
}

const ASSET_CATEGORIES: AssetCategory[] = [
  'IT Hardware',
  'Software License',
  'Office Equipment',
  'Field Gear',
];

const ASSET_CONDITIONS: AssetCondition[] = ['New', 'Good', 'Needs Repair'];
const ASSET_STATUSES: AssetStatus[] = ['Assigned', 'In Stock', 'Under Maintenance'];

function generateNextAssetTag(assets: CompanyAsset[]): string {
  const maxNum = assets.reduce((max, a) => {
    const match = a.tag.match(/^AST-\d{4}-(\d+)$/i);
    if (match) {
      const n = parseInt(match[1], 10);
      return n > max ? n : max;
    }
    return max;
  }, 0);
  return `AST-2026-${String(maxNum + 1).padStart(3, '0')}`;
}

export function AssetsInventoryView({
  assets,
  activeRole,
  departments,
  teamMembers,
  onRegisterAsset,
  onTransferAsset,
  onLogMaintenance,
  onExportSuccess,
  onInspectRequest,
}: AssetsInventoryViewProps) {
  const canManageAssets = activeRole === 'Admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | 'All'>('All');
  const [alertsOnly, setAlertsOnly] = useState(false);

  // Modals
  const [registerOpen, setRegisterOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<CompanyAsset | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<CompanyAsset | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CompanyAsset | null>(null);

  // Register Modal Form
  const [regTag, setRegTag] = useState('');
  const [regName, setRegName] = useState('');
  const [regCategory, setRegCategory] = useState<AssetCategory>('IT Hardware');
  const [regCondition, setRegCondition] = useState<AssetCondition>('New');
  const [regStatus, setRegStatus] = useState<AssetStatus>('In Stock');
  const [regAssignedTo, setRegAssignedTo] = useState('Unassigned — Stockroom');
  const [regDepartment, setRegDepartment] = useState<Department>(
    departments[0] ?? 'Operations',
  );
  const [regSerial, setRegSerial] = useState('');
  const [regLocation, setRegLocation] = useState('');
  const [regStockQty, setRegStockQty] = useState('1');
  const [regMinStock, setRegMinStock] = useState('0');
  const [regError, setRegError] = useState<string | null>(null);

  // Transfer Modal Form
  const [txAssignedTo, setTxAssignedTo] = useState('');
  const [txDepartment, setTxDepartment] = useState<Department>('Engineering');
  const [txCondition, setTxCondition] = useState<AssetCondition>('Good');
  const [txStatus, setTxStatus] = useState<AssetStatus>('Assigned');
  const [txNotes, setTxNotes] = useState('');
  const [txError, setTxError] = useState<string | null>(null);

  // Maintenance Modal Form
  const [mntCondition, setMntCondition] = useState<AssetCondition>('Needs Repair');
  const [mntStatus, setMntStatus] = useState<AssetStatus>('Under Maintenance');
  const [mntNotes, setMntNotes] = useState('');
  const [mntError, setMntError] = useState<string | null>(null);

  const availableEmployees = useMemo(
    () =>
      Array.from(
        new Set([
          'Unassigned — Stockroom',
          ...teamMembers.filter((m) => m.active).map((m) => m.name),
        ]),
      ),
    [teamMembers],
  );

  const availableDepartments = useMemo(
    () => Array.from(new Set([...departments, ...assets.map((a) => a.department)])),
    [departments, assets],
  );

  const totalAssets = assets.length;
  const assignedCount = assets.filter((a) => a.status === 'Assigned').length;
  const inStockCount = assets.filter((a) => a.status === 'In Stock').length;
  const alertCount = assets.filter((a) => isAssetAlert(a)).length;

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesCat = categoryFilter === 'All' || asset.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || asset.status === statusFilter;
      const matchesAlert = !alertsOnly || isAssetAlert(asset);
      const matchesSearch =
        !q ||
        asset.tag.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        asset.assignedTo.toLowerCase().includes(q) ||
        asset.department.toLowerCase().includes(q) ||
        (asset.serialNumber && asset.serialNumber.toLowerCase().includes(q)) ||
        (asset.location && asset.location.toLowerCase().includes(q));
      return matchesCat && matchesStatus && matchesAlert && matchesSearch;
    });
  }, [assets, searchQuery, categoryFilter, statusFilter, alertsOnly]);

  const openRegisterModal = () => {
    setRegTag(generateNextAssetTag(assets));
    setRegName('');
    setRegCategory('IT Hardware');
    setRegCondition('New');
    setRegStatus('In Stock');
    setRegAssignedTo('Unassigned — Stockroom');
    setRegDepartment(availableDepartments[0] ?? 'Operations');
    setRegSerial('');
    setRegLocation('HQ Staging Bay A');
    setRegStockQty('1');
    setRegMinStock('0');
    setRegError(null);
    setRegisterOpen(true);
  };

  const handleRegisterSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanTag = regTag.trim().toUpperCase();
    const cleanName = regName.trim();
    const qty = Math.max(0, Math.round(Number(regStockQty) || 0));
    const minThreshold = Math.max(0, Math.round(Number(regMinStock) || 0));

    if (!cleanTag) {
      setRegError('Asset Tag is required (e.g. AST-2026-019).');
      return;
    }
    if (assets.some((a) => a.tag.toLowerCase() === cleanTag.toLowerCase())) {
      setRegError(`Asset Tag "${cleanTag}" already exists in the registry.`);
      return;
    }
    if (!cleanName) {
      setRegError('Item Name is required.');
      return;
    }

    onRegisterAsset({
      tag: cleanTag,
      name: cleanName,
      category: regCategory,
      assignedTo:
        regStatus === 'In Stock' && !regAssignedTo.trim()
          ? 'Unassigned — Stockroom'
          : regAssignedTo.trim() || 'Unassigned — Stockroom',
      department: regDepartment,
      condition: regCondition,
      status: regStatus,
      serialNumber: regSerial.trim() || undefined,
      location: regLocation.trim() || undefined,
      stockQuantity: qty,
      minStockThreshold: minThreshold,
    });
    setRegisterOpen(false);
  };

  const openTransferModal = (asset: CompanyAsset) => {
    setTransferTarget(asset);
    setTxAssignedTo(
      asset.assignedTo === 'Unassigned — Stockroom' ? '' : asset.assignedTo,
    );
    setTxDepartment(asset.department);
    setTxCondition(asset.condition);
    setTxStatus(asset.status === 'In Stock' ? 'Assigned' : asset.status);
    setTxNotes('');
    setTxError(null);
  };

  const handleTransferSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!transferTarget) return;
    const cleanAssignee = txAssignedTo.trim() || 'Unassigned — Stockroom';
    if (txStatus === 'Assigned' && cleanAssignee === 'Unassigned — Stockroom') {
      setTxError('Specify an Employee or Custodian when status is Assigned.');
      return;
    }
    onTransferAsset(transferTarget.id, {
      assignedTo: txStatus === 'In Stock' ? 'Unassigned — Stockroom' : cleanAssignee,
      department: txDepartment,
      condition: txCondition,
      status: txStatus,
      notes: txNotes.trim() || undefined,
    });
    setTransferTarget(null);
  };

  const openMaintenanceModal = (asset: CompanyAsset) => {
    setMaintenanceTarget(asset);
    setMntCondition(asset.status === 'Under Maintenance' ? 'Good' : 'Needs Repair');
    setMntStatus(asset.status === 'Under Maintenance' ? 'In Stock' : 'Under Maintenance');
    setMntNotes('');
    setMntError(null);
  };

  const handleMaintenanceSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!maintenanceTarget) return;
    if (!mntNotes.trim()) {
      setMntError('Enter maintenance, diagnostic, or repair completion details.');
      return;
    }
    onLogMaintenance(maintenanceTarget.id, {
      condition: mntCondition,
      status: mntStatus,
      notes: mntNotes.trim(),
    });
    setMaintenanceTarget(null);
  };

  const handleExportCsv = () => {
    exportAssetsCsv(filteredAssets);
    onExportSuccess(filteredAssets.length);
  };

  const renderConditionLabel = (condition: AssetCondition) => {
    if (condition === 'New') {
      return (
        <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 whitespace-nowrap">
          New
        </span>
      );
    }
    if (condition === 'Good') {
      return (
        <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          Good
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>Needs Repair</span>
      </span>
    );
  };

  const renderStatusLabel = (status: AssetStatus) => {
    if (status === 'Assigned') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 whitespace-nowrap">
          Assigned
        </span>
      );
    }
    if (status === 'In Stock') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>In Stock</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
        <Wrench className="h-3 w-3 shrink-0" />
        <span>Under Maintenance</span>
      </span>
    );
  };

  const activeHistoryAsset = historyTarget
    ? assets.find((a) => a.id === historyTarget.id) ?? historyTarget
    : null;

  return (
    <div className="space-y-6">
      {/* Top 4-Card KPI Strip */}
      <section
        aria-label="Asset Inventory Metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Company Assets</span>
            <Boxes className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {totalAssets}
          </p>
          <p className="mt-1 text-xs text-slate-500">Tracked hardware, licenses &amp; gear</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Assigned Assets</span>
            <ArrowLeftRight className="h-4 w-4 text-slate-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {assignedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Issued to employees &amp; pods</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Available in Stock</span>
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {inStockCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ready for provisioning &amp; fulfillment</p>
        </div>

        <button
          type="button"
          onClick={() => setAlertsOnly((prev) => !prev)}
          className={`rounded-xl border p-5 text-left transition-colors ${
            alertsOnly
              ? 'border-rose-300 bg-rose-50/50'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Low Stock / Maintenance Alerts
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${alertCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}
            />
          </div>
          <p
            className={`mt-2 font-display text-2xl font-bold tabular-nums ${
              alertCount > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {alertCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {alertsOnly ? 'Showing alert items only (click to clear)' : 'Click to filter flagged units'}
          </p>
        </button>
      </section>

      {/* Search, Filters & Actions Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[230px] flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Asset Tag (AST-2026-014), Item Name, Assignee, Serial..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by Asset Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="All">All Categories</option>
            {ASSET_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Asset Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AssetStatus | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            {ASSET_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-indigo-600" />
            <span>Export Asset Ledger CSV</span>
          </button>

          {canManageAssets && (
            <button
              type="button"
              onClick={openRegisterModal}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Register New Asset</span>
            </button>
          )}
        </div>
      </div>

      {/* Asset & Stock Registry Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredAssets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-display text-sm font-semibold text-slate-900">
              No assets match your current filters
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Clear active filters{canManageAssets ? ' or register a new hardware unit, license pool, or field kit' : ''}.
            </p>
            {canManageAssets && (
              <button
                type="button"
                onClick={openRegisterModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Register New Asset</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-3 pl-5">Asset Tag</th>
                  <th className="px-3 py-3">Item Name</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Assigned To</th>
                  <th className="px-3 py-3">Condition</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pr-5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.map((asset) => {
                  const lowStock =
                    typeof asset.stockQuantity === 'number' &&
                    typeof asset.minStockThreshold === 'number' &&
                    asset.minStockThreshold > 0 &&
                    asset.stockQuantity <= asset.minStockThreshold;

                  return (
                    <tr
                      key={asset.id}
                      className={`transition-colors ${
                        isAssetAlert(asset)
                          ? 'bg-rose-50/20 hover:bg-rose-50/40'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 pr-3 pl-5 font-mono text-xs font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                        {asset.tag}
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="font-semibold text-slate-900">{asset.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {asset.serialNumber && (
                            <span className="font-mono tabular-nums">{asset.serialNumber}</span>
                          )}
                          {asset.serialNumber && asset.location && <span aria-hidden="true">·</span>}
                          {asset.location && <span>{asset.location}</span>}
                          {lowStock && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-rose-700 tabular-nums">
                                Low Stock ({asset.stockQuantity} left / min {asset.minStockThreshold})
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {asset.category}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-semibold text-slate-900">{asset.assignedTo}</p>
                        <p className="text-[11px] text-slate-500">{asset.department}</p>
                      </td>
                      <td className="px-3 py-3.5">{renderConditionLabel(asset.condition)}</td>
                      <td className="px-3 py-3.5">{renderStatusLabel(asset.status)}</td>
                      <td className="py-3.5 pr-5 pl-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canManageAssets && (
                            <>
                              <button
                                type="button"
                                onClick={() => openTransferModal(asset)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                                <span>Assign/Transfer</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openMaintenanceModal(asset)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                              >
                                <Wrench className="h-3.5 w-3.5" />
                                <span>Log Maintenance</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(asset)}
                            title={`View custody & approval history for ${asset.tag}`}
                            aria-label={`View history for ${asset.tag}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span className="font-mono text-[11px] tabular-nums">
                              {asset.history.length}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register New Asset Modal */}
      {registerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-asset-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="register-asset-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Register New Company Asset
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Add IT hardware, software license pools, office equipment, or field gear
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRegisterOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {regError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {regError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="ast-tag" className="block text-xs font-semibold text-slate-700">
                    Asset Tag <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="ast-tag"
                    type="text"
                    value={regTag}
                    onChange={(e) => {
                      setRegTag(e.target.value);
                      setRegError(null);
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ast-name" className="block text-xs font-semibold text-slate-700">
                    Item Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="ast-name"
                    type="text"
                    value={regName}
                    onChange={(e) => {
                      setRegName(e.target.value);
                      setRegError(null);
                    }}
                    placeholder="e.g. ThinkPad X1 Carbon Gen 12"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="ast-cat" className="block text-xs font-semibold text-slate-700">
                    Category
                  </label>
                  <select
                    id="ast-cat"
                    value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value as AssetCategory)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ast-cond" className="block text-xs font-semibold text-slate-700">
                    Condition
                  </label>
                  <select
                    id="ast-cond"
                    value={regCondition}
                    onChange={(e) => setRegCondition(e.target.value as AssetCondition)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ast-status" className="block text-xs font-semibold text-slate-700">
                    Status
                  </label>
                  <select
                    id="ast-status"
                    value={regStatus}
                    onChange={(e) => setRegStatus(e.target.value as AssetStatus)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ast-assignee" className="block text-xs font-semibold text-slate-700">
                    Assigned To (Employee / Custodian)
                  </label>
                  <input
                    id="ast-assignee"
                    type="text"
                    list="nexops-asset-assignees"
                    value={regAssignedTo}
                    onChange={(e) => setRegAssignedTo(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <datalist id="nexops-asset-assignees">
                    {availableEmployees.map((emp) => (
                      <option key={emp} value={emp} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="ast-dept" className="block text-xs font-semibold text-slate-700">
                    Department
                  </label>
                  <select
                    id="ast-dept"
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value as Department)}
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
                  <label htmlFor="ast-serial" className="block text-xs font-semibold text-slate-700">
                    Serial / License Reference
                  </label>
                  <input
                    id="ast-serial"
                    type="text"
                    value={regSerial}
                    onChange={(e) => setRegSerial(e.target.value)}
                    placeholder="SN-..."
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="ast-loc" className="block text-xs font-semibold text-slate-700">
                    Location / Vault
                  </label>
                  <input
                    id="ast-loc"
                    type="text"
                    value={regLocation}
                    onChange={(e) => setRegLocation(e.target.value)}
                    placeholder="HQ Floor 4"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="ast-qty" className="block text-xs font-semibold text-slate-700">
                    Stock Quantity
                  </label>
                  <input
                    id="ast-qty"
                    type="number"
                    min={0}
                    value={regStockQty}
                    onChange={(e) => setRegStockQty(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="ast-min" className="block text-xs font-semibold text-slate-700">
                    Low-Stock Alert Threshold (0 = none)
                  </label>
                  <input
                    id="ast-min"
                    type="number"
                    min={0}
                    value={regMinStock}
                    onChange={(e) => setRegMinStock(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setRegisterOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Register Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign / Transfer Asset Modal */}
      {transferTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-asset-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="transfer-asset-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Assign / Transfer Asset
                </h2>
                <p className="mt-0.5 font-mono text-xs text-indigo-700">
                  {transferTarget.tag} · {transferTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4 px-6 py-5">
              {txError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {txError}
                </div>
              )}

              <div>
                <label htmlFor="tx-status" className="block text-xs font-semibold text-slate-700">
                  Allocation Status
                </label>
                <select
                  id="tx-status"
                  value={txStatus}
                  onChange={(e) => setTxStatus(e.target.value as AssetStatus)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="Assigned">Assigned to Employee</option>
                  <option value="In Stock">Return to Stockroom (In Stock)</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                </select>
              </div>

              {txStatus !== 'In Stock' && (
                <div>
                  <label htmlFor="tx-assignee" className="block text-xs font-semibold text-slate-700">
                    New Custodian / Employee <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="tx-assignee"
                    type="text"
                    list="nexops-tx-employees"
                    value={txAssignedTo}
                    onChange={(e) => {
                      setTxAssignedTo(e.target.value);
                      setTxError(null);
                    }}
                    placeholder="Select or enter employee name"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <datalist id="nexops-tx-employees">
                    {teamMembers
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.name} />
                      ))}
                  </datalist>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tx-dept" className="block text-xs font-semibold text-slate-700">
                    Department
                  </label>
                  <select
                    id="tx-dept"
                    value={txDepartment}
                    onChange={(e) => setTxDepartment(e.target.value as Department)}
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
                  <label htmlFor="tx-cond" className="block text-xs font-semibold text-slate-700">
                    Condition
                  </label>
                  <select
                    id="tx-cond"
                    value={txCondition}
                    onChange={(e) => setTxCondition(e.target.value as AssetCondition)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="tx-notes" className="block text-xs font-semibold text-slate-700">
                  Transfer / Handover Note
                </label>
                <input
                  id="tx-notes"
                  type="text"
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="Optional ticket or custody handover reason"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setTransferTarget(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Confirm Custody Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Maintenance Modal */}
      {maintenanceTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-asset-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="maintenance-asset-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Log Asset Maintenance
                </h2>
                <p className="mt-0.5 font-mono text-xs text-indigo-700">
                  {maintenanceTarget.tag} · {maintenanceTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceTarget(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleMaintenanceSubmit} className="space-y-4 px-6 py-5">
              {mntError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {mntError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mnt-cond" className="block text-xs font-semibold text-slate-700">
                    Updated Condition
                  </label>
                  <select
                    id="mnt-cond"
                    value={mntCondition}
                    onChange={(e) => setMntCondition(e.target.value as AssetCondition)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="mnt-status" className="block text-xs font-semibold text-slate-700">
                    Updated Status
                  </label>
                  <select
                    id="mnt-status"
                    value={mntStatus}
                    onChange={(e) => setMntStatus(e.target.value as AssetStatus)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ASSET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="mnt-notes" className="block text-xs font-semibold text-slate-700">
                  Service / Diagnostic Log <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="mnt-notes"
                  rows={3}
                  value={mntNotes}
                  onChange={(e) => {
                    setMntNotes(e.target.value);
                    setMntError(null);
                  }}
                  placeholder="Describe hardware diagnostics, RMA vendor ticket, or repair sign-off..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setMaintenanceTarget(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Save Maintenance Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Custody & Approval History Modal */}
      {activeHistoryAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-asset-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="history-asset-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Asset Audit &amp; Custody History
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-indigo-700">
                    {activeHistoryAsset.tag}
                  </span>{' '}
                  · {activeHistoryAsset.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {activeHistoryAsset.history.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No custody or maintenance history recorded yet.
                </p>
              ) : (
                [...activeHistoryAsset.history]
                  .sort(
                    (a, b) =>
                      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                  )
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {entry.eventType}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                        {entry.details}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Actor: {entry.actorName}</span>
                        {entry.requestId && onInspectRequest && (
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryTarget(null);
                              onInspectRequest(entry.requestId!);
                            }}
                            className="font-mono font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            Open {entry.requestId} →
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
              <p className="pt-1 text-[11px] text-slate-400">
                Acting as {activeRole}. All custody transfers, maintenance logs, and approved
                procurement requests are automatically recorded here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
