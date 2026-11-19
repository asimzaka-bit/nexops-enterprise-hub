import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react';
import { Department, Priority, RequestStatus } from '../types/nexops';
import {
  downloadSampleRequestsCsvTemplate,
  getTodayDateString,
  parseCsvMatrix,
} from '../utils/storage';

export interface ImportedRequestRow {
  title: string;
  category: string;
  department: Department;
  priority: Priority;
  status: RequestStatus;
  dueDate: string;
  submittedBy?: string;
  assignedReviewer?: string;
  deliverableUrl: string;
  description: string;
  checklist: { label: string; mandatory: boolean }[];
}

interface ImportRequestsModalProps {
  nextRequestId: string;
  departments: string[];
  onClose: () => void;
  onImport: (rows: ImportedRequestRow[]) => void;
}

const VALID_PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const VALID_STATUSES: RequestStatus[] = [
  'Draft',
  'Submitted',
  'Under QA Review',
  'Revision Required',
  'Approved',
  'Rejected',
];

function matchEnum<T extends string>(raw: string | undefined, allowed: T[], fallback: T): T {
  if (!raw) return fallback;
  const cleaned = raw.trim().toLowerCase();
  const found = allowed.find((item) => item.toLowerCase() === cleaned);
  return found ?? fallback;
}

function getSequentialIdPreview(baseId: string, offset: number): string {
  const match = baseId.match(/^(REQ-\d{4}-)(\d+)$/);
  if (!match) return `${baseId}+${offset}`;
  const startNum = parseInt(match[2], 10);
  return `${match[1]}${String(startNum + offset).padStart(3, '0')}`;
}

function defaultDueDate(): string {
  const base = new Date(`${getTodayDateString()}T00:00:00`);
  base.setDate(base.getDate() + 10);
  return base.toISOString().slice(0, 10);
}

export function ImportRequestsModal({
  nextRequestId,
  departments,
  onClose,
  onImport,
}: ImportRequestsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const parsedResult = useMemo(() => {
    if (!csvText.trim()) {
      return { rows: [] as ImportedRequestRow[], warnings: [] as string[], error: null as string | null };
    }

    const matrix = parseCsvMatrix(csvText);
    if (matrix.length < 2) {
      return {
        rows: [] as ImportedRequestRow[],
        warnings: [] as string[],
        error: 'CSV must include a header row and at least one operational request row.',
      };
    }

    const headers = matrix[0].map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));
    const idxOf = (...aliases: string[]) =>
      headers.findIndex((h) => aliases.includes(h));

    const titleIdx = idxOf('title', 'requesttitle', 'name');
    if (titleIdx === -1) {
      return {
        rows: [] as ImportedRequestRow[],
        warnings: [] as string[],
        error: 'Missing required "title" column in CSV header.',
      };
    }

    const catIdx = idxOf('category', 'type');
    const deptIdx = idxOf('department', 'dept');
    const prioIdx = idxOf('priority', 'urgency');
    const statusIdx = idxOf('status', 'stage');
    const dueIdx = idxOf('duedate', 'due', 'targetdate');
    const subIdx = idxOf('submittedby', 'owner', 'submitter');
    const revIdx = idxOf('assignedreviewer', 'reviewer');
    const urlIdx = idxOf('deliverableurl', 'url', 'link', 'referenceurl');
    const descIdx = idxOf('description', 'details', 'summary');
    const chkIdx = idxOf('checklist', 'qachecklist', 'gates');

    const rows: ImportedRequestRow[] = [];
    const warnings: string[] = [];

    matrix.slice(1).forEach((cells, i) => {
      const title = (cells[titleIdx] ?? '').trim();
      if (!title) {
        warnings.push(`Row ${i + 2} skipped: missing title.`);
        return;
      }

      const rawDue = dueIdx >= 0 ? (cells[dueIdx] ?? '').trim() : '';
      const validDue = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : defaultDueDate();

      const rawChecklist = chkIdx >= 0 ? (cells[chkIdx] ?? '').trim() : '';
      const checklistLabels = rawChecklist
        ? rawChecklist
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [
            'Verify operational scope and acceptance criteria',
            'Confirm compliance & peer review sign-off',
          ];

      rows.push({
        title,
        category: (catIdx >= 0 && cells[catIdx]?.trim()) || 'Operational Change',
        department: matchEnum(
          deptIdx >= 0 ? cells[deptIdx] : undefined,
          departments,
          departments[0] ?? 'Operations',
        ),
        priority: matchEnum(
          prioIdx >= 0 ? cells[prioIdx] : undefined,
          VALID_PRIORITIES,
          'Medium',
        ),
        status: matchEnum(
          statusIdx >= 0 ? cells[statusIdx] : undefined,
          VALID_STATUSES,
          'Submitted',
        ),
        dueDate: validDue,
        submittedBy: subIdx >= 0 && cells[subIdx]?.trim() ? cells[subIdx].trim() : undefined,
        assignedReviewer:
          revIdx >= 0 && cells[revIdx]?.trim() ? cells[revIdx].trim() : undefined,
        deliverableUrl: (urlIdx >= 0 && cells[urlIdx]?.trim()) || '',
        description:
          (descIdx >= 0 && cells[descIdx]?.trim()) ||
          `Imported operational submission for "${title}".`,
        checklist: checklistLabels.map((label, idx) => ({
          label,
          mandatory: idx === 0,
        })),
      });
    });

    if (rows.length === 0 && warnings.length === 0) {
      return {
        rows,
        warnings,
        error: 'No valid request rows found in the uploaded CSV.',
      };
    }

    return { rows, warnings, error: null };
  }, [csvText]);

  const readCsvFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readCsvFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readCsvFile(file);
  };

  const handleConfirmImport = () => {
    if (parsedResult.rows.length === 0) return;
    onImport(parsedResult.rows);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-csv-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="import-csv-modal-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Import Operational Requests (CSV)
              </h2>
              <p className="text-xs text-slate-500">
                Bulk upload existing requests into the QA queue with sequential ID assignment
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV import modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Template Download Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-indigo-950">
                Need a standardized schema?
              </p>
              <p className="mt-0.5 text-[11px] text-indigo-700">
                Download the NexOps CSV template with valid headers, departments, and semicolon-delimited QA gates.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadSampleRequestsCsvTemplate}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Sample Template</span>
            </button>
          </div>

          {/* File Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/40'
                : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-xs font-semibold text-slate-900">
              {fileName
                ? `Loaded file: ${fileName}`
                : 'Drag and drop a .csv file here, or browse from disk'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Supported columns: title (required), category, department, priority, status, dueDate, submittedBy, assignedReviewer, deliverableUrl, description, checklist
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Choose CSV File</span>
              </button>
              {csvText && (
                <button
                  type="button"
                  onClick={() => {
                    setCsvText('');
                    setFileName(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Or Paste CSV Text Directly */}
          <div>
            <label
              htmlFor="csv-paste-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Or Paste Raw CSV Content
            </label>
            <textarea
              id="csv-paste-input"
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`title,category,department,priority,status,dueDate\nZero-Trust Firewall Audit,Security Compliance,Engineering,High,Submitted,2026-12-08`}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Validation Error / Warnings */}
          {parsedResult.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{parsedResult.error}</span>
            </div>
          )}

          {parsedResult.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              {parsedResult.warnings.map((w, idx) => (
                <p key={idx}>{w}</p>
              ))}
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedResult.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    {parsedResult.rows.length} request
                    {parsedResult.rows.length > 1 ? 's' : ''} validated and ready to import
                  </span>
                </p>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  Starting at {nextRequestId}
                </span>
              </div>

              <div className="max-h-52 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2">Assigned ID</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Dept</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2 text-right">QA Gates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedResult.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono font-semibold text-indigo-700 tabular-nums whitespace-nowrap">
                          {getSequentialIdPreview(nextRequestId, idx)}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-900">
                          {row.title}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {row.department}
                        </td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {row.priority}
                        </td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {row.status}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {row.dueDate}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                          {row.checklist.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedResult.rows.length === 0}
            onClick={handleConfirmImport}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import {parsedResult.rows.length > 0 ? `${parsedResult.rows.length} ` : ''}
            Requests
          </button>
        </div>
      </div>
    </div>
  );
}
