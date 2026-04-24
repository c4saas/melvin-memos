import { Router } from 'express';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { getSettings, saveSettings } from '../settings';
import { provisionMeetingsDatabase } from '../services/notion-sync';
import { buildDigest, sendDigest } from '../services/digest';
import { requireAuth, getUserId } from '../auth';
import { createLogger } from '../logger';

const log = createLogger('settings-routes');
const BOT_SESSION_DIR = process.env.BOT_SESSION_DIR ?? '/data/bot-session';
const GOOGLE_SESSION_PATH = join(BOT_SESSION_DIR, 'google.json');

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

function redact(data: any) {
  const copy = JSON.parse(JSON.stringify(data));
  if (copy.providers?.groq?.apiKey) copy.providers.groq.apiKey = maskKey(copy.providers.groq.apiKey);
  if (copy.providers?.anthropic?.apiKey) copy.providers.anthropic.apiKey = maskKey(copy.providers.anthropic.apiKey);
  if (copy.providers?.ollama?.apiKey) copy.providers.ollama.apiKey = maskKey(copy.providers.ollama.apiKey);
  if (copy.integrations?.notion?.apiKey) copy.integrations.notion.apiKey = maskKey(copy.integrations.notion.apiKey);
  if (copy.integrations?.googleOAuth?.clientSecret) copy.integrations.googleOAuth.clientSecret = maskKey(copy.integrations.googleOAuth.clientSecret);
  if (copy.integrations?.microsoftOAuth?.clientSecret) copy.integrations.microsoftOAuth.clientSecret = maskKey(copy.integrations.microsoftOAuth.clientSecret);
  if (copy.integrations?.linear?.apiKey) copy.integrations.linear.apiKey = maskKey(copy.integrations.linear.apiKey);
  if (copy.melvinos?.webhookSecret) copy.melvinos.webhookSecret = maskKey(copy.melvinos.webhookSecret);
  if (copy.email?.smtpPassword) copy.email.smtpPassword = maskKey(copy.email.smtpPassword);
  if (Array.isArray(copy.webhooks?.outbound)) {
    for (const w of copy.webhooks.outbound) {
      if (w?.secret) w.secret = maskKey(w.secret);
    }
  }
  return copy;
}

function maskKey(k: string | null): string | null {
  if (!k) return k;
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '••••' + k.slice(-4);
}

function platformMeta() {
  let googleBotSession: { present: boolean; uploadedAt?: string } = { present: false };
  try {
    if (existsSync(GOOGLE_SESSION_PATH)) {
      googleBotSession = { present: true, uploadedAt: statSync(GOOGLE_SESSION_PATH).mtime.toISOString() };
    }
  } catch {}

  return {
    googleOAuth: {
      managed: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    microsoftOAuth: {
      managed: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    },
    googleBotSession,
  };
}

settingsRouter.get('/', async (_req, res) => {
  const s = await getSettings();
  res.json({ ...redact(s), platform: platformMeta() });
});

const ALLOWED_SECTIONS = new Set(['providers', 'integrations', 'bot', 'melvinos', 'email', 'digest', 'webhooks']);

settingsRouter.patch('/', async (req, res) => {
  const body = req.body ?? {};
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_SECTIONS.has(k)) filtered[k] = v;
  }
  const next = await saveSettings(filtered);
  res.json({ ...redact(next), platform: platformMeta() });
});

settingsRouter.post('/bot-session/google', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.cookies)) {
    return res.status(400).json({ error: 'expected Playwright storageState JSON ({ cookies: [...], origins: [...] })' });
  }
  try {
    if (!existsSync(BOT_SESSION_DIR)) mkdirSync(BOT_SESSION_DIR, { recursive: true });
    writeFileSync(GOOGLE_SESSION_PATH, JSON.stringify(body));
    log.info('google bot session uploaded', { cookies: body.cookies.length });
    res.json({ ok: true, cookies: body.cookies.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

settingsRouter.delete('/bot-session/google', async (_req, res) => {
  try {
    if (existsSync(GOOGLE_SESSION_PATH)) {
      const { unlinkSync } = await import('fs');
      unlinkSync(GOOGLE_SESSION_PATH);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Preview the digest HTML without sending — powers the in-app preview panel.
settingsRouter.get('/digest/preview', async (req, res) => {
  const userId = getUserId(req);
  const freq = (req.query.frequency === 'weekly' ? 'weekly' : 'daily') as 'weekly' | 'daily';
  const baseUrl = process.env.APP_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
  const preview = await buildDigest(userId, { frequency: freq, baseUrl });
  if (!preview) return res.json({ ok: true, empty: true });
  res.json({ ok: true, ...preview });
});

// Send a digest right now (for testing SMTP config).
settingsRouter.post('/digest/send-now', async (req, res) => {
  try {
    const userId = getUserId(req);
    const freq = (req.body?.frequency === 'weekly' ? 'weekly' : 'daily') as 'weekly' | 'daily';
    const result = await sendDigest(userId, { frequency: freq, force: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ sent: false, reason: err instanceof Error ? err.message : String(err) });
  }
});

settingsRouter.post('/notion/provision-database', async (req, res) => {
  try {
    const { parentPageId, title } = req.body ?? {};
    if (!parentPageId) return res.status(400).json({ error: 'parentPageId required' });
    const dbId = await provisionMeetingsDatabase(parentPageId, title);
    const current = await getSettings();
    await saveSettings({
      integrations: {
        ...current.integrations,
        notion: { ...current.integrations.notion, meetingsDatabaseId: dbId },
      },
    });
    res.json({ databaseId: dbId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
