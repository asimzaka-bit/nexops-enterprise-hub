import { ArrowUpRight, Download, FileSpreadsheet, Search } from 'lucide-react';
import { useState } from 'react';
import { AuditActionType, AuditEvent } from '../types/nexops';
import { exportAuditLogsCsv, formatDateTime } from '../utils/storage';

interface AuditLogsViewProps {
  logs: AuditEvent[];
  onInspectRequest: (requestId: string) => void;
  onExportSuccess: (count: number) => void;
}

const ACTION_TYPES: (AuditActionType | 'All')[] = [
  'All',
  'Created',
  'Status Changed',
  'Checklist Updated',
  'Comment Added',
  'Team Updated',
];

export function AuditLogsView({
  logs,
  onInspectRequest,
  onExportSuccess,
}: AuditLogsViewProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditActionType | 'All'>('All');

  const normalized = search.trim().toLowerCase();

  const filteredLogs = logs.filter((log) => {
    const matchesAction = actionFilter === 'All' || log.actionType === actionFilter;
    const matchesSearch =
      !normalized ||
      log.requestId.toLowerCase().includes(normalized) ||
      log.actorName.toLowerCase().includes(normalized) ||
      log.actorRole.toLowerCase().includes(normalized) ||
      log.details.toLowerCase().includes(normalized);
    return matchesAction && matchesSearch;
  });

  const handleExport = () => {
    exportAuditLogsCsv(filteredLogs);
    onExportSuccess(filteredLogs.length);
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit ledger by Actor, Target Request ID, or Details..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="audit-action-filter" className="sr-only">
            Filter by Action Type
          </label>
          <select
            id="audit-action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as AuditActionType | 'All')}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === 'All' ? 'All Event Types' : type}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV Report</span>
          </button>
        </div>
      </div>

      {/* Ledger Summary Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
          <span>Read-Only Compliance Ledger</span>
        </span>
        <span className="font-mono tabular-nums">
          Showing {filteredLogs.length} of {logs.length} immutable records
        </span>
      </div>

      {/* Audit Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredLogs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-sm font-semibold text-slate-900">
              No audit records match your search criteria
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Adjust your search filter or action type to inspect historical compliance events.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-3 pl-5">Timestamp</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action Type</th>
                  <th className="px-3 py-3">Target ID</th>
                  <th className="py-3 pr-5 pl-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const isRequestTarget = log.requestId.startsWith('REQ-');
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 pr-3 pl-5 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-semibold text-slate-900">{log.actorName}</p>
                        <p className="text-[11px] text-slate-500">
                          {log.actorSignOffTitle
                            ? `${log.actorSignOffTitle} · ${log.actorRole}`
                            : log.actorRole}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {log.actionType}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs tabular-nums whitespace-nowrap">
                        {isRequestTarget ? (
                          <button
                            type="button"
                            onClick={() => onInspectRequest(log.requestId)}
                            className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                          >
                            <span>{log.requestId}</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-slate-600">{log.requestId}</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-5 pl-3 text-xs leading-relaxed text-slate-700">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
