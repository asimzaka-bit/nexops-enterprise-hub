import {
  ExternalLink,
  Hash,
  Lock,
  Maximize2,
  MessageSquare,
  Send,
  Video,
  X,
} from 'lucide-react';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MeetInviteCardData, TeamChatMessage, TeamMember } from '../types/nexops';
import {
  buildChannelRoomId,
  buildDmRoomId,
  formatPresenceStatus,
  isDmParticipant,
  isStrictChatParticipant,
  resolveLivePresenceOverride,
} from '../utils/storage';
import type { ViewportInfo } from '../hooks/useViewport';
import { SendChatMessagePayload, StartGoogleMeetPayload } from './MailChatHubView';
import { GoogleMeetColorIcon } from './GoogleWorkspaceIcons';
import { UserAvatar } from './UserAvatar';

interface QuickChatDrawerProps {
  currentUser: TeamMember;
  teamMembers: TeamMember[];
  departments: string[];
  onlinePresenceKeys?: Set<string>;
  recentlyOfflineKeys?: Set<string>;
  chatMessages: TeamChatMessage[];
  onSendChatMessage: (payload: SendChatMessagePayload) => void;
  onMarkChatRoomRead: (roomId: string) => void;
  onStartGoogleMeetSession: (payload: StartGoogleMeetPayload) => void;
  onOpenFullHub: () => void;
  viewport?: ViewportInfo;
}

function openExternalUrlSafely(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function QuickChatDrawer({
  currentUser,
  teamMembers,
  departments,
  onlinePresenceKeys,
  recentlyOfflineKeys,
  chatMessages,
  onSendChatMessage,
  onMarkChatRoomRead,
  onStartGoogleMeetSession,
  onOpenFullHub,
  viewport,
}: QuickChatDrawerProps) {
  const isCompactMobile = viewport ? viewport.isMobile : false;
  const [open, setOpen] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string>(() => buildChannelRoomId('General'));
  const [draft, setDraft] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const selfEmail = currentUser.email.trim().toLowerCase();

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [open]);

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

  const channels = useMemo(
    () =>
      Array.from(new Set(['General', ...departments])).map((name) => ({
        roomId: buildChannelRoomId(name),
        label: name,
      })),
    [departments],
  );

  const unreadByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of chatMessages) {
      if (!isStrictChatParticipant(m, selfEmail)) continue;
      if (m.senderEmail.trim().toLowerCase() === selfEmail) continue;
      if (!m.readBy.some((e) => e.trim().toLowerCase() === selfEmail)) {
        map.set(m.roomId, (map.get(m.roomId) ?? 0) + 1);
      }
    }
    return map;
  }, [chatMessages, selfEmail]);

  const totalUnread = useMemo(() => {
    let sum = 0;
    for (const v of unreadByRoom.values()) sum += v;
    return sum;
  }, [unreadByRoom]);

  const activeRoom = useMemo(() => {
    const chan = channels.find((c) => c.roomId === activeRoomId);
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
    return {
      roomId: buildChannelRoomId('General'),
      roomType: 'channel' as const,
      label: '#General',
      rawLabel: 'General',
      peer: undefined,
    };
  }, [activeRoomId, channels, activeTeammates, selfEmail]);

  const roomMessages = useMemo(
    () =>
      chatMessages
        .filter(
          (m) => m.roomId === activeRoom.roomId && isStrictChatParticipant(m, selfEmail),
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [chatMessages, activeRoom.roomId, selfEmail],
  );

  useEffect(() => {
    if (!open) return;
    const hasUnread = roomMessages.some(
      (m) =>
        m.senderEmail.trim().toLowerCase() !== selfEmail &&
        !m.readBy.some((e) => e.trim().toLowerCase() === selfEmail),
    );
    if (hasUnread) {
      onMarkChatRoomRead(activeRoom.roomId);
    }
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, roomMessages, activeRoom.roomId, selfEmail, onMarkChatRoomRead]);

  const handleSend = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (activeRoom.roomType === 'dm' && !isDmParticipant(activeRoom.roomId, selfEmail)) return;
    onSendChatMessage({
      roomId: activeRoom.roomId,
      roomType: activeRoom.roomType,
      roomLabel: activeRoom.label,
      body: clean,
    });
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartMeet = () => {
    const meetUrl = 'https://meet.google.com/new';
    openExternalUrlSafely(meetUrl);
    const nowIso = new Date().toISOString();
    const title = activeRoom.peer
      ? `1:1 Google Meet — ${currentUser.name} & ${activeRoom.peer.name}`
      : `${activeRoom.label} Quick Google Meet`;
    const invite: MeetInviteCardData = {
      url: meetUrl,
      hostName: currentUser.name,
      hostEmail: currentUser.email,
      title,
      createdAt: nowIso,
    };
    onSendChatMessage({
      roomId: activeRoom.roomId,
      roomType: activeRoom.roomType,
      roomLabel: activeRoom.label,
      body: `Started a Google Meet video call for ${activeRoom.label}.`,
      meetInvite: invite,
    });
    if (activeRoom.roomType !== 'dm') {
      onStartGoogleMeetSession({
        title,
        department: currentUser.department,
        attendees: [currentUser.name, `${activeRoom.rawLabel} Team`],
        meetUrl,
        sourceLabel: `Quick Chat (${activeRoom.label})`,
      });
    }
  };

  return (
    <div className="no-print fixed right-4 bottom-4 z-30 max-w-[calc(100vw-24px)] sm:right-6 sm:bottom-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Quick Team Chat Drawer"
          className={`inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-600 text-xs font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 ${
            isCompactMobile ? 'px-3.5 py-2.5' : 'px-4 py-2.5'
          }`}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span>Team Chat</span>
          {totalUnread > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white tabular-nums">
              {totalUnread}
            </span>
          )}
        </button>
      ) : (
        <div
          className="flex h-[520px] max-h-[80vh] w-[calc(100vw-24px)] max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[400px] dark:border-slate-800 dark:bg-slate-900"
          role="dialog"
          aria-label="Quick Team Chat Drawer"
        >
          {/* Drawer Header */}
          <div className="border-b border-slate-200 bg-[#0F172A] text-white dark:border-slate-800">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-indigo-400" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">Quick Team Chat</p>
                  <p className="truncate text-[10px] text-slate-300">{activeRoom.label}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handleStartMeet}
                  title="Start Google Meet"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                >
                  <GoogleMeetColorIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Meet</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenFullHub();
                  }}
                  title="Open Full Mail & Chat Hub"
                  className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close Quick Chat Drawer"
                  className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-800/80 bg-slate-950/70 px-3.5 py-1 text-[10px] font-medium text-slate-300">
              <Lock className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
              <span className="truncate">
                End-to-End Participant Private • Visible only to sender &amp; recipient
              </span>
            </div>
          </div>

          {/* Room Switcher Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950">
            {channels.map((chan) => {
              const isSelected = activeRoom.roomId === chan.roomId;
              const unread = unreadByRoom.get(chan.roomId) ?? 0;
              return (
                <button
                  key={chan.roomId}
                  type="button"
                  onClick={() => setActiveRoomId(chan.roomId)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Hash className="h-3 w-3" />
                  <span>{chan.label}</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-rose-600 px-1 font-mono text-[9px] text-white tabular-nums">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
            {activeTeammates.map((member) => {
              const dmId = buildDmRoomId(selfEmail, member.email);
              const isSelected = activeRoom.roomId === dmId;
              const unread = unreadByRoom.get(dmId) ?? 0;
              const presence = formatPresenceStatus(
                member.lastActiveAt || member.lastActive,
                nowMs,
                resolveLivePresenceOverride(member, onlinePresenceKeys, recentlyOfflineKeys),
              );
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setActiveRoomId(dmId)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      presence.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  <span>{member.name.split(' ')[0]}</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-rose-600 px-1 font-mono text-[9px] text-white tabular-nums">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Message Feed */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {roomMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  No messages in {activeRoom.label} yet
                </p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Send a message or click Meet to launch a Google Meet call.
                </p>
              </div>
            ) : (
              roomMessages.map((msg) => {
                const isSelf = msg.senderEmail.trim().toLowerCase() === selfEmail;
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}
                  >
                    <UserAvatar
                      name={msg.senderName}
                      sizeClass="h-6 w-6"
                      textClass="text-[10px]"
                      roundedClass="rounded-md"
                    />
                    <div
                      className={`max-w-[80%] rounded-xl border px-3 py-2 text-xs ${
                        isSelf
                          ? 'border-indigo-200 bg-indigo-50 text-slate-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {msg.senderName}
                        </span>
                        <span className="font-mono tabular-nums">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                      {msg.meetInvite && (
                        <a
                          href={msg.meetInvite.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          <Video className="h-3 w-3" />
                          <span>Join Meet</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={scrollEndRef} />
          </div>

          {/* Input Bar */}
          <div className="flex items-end gap-1.5 border-t border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${activeRoom.label}...`}
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim()}
              aria-label="Send chat message"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
