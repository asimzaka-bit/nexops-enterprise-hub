import {
  Briefcase,
  Cloud,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderLock,
  HardDrive,
  Landmark,
  Link2,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { dataService } from '../services/dataService';
import {
  Department,
  DocumentVaultAccessTag,
  DocumentVaultFolder,
  DocumentVaultItem,
  DocumentVaultSourceType,
  PendingEditorChange,
  Role,
  TeamMember,
} from '../types/nexops';
import {
  calculateVaultStorageStats,
  formatDateTime,
  formatStorageSize,
  TEN_GB_BYTES,
} from '../utils/storage';
import { PendingApprovalBadge } from './StatusIndicator';

interface DocumentVaultViewProps {
  documents: DocumentVaultItem[];
  departments: Department[];
  activeRole: Role;
  currentUser: TeamMember;
  pendingEditorChanges?: PendingEditorChange[];
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

const ACCEPTED_UPLOAD_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.csv,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/zip,image/png,image/jpeg,image/webp';

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

function isImageMime(mime?: string, fileName?: string): boolean {
  if (mime && mime.startsWith('image/')) return true;
  if (fileName && /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName)) return true;
  return false;
}

function isPdfMime(mime?: string, fileName?: string): boolean {
  if (mime && mime.toLowerCase().includes('pdf')) return true;
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  return false;
}

export function DocumentVaultView({
  documents,
  departments,
  activeRole,
  currentUser,
  pendingEditorChanges = [],
  onAddDocument,
  onDeleteDocument,
}: DocumentVaultViewProps) {
  const [selectedFolder, setSelectedFolder] = useState<'ALL' | DocumentVaultFolder>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sessionBlobUrls, setSessionBlobUrls] = useState<Record<string, string>>({});

  // Add Form State
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState<DocumentVaultFolder>('HR & Policies');
  const [department, setDepartment] = useState<Department>(
    currentUser.department || departments[0] || 'Operations',
  );
  const [accessTag, setAccessTag] = useState<DocumentVaultAccessTag>('All Staff');
  const [sourceType, setSourceType] = useState<DocumentVaultSourceType>('uploaded_file');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState('');

  const canManageVault = activeRole === 'Admin' || activeRole === 'Editor';

  const pendingVaultEditIds = useMemo(() => {
    const set = new Set<string>();
    for (const chg of pendingEditorChanges) {
      if (chg.status === 'pending' && chg.module === 'vault' && chg.action !== 'create') {
        set.add(chg.targetId);
      }
    }
    return set;
  }, [pendingEditorChanges]);

  const pendingCreatedVaultDocs = useMemo(() => {
    if (!canManageVault) return [];
    const emailLower = currentUser.email.toLowerCase();
    return pendingEditorChanges.filter(
      (chg) =>
        chg.status === 'pending' &&
        chg.module === 'vault' &&
        chg.action === 'create' &&
        (activeRole === 'Admin' || chg.editorEmail.toLowerCase() === emailLower),
    );
  }, [pendingEditorChanges, activeRole, currentUser.email, canManageVault]);

  const storageStats = useMemo(() => calculateVaultStorageStats(documents), [documents]);

  const storageTone =
    storageStats.usedPercent >= 90
      ? 'rose'
      : storageStats.usedPercent >= 75
        ? 'amber'
        : 'indigo';

  const visibleDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (activeRole === 'Admin') return true;
      if (doc.accessTag === 'Admin Restricted') {
        return false;
      }
      if (doc.accessTag === 'Editors & Admins' && activeRole === 'Viewer') {
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
    setSourceType('uploaded_file');
    setUrl('');
    setDescription('');
    setSelectedFile(null);
    setIsUploading(false);
    setFormError('');
  };

  const resolveDownloadSource = (doc: DocumentVaultItem): string | undefined => {
    return doc.fileDataUrl || doc.url || sessionBlobUrls[doc.id];
  };

  const handleFilePicked = (file: File | undefined) => {
    setFormError('');
    if (!file) return;
    if (storageStats.usedBytes + file.size > TEN_GB_BYTES) {
      setSelectedFile(null);
      setFormError(
        `Quota Exceeded: "${file.name}" (${formatStorageSize(file.size)}) exceeds the remaining 10.0 GB enterprise cloud storage (${formatStorageSize(storageStats.remainingBytes)} available).`,
      );
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!canManageVault || isUploading) return;
    if (!title.trim()) {
      setFormError('Document title is required.');
      return;
    }
    if (sourceType !== 'uploaded_file' && !url.trim()) {
      setFormError('Please provide a valid Google Drive or document URL.');
      return;
    }
    if (sourceType === 'uploaded_file') {
      if (!selectedFile) {
        setFormError('Please select a file to upload.');
        return;
      }
      if (storageStats.usedBytes + selectedFile.size > TEN_GB_BYTES) {
        setFormError(
          `Upload blocked: File exceeds the remaining 10.0 GB cloud storage quota (${formatStorageSize(storageStats.remainingBytes)} remaining).`,
        );
        return;
      }
    }

    setIsUploading(true);
    try {
      const now = new Date().toISOString();
      const docId = `VLT-${Date.now().toString().slice(-6)}`;

      let uploadMeta: {
        url?: string;
        fileDataUrl?: string;
        storageBucket?: string;
        storagePath?: string;
        storageProvider: 'supabase_storage' | 'cloud_metadata';
      } | null = null;

      if (sourceType === 'uploaded_file' && selectedFile) {
        uploadMeta = await dataService.documentVault.uploadFile(selectedFile, {
          id: docId,
          folder,
          department,
        });
        if (!uploadMeta.url && !uploadMeta.fileDataUrl) {
          const objectUrl = URL.createObjectURL(selectedFile);
          setSessionBlobUrls((prev) => ({ ...prev, [docId]: objectUrl }));
        }
      }

      const newItem: DocumentVaultItem = {
        id: docId,
        title: title.trim(),
        folder,
        department,
        description: description.trim(),
        accessTag,
        sourceType,
        url: sourceType !== 'uploaded_file' ? url.trim() : uploadMeta?.url,
        fileName: sourceType === 'uploaded_file' ? selectedFile?.name : undefined,
        fileSize: sourceType === 'uploaded_file' ? selectedFile?.size : undefined,
        mimeType:
          sourceType === 'uploaded_file'
            ? selectedFile?.type || 'application/octet-stream'
            : undefined,
        fileDataUrl: sourceType === 'uploaded_file' ? uploadMeta?.fileDataUrl : undefined,
        storageBucket: uploadMeta?.storageBucket,
        storagePath: uploadMeta?.storagePath,
        storageProvider:
          sourceType === 'uploaded_file'
            ? uploadMeta?.storageProvider ?? 'cloud_metadata'
            : 'external_link',
        uploadedBy: currentUser.name,
        uploadedByEmail: currentUser.email,
        createdAt: now,
        updatedAt: now,
      };

      onAddDocument(newItem);
      resetForm();
      setShowAddModal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload document.';
      setFormError(msg);
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Read-Only Notice */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            Department Document Vault
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Structured company repository across HR, Operations, Finance &amp; Client Contracts with role-based access tags and 10.0 GB cloud storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!canManageVault ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
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

      {/* 10.0 GB Enterprise Cloud Storage Quota Meter */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                storageTone === 'rose'
                  ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-400'
                  : storageTone === 'amber'
                    ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-400'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-400'
              }`}
            >
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  10.0 GB Total Enterprise Cloud Storage
                </h3>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Cloud className="h-3 w-3" />
                  Supabase Cloud Vault
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {formatStorageSize(storageStats.usedBytes)} / 10.0 GB Used
                </span>{' '}
                ({storageStats.usedPercent.toFixed(1)}%) ·{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  {formatStorageSize(storageStats.remainingBytes)} remaining
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-right dark:border-slate-800 dark:bg-slate-950">
              <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Stored Files / Links
              </span>
              <span className="font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {storageStats.fileCount} files · {storageStats.linkCount} links
              </span>
            </div>
          </div>
        </div>

        {/* Sleek Quota Progress Bar */}
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                storageTone === 'rose'
                  ? 'bg-rose-600'
                  : storageTone === 'amber'
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
              }`}
              style={{
                width: `${storageStats.usedBytes > 0 ? Math.max(1.2, storageStats.usedPercent) : 0}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Supports PDF, DOCX, XLSX, PNG, JPG, CSV &amp; ZIP</span>
            <span className="font-mono tabular-nums">
              {storageStats.remainingBytes <= 0
                ? 'Quota Full — Delete old files to upload'
                : `${formatStorageSize(storageStats.remainingBytes)} free of 10.0 GB`}
            </span>
          </div>
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
                  ? 'border-indigo-500 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                    isActive
                      ? 'border-indigo-200 bg-indigo-600 text-white dark:border-indigo-500'
                      : 'border-slate-200 bg-slate-50 text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {count}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">{f.id}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{f.description}</p>
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, descriptions, uploader or filenames..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
            />
          </div>

          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value as 'ALL' | DocumentVaultFolder)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
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
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="ALL">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <p className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {filteredDocuments.length} of {visibleDocuments.length} accessible files
        </p>
      </div>

      {/* Pending Maker-Checker Vault Proposals */}
      {pendingCreatedVaultDocs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/70 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <PendingApprovalBadge label={`${pendingCreatedVaultDocs.length} Pending Super Admin Approval`} />
            <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
              Uploaded / Linked Vault Documents Awaiting Maker-Checker Review
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {pendingCreatedVaultDocs.map((chg) => (
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

      {/* Document Registry Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FolderLock className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No vault documents in this view
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {canManageVault
                ? 'Upload files (PDF, DOCX, XLSX, PNG, JPG, CSV, ZIP) or link Google Drive files using the button above.'
                : 'No accessible documents have been published to this folder yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Document &amp; File Size</th>
                  <th className="px-4 py-3">Folder</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Access Tag</th>
                  <th className="px-4 py-3">Uploaded By &amp; Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {filteredDocuments.map((doc) => {
                  const isFile = doc.sourceType === 'uploaded_file';
                  const isConfirming = confirmDeleteId === doc.id;
                  const downloadSrc = resolveDownloadSource(doc);
                  const canPreview =
                    Boolean(downloadSrc) &&
                    (!isFile ||
                      isImageMime(doc.mimeType, doc.fileName) ||
                      isPdfMime(doc.mimeType, doc.fileName));

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400">
                            {isFile ? (
                              <FileSpreadsheet className="h-4 w-4" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">
                                {doc.title}
                              </p>
                              {pendingVaultEditIds.has(doc.id) && <PendingApprovalBadge compact />}
                              {isFile && (
                                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {formatStorageSize(doc.fileSize)}
                                </span>
                              )}
                            </div>
                            {doc.description && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {doc.description}
                              </p>
                            )}
                            <p className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              {isFile
                                ? `${doc.fileName || 'File'} · ${
                                    doc.storageProvider === 'supabase_storage'
                                      ? 'Supabase Storage'
                                      : 'Cloud Synced'
                                  }`
                                : doc.url}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {doc.folder}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {doc.department}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            doc.accessTag === 'Admin Restricted'
                              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300'
                              : doc.accessTag === 'Editors & Admins'
                                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300'
                                : doc.accessTag === 'Department Only'
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/50 dark:text-indigo-300'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}
                        >
                          {doc.accessTag}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {doc.uploadedBy}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                          {formatDateTime(doc.createdAt || doc.updatedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canPreview && (
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                            >
                              {isFile ? (
                                <Eye className="h-3 w-3" />
                              ) : (
                                <ExternalLink className="h-3 w-3" />
                              )}
                              {isFile ? 'Preview' : 'View'}
                            </button>
                          )}

                          {isFile && downloadSrc && (
                            <a
                              href={downloadSrc}
                              download={doc.fileName || `${doc.title}.bin`}
                              target={doc.url && !doc.fileDataUrl ? '_blank' : undefined}
                              rel={doc.url && !doc.fileDataUrl ? 'noreferrer' : undefined}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Download className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                              Download
                            </a>
                          )}

                          {canManageVault &&
                            (isConfirming ? (
                              <div className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 dark:border-rose-800 dark:bg-rose-950/60">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteDocument(doc.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-rose-700 hover:underline dark:text-rose-300"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(doc.id)}
                                title="Remove document from vault"
                                className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-5 sm:py-4 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Add Document to Vault
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload files to 10.0 GB Cloud Storage or link a Google Drive resource
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 2026 Employee Leave Policy Circular"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Folder
                  </label>
                  <select
                    value={folder}
                    onChange={(e) => setFolder(e.target.value as DocumentVaultFolder)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {VAULT_FOLDERS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Access Tag
                  </label>
                  <select
                    value={accessTag}
                    onChange={(e) => setAccessTag(e.target.value as DocumentVaultAccessTag)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Source Method
                </label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { id: 'uploaded_file' as const, label: 'Upload File' },
                    { id: 'google_drive' as const, label: 'Google Drive Link' },
                    { id: 'external_link' as const, label: 'External URL' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSourceType(opt.id)}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                        sourceType === opt.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {sourceType !== 'uploaded_file' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
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
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Upload File (PDF, DOCX, XLSX, PNG, JPG, CSV, ZIP)
                    </label>
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                      {formatStorageSize(storageStats.remainingBytes)} free
                    </span>
                  </div>
                  <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30">
                    <Upload className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="truncate">
                      {selectedFile
                        ? `${selectedFile.name} (${formatStorageSize(selectedFile.size)})`
                        : 'Click to select PDF, DOCX, XLSX, PNG/JPG, CSV, or ZIP'}
                    </span>
                    <input
                      type="file"
                      accept={ACCEPTED_UPLOAD_TYPES}
                      className="sr-only"
                      onChange={(e) => handleFilePicked(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary, effective dates, or compliance notes..."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isUploading}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isUploading ? 'Uploading...' : 'Save to Vault'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Preview Modal for Uploaded Files & Linked Documents */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2.5 backdrop-blur-xs sm:p-4 dark:bg-slate-950/80"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-3.5 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  {previewDoc.title}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {previewDoc.folder} · {previewDoc.department} · {previewDoc.accessTag}
                  {previewDoc.fileSize ? ` · ${formatStorageSize(previewDoc.fileSize)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {resolveDownloadSource(previewDoc) && (
                  <a
                    href={resolveDownloadSource(previewDoc)}
                    download={previewDoc.fileName || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800"
                  >
                    {previewDoc.sourceType === 'uploaded_file' ? (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Source Link
                      </>
                    )}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-950">
              {previewDoc.sourceType === 'uploaded_file' &&
              resolveDownloadSource(previewDoc) &&
              isImageMime(previewDoc.mimeType, previewDoc.fileName) ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <img
                    src={resolveDownloadSource(previewDoc)}
                    alt={previewDoc.title}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>
              ) : previewDoc.sourceType === 'uploaded_file' &&
                resolveDownloadSource(previewDoc) &&
                isPdfMime(previewDoc.mimeType, previewDoc.fileName) ? (
                <iframe
                  title={previewDoc.title}
                  src={resolveDownloadSource(previewDoc)}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
                />
              ) : previewDoc.url && getEmbedPreviewUrl(previewDoc.url) ? (
                <iframe
                  title={previewDoc.title}
                  src={getEmbedPreviewUrl(previewDoc.url)!}
                  className="h-full w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <Link2 className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                  <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {previewDoc.title}
                  </p>
                  {previewDoc.description && (
                    <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-300">
                      {previewDoc.description}
                    </p>
                  )}
                  <p className="mt-3 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
                    {previewDoc.fileName || previewDoc.url}
                  </p>
                  {resolveDownloadSource(previewDoc) && (
                    <a
                      href={resolveDownloadSource(previewDoc)}
                      download={previewDoc.fileName || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {previewDoc.sourceType === 'uploaded_file'
                        ? 'Download File'
                        : 'Open Document URL'}
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
