import {
  Briefcase,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Landmark,
  Link2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  Department,
  DocumentVaultAccessTag,
  DocumentVaultFolder,
  DocumentVaultItem,
  DocumentVaultSourceType,
  Role,
  TeamMember,
} from '../types/nexops';
import { formatDateTime } from '../utils/storage';

interface DocumentVaultViewProps {
  documents: DocumentVaultItem[];
  departments: Department[];
  activeRole: Role;
  currentUser: TeamMember;
  onAddDocument: (item: DocumentVaultItem) => void;
  onDeleteDocument: (itemId: string) => void;
}

const VAULT_FOLDERS: {
  id: DocumentVaultFolder;
  description: string;
  icon: typeof FolderLock;
}[] = [
  {
    id: 'HR & Policies',
    description: 'Employee handbooks, onboarding checklists & HR circulars',
    icon: ShieldCheck,
  },
  {
    id: 'Operations & SOPs',
    description: 'Runbooks, standard procedures & quality guidelines',
    icon: Briefcase,
  },
  {
    id: 'Accounts & Finance',
    description: 'Tax filings, ledgers, invoices & audit templates',
    icon: Landmark,
  },
  {
    id: 'Client Contracts',
    description: 'Signed MSAs, SLAs, NDAs & vendor agreements',
    icon: FileText,
  },
];

const ACCESS_TAGS: DocumentVaultAccessTag[] = [
  'All Staff',
  'Department Only',
  'Editors & Admins',
  'Admin Restricted',
];

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getEmbedPreviewUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.includes('docs.google.com/document/d/')) {
    const match = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://docs.google.com/document/d/${match[1]}/preview`;
  }
  if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://docs.google.com/spreadsheets/d/${match[1]}/preview`;
  }
  if (trimmed.includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return null;
}

export function DocumentVaultView({
  documents,
  departments,
  activeRole,
  currentUser,
  onAddDocument,
  onDeleteDocument,
}: DocumentVaultViewProps) {
  const [selectedFolder, setSelectedFolder] = useState<'ALL' | DocumentVaultFolder>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add Form State
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<DocumentVaultFolder>('HR & Policies');
  const [department, setDepartment] = useState<Department>(
    currentUser.department || departments[0] || 'Operations',
  );
  const [accessTag, setAccessTag] = useState<DocumentVaultAccessTag>('All Staff');
  const [sourceType, setSourceType] = useState<DocumentVaultSourceType>('google_drive');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedFileMeta, setUploadedFileMeta] = useState<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileDataUrl: string;
  } | null>(null);
  const [formError, setFormError] = useState('');

  const canManageVault = activeRole === 'Admin';

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (activeRole === 'Admin') return true;
      if (doc.accessTag === 'Admin Restricted' || doc.accessTag === 'Editors & Admins') {
        return false;
      }
      if (
        doc.accessTag === 'Department Only' &&
        doc.department.toLowerCase() !== currentUser.department.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [documents, activeRole, currentUser.department]);

  const folderCounts = useMemo(() => {
    const counts: Record<DocumentVaultFolder, number> = {
      'HR & Policies': 0,
      'Operations & SOPs': 0,
      'Accounts & Finance': 0,
      'Client Contracts': 0,
    };
    for (const doc of visibleDocuments) {
      counts[doc.folder] = (counts[doc.folder] ?? 0) + 1;
    }
    return counts;
  }, [visibleDocuments]);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleDocuments.filter((doc) => {
      if (selectedFolder !== 'ALL' && doc.folder !== selectedFolder) return false;
      if (departmentFilter !== 'ALL' && doc.department !== departmentFilter) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.folder.toLowerCase().includes(q) ||
        doc.department.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        doc.uploadedBy.toLowerCase().includes(q) ||
        (doc.fileName ?? '').toLowerCase().includes(q)
      );
    });
  }, [visibleDocuments, selectedFolder, departmentFilter, searchQuery]);

  const resetForm = () => {
    setTitle('');
    setFolder('HR & Policies');
    setDepartment(currentUser.department || departments[0] || 'Operations');
    setAccessTag('All Staff');
    setSourceType('google_drive');
    setUrl('');
    setDescription('');
    setUploadedFileMeta(null);
    setFormError('');
  };

  const handleFilePicked = (file: File | undefined) => {
    setFormError('');
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setFormError('Uploaded file must be 4 MB or smaller. Use a Google Drive link for larger files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedFileMeta({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          fileDataUrl: reader.result,
        });
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^.]+$/, ''));
        }
      }
    };
    reader.onerror = () => setFormError('Could not read the selected file.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!canManageVault) return;
    if (!title.trim()) {
      setFormError('Document title is required.');
      return;
    }
    if (sourceType !== 'uploaded_file' && !url.trim()) {
      setFormError('Please provide a valid Google Drive or document URL.');
      return;
    }
    if (sourceType === 'uploaded_file' && !uploadedFileMeta) {
      setFormError('Please select a file to upload.');
      return;
    }

    const now = new Date().toISOString();
    const newItem: DocumentVaultItem = {
      id: `VLT-${Date.now().toString().slice(-6)}`,
      title: title.trim(),
      folder,
      department,
      description: description.trim(),
      accessTag,
      sourceType,
      url: sourceType !== 'uploaded_file' ? url.trim() : undefined,
      fileName: sourceType === 'uploaded_file' ? uploadedFileMeta?.fileName : undefined,
      fileSize: sourceType === 'uploaded_file' ? uploadedFileMeta?.fileSize : undefined,
      mimeType: sourceType === 'uploaded_file' ? uploadedFileMeta?.mimeType : undefined,
      fileDataUrl: sourceType === 'uploaded_file' ? uploadedFileMeta?.fileDataUrl : undefined,
      uploadedBy: currentUser.name,
      uploadedByEmail: currentUser.email,
      createdAt: now,
      updatedAt: now,
    };

    onAddDocument(newItem);
    resetForm();
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Read-Only Notice */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Department Document Vault
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Structured company repository across HR, Operations, Finance &amp; Client Contracts with role-based access tags.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!canManageVault ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              Read-Only Access ({activeRole})
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add / Upload Document
            </button>
          )}
        </div>
      </div>

      {/* 4 Structured Vault Folders */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {VAULT_FOLDERS.map((f) => {
          const Icon = f.icon;
          const isActive = selectedFolder === f.id;
          const count = folderCounts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFolder(isActive ? 'ALL' : f.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50/60'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    isActive
                      ? 'border-indigo-200 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-indigo-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {count}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">{f.id}</p>
              <p className="mt-0.5 text-xs text-slate-500">{f.description}</p>
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, descriptions, uploader or filenames..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value as 'ALL' | DocumentVaultFolder)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Folders</option>
            {VAULT_FOLDERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id}
              </option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <p className="font-mono text-xs text-slate-500 tabular-nums">
          {filteredDocuments.length} of {visibleDocuments.length} accessible files
        </p>
      </div>

      {/* Document Registry Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FolderLock className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-900">
              No vault documents in this view
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {canManageVault
                ? 'Link Google Drive files or upload department reference documents using the button above.'
                : 'No accessible documents have been published to this folder yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Folder</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Access Tag</th>
                  <th className="px-4 py-3">Uploaded By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDocuments.map((doc) => {
                  const isFile = doc.sourceType === 'uploaded_file';
                  const isConfirming = confirmDeleteId === doc.id;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-indigo-600">
                            {isFile ? (
                              <FileSpreadsheet className="h-4 w-4" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{doc.title}</p>
                            {doc.description && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                {doc.description}
                              </p>
                            )}
                            <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                              {isFile
                                ? `${doc.fileName || 'File'} · ${formatFileSize(doc.fileSize)}`
                                : doc.url}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {doc.folder}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {doc.department}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            doc.accessTag === 'Admin Restricted'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : doc.accessTag === 'Editors & Admins'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : doc.accessTag === 'Department Only'
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {doc.accessTag}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-800">{doc.uploadedBy}</p>
                        <p className="font-mono text-[10px] text-slate-400 tabular-nums">
                          {formatDateTime(doc.updatedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {isFile && doc.fileDataUrl ? (
                            <a
                              href={doc.fileDataUrl}
                              download={doc.fileName || `${doc.title}.bin`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3 w-3 text-indigo-600" />
                              Download
                            </a>
                          ) : doc.url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </button>
                          ) : null}

                          {canManageVault &&
                            (isConfirming ? (
                              <div className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteDocument(doc.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-rose-700 hover:underline"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(doc.id)}
                                title="Remove document from vault"
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
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

      {/* Add Document Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Add Document to Vault
                </h3>
                <p className="text-xs text-slate-500">
                  Link a Google Drive file or upload an internal reference document
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 2026 Employee Leave Policy Circular"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Folder</label>
                  <select
                    value={folder}
                    onChange={(e) => setFolder(e.target.value as DocumentVaultFolder)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {VAULT_FOLDERS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Access Tag</label>
                  <select
                    value={accessTag}
                    onChange={(e) => setAccessTag(e.target.value as DocumentVaultAccessTag)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {ACCESS_TAGS.filter((t) => activeRole === 'Admin' || t !== 'Admin Restricted').map(
                      (tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Source Method</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {[
                    { id: 'google_drive' as const, label: 'Google Drive Link' },
                    { id: 'external_link' as const, label: 'External URL' },
                    { id: 'uploaded_file' as const, label: 'Upload File' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSourceType(opt.id)}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                        sourceType === opt.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {sourceType !== 'uploaded_file' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    {sourceType === 'google_drive'
                      ? 'Google Drive / Docs / Sheets URL'
                      : 'Document Reference URL'}
                  </label>
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Upload Reference File (Max 4 MB)
                  </label>
                  <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/40">
                    <Upload className="h-4 w-4 text-indigo-600" />
                    <span>
                      {uploadedFileMeta
                        ? `${uploadedFileMeta.fileName} (${formatFileSize(uploadedFileMeta.fileSize)})`
                        : 'Click to select PDF, Word, Excel, or image file'}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => handleFilePicked(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary, effective dates, or compliance notes..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Preview Modal for Linked Documents */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-bold text-slate-900">
                  {previewDoc.title}
                </h3>
                <p className="truncate text-xs text-slate-500">
                  {previewDoc.folder} · {previewDoc.department} · {previewDoc.accessTag}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {previewDoc.url && (
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Source Link
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-50 p-4">
              {previewDoc.url && getEmbedPreviewUrl(previewDoc.url) ? (
                <iframe
                  title={previewDoc.title}
                  src={getEmbedPreviewUrl(previewDoc.url)!}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
                  <Link2 className="h-8 w-8 text-indigo-600" />
                  <p className="mt-3 text-sm font-bold text-slate-900">{previewDoc.title}</p>
                  {previewDoc.description && (
                    <p className="mt-1 max-w-md text-xs text-slate-600">{previewDoc.description}</p>
                  )}
                  <p className="mt-3 break-all font-mono text-xs text-slate-500">
                    {previewDoc.url}
                  </p>
                  {previewDoc.url && (
                    <a
                      href={previewDoc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Document URL
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
