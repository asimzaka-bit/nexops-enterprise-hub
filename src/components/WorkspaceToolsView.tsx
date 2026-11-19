import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileEdit,
  Forward,
  Inbox,
  Info,
  Link2,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createGoogleDoc,
  createGoogleForm,
  createGoogleSheet,
  disconnectGoogleWorkspace,
  extractGoogleFileId,
  fetchGmailLabels,
  fetchGmailMessageDetail,
  fetchGoogleResourceMetadata,
  fetchRecentGmailMessages,
  getCurrentGoogleUser,
  getGoogleEmbedUrl,
  getGoogleWorkspaceAccessToken,
  GmailFolderKey,
  GmailLabelItem,
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
import {
  GmailColorIcon,
  GoogleDocsColorIcon,
  GoogleFormsColorIcon,
  GoogleGColorIcon,
  GoogleSheetsColorIcon,
} from './GoogleWorkspaceIcons';

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

interface UnifiedMailRow {
  id: string;
  source: 'gmail' | 'nexops_log';
  threadId?: string;
  senderDisplay: string;
  senderEmail: string;
  to: string;
  cc?: string;
  subject: string;
  snippet: string;
  bodyText?: string;
  dateRaw: string;
  isUnread: boolean;
  isStarred: boolean;
  labels: string[];
  deliveryMethod?: string;
}

const TOOL_TABS: {
  id: WorkspaceToolType;
  label: string;
  renderIcon: (className?: string) => React.ReactNode;
}[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    renderIcon: (cls) => <GmailColorIcon className={cls} />,
  },
  {
    id: 'docs',
    label: 'Google Docs',
    renderIcon: (cls) => <GoogleDocsColorIcon className={cls} />,
  },
  {
    id: 'sheets',
    label: 'Google Sheets',
    renderIcon: (cls) => <GoogleSheetsColorIcon className={cls} />,
  },
  {
    id: 'forms',
    label: 'Google Forms',
    renderIcon: (cls) => <GoogleFormsColorIcon className={cls} />,
  },
];

const DOC_TOOL_META: Record<
  WorkspaceDocToolType,
  {
    singular: string;
    plural: string;
    newUrl: string;
    placeholderUrl: string;
    primaryBtnClass: string;
    badgeClass: string;
    subtitle: string;
    renderIcon: (className?: string) => React.ReactNode;
  }
> = {
  docs: {
    singular: 'Google Doc',
    plural: 'Google Docs',
    newUrl: 'https://docs.new',
    placeholderUrl: 'https://docs.google.com/document/d/.../edit',
    primaryBtnClass: 'bg-[#1A73E8] hover:bg-[#1557B0] text-white',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    subtitle: 'Create, edit, and collaborate on live Google Documents inside NexOps',
    renderIcon: (cls) => <GoogleDocsColorIcon className={cls} />,
  },
  sheets: {
    singular: 'Google Sheet',
    plural: 'Google Sheets',
    newUrl: 'https://sheets.new',
    placeholderUrl: 'https://docs.google.com/spreadsheets/d/.../edit',
    primaryBtnClass: 'bg-[#0F9D58] hover:bg-[#0B8043] text-white',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subtitle: 'Live financial spreadsheets, operational ledgers, and departmental matrices',
    renderIcon: (cls) => <GoogleSheetsColorIcon className={cls} />,
  },
  forms: {
    singular: 'Google Form',
    plural: 'Google Forms',
    newUrl: 'https://forms.new',
    placeholderUrl: 'https://docs.google.com/forms/d/.../edit',
    primaryBtnClass: 'bg-[#7248B9] hover:bg-[#5E35B1] text-white',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    subtitle: 'Build and fill out live Google Forms, surveys, and QA intake sheets',
    renderIcon: (cls) => <GoogleFormsColorIcon className={cls} />,
  },
};

function GoogleSignInButton({
  loading,
  onClick,
  label = 'Sign in with Google / Verify Gmail Account',
  compact = false,
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2.5 rounded-full border border-[#747775]/40 bg-white font-medium text-[#1F1F1F] shadow-xs transition-all hover:bg-[#F8FAFD] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#0B57D0] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap ${
        compact ? 'h-9 px-3.5 text-xs' : 'h-10 px-4 text-xs'
      }`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#0B57D0] shrink-0" />
      ) : (
        <GoogleGColorIcon className="h-4 w-4 shrink-0" />
      )}
      <span>{loading ? 'Verifying Google Account...' : label}</span>
    </button>
  );
}

function parseSenderParts(rawFrom: string): { name: string; email: string } {
  const trimmed = rawFrom.trim();
  if (!trimmed) return { name: 'Unknown Sender', email: '' };
  const match = trimmed.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    const cleanName = match[1].replace(/^["']|["']$/g, '').trim();
    const cleanEmail = match[2].trim();
    return { name: cleanName || cleanEmail, email: cleanEmail };
  }
  return { name: trimmed, email: trimmed.includes('@') ? trimmed : '' };
}

function formatGmailShortDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 12);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  const [googleDisplayName, setGoogleDisplayName] = useState<string | null>(
    () => getCurrentGoogleUser()?.displayName ?? null,
  );
  const [googlePhotoUrl, setGooglePhotoUrl] = useState<string | null>(
    () => getCurrentGoogleUser()?.photoURL ?? null,
  );
  const [googleConnecting, setGoogleConnecting] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (user, token) => {
        setGoogleToken(token);
        setGoogleEmail(user.email ?? null);
        setGoogleDisplayName(user.displayName ?? null);
        setGooglePhotoUrl(user.photoURL ?? null);
      },
      () => {
        const cur = getCurrentGoogleUser();
        setGoogleToken(getGoogleWorkspaceAccessToken());
        setGoogleEmail(cur?.email ?? null);
        setGoogleDisplayName(cur?.displayName ?? null);
        setGooglePhotoUrl(cur?.photoURL ?? null);
      },
    );
    return unsubscribe;
  }, []);

  // =========================================================================
  // 1. GMAIL AUTHENTIC CLIENT STATE
  // =========================================================================
  const [gmailFolder, setGmailFolder] = useState<GmailFolderKey>('inbox');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [gmailSearchInput, setGmailSearchInput] = useState('');
  const [gmailSearchSubmitted, setGmailSearchSubmitted] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [gmailMessages, setGmailMessages] = useState<GmailRecentMessage[]>([]);
  const [gmailLabels, setGmailLabels] = useState<GmailLabelItem[]>([]);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [loadingMailbox, setLoadingMailbox] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);

  const [starredIds, setStarredIds] = useState<Record<string, boolean>>({});
  const [snoozedMap, setSnoozedMap] = useState<Record<string, UnifiedMailRow>>({});
  const [openedMessage, setOpenedMessage] = useState<UnifiedMailRow | null>(null);
  const [loadingMessageBody, setLoadingMessageBody] = useState(false);

  // Floating Bottom-Right Gmail Compose Window State
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeExpanded, setComposeExpanded] = useState(false);
  const [showCcField, setShowCcField] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [sendingMail, setSendingMail] = useState(false);

  // =========================================================================
  // 2. GOOGLE DOCS, SHEETS & FORMS WORKSPACE STATE
  // =========================================================================
  const [docSearch, setDocSearch] = useState('');
  const [activeDocPanel, setActiveDocPanel] = useState<'none' | 'create_api' | 'add_link'>('none');
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
  const [adHocUrl, setAdHocUrl] = useState('');
  const [adHocActiveUrl, setAdHocActiveUrl] = useState<string | null>(null);

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [embedMode, setEmbedMode] = useState<'edit' | 'preview'>('edit');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveMetadata, setLiveMetadata] = useState<GoogleResourceMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Explicit User Confirmation Modal (Mandatory for Workspace API mutations)
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [executingConfirm, setExecutingConfirm] = useState(false);

  const loadMailboxFolder = useCallback(
    async (folder: GmailFolderKey, searchQuery: string, labelId: string | null) => {
      if (!getGoogleWorkspaceAccessToken()) return;
      if (folder === 'snoozed') {
        setMailboxError(null);
        return;
      }

      setLoadingMailbox(true);
      setMailboxError(null);
      try {
        let q = searchQuery.trim();
        let labelIds: string[] | undefined;

        if (folder === 'inbox') {
          labelIds = ['INBOX'];
        } else if (folder === 'starred') {
          labelIds = ['STARRED'];
        } else if (folder === 'sent') {
          labelIds = ['SENT'];
        } else if (folder === 'drafts') {
          labelIds = ['DRAFT'];
        } else if (folder === 'label' && labelId) {
          labelIds = [labelId];
        }

        const [msgs, labelInfo] = await Promise.all([
          fetchRecentGmailMessages(20, q, labelIds),
          fetchGmailLabels(),
        ]);

        setGmailMessages(msgs);
        setGmailLabels(labelInfo.labels);
        setInboxUnreadCount(labelInfo.inboxUnread);
      } catch (err) {
        setMailboxError(
          err instanceof Error ? err.message : 'Unable to fetch Gmail messages.',
        );
      } finally {
        setLoadingMailbox(false);
      }
    },
    [],
  );

  // Automatically load real Inbox when Google account connects or folder/search changes
  useEffect(() => {
    if (activeTool === 'gmail' && googleToken) {
      void loadMailboxFolder(gmailFolder, gmailSearchSubmitted, selectedLabelId);
    }
  }, [activeTool, googleToken, gmailFolder, gmailSearchSubmitted, selectedLabelId, loadMailboxFolder]);

  const handleGoogleSignIn = async () => {
    setGoogleConnecting(true);
    try {
      const { user, accessToken } = await signInWithGoogleWorkspace();
      setGoogleToken(accessToken);
      setGoogleEmail(user.email ?? null);
      setGoogleDisplayName(user.displayName ?? null);
      setGooglePhotoUrl(user.photoURL ?? null);
      onNotify(
        'Gmail & Google Workspace Verified',
        `Connected as ${user.email || 'Google Account'}. Real Inbox & live API tools unlocked.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Google Verification Cancelled or Failed',
        err instanceof Error ? err.message : 'Unable to verify Google account.',
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
    setGoogleDisplayName(null);
    setGooglePhotoUrl(null);
    setGmailMessages([]);
    setGmailLabels([]);
    setInboxUnreadCount(0);
    setOpenedMessage(null);
    setLiveMetadata(null);
    onNotify('Google Account Disconnected', 'Cleared active Google Workspace access token.', 'info');
  };

  // Unified list of rows for active Gmail folder
  const displayedMailRows = useMemo<UnifiedMailRow[]>(() => {
    const q = gmailSearchSubmitted.trim().toLowerCase();

    if (gmailFolder === 'snoozed') {
      const snoozedList = Object.values(snoozedMap);
      return snoozedList.filter((row) => {
        if (unreadOnly && !row.isUnread) return false;
        if (!q) return true;
        return (
          row.subject.toLowerCase().includes(q) ||
          row.senderDisplay.toLowerCase().includes(q) ||
          row.snippet.toLowerCase().includes(q)
        );
      });
    }

    const mappedGmail: UnifiedMailRow[] = gmailMessages.map((msg) => {
      const parsedFrom = parseSenderParts(msg.from);
      const effectiveStarred = starredIds[msg.id] ?? msg.isStarred;
      return {
        id: msg.id,
        source: 'gmail',
        threadId: msg.threadId,
        senderDisplay:
          gmailFolder === 'sent' ? `To: ${parseSenderParts(msg.to).name}` : parsedFrom.name,
        senderEmail: parsedFrom.email,
        to: msg.to,
        cc: msg.cc,
        subject: msg.subject,
        snippet: msg.snippet,
        bodyText: msg.bodyText,
        dateRaw: msg.date,
        isUnread: msg.isUnread,
        isStarred: effectiveStarred,
        labels: msg.labelIds.filter((l) => !['UNREAD', 'STARRED', 'CATEGORY_PERSONAL'].includes(l)),
      };
    });

    if (gmailFolder === 'sent') {
      const seenSubjects = new Set(
        mappedGmail.map((m) => `${m.subject}::${m.to}`.toLowerCase()),
      );
      const nexopsSent: UnifiedMailRow[] = emails
        .filter((e) => !seenSubjects.has(`${e.subject}::${e.toRecipients}`.toLowerCase()))
        .map((e) => ({
          id: e.id,
          source: 'nexops_log',
          senderDisplay: `To: ${e.toRecipients}`,
          senderEmail: e.senderEmail,
          to: e.toRecipients,
          cc: e.ccRecipients,
          subject: e.subject,
          snippet: e.body.replace(/\s+/g, ' ').slice(0, 140),
          bodyText: e.body,
          dateRaw: e.sentAt,
          isUnread: false,
          isStarred: starredIds[e.id] ?? false,
          labels: ['SENT'],
          deliveryMethod: e.deliveryMethod,
        }));

      const combined = [...mappedGmail, ...nexopsSent];
      return combined.filter((row) => {
        if (unreadOnly && !row.isUnread) return false;
        if (!q) return true;
        return (
          row.subject.toLowerCase().includes(q) ||
          row.senderDisplay.toLowerCase().includes(q) ||
          row.to.toLowerCase().includes(q) ||
          row.snippet.toLowerCase().includes(q)
        );
      });
    }

    return mappedGmail.filter((row) => {
      if (unreadOnly && !row.isUnread) return false;
      return true;
    });
  }, [gmailFolder, gmailMessages, emails, starredIds, snoozedMap, gmailSearchSubmitted, unreadOnly]);

  const handleOpenEmailRow = async (row: UnifiedMailRow) => {
    setOpenedMessage(row);
    if (row.source === 'gmail' && !row.bodyText && googleToken) {
      setLoadingMessageBody(true);
      try {
        const full = await fetchGmailMessageDetail(row.id);
        setOpenedMessage((prev) =>
          prev && prev.id === row.id
            ? {
                ...prev,
                bodyText: full.bodyText || row.snippet,
                cc: full.cc || row.cc,
              }
            : prev,
        );
      } catch {
        // Fallback to snippet gracefully
      } finally {
        setLoadingMessageBody(false);
      }
    }
  };

  const handleToggleStar = (id: string, current: boolean) => {
    setStarredIds((prev) => ({ ...prev, [id]: !current }));
    setOpenedMessage((prev) => (prev && prev.id === id ? { ...prev, isStarred: !current } : prev));
  };

  const handleToggleSnooze = (row: UnifiedMailRow) => {
    setSnoozedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) {
        delete next[row.id];
        onNotify('Removed from Snoozed', row.subject, 'info');
      } else {
        next[row.id] = row;
        onNotify('Snoozed for Follow-Up', `${row.subject} moved to Snoozed list.`, 'info');
      }
      return next;
    });
  };

  const handleSelectFolder = (folder: GmailFolderKey, labelId: string | null = null) => {
    setGmailFolder(folder);
    setSelectedLabelId(labelId);
    setOpenedMessage(null);
  };

  const handleGmailSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGmailSearchSubmitted(gmailSearchInput.trim());
    setOpenedMessage(null);
  };

  const handleOpenCompose = (prefill?: {
    to?: string;
    subject?: string;
    body?: string;
    cc?: string;
  }) => {
    if (prefill) {
      if (prefill.to !== undefined) setMailTo(prefill.to);
      if (prefill.cc !== undefined) {
        setMailCc(prefill.cc);
        setShowCcField(Boolean(prefill.cc));
      }
      if (prefill.subject !== undefined) setMailSubject(prefill.subject);
      if (prefill.body !== undefined) setMailBody(prefill.body);
    }
    setComposeOpen(true);
    setComposeMinimized(false);
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
      onNotify('Message Body Required', 'Write email message content before sending.', 'warning');
      return;
    }
    if (!googleToken) {
      onNotify(
        'Verify Gmail Account First',
        'Click "Sign in with Google / Verify Gmail Account" to send directly via Gmail API, or use Mail App.',
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
      fromEmail: googleEmail || currentUser.email,
      fromName: googleDisplayName || currentUser.name,
    });
  };

  const handleMailtoDispatchLog = () => {
    if (!mailTo.trim() || !mailSubject.trim()) {
      onNotify(
        'To & Subject Required',
        'Fill in at least Recipient (To) and Subject before opening your mail app.',
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
      senderEmail: googleEmail || currentUser.email,
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
    setComposeOpen(false);
  };

  const applyEmailTemplate = (template: 'followup' | 'sla' | 'digest') => {
    if (template === 'followup') {
      setMailSubject('[NexOps] Operational Request QA Review Follow-Up');
      setMailBody(
        `Hello,\n\nPlease review the pending operational request assigned in NexOps Enterprise Hub and confirm QA verification at your earliest convenience.\n\nBest regards,\n${currentUser.name}\n${currentUser.signOffTitle || currentUser.title}`,
      );
    } else if (template === 'sla') {
      setMailSubject('[URGENT SLA] Escalation Notice — Action Required');
      setMailBody(
        `Hello Team,\n\nAn active deliverable is approaching or has breached its SLA target window. Kindly inspect the item inside NexOps Enterprise Hub and record your Stage sign-off.\n\nRegards,\n${currentUser.name}\n${currentUser.department}`,
      );
    } else {
      setMailSubject('[NexOps Weekly] Departmental Operations Summary');
      setMailBody(
        `Team,\n\nHere is our weekly operations summary across active requests, budget utilization, and SOP compliance items.\n\n1. Priority Deliverables:\n2. Open Action Items:\n3. Upcoming Milestones:\n\nBest regards,\n${currentUser.name}`,
      );
    }
  };

  // =========================================================================
  // DOCS / SHEETS / FORMS HANDLERS
  // =========================================================================
  const docTool: WorkspaceDocToolType = activeTool === 'gmail' ? 'docs' : activeTool;
  const docMeta = DOC_TOOL_META[docTool];

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

  const activeDocumentUrl = adHocActiveUrl || selectedLink?.url || null;
  const activeDocumentTitle = adHocActiveUrl
    ? `Live Embedded ${docMeta.singular}`
    : selectedLink?.title || docMeta.singular;

  useEffect(() => {
    setLiveMetadata(null);
    setMetadataError(null);
  }, [selectedLink?.id, activeTool, adHocActiveUrl]);

  const handleRequestCreateGoogleDoc = (e: FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      onNotify(
        'Document Title Required',
        `Enter a title for the new ${docMeta.singular}.`,
        'warning',
      );
      return;
    }
    if (!googleToken) {
      onNotify(
        'Verify Google Account First',
        'Sign in with Google above to create live Docs, Sheets, and Forms directly via API, or use "+ Create New" to open a blank tab.',
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
      onNotify('Title Required', 'Provide a title for this shared document.', 'warning');
      return;
    }
    if (!cleanUrl || (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://'))) {
      onNotify('Valid URL Required', 'Paste a valid https:// Google URL.', 'warning');
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
    setAdHocActiveUrl(null);
    setSelectedLinkId(newLink.id);
    setPasteTitle('');
    setPasteUrl('');
    setPasteNotes('');
    setActiveDocPanel('none');
  };

  const handleQuickPreviewAdHocUrl = (e: FormEvent) => {
    e.preventDefault();
    const url = adHocUrl.trim();
    if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      onNotify('Valid Google URL Required', `Paste a valid ${docMeta.placeholderUrl}`, 'warning');
      return;
    }
    setAdHocActiveUrl(url);
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
        setComposeOpen(false);
        if (gmailFolder === 'sent') {
          void loadMailboxFolder('sent', gmailSearchSubmitted, null);
        }
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
        setAdHocActiveUrl(null);
        setSelectedLinkId(savedLink.id);
        setCreateTitle('');
        setCreateNotes('');
        setActiveDocPanel('none');
      } else if (confirmation.kind === 'delete_link') {
        onDeleteWorkspaceLink(confirmation.link.id);
        if (selectedLinkId === confirmation.link.id) {
          setSelectedLinkId(null);
        }
      }
      setConfirmation(null);
    } catch (err) {
      onNotify(
        'Google Workspace Operation Failed',
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
    if (!activeDocumentUrl) return;
    const fileId =
      (!adHocActiveUrl ? selectedLink?.googleFileId : undefined) ||
      extractGoogleFileId(docTool, activeDocumentUrl);
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

  const handleCopyUrl = async (urlToCopy: string, idKey: string) => {
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopiedId(idKey);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      onNotify('Copy Failed', 'Select and copy the URL manually.', 'warning');
    }
  };

  const snoozedCount = Object.keys(snoozedMap).length;

  return (
    <div className="space-y-4">
      {/* Top Google Workspace Switcher + Account Verification Status */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TOOL_TABS.map((tab) => {
              const isSelected = activeTool === tab.id;
              const count =
                tab.id === 'gmail'
                  ? inboxUnreadCount || emails.length
                  : links.filter((l) => l.toolType === tab.id).length;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTool(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border-[#C2E7FF] bg-[#EDF2FA] text-[#001D35] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.renderIcon('h-4 w-4 shrink-0')}
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                        isSelected
                          ? 'bg-white text-[#0B57D0]'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {googleToken ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 py-1 pr-3 pl-1.5 text-xs font-medium text-emerald-900">
                  {googlePhotoUrl ? (
                    <img
                      src={googlePhotoUrl}
                      alt={googleDisplayName || googleEmail || 'Google User'}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                      {(googleEmail || 'G').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="max-w-[200px] truncate font-semibold">
                    {googleEmail || 'Google Verified'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGoogleDisconnect()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <GoogleSignInButton
                loading={googleConnecting}
                onClick={() => void handleGoogleSignIn()}
                label="Sign in with Google / Verify Gmail Account"
                compact
              />
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 1. AUTHENTIC GOOGLE GMAIL INTERFACE + REAL OAUTH                    */}
      {/* =================================================================== */}
      {activeTool === 'gmail' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#F6F8FC] shadow-xs">
          {/* Authentic Gmail Top Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F6F8FC] px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-[130px]">
              <GmailColorIcon className="h-7 w-7 shrink-0" />
              <span className="font-display text-lg font-medium tracking-tight text-[#444746]">
                Gmail
              </span>
            </div>

            {/* Gmail Pill Search Bar */}
            <form
              onSubmit={handleGmailSearchSubmit}
              className="flex h-11 min-w-[240px] flex-1 max-w-2xl items-center gap-2 rounded-full bg-[#EAF1FB] px-4 transition-all focus-within:bg-white focus-within:shadow-md"
            >
              <button
                type="submit"
                aria-label="Search mail"
                className="rounded-full p-1 text-[#444746] hover:bg-slate-200/60"
              >
                <Search className="h-4 w-4" />
              </button>
              <input
                type="text"
                value={gmailSearchInput}
                onChange={(e) => {
                  setGmailSearchInput(e.target.value);
                  if (!e.target.value.trim()) setGmailSearchSubmitted('');
                }}
                placeholder="Search mail"
                className="w-full bg-transparent text-sm text-[#1F1F1F] placeholder-[#444746] focus:outline-none"
              />
              {gmailSearchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setGmailSearchInput('');
                    setGmailSearchSubmitted('');
                  }}
                  aria-label="Clear mail search"
                  className="rounded-full p-1 text-[#444746] hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {/* Right Actions: Open Full Gmail Window + Status */}
            <div className="flex items-center gap-2">
              {googleToken && (
                <button
                  type="button"
                  onClick={() =>
                    void loadMailboxFolder(gmailFolder, gmailSearchSubmitted, selectedLabelId)
                  }
                  disabled={loadingMailbox}
                  title="Refresh Gmail messages"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#444746] hover:bg-[#E1E5EA]"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingMailbox ? 'animate-spin' : ''}`} />
                </button>
              )}

              <a
                href="https://mail.google.com/mail/u/0/#inbox"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-[#1F1F1F] hover:bg-slate-50"
              >
                <span>Open Full Gmail Window</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#444746]" />
              </a>
            </div>
          </div>

          {/* Gmail Main Body: Left Sub-Nav + Main Mail List / Reader */}
          <div className="flex flex-col md:flex-row min-h-[610px]">
            {/* Left Gmail Sub-Navigation Panel */}
            <aside className="w-full shrink-0 border-b border-slate-200/80 bg-[#F6F8FC] p-3 md:w-56 md:border-r md:border-b-0">
              <button
                type="button"
                onClick={() => handleOpenCompose()}
                className="mb-3 inline-flex h-12 items-center gap-3 rounded-2xl bg-[#C2E7FF] px-5 text-sm font-semibold text-[#001D35] shadow-xs transition-all hover:shadow-md"
              >
                <Pencil className="h-4 w-4" />
                <span>Compose</span>
              </button>

              <div className="space-y-0.5">
                {[
                  {
                    id: 'inbox' as const,
                    label: 'Inbox',
                    icon: Inbox,
                    badge: inboxUnreadCount > 0 ? inboxUnreadCount : undefined,
                  },
                  {
                    id: 'starred' as const,
                    label: 'Starred',
                    icon: Star,
                  },
                  {
                    id: 'snoozed' as const,
                    label: 'Snoozed',
                    icon: Clock,
                    badge: snoozedCount > 0 ? snoozedCount : undefined,
                  },
                  {
                    id: 'sent' as const,
                    label: 'Sent',
                    icon: Send,
                    badge: !googleToken && emails.length > 0 ? emails.length : undefined,
                  },
                  {
                    id: 'drafts' as const,
                    label: 'Drafts',
                    icon: FileEdit,
                  },
                ].map((folder) => {
                  const Icon = folder.icon;
                  const active = gmailFolder === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => handleSelectFolder(folder.id)}
                      className={`flex w-full items-center justify-between rounded-full px-4 py-2 text-xs transition-colors ${
                        active
                          ? 'bg-[#D3E3FD] font-bold text-[#001D35]'
                          : 'font-medium text-[#444746] hover:bg-[#EAEFF8]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{folder.label}</span>
                      </span>
                      {typeof folder.badge === 'number' && folder.badge > 0 && (
                        <span className="font-mono text-[11px] font-bold tabular-nums">
                          {folder.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Gmail Labels Section */}
              <div className="mt-4 border-t border-slate-200/80 pt-3">
                <p className="px-4 pb-1.5 text-[11px] font-semibold tracking-wide text-[#444746]">
                  Labels
                </p>
                {gmailLabels.length === 0 ? (
                  <div className="space-y-0.5">
                    {[
                      { id: 'IMPORTANT', name: 'Important' },
                      { id: 'CATEGORY_UPDATES', name: 'Updates' },
                    ].map((sysLbl) => {
                      const active =
                        gmailFolder === 'label' && selectedLabelId === sysLbl.id;
                      return (
                        <button
                          key={sysLbl.id}
                          type="button"
                          onClick={() => handleSelectFolder('label', sysLbl.id)}
                          className={`flex w-full items-center gap-3 rounded-full px-4 py-1.5 text-xs transition-colors ${
                            active
                              ? 'bg-[#D3E3FD] font-bold text-[#001D35]'
                              : 'font-medium text-[#444746] hover:bg-[#EAEFF8]'
                          }`}
                        >
                          <Tag className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{sysLbl.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {gmailLabels.map((lbl) => {
                      const active = gmailFolder === 'label' && selectedLabelId === lbl.id;
                      return (
                        <button
                          key={lbl.id}
                          type="button"
                          onClick={() => handleSelectFolder('label', lbl.id)}
                          className={`flex w-full items-center gap-3 rounded-full px-4 py-1.5 text-xs transition-colors ${
                            active
                              ? 'bg-[#D3E3FD] font-bold text-[#001D35]'
                              : 'font-medium text-[#444746] hover:bg-[#EAEFF8]'
                          }`}
                        >
                          <Tag className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{lbl.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            {/* Right Main Email Pane (White Rounded Material Canvas) */}
            <div className="flex-1 bg-white md:m-2 md:ml-0 md:rounded-2xl md:border md:border-slate-200/70 flex flex-col overflow-hidden">
              {/* Verification Banner when Google Account is not yet connected */}
              {!googleToken && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-[#EDF2FA] px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <GmailColorIcon className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#001D35]">
                        Verify Your Google Account to Load Live Gmail Inbox &amp; Send Mail
                      </p>
                      <p className="text-[11px] text-[#444746]">
                        Each NexOps user signs in with their own Google account cleanly with Gmail
                        read &amp; send permissions.
                      </p>
                    </div>
                  </div>
                  <GoogleSignInButton
                    loading={googleConnecting}
                    onClick={() => void handleGoogleSignIn()}
                    label="Sign in with Google / Verify Gmail Account"
                    compact
                  />
                </div>
              )}

              {openedMessage ? (
                /* ================= FULL EMAIL READER VIEW ================= */
                <div className="flex flex-1 flex-col">
                  {/* Reader Action Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenedMessage(null)}
                        title="Back to message list"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#444746] hover:bg-slate-100"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleStar(openedMessage.id, openedMessage.isStarred)
                        }
                        title="Toggle Star"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            openedMessage.isStarred
                              ? 'fill-[#F4B400] text-[#F4B400]'
                              : 'text-[#444746]'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleSnooze(openedMessage)}
                        title="Snooze for Follow-up"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#444746] hover:bg-slate-100"
                      >
                        <Clock
                          className={`h-4 w-4 ${
                            snoozedMap[openedMessage.id] ? 'text-[#0B57D0]' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenCompose({
                            to: openedMessage.senderEmail || openedMessage.to,
                            subject: openedMessage.subject.startsWith('Re:')
                              ? openedMessage.subject
                              : `Re: ${openedMessage.subject}`,
                            body: `\n\n--- Original Message ---\nFrom: ${openedMessage.senderDisplay}\nDate: ${openedMessage.dateRaw}\n\n${openedMessage.bodyText || openedMessage.snippet}`,
                          })
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-[#444746] hover:bg-slate-50"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        <span>Reply</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenCompose({
                            to: '',
                            subject: openedMessage.subject.startsWith('Fwd:')
                              ? openedMessage.subject
                              : `Fwd: ${openedMessage.subject}`,
                            body: `\n\n--- Forwarded Message ---\nFrom: ${openedMessage.senderDisplay}\nSubject: ${openedMessage.subject}\n\n${openedMessage.bodyText || openedMessage.snippet}`,
                          })
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-[#444746] hover:bg-slate-50"
                      >
                        <Forward className="h-3.5 w-3.5" />
                        <span>Forward</span>
                      </button>
                      {openedMessage.threadId && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${openedMessage.threadId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-3 text-xs font-semibold text-[#0B57D0] hover:bg-blue-50"
                        >
                          <span>Open in Gmail</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Full Email Subject + Sender Metadata + Body */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-normal text-[#1F1F1F]">
                        {openedMessage.subject}
                      </h2>
                      {openedMessage.labels.slice(0, 3).map((lbl) => (
                        <span
                          key={lbl}
                          className="rounded bg-[#E8EAED] px-2 py-0.5 text-[10px] font-semibold text-[#444746]"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B57D0] text-sm font-bold text-white">
                          {openedMessage.senderDisplay.charAt(0).toUpperCase() || 'M'}
                        </div>
                        <div className="text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[#1F1F1F]">
                              {openedMessage.senderDisplay}
                            </span>
                            {openedMessage.senderEmail && (
                              <span className="text-[#444746]">
                                &lt;{openedMessage.senderEmail}&gt;
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#444746]">
                            to {openedMessage.to || 'me'}
                            {openedMessage.cc ? ` · cc: ${openedMessage.cc}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-[#444746]">
                        {openedMessage.source === 'nexops_log'
                          ? formatDateTime(openedMessage.dateRaw)
                          : openedMessage.dateRaw}
                      </span>
                    </div>

                    {loadingMessageBody ? (
                      <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin text-[#0B57D0]" />
                        <span>Loading full email body from Gmail...</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#1F1F1F]">
                        {openedMessage.bodyText || openedMessage.snippet || '(No message content)'}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ================= EMAIL LIST VIEW ================= */
                <>
                  {/* List Sub-Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-xs font-bold capitalize text-[#1F1F1F]">
                        {gmailFolder === 'label'
                          ? gmailLabels.find((l) => l.id === selectedLabelId)?.name ||
                            selectedLabelId ||
                            'Label'
                          : gmailFolder}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setUnreadOnly((prev) => !prev)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          unreadOnly
                            ? 'border-[#0B57D0] bg-[#D3E3FD] text-[#001D35]'
                            : 'border-slate-200 bg-white text-[#444746] hover:bg-slate-50'
                        }`}
                      >
                        Unread only
                      </button>
                    </div>
                    <span className="text-[11px] text-[#444746] tabular-nums">
                      {displayedMailRows.length} message
                      {displayedMailRows.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {mailboxError && (
                    <div className="m-4 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
                      <span>{mailboxError}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void loadMailboxFolder(gmailFolder, gmailSearchSubmitted, selectedLabelId)
                        }
                        className="font-semibold underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {loadingMailbox ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-20 text-xs text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin text-[#0B57D0]" />
                      <p className="mt-2 font-medium">Loading Gmail messages...</p>
                    </div>
                  ) : displayedMailRows.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                      <GmailColorIcon className="h-10 w-10 opacity-85" />
                      <p className="mt-3 text-sm font-semibold text-[#1F1F1F]">
                        {!googleToken && gmailFolder !== 'sent'
                          ? 'Verify your Google account to view this folder'
                          : `No messages in ${gmailFolder}`}
                      </p>
                      <p className="mt-1 max-w-md text-xs text-[#444746]">
                        {!googleToken && gmailFolder !== 'sent'
                          ? 'Click "Sign in with Google / Verify Gmail Account" above to connect your real Gmail inbox, starred mail, drafts, and labels.'
                          : gmailSearchSubmitted
                            ? `No messages matched "${gmailSearchSubmitted}".`
                            : 'Use Compose on the left to send a corporate email directly via Gmail.'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[540px]">
                      {displayedMailRows.map((row) => (
                        <div
                          key={row.id}
                          className={`group flex items-center gap-2 px-3 py-2.5 text-xs transition-all hover:bg-[#F2F6FC] hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0] ${
                            row.isUnread ? 'bg-white font-semibold' : 'bg-[#F8FAFD]/60'
                          }`}
                        >
                          {/* Star Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleStar(row.id, row.isStarred)}
                            aria-label="Toggle star"
                            className="shrink-0 rounded-full p-1 hover:bg-slate-200/70"
                          >
                            <Star
                              className={`h-4 w-4 ${
                                row.isStarred
                                  ? 'fill-[#F4B400] text-[#F4B400]'
                                  : 'text-slate-400 group-hover:text-slate-600'
                              }`}
                            />
                          </button>

                          {/* Snooze Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleSnooze(row)}
                            title={snoozedMap[row.id] ? 'Unsnooze' : 'Snooze for follow-up'}
                            className="hidden shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200/70 hover:text-[#0B57D0] sm:inline-flex"
                          >
                            <Clock
                              className={`h-3.5 w-3.5 ${
                                snoozedMap[row.id] ? 'text-[#0B57D0]' : ''
                              }`}
                            />
                          </button>

                          {/* Clickable Row Content */}
                          <button
                            type="button"
                            onClick={() => void handleOpenEmailRow(row)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span
                              className={`w-36 shrink-0 truncate sm:w-44 ${
                                row.isUnread ? 'font-bold text-[#1F1F1F]' : 'text-[#1F1F1F]'
                              }`}
                            >
                              {row.senderDisplay}
                            </span>

                            <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                              {row.deliveryMethod && (
                                <span className="shrink-0 rounded bg-[#E8F0FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#1967D2]">
                                  {row.deliveryMethod}
                                </span>
                              )}
                              <span
                                className={`shrink-0 max-w-[45%] truncate ${
                                  row.isUnread ? 'font-bold text-[#1F1F1F]' : 'font-medium text-[#1F1F1F]'
                                }`}
                              >
                                {row.subject}
                              </span>
                              <span className="truncate font-normal text-[#5F6368]">
                                — {row.snippet}
                              </span>
                            </div>

                            <span
                              className={`shrink-0 font-mono text-[11px] tabular-nums ${
                                row.isUnread ? 'font-bold text-[#1F1F1F]' : 'text-[#5F6368]'
                              }`}
                            >
                              {formatGmailShortDate(row.dateRaw)}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* FLOATING BOTTOM-RIGHT GMAIL-STYLE COMPOSE WINDOW                    */}
      {/* =================================================================== */}
      {composeOpen && (
        <div
          className={`fixed bottom-0 right-3 z-40 sm:right-8 flex flex-col overflow-hidden rounded-t-2xl border border-slate-300 bg-white shadow-2xl transition-all ${
            composeMinimized
              ? 'w-72'
              : composeExpanded
                ? 'w-[calc(100vw-24px)] max-w-2xl'
                : 'w-[calc(100vw-24px)] max-w-lg'
          }`}
        >
          {/* Compose Header Bar */}
          <div className="flex items-center justify-between bg-[#F2F6FC] px-4 py-2.5 text-[#1F1F1F]">
            <button
              type="button"
              onClick={() => setComposeMinimized((prev) => !prev)}
              className="flex flex-1 items-center gap-2 text-left text-xs font-semibold"
            >
              <GmailColorIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{mailSubject.trim() || 'New Message'}</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setComposeMinimized((prev) => !prev)}
                title={composeMinimized ? 'Expand compose window' : 'Minimize'}
                className="rounded p-1 text-[#444746] hover:bg-slate-200/70"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              {!composeMinimized && (
                <button
                  type="button"
                  onClick={() => setComposeExpanded((prev) => !prev)}
                  title="Toggle wide view"
                  className="hidden rounded p-1 text-[#444746] hover:bg-slate-200/70 sm:inline-flex"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                title="Close compose"
                className="rounded p-1 text-[#444746] hover:bg-slate-200/70"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {!composeMinimized && (
            <form onSubmit={handleRequestGmailSend} className="flex flex-col">
              {/* From Strip */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-1.5 text-[11px] text-[#5F6368]">
                <span>
                  From:{' '}
                  <strong className="text-[#1F1F1F]">
                    {googleEmail || currentUser.email}
                  </strong>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    googleToken
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {googleToken ? 'Gmail API Connected' : 'Mailto Only (Verify Google to API Send)'}
                </span>
              </div>

              {/* To Row */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                <span className="text-xs text-[#5F6368]">To</span>
                <input
                  type="text"
                  required
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                  placeholder="colleague@company.com"
                  className="flex-1 text-xs text-[#1F1F1F] focus:outline-none"
                />
                {!showCcField && (
                  <button
                    type="button"
                    onClick={() => setShowCcField(true)}
                    className="text-[11px] font-medium text-[#5F6368] hover:text-[#1F1F1F]"
                  >
                    Cc
                  </button>
                )}
              </div>

              {showCcField && (
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                  <span className="text-xs text-[#5F6368]">Cc</span>
                  <input
                    type="text"
                    value={mailCc}
                    onChange={(e) => setMailCc(e.target.value)}
                    placeholder="manager@company.com"
                    className="flex-1 text-xs text-[#1F1F1F] focus:outline-none"
                  />
                </div>
              )}

              {/* Quick Team Directory Adder */}
              {teamMembers.length > 0 && (
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-1.5">
                  <select
                    aria-label="Quick add colleague email"
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
                    className="w-full bg-transparent text-[11px] text-[#444746] focus:outline-none"
                  >
                    <option value="">+ Quick add recipient from NexOps Team Directory...</option>
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

              {/* Subject Row */}
              <div className="border-b border-slate-100 px-4 py-2">
                <input
                  type="text"
                  required
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full text-xs font-medium text-[#1F1F1F] placeholder-[#5F6368] focus:outline-none"
                />
              </div>

              {/* Message Body */}
              <textarea
                rows={composeExpanded ? 12 : 8}
                required
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
                placeholder="Write your corporate email..."
                className="w-full resize-none px-4 py-3 text-xs leading-relaxed text-[#1F1F1F] focus:outline-none"
              />

              {/* Templates Strip */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2">
                <span className="text-[10px] font-medium text-[#5F6368]">Templates:</span>
                <button
                  type="button"
                  onClick={() => applyEmailTemplate('followup')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  QA Follow-Up
                </button>
                <button
                  type="button"
                  onClick={() => applyEmailTemplate('sla')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  SLA Notice
                </button>
                <button
                  type="button"
                  onClick={() => applyEmailTemplate('digest')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Ops Digest
                </button>
              </div>

              {/* Bottom Send Bar */}
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={sendingMail || !googleToken}
                    title={
                      googleToken
                        ? 'Send directly via Gmail API'
                        : 'Verify your Google account first to send via Gmail API'
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0B57D0] px-5 text-xs font-semibold text-white transition-colors hover:bg-[#0842A0] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingMail ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>Send</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleMailtoDispatchLog}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 px-3 text-[11px] font-semibold text-[#444746] hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Mail App</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMailTo('');
                    setMailCc('');
                    setMailSubject('');
                    setMailBody('');
                    setComposeOpen(false);
                  }}
                  title="Discard draft"
                  className="rounded-full p-2 text-[#444746] hover:bg-slate-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. LIVE EMBEDDED GOOGLE DOCS, SHEETS & FORMS WORKSPACE              */}
      {/* =================================================================== */}
      {activeTool !== 'gmail' && (
        <div className="space-y-4">
          {/* Authentic Google Tool Header with Official Colored Icon + "+ Create New" */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                  {docMeta.renderIcon('h-7 w-7')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      {docMeta.plural}
                    </h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${docMeta.badgeClass}`}
                    >
                      {filteredLinks.length} saved
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{docMeta.subtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={docMeta.newUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-xs transition-colors ${docMeta.primaryBtnClass}`}
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Create New</span>
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>

                <button
                  type="button"
                  onClick={() =>
                    setActiveDocPanel((prev) =>
                      prev === 'create_api' ? 'none' : 'create_api',
                    )
                  }
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                    activeDocPanel === 'create_api'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create via API</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveDocPanel((prev) => (prev === 'add_link' ? 'none' : 'add_link'))
                  }
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                    activeDocPanel === 'add_link'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span>Save Team Link</span>
                </button>
              </div>
            </div>

            {/* Expandable Form: Create Direct via Google API */}
            {activeDocPanel === 'create_api' && (
              <form
                onSubmit={handleRequestCreateGoogleDoc}
                className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    required
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder={`New ${docMeta.singular} Title...`}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B57D0] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    aria-label="Department"
                    value={createDept}
                    onChange={(e) => setCreateDept(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-[#0B57D0] focus:outline-none"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                    placeholder="Purpose / collaboration note..."
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B57D0] focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={creatingDoc}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${docMeta.primaryBtnClass}`}
                  >
                    {creatingDoc ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>Create</span>
                  </button>
                </div>
              </form>
            )}

            {/* Expandable Form: Save Existing Link to Team Directory */}
            {activeDocPanel === 'add_link' && (
              <form
                onSubmit={handleSavePastedLink}
                className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    required
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder={`Title (e.g., Q4 ${docMeta.singular})`}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B57D0] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="url"
                    required
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    placeholder={docMeta.placeholderUrl}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs text-slate-900 focus:border-[#0B57D0] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    aria-label="Link Department"
                    value={pasteDept}
                    onChange={(e) => setPasteDept(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-[#0B57D0] focus:outline-none"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={pasteNotes}
                    onChange={(e) => setPasteNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B57D0] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <button
                    type="submit"
                    className="h-9 w-full rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Saved Team Document Switcher Bar + Instant URL Loader */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Saved Document Chips & Search Filter */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="relative w-44 shrink-0">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Filter saved files..."
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-xs text-slate-800 focus:border-[#0B57D0] focus:bg-white focus:outline-none"
                  />
                </div>

                {filteredLinks.length === 0 ? (
                  <span className="text-xs text-slate-500">
                    No saved team {docMeta.plural} yet — paste a URL on the right or click Create.
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filteredLinks.map((link) => {
                      const isActive = !adHocActiveUrl && selectedLink?.id === link.id;
                      return (
                        <button
                          key={link.id}
                          type="button"
                          onClick={() => {
                            setAdHocActiveUrl(null);
                            setSelectedLinkId(link.id);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? 'border-[#0B57D0] bg-[#E8F0FE] font-semibold text-[#174EA6]'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {docMeta.renderIcon('h-3.5 w-3.5 shrink-0')}
                          <span className="max-w-[160px] truncate">{link.title}</span>
                          <span className="rounded bg-white/80 px-1 text-[10px] text-slate-500">
                            {link.department}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Instant Google URL Embed Bar */}
              <form
                onSubmit={handleQuickPreviewAdHocUrl}
                className="flex w-full items-center gap-1.5 sm:w-auto"
              >
                <input
                  type="url"
                  value={adHocUrl}
                  onChange={(e) => setAdHocUrl(e.target.value)}
                  placeholder={`Open any ${docMeta.singular} URL inline...`}
                  className="h-8 w-full min-w-[210px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-[11px] text-slate-800 focus:border-[#0B57D0] focus:bg-white focus:outline-none sm:w-64"
                />
                <button
                  type="submit"
                  className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open
                </button>
              </form>
            </div>
          </div>

          {/* Full-Height Live Embedded Document Viewer */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col">
            {!activeDocumentUrl ? (
              <div className="flex min-h-[580px] flex-col items-center justify-center px-6 py-16 text-center">
                {docMeta.renderIcon('h-12 w-12')}
                <h3 className="mt-4 font-display text-base font-bold text-slate-900">
                  Live Embedded {docMeta.singular} Workspace
                </h3>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
                  Select a saved company {docMeta.singular} from the switcher bar above, paste any{' '}
                  {docMeta.singular} URL to open it right here inside NexOps, or create a new file
                  with 1 click.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <a
                    href={docMeta.newUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${docMeta.primaryBtnClass}`}
                  >
                    <Plus className="h-4 w-4" />
                    <span>+ Create New ({docMeta.newUrl.replace('https://', '')})</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveDocPanel('add_link')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Save Team {docMeta.singular} Link</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Embedded Viewer Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {docMeta.renderIcon('h-5 w-5 shrink-0')}
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-sm font-bold text-slate-900">
                        {activeDocumentTitle}
                      </h3>
                      {selectedLink && !adHocActiveUrl ? (
                        <p className="truncate font-mono text-[11px] text-slate-500">
                          {selectedLink.department} · Shared by {selectedLink.addedBy} ·{' '}
                          {formatDateTime(selectedLink.updatedAt)}
                        </p>
                      ) : (
                        <p className="truncate font-mono text-[11px] text-slate-500">
                          {activeDocumentUrl}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Edit / Preview Toggle */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setEmbedMode('edit')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          embedMode === 'edit'
                            ? 'bg-[#0B57D0] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Edit Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmbedMode('preview')}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          embedMode === 'preview'
                            ? 'bg-[#0B57D0] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {docTool === 'forms' ? 'Fill Form' : 'Preview'}
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B57D0]" />
                        ) : (
                          <Info className="h-3.5 w-3.5 text-[#0B57D0]" />
                        )}
                        <span>API Details</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyUrl(
                          activeDocumentUrl,
                          selectedLink?.id || 'adhoc',
                        )
                      }
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {copiedId === (selectedLink?.id || 'adhoc') ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                      )}
                      <span>
                        {copiedId === (selectedLink?.id || 'adhoc') ? 'Copied' : 'Copy'}
                      </span>
                    </button>

                    {selectedLink &&
                      !adHocActiveUrl &&
                      (currentUser.role === 'Admin' ||
                        selectedLink.addedBy === currentUser.name) && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmation({ kind: 'delete_link', link: selectedLink })
                          }
                          title="Remove from team switcher"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                    <a
                      href={activeDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <span>Open Full Screen</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {/* Live API Metadata Banner */}
                {(liveMetadata || metadataError) && (
                  <div className="border-b border-slate-200 bg-[#E8F0FE]/60 px-5 py-2.5 text-xs">
                    {metadataError ? (
                      <p className="font-medium text-rose-700">{metadataError}</p>
                    ) : (
                      liveMetadata && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-[#174EA6]">
                              {liveMetadata.title}
                            </span>
                            {liveMetadata.details.length > 0 && (
                              <span className="ml-2 text-[11px] text-slate-600">
                                {liveMetadata.details.join(' · ')}
                              </span>
                            )}
                          </div>
                          <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#174EA6]">
                            {liveMetadata.summary}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Full-Height Live Embedded Iframe */}
                <div className="relative flex-1 bg-slate-100">
                  <iframe
                    key={`${activeDocumentUrl}-${embedMode}`}
                    src={getGoogleEmbedUrl(docTool, activeDocumentUrl, embedMode)}
                    title={activeDocumentTitle}
                    className="h-[calc(100vh-300px)] min-h-[620px] w-full border-0 bg-white"
                    allow="clipboard-read; clipboard-write"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
                  <span>
                    Mode: <strong className="text-slate-700">{embedMode === 'edit' ? 'Live Edit (/edit)' : docTool === 'forms' ? 'Live Form Fill (/viewform)' : 'Clean Preview (/preview)'}</strong>
                  </span>
                  <span>
                    If a restricted corporate file blocks embedded access, ensure Google sharing
                    allows link access or click <strong className="text-slate-700">Open Full Screen</strong>.
                  </span>
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
                    `You are about to send an email from ${confirmation.fromEmail} using your verified Gmail account.`}
                  {confirmation.kind === 'create_google_doc' &&
                    `This will create "${confirmation.title}" in your connected Google Workspace account (${googleEmail || currentUser.email}) and share it with your NexOps team.`}
                  {confirmation.kind === 'delete_link' &&
                    `Remove "${confirmation.link.title}" from the shared NexOps Workspace switcher? (Your underlying Google file is preserved.)`}
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
                    : 'bg-[#0B57D0] hover:bg-[#0842A0]'
                }`}
              >
                {executingConfirm && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {confirmation.kind === 'send_gmail'
                    ? 'Confirm & Send'
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
