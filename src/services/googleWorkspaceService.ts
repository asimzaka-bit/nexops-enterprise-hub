import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  FormQuestionItem,
  FormSubmissionItem,
  WorkspaceDocToolType,
} from '../types/nexops';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/forms.body',
] as const;

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }
  return authInstance;
}

const googleProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory token caching (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface GoogleWorkspaceSession {
  user: User;
  accessToken: string;
}

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: User, accessToken: string) => void,
  onAuthUnavailable?: () => void,
): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      onAuthUnavailable?.();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<GoogleWorkspaceSession> {
  const auth = getFirebaseAuth();
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Unable to obtain Google Workspace access token from sign-in.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleWorkspaceAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): User | null {
  return getFirebaseAuth().currentUser;
}

export async function disconnectGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  await getFirebaseAuth().signOut();
}

// ---------------------------------------------------------------------------
// Gmail API Helpers
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let part = '';
    for (let j = 0; j < chunk.length; j += 1) {
      part += String.fromCharCode(chunk[j]);
    }
    binary += part;
  }
  return btoa(binary);
}

function wrapBase6476(b64: string): string {
  return b64.replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
}

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeUtf8HeaderWord(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return `=?UTF-8?B?${bytesToBase64(bytes)}?=`;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBodyToSafeHtml(rawBody: string): string {
  // Convert markdown links [label](https://...) and bare https?:// URLs into clickable <a> tags
  const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(rawBody)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtmlText(rawBody.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      const safeLabel = escapeHtmlText(match[1]);
      const safeHref = escapeHtmlText(match[2]);
      result += `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#0B57D0;text-decoration:underline;">${safeLabel}</a>`;
    } else if (match[3]) {
      const safeHref = escapeHtmlText(match[3]);
      result += `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#0B57D0;text-decoration:underline;">${safeHref}</a>`;
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rawBody.length) {
    result += escapeHtmlText(rawBody.slice(lastIndex));
  }

  const withBreaks = result.replace(/\r?\n/g, '<br />');
  return `<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.55;color:#1F1F1F;">${withBreaks}</div>`;
}

export interface SendGmailPayload {
  fromEmail: string;
  fromName: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachments?: File[];
}

export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
}

export interface GmailRecentMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  snippet: string;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  bodyText?: string;
  attachments?: GmailAttachmentMeta[];
}

export interface GmailLabelItem {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesUnread?: number;
}

export type GmailFolderKey = 'inbox' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'label';

function decodeBase64UrlUtf8(encoded: string): string {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface GmailMimePart {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMimePart[];
}

function extractGmailAttachments(payload?: GmailMimePart): GmailAttachmentMeta[] {
  if (!payload) return [];
  const list: GmailAttachmentMeta[] = [];
  if (payload.filename && payload.filename.trim()) {
    list.push({
      filename: payload.filename.trim(),
      mimeType: payload.mimeType || 'application/octet-stream',
      size: payload.body?.size ?? 0,
      attachmentId: payload.body?.attachmentId,
    });
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      list.push(...extractGmailAttachments(part));
    }
  }
  return list;
}

function extractGmailBodyText(payload?: GmailMimePart): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data).trim();
  }
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      const plain = extractGmailBodyText(part);
      if (plain && part.mimeType === 'text/plain') return plain;
    }
    for (const part of payload.parts) {
      const nested = extractGmailBodyText(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtmlTags(decodeBase64UrlUtf8(payload.body.data));
  }
  if (payload.body?.data && !payload.filename) {
    return decodeBase64UrlUtf8(payload.body.data).trim();
  }
  return '';
}

export async function sendEmailViaGmailApi(
  payload: SendGmailPayload,
): Promise<{ id: string; threadId?: string }> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect your Google account first to send emails via Gmail API.');
  }

  const encoder = new TextEncoder();
  const attachments = payload.attachments ?? [];
  const altBoundary = `nexops_alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mixedBoundary = `nexops_mix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const plainBase64 = wrapBase6476(bytesToBase64(encoder.encode(payload.body)));
  const htmlBase64 = wrapBase6476(bytesToBase64(encoder.encode(formatBodyToSafeHtml(payload.body))));

  const alternativeSection = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    plainBase64,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
    '',
    `--${altBoundary}--`,
  ];

  const baseHeaders = [
    `From: "${payload.fromName.replace(/"/g, '')}" <${payload.fromEmail}>`,
    `To: ${payload.to.trim()}`,
    ...(payload.cc && payload.cc.trim() ? [`Cc: ${payload.cc.trim()}`] : []),
    `Subject: ${encodeUtf8HeaderWord(payload.subject.trim())}`,
    'MIME-Version: 1.0',
  ];

  let mimeLines: string[];

  if (attachments.length === 0) {
    mimeLines = [...baseHeaders, ...alternativeSection];
  } else {
    const attachmentParts: string[] = [];
    for (const file of attachments) {
      const buffer = await file.arrayBuffer();
      const b64 = wrapBase6476(bytesToBase64(new Uint8Array(buffer)));
      const safeFileName = file.name.replace(/["\r\n]/g, '_');
      const mimeType = file.type || 'application/octet-stream';
      attachmentParts.push(
        `--${mixedBoundary}`,
        `Content-Type: ${mimeType}; name="${safeFileName}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${safeFileName}"`,
        '',
        b64,
        '',
      );
    }

    mimeLines = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      ...alternativeSection,
      '',
      ...attachmentParts,
      `--${mixedBoundary}--`,
    ];
  }

  const raw = encodeBase64Url(mimeLines.join('\r\n'));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const data = (await res.json()) as { id?: string; threadId?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Gmail API error (${res.status}).`);
  }
  if (!data.id) {
    throw new Error('Gmail API did not return a sent message ID.');
  }
  return { id: data.id, threadId: data.threadId };
}

export async function fetchGmailLabels(): Promise<{
  inboxUnread: number;
  labels: GmailLabelItem[];
}> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    return { inboxUnread: 0, labels: [] };
  }

  const [listRes, inboxRes] = await Promise.all([
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  let inboxUnread = 0;
  if (inboxRes.ok) {
    const inboxData = (await inboxRes.json()) as { messagesUnread?: number };
    inboxUnread = inboxData.messagesUnread ?? 0;
  }

  if (!listRes.ok) {
    return { inboxUnread, labels: [] };
  }

  const listData = (await listRes.json()) as {
    labels?: { id: string; name: string; type?: string }[];
  };

  const userLabels: GmailLabelItem[] = (listData.labels ?? [])
    .filter((l) => l.type === 'user')
    .map((l) => ({
      id: l.id,
      name: l.name,
      type: 'user' as const,
    }))
    .slice(0, 10);

  return { inboxUnread, labels: userLabels };
}

export async function fetchRecentGmailMessages(
  maxResults = 15,
  query = 'in:inbox',
  labelIds?: string[],
): Promise<GmailRecentMessage[]> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Sign in with Google Workspace to read live Gmail messages.');
  }

  const params = new URLSearchParams();
  params.set('maxResults', String(maxResults));
  if (query.trim()) {
    params.set('q', query.trim());
  }
  if (labelIds && labelIds.length > 0) {
    labelIds.forEach((lid) => params.append('labelIds', lid));
  }

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId: string }[];
    error?: { message?: string };
  };
  if (!listRes.ok) {
    throw new Error(listData.error?.message || `Unable to list Gmail messages (${listRes.status}).`);
  }

  const items = listData.messages ?? [];
  if (items.length === 0) return [];

  const details = await Promise.all(
    items.map(async (item): Promise<GmailRecentMessage | null> => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          item.id,
        )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!msgRes.ok) return null;
      const msgData = (await msgRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = msgData.payload?.headers ?? [];
      const labels = msgData.labelIds ?? [];
      const pick = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
      return {
        id: msgData.id,
        threadId: msgData.threadId,
        from: pick('From'),
        to: pick('To'),
        cc: pick('Cc') || undefined,
        subject: pick('Subject') || '(No Subject)',
        date: pick('Date'),
        snippet: msgData.snippet ?? '',
        labelIds: labels,
        isUnread: labels.includes('UNREAD'),
        isStarred: labels.includes('STARRED'),
      };
    }),
  );

  return details.filter((m): m is GmailRecentMessage => m !== null);
}

export async function fetchGmailMessageDetail(messageId: string): Promise<GmailRecentMessage> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Sign in with Google Workspace to open this email.');
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
      messageId,
    )}?format=full`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    labelIds?: string[];
    payload?: GmailMimePart & { headers?: { name: string; value: string }[] };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Unable to load message detail (${res.status}).`);
  }

  const headers = data.payload?.headers ?? [];
  const labels = data.labelIds ?? [];
  const pick = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const extractedBody = extractGmailBodyText(data.payload) || data.snippet || '';
  const extractedAttachments = extractGmailAttachments(data.payload);

  return {
    id: data.id,
    threadId: data.threadId,
    from: pick('From'),
    to: pick('To'),
    cc: pick('Cc'),
    subject: pick('Subject') || '(No Subject)',
    date: pick('Date'),
    snippet: data.snippet ?? '',
    labelIds: labels,
    isUnread: labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    bodyText: extractedBody,
    attachments: extractedAttachments,
  };
}

// ---------------------------------------------------------------------------
// Google Docs, Sheets & Forms API + Embed URL Helpers
// ---------------------------------------------------------------------------

export function extractGoogleFileId(toolType: WorkspaceDocToolType, rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (toolType === 'docs') {
    const m = url.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : null;
  }
  if (toolType === 'sheets') {
    const m = url.match(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : null;
  }
  const mEdit = url.match(/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(?!e\/)([a-zA-Z0-9_-]+)/i);
  if (mEdit) return mEdit[1];
  return null;
}

export function getGoogleEmbedUrl(
  toolType: WorkspaceDocToolType,
  rawUrl: string,
  mode: 'edit' | 'preview' = 'edit',
): string {
  const url = rawUrl.trim();
  const fileId = extractGoogleFileId(toolType, url);

  if (toolType === 'docs' && fileId) {
    return mode === 'preview'
      ? `https://docs.google.com/document/d/${fileId}/preview`
      : `https://docs.google.com/document/d/${fileId}/edit?rm=full`;
  }
  if (toolType === 'sheets' && fileId) {
    return mode === 'preview'
      ? `https://docs.google.com/spreadsheets/d/${fileId}/preview`
      : `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=full`;
  }
  if (toolType === 'forms') {
    if (url.includes('/forms/d/e/')) {
      const cleanBase = url.split('?')[0].replace(/\/(edit|viewform)$/, '');
      return `${cleanBase}/viewform?embedded=true`.replace(
        '/viewform/viewform',
        '/viewform',
      );
    }
    if (fileId) {
      return mode === 'preview'
        ? `https://docs.google.com/forms/d/${fileId}/viewform?embedded=true`
        : `https://docs.google.com/forms/d/${fileId}/edit`;
    }
  }
  return url;
}

export async function createGoogleDoc(
  title: string,
): Promise<{ fileId: string; title: string; url: string }> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to create a live Google Doc.');
  }
  const res = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: title.trim() }),
  });
  const data = (await res.json()) as {
    documentId?: string;
    title?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.documentId) {
    throw new Error(data.error?.message || `Google Docs API error (${res.status}).`);
  }
  return {
    fileId: data.documentId,
    title: data.title || title.trim(),
    url: `https://docs.google.com/document/d/${data.documentId}/edit`,
  };
}

export async function createGoogleSheet(
  title: string,
): Promise<{ fileId: string; title: string; url: string }> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to create a live Google Sheet.');
  }
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { title: title.trim() } }),
  });
  const data = (await res.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    error?: { message?: string };
  };
  if (!res.ok || !data.spreadsheetId) {
    throw new Error(data.error?.message || `Google Sheets API error (${res.status}).`);
  }
  return {
    fileId: data.spreadsheetId,
    title: data.properties?.title || title.trim(),
    url:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}

export async function createGoogleForm(
  title: string,
): Promise<{ fileId: string; title: string; url: string; responderUri?: string }> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to create a live Google Form.');
  }
  const res = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: title.trim(),
        documentTitle: title.trim(),
      },
    }),
  });
  const data = (await res.json()) as {
    formId?: string;
    responderUri?: string;
    info?: { title?: string };
    error?: { message?: string };
  };
  if (!res.ok || !data.formId) {
    throw new Error(data.error?.message || `Google Forms API error (${res.status}).`);
  }
  return {
    fileId: data.formId,
    title: data.info?.title || title.trim(),
    url: `https://docs.google.com/forms/d/${data.formId}/edit`,
    responderUri: data.responderUri,
  };
}

export interface GoogleResourceMetadata {
  title: string;
  summary: string;
  details: string[];
}

export async function fetchGoogleResourceMetadata(
  toolType: WorkspaceDocToolType,
  fileId: string,
): Promise<GoogleResourceMetadata> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to inspect live file metadata.');
  }
  const safeId = encodeURIComponent(fileId.trim());

  if (toolType === 'docs') {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${safeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as {
      title?: string;
      revisionId?: string;
      body?: { content?: { paragraph?: unknown; table?: unknown }[] };
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || `Google Docs API error (${res.status}).`);
    }
    const blocks = data.body?.content ?? [];
    const paragraphCount = blocks.filter((b) => Boolean(b.paragraph)).length;
    const tableCount = blocks.filter((b) => Boolean(b.table)).length;
    return {
      title: data.title || 'Google Document',
      summary: `${paragraphCount} paragraphs · ${tableCount} tables`,
      details: [
        `Document ID: ${fileId}`,
        ...(data.revisionId ? [`Revision: ${data.revisionId.slice(0, 14)}…`] : []),
      ],
    };
  }

  if (toolType === 'sheets') {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${safeId}?fields=properties.title,sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = (await res.json()) as {
      properties?: { title?: string };
      sheets?: { properties?: { title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || `Google Sheets API error (${res.status}).`);
    }
    const tabs = data.sheets ?? [];
    return {
      title: data.properties?.title || 'Google Spreadsheet',
      summary: `${tabs.length} worksheet tab${tabs.length === 1 ? '' : 's'}`,
      details: tabs.map((t) => {
        const p = t.properties;
        return `Tab "${p?.title ?? 'Sheet'}" (${p?.gridProperties?.rowCount ?? 0} rows × ${p?.gridProperties?.columnCount ?? 0} cols)`;
      }),
    };
  }

  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    info?: { title?: string; description?: string };
    items?: { title?: string }[];
    responderUri?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Forms API error (${res.status}).`);
  }
  const items = data.items ?? [];
  return {
    title: data.info?.title || 'Google Form',
    summary: `${items.length} form question/section item${items.length === 1 ? '' : 's'}`,
    details: [
      ...(data.info?.description ? [data.info.description] : []),
      ...items.slice(0, 6).map((it, idx) => `${idx + 1}. ${it.title || 'Untitled item'}`),
    ],
  };
}

// ---------------------------------------------------------------------------
// Interactive Docs / Sheets / Forms Live API Sync Helpers
// ---------------------------------------------------------------------------

export async function fetchGoogleDocPlainText(documentId: string): Promise<{
  title: string;
  text: string;
}> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to pull live Google Doc content.');
  }
  const safeId = encodeURIComponent(documentId.trim());
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    title?: string;
    body?: {
      content?: {
        paragraph?: {
          elements?: { textRun?: { content?: string } }[];
        };
      }[];
    };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Docs API error (${res.status}).`);
  }
  const lines: string[] = [];
  for (const block of data.body?.content ?? []) {
    if (block.paragraph?.elements) {
      const line = block.paragraph.elements.map((el) => el.textRun?.content ?? '').join('');
      if (line) lines.push(line);
    }
  }
  return {
    title: data.title || 'Untitled Document',
    text: lines.join('').trim(),
  };
}

export async function syncTextToGoogleDoc(documentId: string, plainText: string): Promise<void> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to push changes to Google Docs.');
  }
  const safeId = encodeURIComponent(documentId.trim());
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const docData = (await docRes.json()) as {
    body?: { content?: { endIndex?: number }[] };
    error?: { message?: string };
  };
  if (!docRes.ok) {
    throw new Error(docData.error?.message || `Google Docs API error (${docRes.status}).`);
  }

  const content = docData.body?.content ?? [];
  const lastEndIndex = content[content.length - 1]?.endIndex ?? 2;
  const requests: Record<string, unknown>[] = [];
  if (lastEndIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: lastEndIndex - 1,
        },
      },
    });
  }
  if (plainText.trim()) {
    requests.push({
      insertText: {
        location: { index: 1 },
        text: plainText,
      },
    });
  }
  if (requests.length === 0) return;

  const updateRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${safeId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!updateRes.ok) {
    const errData = (await updateRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errData.error?.message || `Google Docs sync failed (${updateRes.status}).`);
  }
}

export async function fetchGoogleSheetValues(spreadsheetId: string): Promise<{
  title: string;
  sheetName: string;
  values: string[][];
}> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to pull live Google Sheet values.');
  }
  const safeId = encodeURIComponent(spreadsheetId.trim());
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const metaData = (await metaRes.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
    error?: { message?: string };
  };
  if (!metaRes.ok) {
    throw new Error(metaData.error?.message || `Google Sheets API error (${metaRes.status}).`);
  }
  const sheetName = metaData.sheets?.[0]?.properties?.title || 'Sheet1';
  const range = encodeURIComponent(`${sheetName}!A1:Z100`);
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${range}?valueRenderOption=FORMULA`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const valData = (await valRes.json()) as {
    values?: (string | number | boolean)[][];
    error?: { message?: string };
  };
  if (!valRes.ok) {
    throw new Error(valData.error?.message || `Google Sheets values error (${valRes.status}).`);
  }
  return {
    title: metaData.properties?.title || 'Spreadsheet',
    sheetName,
    values: (valData.values ?? []).map((row) => row.map((cell) => String(cell ?? ''))),
  };
}

export async function updateGoogleSheetValues(
  spreadsheetId: string,
  sheetName: string,
  values: string[][],
): Promise<void> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to push values to Google Sheets.');
  }
  const safeId = encodeURIComponent(spreadsheetId.trim());
  const range = encodeURIComponent(`${sheetName}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errData.error?.message || `Google Sheets update failed (${res.status}).`);
  }
}

export async function fetchGoogleFormStructure(formId: string): Promise<{
  title: string;
  description: string;
  questions: FormQuestionItem[];
}> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to read Google Form questions.');
  }
  const safeId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    info?: { title?: string; description?: string };
    items?: {
      itemId?: string;
      title?: string;
      description?: string;
      questionItem?: {
        question?: {
          required?: boolean;
          textQuestion?: { paragraph?: boolean };
          choiceQuestion?: { type?: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN'; options?: { value?: string }[] };
          dateQuestion?: unknown;
          timeQuestion?: unknown;
          fileUploadQuestion?: unknown;
        };
      };
    }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Forms API error (${res.status}).`);
  }

  const questions: FormQuestionItem[] = (data.items ?? []).map((item, idx) => {
    const q = item.questionItem?.question;
    let type: FormQuestionItem['type'] = 'short_answer';
    let options: string[] | undefined;

    if (q?.textQuestion?.paragraph) type = 'paragraph';
    else if (q?.choiceQuestion) {
      if (q.choiceQuestion.type === 'CHECKBOX') type = 'checkboxes';
      else if (q.choiceQuestion.type === 'DROP_DOWN') type = 'dropdown';
      else type = 'multiple_choice';
      options = (q.choiceQuestion.options ?? [])
        .map((o) => o.value || '')
        .filter(Boolean);
    } else if (q?.dateQuestion || q?.timeQuestion) {
      type = 'date_time';
    } else if (q?.fileUploadQuestion) {
      type = 'file_upload';
    }

    return {
      id: item.itemId || `gq-${Date.now()}-${idx}`,
      title: item.title || `Question ${idx + 1}`,
      description: item.description,
      type,
      required: Boolean(q?.required),
      options,
    };
  });

  return {
    title: data.info?.title || 'Google Form',
    description: data.info?.description || '',
    questions,
  };
}

export async function syncQuestionsToGoogleForm(
  formId: string,
  title: string,
  description: string,
  questions: FormQuestionItem[],
): Promise<void> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to push questions to Google Forms.');
  }
  const safeId = encodeURIComponent(formId.trim());
  const existingRes = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existingData = (await existingRes.json()) as {
    items?: unknown[];
    error?: { message?: string };
  };
  if (!existingRes.ok) {
    throw new Error(existingData.error?.message || `Google Forms API error (${existingRes.status}).`);
  }

  const existingCount = existingData.items?.length ?? 0;
  const requests: Record<string, unknown>[] = [
    {
      updateFormInfo: {
        info: {
          title: title.trim() || 'NexOps Form',
          description: description.trim(),
        },
        updateMask: 'title,description',
      },
    },
  ];

  // Clear existing items from end to start so batchUpdate cleanly reflects our studio list
  for (let i = existingCount - 1; i >= 0; i -= 1) {
    requests.push({ deleteItem: { location: { index: i } } });
  }

  questions.forEach((q, idx) => {
    let questionPayload: Record<string, unknown>;
    if (q.type === 'paragraph') {
      questionPayload = { required: q.required, textQuestion: { paragraph: true } };
    } else if (
      q.type === 'multiple_choice' ||
      q.type === 'checkboxes' ||
      q.type === 'dropdown'
    ) {
      const choiceType =
        q.type === 'checkboxes' ? 'CHECKBOX' : q.type === 'dropdown' ? 'DROP_DOWN' : 'RADIO';
      const opts = (q.options && q.options.length > 0 ? q.options : ['Option 1']).map((v) => ({
        value: v,
      }));
      questionPayload = {
        required: q.required,
        choiceQuestion: { type: choiceType, options: opts },
      };
    } else if (q.type === 'date_time') {
      questionPayload = {
        required: q.required,
        dateQuestion: { includeTime: true, includeYear: true },
      };
    } else {
      questionPayload = { required: q.required, textQuestion: { paragraph: false } };
    }

    requests.push({
      createItem: {
        item: {
          title: q.title.trim() || `Question ${idx + 1}`,
          ...(q.description ? { description: q.description } : {}),
          questionItem: {
            question: questionPayload,
          },
        },
        location: { index: idx },
      },
    });
  });

  const batchRes = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) {
    const errData = (await batchRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errData.error?.message || `Google Forms sync failed (${batchRes.status}).`);
  }
}

export async function fetchGoogleFormResponses(formId: string): Promise<FormSubmissionItem[]> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect Google Workspace first to pull live Google Form responses.');
  }
  const safeId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}/responses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    responses?: {
      responseId?: string;
      respondentEmail?: string;
      lastSubmittedTime?: string;
      answers?: Record<
        string,
        {
          questionId?: string;
          textAnswers?: { answers?: { value?: string }[] };
        }
      >;
    }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        'Google Forms responses endpoint requires responses.readonly scope. Showing in-app captured responses.',
      );
    }
    throw new Error(data.error?.message || `Google Forms responses error (${res.status}).`);
  }

  return (data.responses ?? []).map((r, idx) => {
    const mappedAnswers: Record<string, string | string[]> = {};
    if (r.answers) {
      Object.entries(r.answers).forEach(([qKey, ans]) => {
        const vals = (ans.textAnswers?.answers ?? []).map((a) => a.value || '').filter(Boolean);
        mappedAnswers[qKey] = vals.length > 1 ? vals : vals[0] || '';
      });
    }
    return {
      id: r.responseId || `gfr-${idx}`,
      submittedBy: r.respondentEmail || 'Google Form Respondent',
      submittedAt: r.lastSubmittedTime || new Date().toISOString(),
      answers: mappedAnswers,
    };
  });
}
