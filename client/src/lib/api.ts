export type Meeting = {
  id: string;
  title: string;
  platform: 'google_meet' | 'zoom' | 'teams' | 'voice';
  meetingUrl: string;
  startAt: string;
  endAt: string | null;
  host: string | null;
  attendees: Array<{ email: string; name?: string }>;
  autoJoin: boolean;
  status: string;
  summary: string | null;
  transcript: string | null;
  actionItems: Array<{ owner?: string; task: string; deadline?: string }>;
  tags?: string[];
  notionPageUrl: string | null;
  durationSeconds: number | null;
  recordingPath: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type Highlight = {
  id: string;
  meetingId: string;
  userId: string;
  text: string;
  note: string | null;
  startSec: number | null;
  endSec: number | null;
  color: string;
  createdAt: string;
};

export type CalendarAccount = {
  id: string;
  provider: string;
  accountEmail: string;
  autoJoin: boolean;
  joinNotifyMinutes: number;
  status: string;
  createdAt: string;
};

/**
 * When a 401 lands mid-session (rate-limiter, admin revoked, cookie expired),
 * tell the app shell to re-check /me so the login page renders instead of
 * cascading errors into every useQuery.
 */
let sessionExpiredFired = false;
function fireSessionExpired() {
  if (sessionExpiredFired) return;
  sessionExpiredFired = true;
  // Reset shortly so future genuine 401s (after re-login) still get handled.
  setTimeout(() => { sessionExpiredFired = false; }, 3000);
  try {
    window.dispatchEvent(new CustomEvent('memos:session-expired'));
  } catch {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    // /api/auth/* endpoints use 401 in normal flows (e.g. bad password on login);
    // don't treat those as a session expiry.
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      fireSessionExpired();
    }
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type MeUser = { id: string; email: string; name: string | null; timezone: string };

export const api = {
  me: () => request<{ user: MeUser | null; mode: string; loginRequired: boolean; needsSetup?: boolean }>('/api/auth/me'),
  setupStatus: () => request<{ needsSetup: boolean; defaultEmail?: string; defaultName?: string }>('/api/auth/setup-status'),
  setup: (email: string, password: string, name?: string) =>
    request<{ user: MeUser }>('/api/auth/setup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) => request<{ user: MeUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listMeetings: () => request<Meeting[]>('/api/meetings'),
  getMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  createMeeting: (data: Partial<Meeting>) => request<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(data) }),
  joinNow: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}/join-now`, { method: 'POST' }),
  stopMeeting: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}/stop`, { method: 'POST' }),
  reprocess: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}/reprocess`, { method: 'POST' }),
  updateTags: (id: string, tags: string[]) =>
    request<{ ok: boolean; tags: string[] }>(`/api/meetings/${id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags }) }),

  listHighlights: (meetingId: string) =>
    request<Highlight[]>(`/api/highlights/meeting/${meetingId}`),
  createHighlight: (body: { meetingId: string; text: string; note?: string; color?: string }) =>
    request<Highlight>('/api/highlights', { method: 'POST', body: JSON.stringify(body) }),
  deleteHighlight: (id: string) =>
    request<{ ok: boolean }>(`/api/highlights/${id}`, { method: 'DELETE' }),
  updateHighlight: (id: string, body: { note?: string; color?: string }) =>
    request<Highlight>(`/api/highlights/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMeeting: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}`, { method: 'DELETE' }),

  listCalendars: () => request<CalendarAccount[]>('/api/calendar/accounts'),
  updateCalendar: (id: string, body: Partial<CalendarAccount>) => request<{ ok: boolean }>(`/api/calendar/accounts/${id}`, { method: 'POST', body: JSON.stringify(body) }),
  deleteCalendar: (id: string) => request<{ ok: boolean }>(`/api/calendar/accounts/${id}`, { method: 'DELETE' }),
  syncCalendars: () => request<{ synced: number; eventsWithLinks: number; accounts: number }>('/api/calendar/sync', { method: 'POST' }),

  getSettings: () => request<any>('/api/settings'),
  saveSettings: (body: any) => request<any>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  provisionNotionDb: (parentPageId: string, title?: string) =>
    request<{ databaseId: string }>('/api/settings/notion/provision-database', { method: 'POST', body: JSON.stringify({ parentPageId, title }) }),
  uploadGoogleBotSession: (storageState: object) =>
    request<{ ok: boolean; cookies: number }>('/api/settings/bot-session/google', { method: 'POST', body: JSON.stringify(storageState) }),
  deleteGoogleBotSession: () =>
    request<{ ok: boolean }>('/api/settings/bot-session/google', { method: 'DELETE' }),

  getExtensionInfo: () =>
    request<{ available: boolean; downloadUrl: string; version: string | null }>('/api/extension'),

  semanticSearch: (query: string, limit = 12) =>
    request<{ hits: Array<{ meetingId: string; meetingTitle: string; meetingDate: string; source: 'summary' | 'transcript'; snippet: string; score: number }> }>(
      '/api/search/semantic',
      { method: 'POST', body: JSON.stringify({ query, limit }) },
    ),
  reindexMeetings: () =>
    request<{ ok: boolean; indexed: number; skipped: number; errors: string[] }>('/api/search/reindex', { method: 'POST' }),

  linearTeams: () => request<{ teams: Array<{ id: string; name: string; key: string }> }>('/api/linear/teams'),
  linearCreateIssue: (body: { meetingId?: string; actionIndex?: number; title?: string; description?: string; priority?: number }) =>
    request<{ issueId: string; identifier: string; url: string }>('/api/linear/issue', { method: 'POST', body: JSON.stringify(body) }),

  exportCount: () => request<{ count: number }>('/api/export/count'),

  // API keys
  listApiKeys: () => request<Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }>>('/api/api-keys'),
  createApiKey: (name: string) => request<{ id: string; name: string; prefix: string; createdAt: string; token: string }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteApiKey: (id: string) => request<{ ok: boolean }>(`/api/api-keys/${id}`, { method: 'DELETE' }),

  previewDigest: (frequency: 'daily' | 'weekly') =>
    request<{ ok: boolean; empty?: boolean; subject?: string; html?: string; text?: string; meetingsCount?: number; actionCount?: number }>(`/api/settings/digest/preview?frequency=${frequency}`),

  sendDigestNow: (frequency: 'daily' | 'weekly') =>
    request<{ sent: boolean; reason?: string }>('/api/settings/digest/send-now', { method: 'POST', body: JSON.stringify({ frequency }) }),

  uploadVoiceRecording: async (blob: Blob, title: string, durationSec: number): Promise<Meeting> => {
    const params = new URLSearchParams({ title, durationSec: String(Math.round(durationSec)) });
    const res = await fetch(`/api/meetings/voice-recording?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  },
};
