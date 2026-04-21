import { Router } from 'express';
import { getSettings, saveSettings } from '../settings';
import { provisionMeetingsDatabase } from '../services/notion-sync';
import { requireAuth } from '../auth';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

function redact(data: any) {
  const copy = JSON.parse(JSON.stringify(data));
  if (copy.providers?.groq?.apiKey) copy.providers.groq.apiKey = maskKey(copy.providers.groq.apiKey);
  if (copy.providers?.anthropic?.apiKey) copy.providers.anthropic.apiKey = maskKey(copy.providers.anthropic.apiKey);
  if (copy.integrations?.notion?.apiKey) copy.integrations.notion.apiKey = maskKey(copy.integrations.notion.apiKey);
  if (copy.integrations?.googleOAuth?.clientSecret) copy.integrations.googleOAuth.clientSecret = maskKey(copy.integrations.googleOAuth.clientSecret);
  if (copy.integrations?.microsoftOAuth?.clientSecret) copy.integrations.microsoftOAuth.clientSecret = maskKey(copy.integrations.microsoftOAuth.clientSecret);
  if (copy.melvinos?.webhookSecret) copy.melvinos.webhookSecret = maskKey(copy.melvinos.webhookSecret);
  return copy;
}

function maskKey(k: string | null): string | null {
  if (!k) return k;
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '••••' + k.slice(-4);
}

function platformMeta() {
  return {
    googleOAuth: {
      managed: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    microsoftOAuth: {
      managed: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    },
  };
}

settingsRouter.get('/', async (_req, res) => {
  const s = await getSettings();
  res.json({ ...redact(s), platform: platformMeta() });
});

const ALLOWED_SECTIONS = new Set(['providers', 'integrations', 'bot', 'melvinos']);

settingsRouter.patch('/', async (req, res) => {
  const body = req.body ?? {};
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_SECTIONS.has(k)) filtered[k] = v;
  }
  const next = await saveSettings(filtered);
  res.json({ ...redact(next), platform: platformMeta() });
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
