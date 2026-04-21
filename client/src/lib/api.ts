export type Meeting = {
  id: string;
  title: string;
  platform: 'google_meet' | 'zoom' | 'teams';
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
  notionPageUrl: string | null;
  durationSeconds: number | null;
  recordingPath: string | null;
  errorMessage: string | null;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (!res.ok) {
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
  deleteMeeting: (id: string) => request<{ ok: boolean }>(`/api/meetings/${id}`, { method: 'DELETE' }),

  listCalendars: () => request<CalendarAccount[]>('/api/calendar/accounts'),
  updateCalendar: (id: string, body: Partial<CalendarAccount>) => request<{ ok: boolean }>(`/api/calendar/accounts/${id}`, { method: 'POST', body: JSON.stringify(body) }),
  deleteCalendar: (id: string) => request<{ ok: boolean }>(`/api/calendar/accounts/${id}`, { method: 'DELETE' }),
  syncCalendars: () => request<{ synced: number }>('/api/calendar/sync', { method: 'POST' }),

  getSettings: () => request<any>('/api/settings'),
  saveSettings: (body: any) => request<any>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  provisionNotionDb: (parentPageId: string, title?: string) =>
    request<{ databaseId: string }>('/api/settings/notion/provision-database', { method: 'POST', body: JSON.stringify({ parentPageId, title }) }),
};
