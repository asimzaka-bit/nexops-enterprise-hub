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
import { WorkspaceDocToolType } from '../types/nexops';

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

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface SendGmailPayload {
  fromEmail: string;
  fromName: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}

export interface GmailRecentMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function sendEmailViaGmailApi(
  payload: SendGmailPayload,
): Promise<{ id: string; threadId?: string }> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Connect your Google account first to send emails via Gmail API.');
  }

  const lines = [
    `From: "${payload.fromName.replace(/"/g, '')}" <${payload.fromEmail}>`,
    `To: ${payload.to.trim()}`,
    ...(payload.cc && payload.cc.trim() ? [`Cc: ${payload.cc.trim()}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(payload.subject.trim())))}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    payload.body,
  ];

  const raw = encodeBase64Url(lines.join('\r\n'));

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

export async function fetchRecentGmailMessages(
  maxResults = 6,
  query = 'in:sent OR in:inbox',
): Promise<GmailRecentMessage[]> {
  const token = getGoogleWorkspaceAccessToken();
  if (!token) {
    throw new Error('Sign in with Google Workspace to read live Gmail messages.');
  }

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${encodeURIComponent(
    String(maxResults),
  )}&q=${encodeURIComponent(query)}`;

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
    items.map(async (item) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          item.id,
        )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!msgRes.ok) return null;
      const msgData = (await msgRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = msgData.payload?.headers ?? [];
      const pick = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
      return {
        id: msgData.id,
        threadId: msgData.threadId,
        from: pick('From'),
        to: pick('To'),
        subject: pick('Subject') || '(No Subject)',
        date: pick('Date'),
        snippet: msgData.snippet ?? '',
      } satisfies GmailRecentMessage;
    }),
  );

  return details.filter((m): m is GmailRecentMessage => m !== null);
}

// ---------------------------------------------------------------------------
// Google Docs, Sheets & Forms API + Embed URL Helpers
// ---------------------------------------------------------------------------

export function extractGoogleFileId(toolType: WorkspaceDocToolType, rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (toolType === 'docs') {
    const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : null;
  }
  if (toolType === 'sheets') {
    const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : null;
  }
  const mEdit = url.match(/docs\.google\.com\/forms\/d\/(?!e\/)([a-zA-Z0-9_-]+)/i);
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
      : `https://docs.google.com/document/d/${fileId}/edit?embedded=true`;
  }
  if (toolType === 'sheets' && fileId) {
    return mode === 'preview'
      ? `https://docs.google.com/spreadsheets/d/${fileId}/preview`
      : `https://docs.google.com/spreadsheets/d/${fileId}/edit?rm=minimal`;
  }
  if (toolType === 'forms') {
    if (url.includes('/forms/d/e/')) {
      return url.includes('embedded=true')
        ? url
        : `${url.split('?')[0].replace(/\/$/, '')}?embedded=true`;
    }
    if (fileId) {
      return mode === 'preview'
        ? `https://docs.google.com/forms/d/${fileId}/viewform?embedded=true`
        : `https://docs.google.com/forms/d/${fileId}/edit?embedded=true`;
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
