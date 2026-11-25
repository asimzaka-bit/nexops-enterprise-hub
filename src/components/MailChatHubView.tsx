import {
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileEdit,
  Forward,
  Hash,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchRecentGmailMessages,
  GmailRecentMessage,
  sendEmailViaGmailApi,
} from '../services/googleWorkspaceService';
import {
  CorporateMailMessage,
  Department,
  MeetInviteCardData,
  Role,
  TeamChatMessage,
  TeamMember,
} from '../types/nexops';
import {
  buildChannelRoomId,
  buildDmRoomId,
  formatDateTime,
  formatPresenceStatus,
  resolveLivePresenceOverride,
} from '../utils/storage';
import { GmailColorIcon, GoogleGColorIcon, GoogleMeetColorIcon } from './GoogleWorkspaceIcons';
import { UserAvatar } from './UserAvatar';

export interface StartGoogleMeetPayload {
  title: string;
  department: Department;
  attendees: string[];
  meetUrl: string;
  sourceLabel: string;
}

export interface SendCorporateMailPayload {
  draftId?: string;
  threadId?: string;
  parentId?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  meetInvite?: MeetInviteCardData;
  deliveryMethod: CorporateMailMessage['deliveryMethod'];
}

export interface SaveCorporateDraftPayload {
  draftId?: string;
  threadId?: string;
  parentId?: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  meetInvite?: MeetInviteCardData;
}

export interface SendChatMessagePayload {
  roomId: string;
  roomType: 'channel' | 'dm';
  roomLabel: string;
  body: string;
  meetInvite?: MeetInviteCardData;
}

interface MailChatHubViewProps {
  currentUser: TeamMember;
  activeRole: Role;
  teamMembers: TeamMember[];
  departments: string[];
  onlinePresenceKeys?: Set<string>;
  recentlyOfflineKeys?: Set<string>;
  corporateMails: CorporateMailMessage[];
  chatMessages: TeamChatMessage[];
  googleToken: string | null;
  googleEmail: string | null;
  googleConnecting: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSendMail: (payload: SendCorporateMailPayload) => void;
  onSaveDraft: (payload: SaveCorporateDraftPayload) => void;
  onDeleteDraft: (draftId: string) => void;
  onMarkMailRead: (mailId: string) => void;
  onSendChatMessage: (payload: SendChatMessagePayload) => void;
  onMarkChatRoomRead: (roomId: string) => void;
  onStartGoogleMeetSession: (payload: StartGoogleMeetPayload) => void;
  onNotify: (
    title: string,
    description?: string,
    variant?: 'success' | 'error' | 'warning' | 'info',
  ) => void;
}

type HubViewMode = 'mail' | 'chat' | 'split';
type MailFolder = 'inbox' | 'sent' | 'drafts' | 'gmail';

function openExternalUrlSafely(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function renderSafeLinkedText(text: string): ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const href = match[1];
    parts.push(
      <a
        key={`url-${idx++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-indigo-600 underline decoration-indigo-400/60 underline-offset-2 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        {href}
      </a>,
    );
    lastIndex = match.index + href.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function parseEmailList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes('@')),
    ),
  );
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function GoogleMeetInviteCard({
  invite,
  compact = false,
}: {
  invite: MeetInviteCardData;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div
      className={`rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/70 dark:bg-emerald-950/35 ${
        compact ? 'mt-2 p-2.5' : 'my-3 p-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white shadow-2xs dark:border-emerald-800 dark:bg-slate-900">
            <GoogleMeetColorIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
              {invite.title || 'Google Meet Video Call'}
            </p>
            <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">
              Host: {invite.hostName} ·{' '}
              <span className="font-mono tabular-nums">{formatShortTime(invite.createdAt)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            title="Copy Meet Link"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>
          <a
            href={invite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <Video className="h-3.5 w-3.5 shrink-0" />
            <span>Join Meet</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-85" />
          </a>
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[11px] text-emerald-800 dark:text-emerald-300">
        {invite.url}
      </p>
    </div>
  );
}

export function MailChatHubView({
  currentUser,
  activeRole,
  teamMembers,
  departments,
  onlinePresenceKeys,
  recentlyOfflineKeys,
  corporateMails,
  chatMessages,
  googleToken,
  googleEmail,
  googleConnecting,
  onGoogleSignIn,
  onSendMail,
  onSaveDraft,
  onDeleteDraft,
  onMarkMailRead,
  onSendChatMessage,
  onMarkChatRoomRead,
  onStartGoogleMeetSession,
  onNotify,
}: MailChatHubViewProps) {
  const selfEmail = currentUser.email.trim().toLowerCase();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const [viewMode, setViewMode] = useState<HubViewMode>('mail');

  // =========================================================================
  // ENTERPRISE MAIL STATE
  // =========================================================================
  const [mailFolder, setMailFolder] = useState<MailFolder>('inbox');
  const [mailSearch, setMailSearch] = useState('');
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);

  // Compose / Reply / Forward Modal State
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeHeading, setComposeHeading] = useState('New Corporate Email');
  const [editingDraftId, setEditingDraftId] = useState<string | undefined>(undefined);
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>(undefined);
  const [replyParentId, setReplyParentId] = useState<string | undefined>(undefined);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subjectInput, setSubjectInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [composeMeetInvite, setComposeMeetInvite] = useState<MeetInviteCardData | undefined>(
    undefined,
  );
  const [alsoSendViaGmailApi, setAlsoSendViaGmailApi] = useState(false);
  const [sendingExternalGmail, setSendingExternalGmail] = useState(false);
  const [gmailConfirmPending, setGmailConfirmPending] = useState(false);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);

  // Optional live Gmail Inbox feed when verified
  const [gmailInbox, setGmailInbox] = useState<GmailRecentMessage[]>([]);
  const [loadingGmailInbox, setLoadingGmailInbox] = useState(false);

  const loadLiveGmailInbox = async () => {
    if (!googleToken) return;
    setLoadingGmailInbox(true);
    try {
      const msgs = await fetchRecentGmailMessages(15, mailSearch.trim(), ['INBOX']);
      setGmailInbox(msgs);
    } catch (err) {
      onNotify(
        'Gmail Sync Notice',
        err instanceof Error ? err.message : 'Unable to load Gmail inbox.',
        'warning',
      );
    } finally {
      setLoadingGmailInbox(false);
    }
  };

  useEffect(() => {
    if (mailFolder === 'gmail' && googleToken) {
      void loadLiveGmailInbox();
    }
  }, [mailFolder, googleToken]);

  const activeTeammates = useMemo(
    () =>
      teamMembers.filter(
        (m) =>
          m.active &&
          (m.approvalStatus ?? 'approved') === 'approved' &&
          m.email.trim().toLowerCase() !== selfEmail,
      ),
    [teamMembers, selfEmail],
  );

  const isMailAddressedToSelf = (mail: CorporateMailMessage) => {
    const recipients = [...mail.toEmails, ...mail.ccEmails].map((e) => e.trim().toLowerCase());
    return (
      recipients.includes(selfEmail) ||
      recipients.includes('all@nexops.company') ||
      recipients.includes(`dept:${currentUser.department.toLowerCase()}@nexops.company`)
    );
  };

  const inboxMails = useMemo(
    () =>
      corporateMails
        .filter((m) => m.status === 'sent' && isMailAddressedToSelf(m))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [corporateMails, selfEmail, currentUser.department],
  );

  const sentMails = useMemo(
    () =>
      corporateMails
        .filter((m) => m.status === 'sent' && m.fromEmail.trim().toLowerCase() === selfEmail)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [corporateMails, selfEmail],
  );

  const draftMails = useMemo(
    () =>
      corporateMails
        .filter((m) => m.status === 'draft' && m.fromEmail.trim().toLowerCase() === selfEmail)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [corporateMails, selfEmail],
  );

  const unreadInboxCount = useMemo(
    () =>
      inboxMails.filter(
        (m) => !m.readBy.some((e) => e.trim().toLowerCase() === selfEmail),
      ).length,
    [inboxMails, selfEmail],
  );

  const filteredMails = useMemo(() => {
    const base =
      mailFolder === 'inbox' ? inboxMails : mailFolder === 'sent' ? sentMails : draftMails;
    const q = mailSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.fromName.toLowerCase().includes(q) ||
        m.fromEmail.toLowerCase().includes(q) ||
        m.toEmails.some((e) => e.toLowerCase().includes(q)) ||
        m.body.toLowerCase().includes(q),
    );
  }, [mailFolder, inboxMails, sentMails, draftMails, mailSearch]);

  const selectedMail = useMemo(() => {
    if (mailFolder === 'gmail') return null;
    if (selectedMailId) {
      const found = filteredMails.find((m) => m.id === selectedMailId);
      if (found) return found;
    }
    return filteredMails[0] ?? null;
  }, [mailFolder, filteredMails, selectedMailId]);

  const selectedThreadMessages = useMemo(() => {
    if (!selectedMail) return [];
    return corporateMails
      .filter((m) => m.status === 'sent' && m.threadId === selectedMail.threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [corporateMails, selectedMail]);

  useEffect(() => {
    if (
      selectedMail &&
      selectedMail.status === 'sent' &&
      !selectedMail.readBy.some((e) => e.trim().toLowerCase() === selfEmail)
    ) {
      onMarkMailRead(selectedMail.id);
    }
  }, [selectedMail?.id, selfEmail, onMarkMailRead]);

  const openBlankCompose = () => {
    setComposeHeading('New Corporate Email');
    setEditingDraftId(undefined);
    setReplyThreadId(undefined);
    setReplyParentId(undefined);
    setToInput('');
    setCcInput('');
    setShowCc(false);
    setSubjectInput('');
    setBodyInput('');
    setComposeMeetInvite(undefined);
    setAlsoSendViaGmailApi(Boolean(googleToken));
    setGmailConfirmPending(false);
    setComposeOpen(true);
  };

  const openReplyCompose = (mail: CorporateMailMessage, mode: 'reply' | 'replyAll' | 'forward') => {
    const quotedHeader = `\n\n--- On ${formatDateTime(mail.createdAt)}, ${mail.fromName} <${mail.fromEmail}> wrote: ---\n${mail.body}`;
    if (mode === 'reply') {
      const replyTarget =
        mail.fromEmail.trim().toLowerCase() === selfEmail
          ? mail.toEmails.join(', ')
          : mail.fromEmail;
      setComposeHeading(`Reply to ${mail.fromName}`);
      setToInput(replyTarget);
      setCcInput('');
      setShowCc(false);
      setSubjectInput(mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`);
      setBodyInput(quotedHeader);
      setReplyThreadId(mail.threadId);
      setReplyParentId(mail.id);
    } else if (mode === 'replyAll') {
      const allRecipients = Array.from(
        new Set([mail.fromEmail, ...mail.toEmails, ...mail.ccEmails].map((e) => e.trim().toLowerCase())),
      ).filter((e) => e && e !== selfEmail);
      setComposeHeading(`Reply All · ${mail.subject}`);
      setToInput(allRecipients.join(', '));
      setCcInput('');
      setShowCc(false);
      setSubjectInput(mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`);
      setBodyInput(quotedHeader);
      setReplyThreadId(mail.threadId);
      setReplyParentId(mail.id);
    } else {
      setComposeHeading(`Forward · ${mail.subject}`);
      setToInput('');
      setCcInput('');
      setShowCc(false);
      setSubjectInput(mail.subject.startsWith('Fwd:') ? mail.subject : `Fwd: ${mail.subject}`);
      setBodyInput(
        `\n\n--- Forwarded message from ${mail.fromName} <${mail.fromEmail}> ---\nSubject: ${mail.subject}\n\n${mail.body}`,
      );
      setReplyThreadId(undefined);
      setReplyParentId(mail.id);
    }
    setEditingDraftId(undefined);
    setComposeMeetInvite(undefined);
    setAlsoSendViaGmailApi(Boolean(googleToken));
    setGmailConfirmPending(false);
    setComposeOpen(true);
  };

  const openDraftInCompose = (draft: CorporateMailMessage) => {
    setComposeHeading('Resume Draft');
    setEditingDraftId(draft.id);
    setReplyThreadId(draft.threadId);
    setReplyParentId(draft.parentId);
    setToInput(draft.toEmails.join(', '));
    setCcInput(draft.ccEmails.join(', '));
    setShowCc(draft.ccEmails.length > 0);
    setSubjectInput(draft.subject);
    setBodyInput(draft.body);
    setComposeMeetInvite(draft.meetInvite);
    setAlsoSendViaGmailApi(Boolean(googleToken));
    setGmailConfirmPending(false);
    setComposeOpen(true);
  };

  const appendRecipientEmail = (emailToAdd: string) => {
    const existing = parseEmailList(toInput);
    const clean = emailToAdd.trim().toLowerCase();
    if (!existing.includes(clean)) {
      setToInput([...existing, clean].join(', '));
    }
  };

  const handleInsertMeetIntoCompose = () => {
    const meetUrl = 'https://meet.google.com/new';
    openExternalUrlSafely(meetUrl);
    const nowIso = new Date().toISOString();
    const meetingTitle = subjectInput.trim() || `NexOps Video Sync — ${currentUser.name}`;
    const invite: MeetInviteCardData = {
      url: meetUrl,
      hostName: currentUser.name,
      hostEmail: currentUser.email,
      title: meetingTitle,
      createdAt: nowIso,
    };
    setComposeMeetInvite(invite);
    const snippet = `\n\n[Google Meet Invitation]\nMeeting: ${meetingTitle}\nHost: ${currentUser.name}\nJoin Google Meet: ${meetUrl}\n`;
    setBodyInput((prev) => (prev.includes(meetUrl) ? prev : `${prev}${snippet}`.trimStart()));
    if (!subjectInput.trim()) {
      setSubjectInput(`Google Meet Invitation: ${meetingTitle}`);
    }

    const recipients = parseEmailList(toInput);
    const attendeeNames = recipients.map((email) => {
      const m = teamMembers.find((tm) => tm.email.trim().toLowerCase() === email);
      return m?.name || email;
    });

    onStartGoogleMeetSession({
      title: meetingTitle,
      department: currentUser.department,
      attendees: Array.from(new Set([currentUser.name, ...attendeeNames])),
      meetUrl,
      sourceLabel: 'Mail Composer',
    });
  };

  const handleSaveDraftClick = () => {
    const toEmails = parseEmailList(toInput);
    const ccEmails = parseEmailList(ccInput);
    onSaveDraft({
      draftId: editingDraftId,
      threadId: replyThreadId,
      parentId: replyParentId,
      toEmails,
      ccEmails,
      subject: subjectInput.trim() || '(No Subject)',
      body: bodyInput,
      meetInvite: composeMeetInvite,
    });
    setComposeOpen(false);
  };

  const executeMailDispatch = async () => {
    const toEmails = parseEmailList(toInput);
    const ccEmails = parseEmailList(ccInput);
    if (toEmails.length === 0) {
      onNotify(
        'Recipient Required',
        'Enter at least one valid corporate email address in the To field.',
        'warning',
      );
      return;
    }
    if (!subjectInput.trim()) {
      onNotify('Subject Required', 'Please enter a subject line before sending.', 'warning');
      return;
    }
    if (!bodyInput.trim() && !composeMeetInvite) {
      onNotify('Message Body Required', 'Write a message or attach a Meet invite.', 'warning');
      return;
    }

    let method: CorporateMailMessage['deliveryMethod'] = 'NexOps Mail';
    if (alsoSendViaGmailApi && googleToken) {
      const externalRecipients = toEmails.filter(
        (e) => e !== 'all@nexops.company' && !e.startsWith('dept:'),
      );
      if (externalRecipients.length > 0) {
        setSendingExternalGmail(true);
        try {
          await sendEmailViaGmailApi({
            fromEmail: googleEmail || currentUser.email,
            fromName: currentUser.name,
            to: externalRecipients.join(', '),
            cc: ccEmails.filter((e) => !e.startsWith('dept:')).join(', '),
            subject: subjectInput.trim(),
            body: bodyInput.trim(),
          });
          method = 'Gmail API';
        } catch (err) {
          onNotify(
            'Gmail API Fallback',
            `${err instanceof Error ? err.message : 'Gmail dispatch failed.'} Delivered via internal NexOps Mail.`,
            'warning',
          );
        } finally {
          setSendingExternalGmail(false);
        }
      }
    }

    onSendMail({
      draftId: editingDraftId,
      threadId: replyThreadId,
      parentId: replyParentId,
      toEmails,
      ccEmails,
      subject: subjectInput.trim(),
      body: bodyInput.trim(),
      meetInvite: composeMeetInvite,
      deliveryMethod: method,
    });

    setComposeOpen(false);
    setGmailConfirmPending(false);
    setMailFolder('sent');
  };

  const handleComposeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (alsoSendViaGmailApi && googleToken && !gmailConfirmPending) {
      setGmailConfirmPending(true);
      return;
    }
    void executeMailDispatch();
  };

  const handleOpenMailtoFallback = () => {
    const toEmails = parseEmailList(toInput);
    if (toEmails.length === 0 || !subjectInput.trim()) {
      onNotify(
        'To & Subject Required',
        'Provide a recipient and subject to open your local mail client.',
        'warning',
      );
      return;
    }
    const params = new URLSearchParams();
    if (ccInput.trim()) params.set('cc', ccInput.trim());
    params.set('subject', subjectInput.trim());
    params.set('body', bodyInput.trim());
    const mailtoHref = `mailto:${encodeURIComponent(toEmails.join(','))}?${params.toString()}`;
    const a = document.createElement('a');
    a.href = mailtoHref;
    a.click();
    onSendMail({
      draftId: editingDraftId,
      threadId: replyThreadId,
      parentId: replyParentId,
      toEmails,
      ccEmails: parseEmailList(ccInput),
      subject: subjectInput.trim(),
      body: bodyInput.trim(),
      meetInvite: composeMeetInvite,
      deliveryMethod: 'Mail Client (mailto)',
    });
    setComposeOpen(false);
  };

  // =========================================================================
  // REAL-TIME TEAM CHAT STATE (Channels + 1-on-1 Direct Messages)
  // =========================================================================
  const channelRooms = useMemo(() => {
    const names = Array.from(new Set(['General', ...departments]));
    return names.map((name) => ({
      roomId: buildChannelRoomId(name),
      roomType: 'channel' as const,
      label: name,
    }));
  }, [departments]);

  const [activeRoomId, setActiveRoomId] = useState<string>(() => buildChannelRoomId('General'));
  const [chatDirectoryQuery, setChatDirectoryQuery] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const activeRoomMeta = useMemo(() => {
    const chan = channelRooms.find((c) => c.roomId === activeRoomId);
    if (chan) {
      return {
        roomId: chan.roomId,
        roomType: 'channel' as const,
        label: `#${chan.label}`,
        rawLabel: chan.label,
        peer: undefined as TeamMember | undefined,
      };
    }
    const peer = activeTeammates.find(
      (m) => buildDmRoomId(selfEmail, m.email) === activeRoomId,
    );
    if (peer) {
      return {
        roomId: activeRoomId,
        roomType: 'dm' as const,
        label: peer.name,
        rawLabel: peer.name,
        peer,
      };
    }
    const fallback = channelRooms[0] ?? {
      roomId: buildChannelRoomId('General'),
      roomType: 'channel' as const,
      label: 'General',
    };
    return {
      roomId: fallback.roomId,
      roomType: 'channel' as const,
      label: `#${fallback.label}`,
      rawLabel: fallback.label,
      peer: undefined,
    };
  }, [activeRoomId, channelRooms, activeTeammates, selfEmail]);

  const roomUnreadCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const msg of chatMessages) {
      const senderLower = msg.senderEmail.trim().toLowerCase();
      if (senderLower === selfEmail) continue;
      if (!msg.readBy.some((e) => e.trim().toLowerCase() === selfEmail)) {
        map.set(msg.roomId, (map.get(msg.roomId) ?? 0) + 1);
      }
    }
    return map;
  }, [chatMessages, selfEmail]);

  const totalUnreadChatCount = useMemo(() => {
    let total = 0;
    for (const count of roomUnreadCounts.values()) {
      total += count;
    }
    return total;
  }, [roomUnreadCounts]);

  const activeRoomMessages = useMemo(
    () =>
      chatMessages
        .filter((m) => m.roomId === activeRoomMeta.roomId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [chatMessages, activeRoomMeta.roomId],
  );

  // Mark messages in the active room read automatically when chat panel is open
  useEffect(() => {
    if (viewMode !== 'chat' && viewMode !== 'split') return;
    const hasUnread = activeRoomMessages.some(
      (m) =>
        m.senderEmail.trim().toLowerCase() !== selfEmail &&
        !m.readBy.some((e) => e.trim().toLowerCase() === selfEmail),
    );
    if (hasUnread) {
      onMarkChatRoomRead(activeRoomMeta.roomId);
    }
  }, [viewMode, activeRoomMeta.roomId, activeRoomMessages, selfEmail, onMarkChatRoomRead]);

  // Smooth auto-scroll on room switch or incoming messages
  useEffect(() => {
    if (viewMode === 'chat' || viewMode === 'split') {
      chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeRoomMessages.length, activeRoomMeta.roomId, viewMode]);

  const filteredChannels = useMemo(() => {
    const q = chatDirectoryQuery.trim().toLowerCase();
    if (!q) return channelRooms;
    return channelRooms.filter((c) => c.label.toLowerCase().includes(q));
  }, [channelRooms, chatDirectoryQuery]);

  const filteredDmUsers = useMemo(() => {
    const q = chatDirectoryQuery.trim().toLowerCase();
    if (!q) return activeTeammates;
    return activeTeammates.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q),
    );
  }, [activeTeammates, chatDirectoryQuery]);

  const handleSendChat = () => {
    const clean = chatDraft.trim();
    if (!clean) return;
    onSendChatMessage({
      roomId: activeRoomMeta.roomId,
      roomType: activeRoomMeta.roomType,
      roomLabel: activeRoomMeta.label,
      body: clean,
    });
    setChatDraft('');
  };

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleStartGoogleMeetInChat = () => {
    const meetUrl = 'https://meet.google.com/new';
    openExternalUrlSafely(meetUrl);
    const nowIso = new Date().toISOString();
    const meetingTitle =
      activeRoomMeta.roomType === 'dm' && activeRoomMeta.peer
        ? `1:1 Google Meet — ${currentUser.name} & ${activeRoomMeta.peer.name}`
        : `${activeRoomMeta.label} Team Sync (Google Meet)`;

    const invite: MeetInviteCardData = {
      url: meetUrl,
      hostName: currentUser.name,
      hostEmail: currentUser.email,
      title: meetingTitle,
      createdAt: nowIso,
    };

    onSendChatMessage({
      roomId: activeRoomMeta.roomId,
      roomType: activeRoomMeta.roomType,
      roomLabel: activeRoomMeta.label,
      body: `Started a Google Meet video call for ${activeRoomMeta.label}. Click Join Meet below to enter.`,
      meetInvite: invite,
    });

    const attendees =
      activeRoomMeta.roomType === 'dm' && activeRoomMeta.peer
        ? [currentUser.name, activeRoomMeta.peer.name]
        : [currentUser.name, `${activeRoomMeta.rawLabel} Team`];

    onStartGoogleMeetSession({
      title: meetingTitle,
      department:
        activeRoomMeta.peer?.department ||
        (activeRoomMeta.rawLabel !== 'General'
          ? activeRoomMeta.rawLabel
          : currentUser.department),
      attendees,
      meetUrl,
      sourceLabel: `Chat (${activeRoomMeta.label})`,
    });
  };

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================
  const renderMailSection = () => (
    <div className="flex min-h-[600px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Mail Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openBlankCompose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Compose</span>
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                setMailFolder('inbox');
                setSelectedMailId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mailFolder === 'inbox'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Inbox className="h-3.5 w-3.5 shrink-0" />
              <span>Inbox</span>
              {unreadInboxCount > 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                    mailFolder === 'inbox'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  }`}
                >
                  {unreadInboxCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMailFolder('sent');
                setSelectedMailId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mailFolder === 'sent'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              <span>Sent</span>
              <span className="font-mono text-[10px] opacity-80 tabular-nums">
                {sentMails.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMailFolder('drafts');
                setSelectedMailId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mailFolder === 'drafts'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <FileEdit className="h-3.5 w-3.5 shrink-0" />
              <span>Drafts</span>
              {draftMails.length > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800 tabular-nums dark:bg-amber-950 dark:text-amber-300">
                  {draftMails.length}
                </span>
              )}
            </button>

            {googleToken && (
              <button
                type="button"
                onClick={() => setMailFolder('gmail')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  mailFolder === 'gmail'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <GmailColorIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Gmail</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={mailSearch}
            onChange={(e) => setMailSearch(e.target.value)}
            placeholder="Search emails, people, subjects..."
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Mail Split Pane: List + Thread Reader */}
      {mailFolder === 'gmail' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Connected Google Gmail Inbox ({googleEmail || currentUser.email})
            </p>
            <button
              type="button"
              onClick={() => void loadLiveGmailInbox()}
              disabled={loadingGmailInbox}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingGmailInbox ? 'animate-spin' : ''}`} />
              <span>Refresh Gmail</span>
            </button>
          </div>
          {loadingGmailInbox ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
                />
              ))}
            </div>
          ) : gmailInbox.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No Gmail messages loaded yet. Click Refresh Gmail to synchronize.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {gmailInbox.map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                        {g.from}
                      </span>
                      {g.isUnread && (
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          Unread
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {g.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {g.snippet}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {g.date}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setComposeHeading(`Reply · ${g.subject}`);
                        setToInput(g.from.match(/<([^>]+)>/)?.[1] || g.from);
                        setSubjectInput(g.subject.startsWith('Re:') ? g.subject : `Re: ${g.subject}`);
                        setBodyInput(`\n\n--- Original Gmail from ${g.from} ---\n${g.snippet}`);
                        setAlsoSendViaGmailApi(true);
                        setComposeOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400"
                    >
                      <Reply className="h-3 w-3" />
                      <span>Reply</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0 dark:divide-slate-800">
          {/* Mail List Column */}
          <div className="max-h-[340px] overflow-y-auto lg:col-span-5 lg:max-h-[600px]">
            {filteredMails.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center">
                <Mail className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {mailFolder === 'inbox'
                    ? 'Your Corporate Inbox is Clear'
                    : mailFolder === 'sent'
                      ? 'No Sent Emails Yet'
                      : 'No Saved Drafts'}
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  Compose an internal email, invite teammates to a Google Meet call, or send via
                  your connected Gmail account.
                </p>
                <button
                  type="button"
                  onClick={openBlankCompose}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Compose Email</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMails.map((mail) => {
                  const isSelected = selectedMail?.id === mail.id;
                  const isUnread =
                    mail.status === 'sent' &&
                    mailFolder === 'inbox' &&
                    !mail.readBy.some((e) => e.trim().toLowerCase() === selfEmail);
                  return (
                    <button
                      key={mail.id}
                      type="button"
                      onClick={() => {
                        setSelectedMailId(mail.id);
                        if (mail.status === 'sent' && isUnread) {
                          onMarkMailRead(mail.id);
                        }
                      }}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40'
                          : isUnread
                            ? 'bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <UserAvatar
                        name={mail.fromName}
                        sizeClass="h-8 w-8"
                        textClass="text-xs"
                        roundedClass="rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-xs ${
                              isUnread
                                ? 'font-bold text-slate-950 dark:text-white'
                                : 'font-semibold text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {mailFolder === 'sent'
                              ? `To: ${mail.toEmails.join(', ')}`
                              : mail.fromName}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                            {formatShortTime(mail.updatedAt || mail.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {isUnread && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                          )}
                          <p
                            className={`truncate text-xs ${
                              isUnread
                                ? 'font-bold text-slate-900 dark:text-slate-100'
                                : 'font-medium text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {mail.subject}
                          </p>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {mail.body.replace(/\s+/g, ' ').slice(0, 90) || 'Google Meet Invitation'}
                          </p>
                          {mail.meetInvite && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <Video className="h-2.5 w-2.5" />
                              <span>Meet</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Thread Reader Column */}
          <div className="flex flex-col overflow-y-auto lg:col-span-7 lg:max-h-[600px]">
            {!selectedMail ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center">
                <Sparkles className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Select an email thread to read or reply
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Every signed-in user ({activeRole}) can compose, reply, forward, and schedule
                  Google Meet calls.
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col p-4 sm:p-5">
                {/* Thread Header & Direct Reply / Forward Actions */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedMail.subject}
                      </h2>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {selectedMail.status === 'draft' ? 'Draft' : selectedMail.deliveryMethod}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedMail.status === 'draft'
                        ? `Draft saved ${formatDateTime(selectedMail.updatedAt)}`
                        : `${selectedThreadMessages.length || 1} message${(selectedThreadMessages.length || 1) === 1 ? '' : 's'} in thread`}
                    </p>
                  </div>

                  {selectedMail.status === 'draft' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDraftInCompose(selectedMail)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Resume Draft</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteDraft(selectedMail.id);
                          setSelectedMailId(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openReplyCompose(selectedMail, 'reply')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        <span>Reply</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openReplyCompose(selectedMail, 'replyAll')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <ReplyAll className="h-3.5 w-3.5" />
                        <span>Reply All</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openReplyCompose(selectedMail, 'forward')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Forward className="h-3.5 w-3.5" />
                        <span>Forward</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Messages in Thread */}
                <div className="mt-4 space-y-4">
                  {(selectedMail.status === 'draft'
                    ? [selectedMail]
                    : selectedThreadMessages.length > 0
                      ? selectedThreadMessages
                      : [selectedMail]
                  ).map((msg) => (
                    <article
                      key={msg.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <UserAvatar
                            name={msg.fromName}
                            sizeClass="h-8 w-8"
                            textClass="text-xs"
                            roundedClass="rounded-lg"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                              {msg.fromName}{' '}
                              <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                                &lt;{msg.fromEmail}&gt;
                              </span>
                            </p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              To: {msg.toEmails.join(', ') || '—'}
                              {msg.ccEmails.length > 0 ? ` · Cc: ${msg.ccEmails.join(', ')}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                          {formatDateTime(msg.createdAt)}
                        </span>
                      </div>

                      {msg.meetInvite && <GoogleMeetInviteCard invite={msg.meetInvite} />}

                      <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                        {renderSafeLinkedText(msg.body)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderChatSection = () => {
    const peerPresence = activeRoomMeta.peer
      ? formatPresenceStatus(
          activeRoomMeta.peer.lastActiveAt || activeRoomMeta.peer.lastActive,
          nowMs,
          resolveLivePresenceOverride(
            activeRoomMeta.peer,
            onlinePresenceKeys,
            recentlyOfflineKeys,
          ),
        )
      : null;

    return (
      <div className="grid min-h-[600px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        {/* Chat Directory Sidebar (Channels + 1-on-1 Direct Messages) */}
        <aside className="flex max-h-[300px] flex-col border-b border-slate-200 bg-slate-50/60 lg:col-span-4 lg:max-h-[650px] lg:border-r lg:border-b-0 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="search"
                value={chatDirectoryQuery}
                onChange={(e) => setChatDirectoryQuery(e.target.value)}
                placeholder="Search channels or teammates..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-2.5">
            {/* Department Channels */}
            <div>
              <p className="px-2 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                Department Channels
              </p>
              <div className="space-y-0.5">
                {filteredChannels.map((chan) => {
                  const isActive = activeRoomMeta.roomId === chan.roomId;
                  const unread = roomUnreadCounts.get(chan.roomId) ?? 0;
                  return (
                    <button
                      key={chan.roomId}
                      type="button"
                      onClick={() => {
                        setActiveRoomId(chan.roomId);
                        onMarkChatRoomRead(chan.roomId);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-indigo-600 font-bold text-white'
                          : 'font-medium text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Hash
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="truncate">{chan.label}</span>
                      </span>
                      {unread > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                            isActive
                              ? 'bg-white text-indigo-700'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1-on-1 Direct Messages with Live Online/Offline Presence */}
            <div>
              <p className="px-2 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                Direct Messages ({filteredDmUsers.length})
              </p>
              {filteredDmUsers.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">
                  No matching team members found.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredDmUsers.map((member) => {
                    const dmRoomId = buildDmRoomId(selfEmail, member.email);
                    const isActive = activeRoomMeta.roomId === dmRoomId;
                    const unread = roomUnreadCounts.get(dmRoomId) ?? 0;
                    const presence = formatPresenceStatus(
                      member.lastActiveAt || member.lastActive,
                      nowMs,
                      resolveLivePresenceOverride(
                        member,
                        onlinePresenceKeys,
                        recentlyOfflineKeys,
                      ),
                    );
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setActiveRoomId(dmRoomId);
                          onMarkChatRoomRead(dmRoomId);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-800 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="relative shrink-0">
                            <UserAvatar
                              name={member.name}
                              avatarUrl={member.avatarUrl}
                              sizeClass="h-7 w-7"
                              textClass="text-[11px]"
                              roundedClass="rounded-lg"
                            />
                            <span
                              title={presence.label}
                              className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                                isActive
                                  ? 'border-indigo-600'
                                  : 'border-white dark:border-slate-950'
                              } ${presence.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">{member.name}</p>
                            <p
                              className={`truncate text-[10px] ${
                                isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {member.department} · {presence.isOnline ? 'Online' : presence.label}
                            </p>
                          </div>
                        </div>
                        {unread > 0 && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                              isActive
                                ? 'bg-white text-indigo-700'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Active Chat Feed & Composer */}
        <section className="flex flex-col lg:col-span-8 lg:max-h-[650px]">
          {/* Chat Room Header with Start Google Meet Button */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-2.5">
              {activeRoomMeta.roomType === 'dm' && activeRoomMeta.peer ? (
                <UserAvatar
                  name={activeRoomMeta.peer.name}
                  avatarUrl={activeRoomMeta.peer.avatarUrl}
                  sizeClass="h-8 w-8"
                  textClass="text-xs"
                  roundedClass="rounded-lg"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  <Hash className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeRoomMeta.label}
                  </h3>
                  {peerPresence && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        peerPresence.isOnline
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          peerPresence.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{peerPresence.isOnline ? 'Online' : peerPresence.label}</span>
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {activeRoomMeta.peer
                    ? `${activeRoomMeta.peer.department} · ${activeRoomMeta.peer.email}`
                    : 'Real-time departmental collaboration channel'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartGoogleMeetInChat}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
            >
              <GoogleMeetColorIcon className="h-4 w-4 shrink-0" />
              <span>Start Google Meet</span>
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 p-4 dark:bg-slate-950/40">
            {activeRoomMessages.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Start the conversation in {activeRoomMeta.label}
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                  Messages deliver in real time across active sessions. Click Start Google Meet
                  anytime to drop a video call card.
                </p>
              </div>
            ) : (
              activeRoomMessages.map((msg) => {
                const isSelf = msg.senderEmail.trim().toLowerCase() === selfEmail;
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isSelf ? 'flex-row-reverse' : ''}`}
                  >
                    <UserAvatar
                      name={msg.senderName}
                      sizeClass="h-8 w-8"
                      textClass="text-xs"
                      roundedClass="rounded-lg"
                    />
                    <div
                      className={`max-w-[82%] rounded-xl border px-3.5 py-2.5 ${
                        isSelf
                          ? 'border-indigo-200 bg-indigo-50/90 text-slate-900 dark:border-indigo-800/70 dark:bg-indigo-950/55 dark:text-slate-100'
                          : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold">{msg.senderName}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {msg.senderRole}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                          {formatShortTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
                        {renderSafeLinkedText(msg.body)}
                      </p>
                      {msg.meetInvite && <GoogleMeetInviteCard invite={msg.meetInvite} compact />}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatScrollRef} />
          </div>

          {/* Chat Composer Bar */}
          <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleStartGoogleMeetInChat}
                title="Start Google Meet video call in this chat"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 transition-colors hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-emerald-950/60"
              >
                <GoogleMeetColorIcon className="h-5 w-5" />
              </button>
              <textarea
                rows={1}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder={`Message ${activeRoomMeta.label} (Enter to send, Shift+Enter for new line)...`}
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={!chatDraft.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Unified Communication Header */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('mail')}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === 'mail'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Mail className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>Enterprise Mail</span>
              {unreadInboxCount > 0 && (
                <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white tabular-nums">
                  {unreadInboxCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('chat')}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                viewMode === 'chat'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Live Team Chat</span>
              {totalUnreadChatCount > 0 && (
                <span className="rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white tabular-nums">
                  {totalUnreadChatCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors xl:inline-flex ${
                viewMode === 'split'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Users className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <span>Split View</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const meetUrl = 'https://meet.google.com/new';
                openExternalUrlSafely(meetUrl);
                onStartGoogleMeetSession({
                  title: `Instant Google Meet — ${currentUser.name}`,
                  department: currentUser.department,
                  attendees: [currentUser.name],
                  meetUrl,
                  sourceLabel: 'Mail & Chat Hub Header',
                });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
            >
              <GoogleMeetColorIcon className="h-4 w-4 shrink-0" />
              <span>Instant Google Meet</span>
            </button>

            {googleToken ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300">
                <GoogleGColorIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[160px] truncate">{googleEmail || 'Gmail Connected'}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void onGoogleSignIn()}
                disabled={googleConnecting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <GoogleGColorIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{googleConnecting ? 'Connecting...' : 'Connect Gmail'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Mail & Chat Body */}
      {viewMode === 'split' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>{renderMailSection()}</div>
          <div>{renderChatSection()}</div>
        </div>
      ) : viewMode === 'mail' ? (
        renderMailSection()
      ) : (
        renderChatSection()
      )}

      {/* Email Compose / Reply / Forward Modal */}
      {composeOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setComposeOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-xs sm:p-4 dark:bg-slate-950/80"
          role="dialog"
          aria-modal="true"
          aria-label={composeHeading}
        >
          <form
            onSubmit={handleComposeSubmit}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {composeHeading}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                aria-label="Close email composer"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Fields */}
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {/* Pre-filled Sender Identity */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
                <span className="font-semibold text-slate-500 dark:text-slate-400">From:</span>
                <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                  {currentUser.name}{' '}
                  <span className="font-mono text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    &lt;{currentUser.email}&gt;
                  </span>
                </span>
              </div>

              {/* To Input + Quick Teammate Picker */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    To (Recipients)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRecipientPicker((prev) => !prev)}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {showRecipientPicker ? 'Hide Team Directory' : '+ Pick Teammate'}
                    </button>
                    {!showCc && (
                      <button
                        type="button"
                        onClick={() => setShowCc(true)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Add Cc
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => {
                    setToInput(e.target.value);
                    setGmailConfirmPending(false);
                  }}
                  placeholder="colleague@company.com, team@company.com (comma separated)"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />

                {showRecipientPicker && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    <button
                      type="button"
                      onClick={() => appendRecipientEmail('all@nexops.company')}
                      className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                    >
                      All Team (all@nexops.company)
                    </button>
                    {activeTeammates.map((tm) => (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() => appendRecipientEmail(tm.email)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {tm.name} ({tm.department})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {showCc && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Cc
                  </label>
                  <input
                    type="text"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    placeholder="cc-recipient@company.com"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Subject
                </label>
                <input
                  type="text"
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="Enter email subject..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Compose Toolbar with Start Google Meet */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={handleInsertMeetIntoCompose}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                >
                  <GoogleMeetColorIcon className="h-4 w-4 shrink-0" />
                  <span>Start Google Meet &amp; Insert Invite</span>
                </button>

                {googleToken && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={alsoSendViaGmailApi}
                      onChange={(e) => {
                        setAlsoSendViaGmailApi(e.target.checked);
                        setGmailConfirmPending(false);
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Dispatch externally via Gmail API</span>
                  </label>
                )}
              </div>

              {composeMeetInvite && (
                <div className="space-y-1.5">
                  <GoogleMeetInviteCard invite={composeMeetInvite} compact />
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Meet URL:
                    </label>
                    <input
                      type="url"
                      value={composeMeetInvite.url}
                      onChange={(e) =>
                        setComposeMeetInvite((prev) =>
                          prev ? { ...prev, url: e.target.value } : prev,
                        )
                      }
                      placeholder="https://meet.google.com/xxx-xxxx-xxx"
                      className="h-7 flex-1 rounded border border-slate-200 bg-white px-2 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>
                </div>
              )}

              <textarea
                rows={8}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                placeholder="Write your corporate message..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />

              {gmailConfirmPending && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
                  Confirm live dispatch via connected Google Gmail ({googleEmail || currentUser.email}) to{' '}
                  <span className="font-mono font-bold">{toInput}</span>. Click{' '}
                  <strong>Confirm &amp; Send</strong> below to proceed.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftClick}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenMailtoFallback}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Mail App</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingExternalGmail}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>
                    {sendingExternalGmail
                      ? 'Sending...'
                      : gmailConfirmPending
                        ? 'Confirm & Send'
                        : 'Send Email'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
