import { eq } from 'drizzle-orm';
import { db } from '../db';
import { calendarAccounts } from '../../shared/schema';
import { getSettings } from '../settings';
import { createLogger } from '../logger';
import { encryptSecret, decryptSecret } from '../crypto';
import { extractMeetingUrl, type CalendarEventSummary } from './google-calendar';

const log = createLogger('microsoft-calendar');

const SCOPES = ['openid', 'email', 'profile', 'offline_access', 'Calendars.Read', 'User.Read'];

function authority(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}`;
}

export async function buildMicrosoftAuthUrl(redirectUri: string, state: string): Promise<string> {
  const s = await getSettings();
  const clientId = s.integrations.microsoftOAuth.clientId;
  const tenant = s.integrations.microsoftOAuth.tenantId || 'common';
  if (!clientId) throw new Error('Microsoft OAuth not configured');
  const url = new URL(`${authority(tenant)}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeMicrosoftCode(code: string, redirectUri: string, userId: string): Promise<string> {
  const s = await getSettings();
  const clientId = s.integrations.microsoftOAuth.clientId;
  const clientSecret = s.integrations.microsoftOAuth.clientSecret;
  const tenant = s.integrations.microsoftOAuth.tenantId || 'common';
  if (!clientId || !clientSecret) throw new Error('Microsoft OAuth not configured');

  const tokenRes = await fetch(`${authority(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: SCOPES.join(' '),
    }),
  });
  if (!tokenRes.ok) throw new Error(`Microsoft token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };

  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) throw new Error(`Microsoft /me failed: ${await meRes.text()}`);
  const me = await meRes.json() as { mail?: string; userPrincipalName?: string };
  const email = me.mail ?? me.userPrincipalName;
  if (!email) throw new Error('Microsoft did not return an email');

  const existing = await db.select().from(calendarAccounts)
    .where(eq(calendarAccounts.accountEmail, email)).limit(1);

  const values = {
    userId,
    provider: 'microsoft' as const,
    accountEmail: email,
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing[0]?.refreshToken ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    status: 'connected' as const,
  };

  if (existing[0]) {
    await db.update(calendarAccounts).set(values).where(eq(calendarAccounts.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db.insert(calendarAccounts).values(values).returning();
  return row.id;
}

async function refreshMicrosoftToken(accountId: string): Promise<string> {
  const [acc] = await db.select().from(calendarAccounts).where(eq(calendarAccounts.id, accountId)).limit(1);
  const refreshToken = decryptSecret(acc?.refreshToken);
  if (!refreshToken) throw new Error('No refresh token for MS account');
  const s = await getSettings();
  const clientId = s.integrations.microsoftOAuth.clientId!;
  const clientSecret = s.integrations.microsoftOAuth.clientSecret!;
  const tenant = s.integrations.microsoftOAuth.tenantId || 'common';

  const res = await fetch(`${authority(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`MS refresh failed: ${await res.text()}`);
  const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };

  await db.update(calendarAccounts).set({
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : acc!.refreshToken,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
  }).where(eq(calendarAccounts.id, accountId));

  return tokens.access_token;
}

async function accessTokenFor(accountId: string): Promise<string> {
  const [acc] = await db.select().from(calendarAccounts).where(eq(calendarAccounts.id, accountId)).limit(1);
  if (!acc) throw new Error('account not found');
  if (acc.expiresAt && acc.expiresAt.getTime() - Date.now() < 60_000) {
    return refreshMicrosoftToken(accountId);
  }
  const token = decryptSecret(acc.accessToken);
  if (!token) throw new Error('no access token');
  return token;
}

export async function listUpcomingMicrosoftEvents(accountId: string, withinHours = 24): Promise<CalendarEventSummary[]> {
  const token = await accessTokenFor(accountId);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + withinHours * 3600_000).toISOString();

  const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${timeMin}&endDateTime=${timeMax}&$top=50&$orderby=start/dateTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
  if (!res.ok) throw new Error(`MS events failed: ${await res.text()}`);
  const data = await res.json() as any;

  const events: CalendarEventSummary[] = [];
  for (const e of data.value ?? []) {
    const haystack = [e.body?.content, e.location?.displayName, e.onlineMeeting?.joinUrl].filter(Boolean).join(' ');
    const match = extractMeetingUrl(haystack);
    if (!match) continue;

    events.push({
      externalId: e.id,
      title: e.subject ?? 'Untitled Meeting',
      start: new Date(e.start.dateTime + 'Z'),
      end: new Date(e.end.dateTime + 'Z'),
      meetingUrl: match.url,
      platform: match.platform,
      attendees: (e.attendees ?? []).map((a: any) => ({
        email: a.emailAddress?.address ?? '',
        name: a.emailAddress?.name ?? undefined,
      })),
      host: e.organizer?.emailAddress?.address,
    });
  }

  log.info('listed MS events', { accountId, count: events.length });
  return events;
}
