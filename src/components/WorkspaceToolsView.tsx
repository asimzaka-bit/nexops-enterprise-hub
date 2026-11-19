import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createGoogleDoc,
  createGoogleForm,
  createGoogleSheet,
  disconnectGoogleWorkspace,
  extractGoogleFileId,
  fetchGoogleResourceMetadata,
  fetchRecentGmailMessages,
  getCurrentGoogleUser,
  getGoogleEmbedUrl,
  getGoogleWorkspaceAccessToken,
  GmailRecentMessage,
  GoogleResourceMetadata,
  initGoogleWorkspaceAuth,
  sendEmailViaGmailApi,
  signInWithGoogleWorkspace,
} from '../services/googleWorkspaceService';
import {
  Department,
  TeamMember,
  WorkspaceDocToolType,
  WorkspaceEmailLog,
  WorkspaceSavedLink,
  WorkspaceToolType,
} from '../types/nexops';
import { formatDateTime } from '../utils/storage';

interface WorkspaceToolsViewProps {
  activeTool: WorkspaceToolType;
  onSelectTool: (tool: WorkspaceToolType) => void;
  currentUser: TeamMember;
  teamMembers: TeamMember[];
  departments: string[];
  emails: WorkspaceEmailLog[];
  links: WorkspaceSavedLink[];
  onSaveEmailLog: (emailLog: WorkspaceEmailLog) => void;
  onSaveWorkspaceLink: (link: WorkspaceSavedLink) => void;
  onDeleteWorkspaceLink: (linkId: string) => void;
  onNotify: (
    title: string,
    description: string,
    variant?: 'success' | 'error' | 'warning' | 'info',
  ) => void;
}

type PendingConfirmation =
  | {
      kind: 'send_gmail';
      to: string;
      cc: string;
      subject: string;
      body: string;
      fromEmail: string;
      fromName: string;
    }
  | {
      kind: 'create_google_doc';
      toolType: WorkspaceDocToolType;
      title: string;
      department: Department;
      notes: string;
    }
  | {
      kind: 'delete_link';
      link: WorkspaceSavedLink;
    };

const TOOL_TABS: {
  id: WorkspaceToolType;
  label: string;
  subtitle: string;
  icon: typeof Mail;
  accentClass: string;
  badgeClass: string;
}[] = [
  {
    id: 'gmail',
    label: 'Gmail Client',
    subtitle: 'Compose, send & audit corporate emails',
    icon: Mail,
    accentClass: 'text-rose-600',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    id: 'docs',
    label: 'Google Docs',
    subtitle: 'Create & collaborate on live SOPs and briefs',
    icon: FileText,
    accentClass: 'text-blue-600',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'sheets',
    label: 'Google Sheets',
    subtitle: 'Live financial trackers, budgets & matrices',
    icon: FileSpreadsheet,
    accentClass: 'text-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'forms',
    label: 'Google Forms',
    subtitle: 'Intake surveys, QA feedback & audit forms',
    icon: ClipboardList,
    accentClass: 'text-violet-600',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
];

const DOC_TOOL_META: Record<
  WorkspaceDocToolType,
  {
    singular: string;
    plural: string;
    newUrl: string;
    placeholderUrl: string;
  }
> = {
  docs: {
    singular: 'Google Doc',
    plural: 'Google Docs',
    newUrl: 'https://docs.new',
    placeholderUrl: 'https://docs.google.com/document/d/.../edit',
  },
  sheets: {
    singular: 'Google Sheet',
    plural: 'Google Sheets',
    newUrl: 'https://sheets.new',
    placeholderUrl: 'https://docs.google.com/spreadsheets/d/.../edit',
  },
  forms: {
    singular: 'Google Form',
    plural: 'Google Forms',
    newUrl: 'https://forms.new',
    placeholderUrl: 'https://docs.google.com/forms/d/.../edit',
  },
};

function GoogleSignInButton({
  loading,
  onClick,
  label = 'Sign in with Google',
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
      ) : (
        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
          <path fill="none" d="M0 0h48v48H0z" />
        </svg>
      )}
      <span>{loading ? 'Connecting Google...' : label}</span>
    </button>
  );
}

export function WorkspaceToolsView({
  activeTool,
  onSelectTool,
  currentUser,
  teamMembers,
  departments,
  emails,
  links,
  onSaveEmailLog,
  onSaveWorkspaceLink,
  onDeleteWorkspaceLink,
  onNotify,
}: WorkspaceToolsViewProps) {
  // Google Workspace OAuth session state (in-memory token only)
  const [googleToken, setGoogleToken] = useState<string | null>(() =>
    getGoogleWorkspaceAccessToken(),
  );
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    () => getCurrentGoogleUser()?.email ?? null,
  );
  const [googleConnecting, setGoogleConnecting] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (user, token) => {
        setGoogleToken(token);
        setGoogleEmail(user.email ?? null);
      },
      () => {
        setGoogleToken(getGoogleWorkspaceAccessToken());
        setGoogleEmail(getCurrentGoogleUser()?.email ?? null);
      },
    );
    return unsubscribe;
  }, []);

  // Gmail Configuration & Composer State
  const senderStorageKey = `nexops_gmail_sender_${currentUser.id}`;
  const [configuredGmail, setConfiguredGmail] = useState<string>(() => {
    try {
      return localStorage.getItem(senderStorageKey) || currentUser.email;
    } catch {
      return currentUser.email;
    }
  });
  const [editingSender, setEditingSender] = useState(false);
  const [draftSenderEmail, setDraftSenderEmail] = useState(configuredGmail);

  useEffect(() => {
    if (googleEmail) {
      setConfiguredGmail(googleEmail);
      setDraftSenderEmail(googleEmail);
    }
  }, [googleEmail]);

  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [sendingMail, setSendingMail] = useState(false);
  const [recentMessages, setRecentMessages] = useState<GmailRecentMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [gmailPaneTab, setGmailPaneTab] = useState<'sent_log' | 'live_gmail'>('sent_log');

  // Docs / Sheets / Forms State
  const [docSearch, setDocSearch] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createDept, setCreateDept] = useState<Department>(
    currentUser.department || departments[0] || 'Operations',
  );
  const [createNotes, setCreateNotes] = useState('');
  const [creatingDoc, setCreatingDoc] = useState(false);

  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteDept, setPasteDept] = useState<Department>(
    currentUser.department || departments[0] || 'Operations',
  );
  const [pasteNotes, setPasteNotes] = useState('');
  const [showPasteForm, setShowPasteForm] = useState(false);

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [embedMode, setEmbedMode] = useState<'edit' | 'preview'>('edit');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveMetadata, setLiveMetadata] = useState<GoogleResourceMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Explicit User Confirmation Modal (Required for all Workspace API mutations)
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [executingConfirm, setExecutingConfirm] = useState(false);

  const docTool: WorkspaceDocToolType =
    activeTool === 'gmail' ? 'docs' : activeTool;

  const filteredLinks = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return links.filter((link) => {
      if (link.toolType !== docTool) return false;
      if (!q) return true;
      return (
        link.title.toLowerCase().includes(q) ||
        link.department.toLowerCase().includes(q) ||
        link.addedBy.toLowerCase().includes(q) ||
        link.notes.toLowerCase().includes(q)
      );
    });
  }, [links, docTool, docSearch]);

  const selectedLink = useMemo(() => {
    if (selectedLinkId) {
      const match = filteredLinks.find((l) => l.id === selectedLinkId);
      if (match) return match;
    }
    return filteredLinks[0] ?? null;
  }, [filteredLinks, selectedLinkId]);

  useEffect(() => {
    setLiveMetadata(null);
    setMetadataError(null);
  }, [selectedLink?.id, activeTool]);

  const handleGoogleSignIn = async () => {
    setGoogleConnecting(true);
    try {
      const { user, accessToken } = await signInWithGoogleWorkspace();
      setGoogleToken(accessToken);
      setGoogleEmail(user.email ?? null);
      onNotify(
        'Google Workspace Connected',
        `Authorized ${user.email || 'Google account'} for Gmail, Docs, Sheets & Forms.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Sign-In Cancelled or Failed',
        err instanceof Error ? err.message : 'Unable to connect Google Workspace.',
        'warning',
      );
    } finally {
      setGoogleConnecting(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await disconnectGoogleWorkspace();
    setGoogleToken(null);
    setGoogleEmail(null);
    setRecentMessages([]);
    setLiveMetadata(null);
    onNotify('Google Workspace Disconnected', 'Cleared active Google access session.', 'info');
  };

  const handleSaveSenderConfig = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = draftSenderEmail.trim();
    if (!cleaned || !cleaned.includes('@')) {
      onNotify('Invalid Gmail Address', 'Enter a valid corporate Gmail address.', 'warning');
      return;
    }
    setConfiguredGmail(cleaned);
    try {
      localStorage.setItem(senderStorageKey, cleaned);
    } catch {
      // Ignore quota errors
    }
    setEditingSender(false);
    onNotify('Sender Gmail Saved', `Configured outbound sender: ${cleaned}`, 'success');
  };

  const handleRequestGmailSend = (e: FormEvent) => {
    e.preventDefault();
    if (!mailTo.trim() || !mailTo.includes('@')) {
      onNotify('Recipient Required', 'Enter a valid recipient email address in To.', 'warning');
      return;
    }
    if (!mailSubject.trim()) {
      onNotify('Subject Required', 'Enter an email subject line before sending.', 'warning');
      return;
    }
    if (!mailBody.trim()) {
      onNotify('Message Body Required', 'Enter email message content before sending.', 'warning');
      return;
    }
    if (!googleToken) {
      onNotify(
        'Connect Google Account First',
        'Click "Sign in with Google" to send directly via Gmail API, or use Open in Mail App.',
        'warning',
      );
      return;
    }

    setConfirmation({
      kind: 'send_gmail',
      to: mailTo.trim(),
      cc: mailCc.trim(),
      subject: mailSubject.trim(),
      body: mailBody.trim(),
      fromEmail: googleEmail || configuredGmail,
      fromName: currentUser.name,
    });
  };

  const handleMailtoDispatchLog = () => {
    if (!mailTo.trim() || !mailSubject.trim()) {
      onNotify(
        'To & Subject Required',
        'Fill in at least Recipient (To) and Subject before launching your mail client.',
        'warning',
      );
      return;
    }

    const params = new URLSearchParams();
    if (mailCc.trim()) params.set('cc', mailCc.trim());
    params.set('subject', mailSubject.trim());
    params.set('body', mailBody.trim());
    const mailtoHref = `mailto:${encodeURIComponent(mailTo.trim())}?${params.toString()}`;

    const a = document.createElement('a');
    a.href = mailtoHref;
    a.click();

    const log: WorkspaceEmailLog = {
      id: `eml-${Date.now()}`,
      senderEmail: configuredGmail,
      senderName: currentUser.name,
      toRecipients: mailTo.trim(),
      ccRecipients: mailCc.trim(),
      subject: mailSubject.trim(),
      body: mailBody.trim(),
      deliveryMethod: 'Mail Client (mailto)',
      status: 'Dispatched via Mail Client',
      sentAt: new Date().toISOString(),
    };
    onSaveEmailLog(log);
  };

  const handleRefreshLiveGmail = async () => {
    if (!googleToken) return;
    setLoadingInbox(true);
    try {
      const msgs = await fetchRecentGmailMessages(8);
      setRecentMessages(msgs);
      setGmailPaneTab('live_gmail');
    } catch (err) {
      onNotify(
        'Gmail Fetch Failed',
        err instanceof Error ? err.message : 'Unable to load recent Gmail messages.',
        'warning',
      );
    } finally {
      setLoadingInbox(false);
    }
  };

  const handleRequestCreateGoogleDoc = (e: FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      onNotify(
        'Document Title Required',
        `Enter a title for the new ${DOC_TOOL_META[docTool].singular}.`,
        'warning',
      );
      return;
    }
    if (!googleToken) {
      onNotify(
        'Connect Google Workspace',
        'Sign in with Google above to create new Docs, Sheets, and Forms directly via API.',
        'warning',
      );
      return;
    }

    setConfirmation({
      kind: 'create_google_doc',
      toolType: docTool,
      title: createTitle.trim(),
      department: createDept,
      notes: createNotes.trim(),
    });
  };

  const handleSavePastedLink = (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = pasteTitle.trim();
    const cleanUrl = pasteUrl.trim();
    if (!cleanTitle) {
      onNotify('Title Required', 'Provide a descriptive title for the team document link.', 'warning');
      return;
    }
    if (!cleanUrl || (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://'))) {
      onNotify('Valid URL Required', 'Paste a complete https:// Google Docs/Sheets/Forms URL.', 'warning');
      return;
    }

    const now = new Date().toISOString();
    const fileId = extractGoogleFileId(docTool, cleanUrl) ?? undefined;
    const newLink: WorkspaceSavedLink = {
      id: `lnk-${Date.now()}`,
      toolType: docTool,
      title: cleanTitle,
      url: cleanUrl,
      googleFileId: fileId,
      department: pasteDept,
      notes: pasteNotes.trim(),
      addedBy: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };

    onSaveWorkspaceLink(newLink);
    setSelectedLinkId(newLink.id);
    setPasteTitle('');
    setPasteUrl('');
    setPasteNotes('');
    setShowPasteForm(false);
  };

  const handleExecuteConfirmedAction = async () => {
    if (!confirmation) return;
    setExecutingConfirm(true);
    try {
      if (confirmation.kind === 'send_gmail') {
        setSendingMail(true);
        const sentRes = await sendEmailViaGmailApi({
          fromEmail: confirmation.fromEmail,
          fromName: confirmation.fromName,
          to: confirmation.to,
          cc: confirmation.cc,
          subject: confirmation.subject,
          body: confirmation.body,
        });

        const emailLog: WorkspaceEmailLog = {
          id: `eml-${Date.now()}`,
          senderEmail: confirmation.fromEmail,
          senderName: confirmation.fromName,
          toRecipients: confirmation.to,
          ccRecipients: confirmation.cc,
          subject: confirmation.subject,
          body: confirmation.body,
          deliveryMethod: 'Gmail API',
          gmailMessageId: sentRes.id,
          status: 'Sent',
          sentAt: new Date().toISOString(),
        };
        onSaveEmailLog(emailLog);
        setMailTo('');
        setMailCc('');
        setMailSubject('');
        setMailBody('');
        setGmailPaneTab('sent_log');
      } else if (confirmation.kind === 'create_google_doc') {
        setCreatingDoc(true);
        const created =
          confirmation.toolType === 'docs'
            ? await createGoogleDoc(confirmation.title)
            : confirmation.toolType === 'sheets'
              ? await createGoogleSheet(confirmation.title)
              : await createGoogleForm(confirmation.title);

        const now = new Date().toISOString();
        const savedLink: WorkspaceSavedLink = {
          id: `lnk-${Date.now()}`,
          toolType: confirmation.toolType,
          title: created.title,
          url: created.url,
          googleFileId: created.fileId,
          department: confirmation.department,
          notes: confirmation.notes,
          addedBy: currentUser.name,
          createdAt: now,
          updatedAt: now,
        };
        onSaveWorkspaceLink(savedLink);
        setSelectedLinkId(savedLink.id);
        setCreateTitle('');
        setCreateNotes('');
      } else if (confirmation.kind === 'delete_link') {
        onDeleteWorkspaceLink(confirmation.link.id);
        if (selectedLinkId === confirmation.link.id) {
          setSelectedLinkId(null);
        }
      }
      setConfirmation(null);
    } catch (err) {
      onNotify(
        'Workspace Operation Failed',
        err instanceof Error ? err.message : 'Unable to complete Google Workspace request.',
        'error',
      );
    } finally {
      setExecutingConfirm(false);
      setSendingMail(false);
      setCreatingDoc(false);
    }
  };

  const handleInspectLiveMetadata = async () => {
    if (!selectedLink) return;
    const fileId = selectedLink.googleFileId || extractGoogleFileId(docTool, selectedLink.url);
    if (!fileId) {
      setMetadataError('Could not extract a Google File ID from this URL.');
      return;
    }
    setLoadingMetadata(true);
    setMetadataError(null);
    try {
      const meta = await fetchGoogleResourceMetadata(docTool, fileId);
      setLiveMetadata(meta);
    } catch (err) {
      setMetadataError(
        err instanceof Error ? err.message : 'Unable to fetch file metadata from Google API.',
      );
    } finally {
      setLoadingMetadata(false);
    }
  };

  const handleCopyUrl = async (link: WorkspaceSavedLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      onNotify('Copy Failed', 'Select and copy the URL manually.', 'warning');
    }
  };

  const applyEmailTemplate = (template: 'followup' | 'sla' | 'digest') => {
    if (template === 'followup') {
      setMailSubject('[NexOps] Operational Request QA Review Follow-Up');
      setMailBody(
        `Hello,\n\nPlease review the pending operational request assigned in NexOps Enterprise Hub and confirm QA checklist verification at your earliest convenience.\n\nBest regards,\n${currentUser.name}\n${currentUser.signOffTitle || currentUser.title}`,
      );
    } else if (template === 'sla') {
      setMailSubject('[URGENT SLA] Escalation Notice — Action Required');
      setMailBody(
        `Hello Team,\n\nAn active deliverable is approaching or has breached its SLA target window. Kindly inspect the item inside NexOps Enterprise Hub and record your Stage sign-off or revision feedback.\n\nRegards,\n${currentUser.name}\n${currentUser.department}`,
      );
    } else {
      setMailSubject('[NexOps Weekly] Departmental Operations Summary');
      setMailBody(
        `Team,\n\nHere is our weekly operations update across active requests, budget utilization, and SOP compliance items.\n\n1. Priority Deliverables:\n2. Open Action Items:\n3. Upcoming Milestones:\n\nBest regards,\n${currentUser.name}`,
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Workspace Tools Switcher & Google Account Connection Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {TOOL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTool === tab.id;
              const count =
                tab.id === 'gmail'
                  ? emails.length
                  : links.filter((l) => l.toolType === tab.id).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTool(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${isSelected ? 'text-white' : tab.accentClass}`}
                  />
                  <span>{tab.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                      isSelected
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {googleToken ? (
              <>
                <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Connected: {googleEmail || 'Google Workspace'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleGoogleDisconnect()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5 text-slate-500" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <GoogleSignInButton
                loading={googleConnecting}
                onClick={() => void handleGoogleSignIn()}
                label="Sign in with Google Workspace"
              />
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 1. GMAIL CORPORATE MAIL COMPOSER & CLIENT                           */}
      {/* =================================================================== */}
      {activeTool === 'gmail' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Left: Compose & Sender Configuration */}
          <div className="space-y-5 xl:col-span-6">
            {/* Linked Gmail Configuration */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Corporate Sender Configuration
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDraftSenderEmail(configuredGmail);
                    setEditingSender((prev) => !prev);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  {editingSender ? 'Cancel' : 'Configure Gmail Address'}
                </button>
              </div>

              {editingSender ? (
                <form onSubmit={handleSaveSenderConfig} className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="email"
                    required
                    value={draftSenderEmail}
                    onChange={(e) => setDraftSenderEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-9 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Save Sender
                  </button>
                </form>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                  <div>
                    <span className="text-slate-500">Active Outbound Address: </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {googleEmail || configuredGmail}
                    </span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      googleToken
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {googleToken ? 'Gmail API Ready' : 'Mail Client Fallback'}
                  </span>
                </div>
              )}
            </div>

            {/* Mail Composer Card */}
            <form
              onSubmit={handleRequestGmailSend}
              className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-rose-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Compose Corporate Email
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyEmailTemplate('followup')}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    QA Follow-Up
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEmailTemplate('sla')}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    SLA Notice
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEmailTemplate('digest')}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Ops Digest
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="mail-to" className="block text-xs font-semibold text-slate-700">
                    To Recipient(s) *
                  </label>
                  <input
                    id="mail-to"
                    type="text"
                    required
                    value={mailTo}
                    onChange={(e) => setMailTo(e.target.value)}
                    placeholder="colleague@company.com"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="mail-cc" className="block text-xs font-semibold text-slate-700">
                    CC (Optional)
                  </label>
                  <input
                    id="mail-cc"
                    type="text"
                    value={mailCc}
                    onChange={(e) => setMailCc(e.target.value)}
                    placeholder="manager@company.com"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Team Directory Quick Recipient Picker */}
              {teamMembers.length > 0 && (
                <div>
                  <label
                    htmlFor="mail-quick-pick"
                    className="block text-[11px] font-medium text-slate-500"
                  >
                    Quick Add from Team Directory
                  </label>
                  <select
                    id="mail-quick-pick"
                    value=""
                    onChange={(e) => {
                      const picked = e.target.value;
                      if (!picked) return;
                      setMailTo((prev) =>
                        prev.trim()
                          ? prev.includes(picked)
                            ? prev
                            : `${prev.trim()}, ${picked}`
                          : picked,
                      );
                    }}
                    className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select a colleague to add to To...</option>
                    {teamMembers
                      .filter((m) => m.active && m.email)
                      .map((m) => (
                        <option key={m.id} value={m.email}>
                          {m.name} ({m.department}) — {m.email}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="mail-subject" className="block text-xs font-semibold text-slate-700">
                  Subject *
                </label>
                <input
                  id="mail-subject"
                  type="text"
                  required
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  placeholder="Enter corporate email subject..."
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="mail-body" className="block text-xs font-semibold text-slate-700">
                  Message Body *
                </label>
                <textarea
                  id="mail-body"
                  rows={7}
                  required
                  value={mailBody}
                  onChange={(e) => setMailBody(e.target.value)}
                  placeholder="Write your message..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={handleMailtoDispatchLog}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  <span>Open in Mail App (mailto)</span>
                </button>

                <button
                  type="submit"
                  disabled={sendingMail || !googleToken}
                  title={
                    googleToken
                      ? 'Send email directly via connected Gmail API'
                      : 'Sign in with Google Workspace above to send directly via Gmail API'
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingMail ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Send via Gmail API</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Supabase Sent History Log + Live Gmail Recent Messages */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden xl:col-span-6 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGmailPaneTab('sent_log')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    gmailPaneTab === 'sent_log'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>Sent History Log ({emails.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGmailPaneTab('live_gmail')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    gmailPaneTab === 'live_gmail'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Live Gmail Mailbox</span>
                </button>
              </div>

              {gmailPaneTab === 'live_gmail' && googleToken && (
                <button
                  type="button"
                  onClick={() => void handleRefreshLiveGmail()}
                  disabled={loadingInbox}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingInbox ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {gmailPaneTab === 'sent_log' ? (
              <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
                {emails.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Mail className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-800">
                      No Sent Emails Recorded Yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Emails dispatched via Gmail API or Mail Client are saved automatically to
                      Supabase (<span className="font-mono">nexops_workspace_emails</span>).
                    </p>
                  </div>
                ) : (
                  emails.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-slate-50/70">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {item.subject}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            <span className="font-semibold">To:</span> {item.toRecipients}
                            {item.ccRecipients ? ` · CC: ${item.ccRecipients}` : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${
                            item.deliveryMethod === 'Gmail API'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.deliveryMethod}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-slate-600">
                        {item.body}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-slate-400">
                        <span>
                          From: {item.senderName} ({item.senderEmail})
                        </span>
                        <span>{formatDateTime(item.sentAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[600px]">
                {!googleToken ? (
                  <div className="px-6 py-16 text-center space-y-3">
                    <Mail className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-800">
                      Connect Google Workspace to View Live Gmail Messages
                    </p>
                    <p className="text-xs text-slate-500">
                      Sign in with Google above, then click Refresh to inspect recent sent &amp;
                      inbox messages directly from Gmail.
                    </p>
                    <div className="pt-1 flex justify-center">
                      <GoogleSignInButton
                        loading={googleConnecting}
                        onClick={() => void handleGoogleSignIn()}
                      />
                    </div>
                  </div>
                ) : recentMessages.length === 0 ? (
                  <div className="px-6 py-16 text-center space-y-3">
                    <p className="text-xs text-slate-600">
                      Click below to load your recent Gmail messages from your connected account.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRefreshLiveGmail()}
                      disabled={loadingInbox}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      {loadingInbox ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span>Load Live Gmail Messages</span>
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentMessages.map((msg) => (
                      <div key={msg.id} className="p-4 hover:bg-slate-50/70">
                        <p className="truncate text-xs font-bold text-slate-900">{msg.subject}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          From: {msg.from || '—'} · To: {msg.to || '—'}
                        </p>
                        <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{msg.snippet}</p>
                        <p className="mt-1.5 font-mono text-[10px] text-slate-400">{msg.date}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. GOOGLE DOCS, SHEETS & FORMS SPLIT-VIEW WORKSPACE LAUNCHER        */}
      {/* =================================================================== */}
      {activeTool !== 'gmail' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Panel: Create Direct + Paste Shared Company Link + Directory */}
          <div className="space-y-4 lg:col-span-5">
            {/* Create New Live Document via Google API */}
            <form
              onSubmit={handleRequestCreateGoogleDoc}
              className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Create New {DOC_TOOL_META[docTool].singular}
                  </h3>
                </div>
                <a
                  href={DOC_TOOL_META[docTool].newUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <span>Quick Blank Tab</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder={`New ${DOC_TOOL_META[docTool].singular} Title...`}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Department"
                  value={createDept}
                  onChange={(e) => setCreateDept(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Purpose / note (optional)"
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasteForm((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{showPasteForm ? 'Hide Link Form' : 'Paste Existing Link'}</span>
                </button>
                <button
                  type="submit"
                  disabled={creatingDoc}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {creatingDoc ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Create via Google API</span>
                </button>
              </div>
            </form>

            {/* Paste & Save Existing Company Link */}
            {showPasteForm && (
              <form
                onSubmit={handleSavePastedLink}
                className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900">
                    Save Active Company {DOC_TOOL_META[docTool].singular} Link
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowPasteForm(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Document Title (e.g., Q4 Vendor Ledger)"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
                <input
                  type="url"
                  required
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder={DOC_TOOL_META[docTool].placeholderUrl}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    aria-label="Link Department"
                    value={pasteDept}
                    onChange={(e) => setPasteDept(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={pasteNotes}
                    onChange={(e) => setPasteNotes(e.target.value)}
                    placeholder="Collaboration notes..."
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Save to Team Directory
                  </button>
                </div>
              </form>
            )}

            {/* Shared Team Directory List */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder={`Filter shared ${DOC_TOOL_META[docTool].plural}...`}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-8 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {filteredLinks.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <Link2 className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2.5 text-xs font-semibold text-slate-800">
                      No Shared {DOC_TOOL_META[docTool].plural} Saved Yet
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Create a new {DOC_TOOL_META[docTool].singular} above or paste an active
                      company link to share it with your team.
                    </p>
                  </div>
                ) : (
                  filteredLinks.map((link) => {
                    const isSelected = selectedLink?.id === link.id;
                    const canRemove =
                      currentUser.role === 'Admin' || link.addedBy === currentUser.name;
                    return (
                      <div
                        key={link.id}
                        className={`flex items-start justify-between gap-2 p-3.5 transition-colors ${
                          isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedLinkId(link.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-bold text-slate-900">
                              {link.title}
                            </span>
                            <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              {link.department}
                            </span>
                          </div>
                          {link.notes && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-600">
                              {link.notes}
                            </p>
                          )}
                          <p className="mt-1 font-mono text-[10px] text-slate-400">
                            Added by {link.addedBy} · {formatDateTime(link.updatedAt)}
                          </p>
                        </button>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => setConfirmation({ kind: 'delete_link', link })}
                            title="Remove shared link"
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Live Embedded Workspace & Metadata Inspector */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7 flex flex-col">
            {!selectedLink ? (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-center min-h-[540px]">
                <FileText className="h-10 w-10 text-slate-300" />
                <h3 className="mt-3 font-display text-sm font-bold text-slate-900">
                  Split-View {DOC_TOOL_META[docTool].singular} Workspace
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  Select a shared company document on the left, create a new live{' '}
                  {DOC_TOOL_META[docTool].singular} via Google API, or paste an existing URL to
                  launch it right inside NexOps Enterprise Hub.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-bold text-slate-900">
                      {selectedLink.title}
                    </h3>
                    <p className="truncate font-mono text-[11px] text-slate-500">
                      {selectedLink.department} · Shared by {selectedLink.addedBy}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setEmbedMode('edit')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          embedMode === 'edit'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Live Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmbedMode('preview')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          embedMode === 'preview'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Preview
                      </button>
                    </div>

                    {googleToken && (
                      <button
                        type="button"
                        onClick={() => void handleInspectLiveMetadata()}
                        disabled={loadingMetadata}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {loadingMetadata ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <Info className="h-3.5 w-3.5 text-indigo-600" />
                        )}
                        <span>API Details</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(selectedLink)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copiedId === selectedLink.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                      )}
                      <span>{copiedId === selectedLink.id ? 'Copied' : 'Copy Link'}</span>
                    </button>

                    <a
                      href={selectedLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <span>Open Full Screen</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {/* Live API Metadata Summary Strip */}
                {(liveMetadata || metadataError) && (
                  <div className="border-b border-slate-200 bg-indigo-50/50 px-5 py-3 text-xs">
                    {metadataError ? (
                      <p className="font-medium text-rose-700">{metadataError}</p>
                    ) : (
                      liveMetadata && (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-indigo-950">
                              Live Google API Metadata: {liveMetadata.title}
                            </span>
                            <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800">
                              {liveMetadata.summary}
                            </span>
                          </div>
                          {liveMetadata.details.length > 0 && (
                            <p className="text-[11px] text-slate-600">
                              {liveMetadata.details.join(' · ')}
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Embedded Workspace Iframe */}
                <div className="relative flex-1 bg-slate-100 min-h-[540px]">
                  <iframe
                    key={`${selectedLink.id}-${embedMode}`}
                    src={getGoogleEmbedUrl(docTool, selectedLink.url, embedMode)}
                    title={selectedLink.title}
                    className="h-[540px] w-full border-0 bg-white"
                    allow="clipboard-read; clipboard-write"
                  />
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
                  Tip: If a private Google document restricts embedded frames, click{' '}
                  <span className="font-semibold text-slate-700">Open Full Screen</span> above or
                  update Google sharing to &ldquo;Anyone with the link&rdquo;.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* EXPLICIT USER CONFIRMATION MODAL (Mandatory for Workspace Mutations)*/}
      {/* =================================================================== */}
      {confirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="workspace-confirm-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  {confirmation.kind === 'send_gmail' && 'Confirm Sending Email via Gmail'}
                  {confirmation.kind === 'create_google_doc' &&
                    `Create New ${DOC_TOOL_META[confirmation.toolType].singular}?`}
                  {confirmation.kind === 'delete_link' && 'Remove Shared Workspace Link?'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {confirmation.kind === 'send_gmail' &&
                    `You are about to send an official email from ${confirmation.fromEmail} via your connected Gmail account.`}
                  {confirmation.kind === 'create_google_doc' &&
                    `This will create "${confirmation.title}" inside your connected Google Workspace account (${googleEmail || currentUser.email}) and share its link with your NexOps team.`}
                  {confirmation.kind === 'delete_link' &&
                    `Remove "${confirmation.link.title}" from the shared NexOps Workspace directory? (The underlying Google file will not be deleted.)`}
                </p>

                {confirmation.kind === 'send_gmail' && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                    <p>
                      <span className="font-semibold text-slate-700">To:</span> {confirmation.to}
                    </p>
                    {confirmation.cc && (
                      <p>
                        <span className="font-semibold text-slate-700">CC:</span> {confirmation.cc}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold text-slate-700">Subject:</span>{' '}
                      {confirmation.subject}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={executingConfirm}
                onClick={() => setConfirmation(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={executingConfirm}
                onClick={() => void handleExecuteConfirmedAction()}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                  confirmation.kind === 'delete_link'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {executingConfirm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {confirmation.kind === 'send_gmail'
                    ? 'Confirm & Send Email'
                    : confirmation.kind === 'create_google_doc'
                      ? 'Confirm & Create'
                      : 'Confirm Remove'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
