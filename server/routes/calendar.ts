import { Router } from 'express';
import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { calendarAccounts } from '../../shared/schema';
import { buildAuthUrl, exchangeCode } from '../integrations/google-calendar';
import { buildMicrosoftAuthUrl, exchangeMicrosoftCode } from '../integrations/microsoft-calendar';
import { syncAllCalendars } from '../services/calendar-poller';
import { requireAuth, getUserId } from '../auth';

export const calendarRouter = Router();

const pendingStates = new Map<string, { userId: string; provider: 'google' | 'microsoft'; expires: number }>();

function makeState(userId: string, provider: 'google' | 'microsoft'): string {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId, provider, expires: Date.now() + 10 * 60_000 });
  return state;
}

function consumeState(state: string, provider: 'google' | 'microsoft'): string | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  if (entry.expires < Date.now() || entry.provider !== provider) {
    pendingStates.delete(state);
    return null;
  }
  pendingStates.delete(state);
  return entry.userId;
}

calendarRouter.get('/accounts', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.select().from(calendarAccounts)
    .where(eq(calendarAccounts.userId, userId))
    .orderBy(desc(calendarAccounts.createdAt));
  res.json(rows.map(r => ({ ...r, accessToken: undefined, refreshToken: undefined })));
});

calendarRouter.delete('/accounts/:id', requireAuth, async (req, res) => {
  await db.delete(calendarAccounts).where(eq(calendarAccounts.id, req.params.id));
  res.json({ ok: true });
});

calendarRouter.post('/accounts/:id', requireAuth, async (req, res) => {
  const { autoJoin, joinNotifyMinutes } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof autoJoin === 'boolean') updates.autoJoin = autoJoin;
  if (typeof joinNotifyMinutes === 'number') updates.joinNotifyMinutes = joinNotifyMinutes;
  await db.update(calendarAccounts).set(updates).where(eq(calendarAccounts.id, req.params.id));
  res.json({ ok: true });
});

calendarRouter.get('/google/start', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const redirectUri = `${process.env.APP_BASE_URL ?? 'http://localhost:3100'}/api/calendar/google/callback`;
    const state = makeState(userId, 'google');
    const url = await buildAuthUrl(redirectUri, state);
    res.redirect(url);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

calendarRouter.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) return res.status(400).send('missing code/state');
    const userId = consumeState(state, 'google');
    if (!userId) return res.status(400).send('invalid or expired state');
    const redirectUri = `${process.env.APP_BASE_URL ?? 'http://localhost:3100'}/api/calendar/google/callback`;
    await exchangeCode(code, redirectUri, userId);
    res.redirect('/settings?calendar=connected');
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

calendarRouter.get('/microsoft/start', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const redirectUri = `${process.env.APP_BASE_URL ?? 'http://localhost:3100'}/api/calendar/microsoft/callback`;
    const state = makeState(userId, 'microsoft');
    const url = await buildMicrosoftAuthUrl(redirectUri, state);
    res.redirect(url);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

calendarRouter.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) return res.status(400).send('missing code/state');
    const userId = consumeState(state, 'microsoft');
    if (!userId) return res.status(400).send('invalid or expired state');
    const redirectUri = `${process.env.APP_BASE_URL ?? 'http://localhost:3100'}/api/calendar/microsoft/callback`;
    await exchangeMicrosoftCode(code, redirectUri, userId);
    res.redirect('/settings?calendar=connected');
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : String(err));
  }
});

calendarRouter.post('/sync', requireAuth, async (_req, res) => {
  const r = await syncAllCalendars();
  res.json(r);
});
