import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { calendarAccounts } from '../../shared/schema';
import { getSettings } from '../settings';
import { createLogger } from '../logger';
import { encryptSecret, decryptSecret } from '../crypto';

const log = createLogger('google-calendar');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'openid',
  'email',
  'profile',
];

async function getOAuthClient(redirectUri: string): Promise<OAuth2Client> {
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  const platformManaged = Boolean(envId && envSecret);

  let clientId: string | null | undefined;
  let clientSecret: string | null | undefined;

  if (platformManaged) {
    clientId = envId;
    clientSecret = envSecret;
  } else {
    const s = await getSettings();
    clientId = s.integrations.googleOAuth.clientId ?? undefined;
    clientSecret = s.integrations.googleOAuth.clientSecret ?? undefined;
  }

  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function buildAuthUrl(redirectUri: string, state: string): Promise<string> {
  const client = await getOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    // 'select_account consent' forces Google to show the account chooser even if
    // the user is already signed into one — required so users can add a second
    // Gmail to Memos without being auto-reconnected as the first.
    prompt: 'select_account consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string, redirectUri: string, userId: string) {
  const client = await getOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const email = profile.email;
  if (!email) throw new Error('Google did not return an email');

  // Scope by userId — don't collide a different user's account with the same email.
  const existing = await db.select().from(calendarAccounts)
    .where(and(eq(calendarAccounts.userId, userId), eq(calendarAccounts.accountEmail, email)))
    .limit(1);

  const values = {
    userId,
    provider: 'google' as const,
    accountEmail: email,
    accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : null,
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing[0]?.refreshToken ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    status: 'connected' as const,
  };

  if (existing[0]) {
    await db.update(calendarAccounts).set(values).where(eq(calendarAccounts.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db.insert(calendarAccounts).values(values).returning();
  return row.id;
}

const clientCache = new Map<string, OAuth2Client>();

async function authForAccount(accountId: string): Promise<OAuth2Client> {
  const [acc] = await db.select().from(calendarAccounts).where(eq(calendarAccounts.id, accountId)).limit(1);
  if (!acc) throw new Error('Calendar account not found');

  let client = clientCache.get(accountId);
  if (!client) {
    client = await getOAuthClient('');
    client.on('tokens', (tokens) => {
      db.update(calendarAccounts).set({
        accessToken: tokens.access_token ? encryptSecret(tokens.access_token) : undefined,
        refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      }).where(eq(calendarAccounts.id, accountId)).catch(err => log.error('token persist failed', err));
    });
    clientCache.set(accountId, client);
  }
  client.setCredentials({
    access_token: decryptSecret(acc.accessToken) ?? undefined,
    refresh_token: decryptSecret(acc.refreshToken) ?? undefined,
    expiry_date: acc.expiresAt?.getTime(),
  });
  return client;
}

export interface CalendarEventSummary {
  externalId: string;
  title: string;
  start: Date;
  end?: Date;
  meetingUrl?: string;
  attendees: Array<{ email: string; name?: string }>;
  host?: string;
  platform?: 'google_meet' | 'zoom' | 'teams';
}

const MEETING_URL_RX = [
  { rx: /https:\/\/meet\.google\.com\/[a-z0-9-]+/i, platform: 'google_meet' as const },
  { rx: /https:\/\/[a-z0-9.-]*zoom\.us\/j\/\d+(\?pwd=[a-zA-Z0-9.]+)?/i, platform: 'zoom' as const },
  { rx: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"']+/i, platform: 'teams' as const },
  { rx: /https:\/\/teams\.live\.com\/meet\/[^\s"']+/i, platform: 'teams' as const },
];

export function extractMeetingUrl(text: string): { url: string; platform: 'google_meet' | 'zoom' | 'teams' } | null {
  for (const { rx, platform } of MEETING_URL_RX) {
    const m = text.match(rx);
    if (m) return { url: m[0], platform };
  }
  return null;
}

export async function listUpcomingEvents(accountId: string, withinHours = 14 * 24): Promise<CalendarEventSummary[]> {
  const auth = await authForAccount(accountId);
  const cal = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMax = new Date(Date.now() + withinHours * 3600 * 1000);

  const calendarList = await cal.calendarList.list({ minAccessRole: 'reader', maxResults: 250 });
  const calendarIds = (calendarList.data.items ?? [])
    .filter(c => c.id && !c.deleted && c.selected !== false)
    .map(c => c.id!);

  const all: NonNullable<calendar_v3.Schema$Events['items']> = [];
  for (const calendarId of calendarIds) {
    try {
      const resp = await cal.events.list({
        calendarId,
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });
      if (resp.data.items) all.push(...resp.data.items);
    } catch (err) {
      log.warn('skipping calendar', { calendarId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const data = { items: all };
  const rawCount = data.items?.length ?? 0;

  const events: CalendarEventSummary[] = [];
  for (const e of data.items ?? []) {
    if (!e.id || !e.start) continue;
    const startStr = e.start.dateTime ?? e.start.date;
    if (!startStr) continue;

    let meeting: ReturnType<typeof extractMeetingUrl> = null;
    if (e.hangoutLink) meeting = { url: e.hangoutLink, platform: 'google_meet' };
    if (!meeting && e.conferenceData?.entryPoints) {
      for (const ep of e.conferenceData.entryPoints) {
        if (ep.uri) {
          meeting = extractMeetingUrl(ep.uri);
          if (meeting) break;
        }
      }
    }
    if (!meeting && e.description) meeting = extractMeetingUrl(e.description);
    if (!meeting && e.location) meeting = extractMeetingUrl(e.location);
    if (!meeting) continue;

    events.push({
      externalId: e.id,
      title: e.summary ?? 'Untitled Meeting',
      start: new Date(startStr),
      end: e.end?.dateTime || e.end?.date ? new Date(e.end!.dateTime ?? e.end!.date!) : undefined,
      meetingUrl: meeting.url,
      platform: meeting.platform,
      attendees: (e.attendees ?? []).map((a: calendar_v3.Schema$EventAttendee) => ({ email: a.email ?? '', name: a.displayName ?? undefined })),
      host: e.organizer?.email ?? undefined,
    });
  }

  log.info('listed events', {
    accountId,
    calendarsScanned: calendarIds.length,
    rawCount,
    withVideoLink: events.length,
    windowHours: withinHours,
  });
  return events;
}
