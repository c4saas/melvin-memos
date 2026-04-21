import { eq } from 'drizzle-orm';
import { db } from './db';
import { platformSettings, platformSettingsSchema, type PlatformSettingsData } from '../shared/schema';
import { logger } from './logger';
import { encryptSecret, decryptSecret } from './crypto';

const SECRET_PATHS: Array<(s: PlatformSettingsData) => void> = [];
function applyOnSecretPaths(data: PlatformSettingsData, fn: (val: string | null) => string | null): void {
  if (data.providers?.groq?.apiKey) data.providers.groq.apiKey = fn(data.providers.groq.apiKey);
  if (data.providers?.anthropic?.apiKey) data.providers.anthropic.apiKey = fn(data.providers.anthropic.apiKey);
  if (data.integrations?.notion?.apiKey) data.integrations.notion.apiKey = fn(data.integrations.notion.apiKey);
  if (data.integrations?.googleOAuth?.clientSecret) data.integrations.googleOAuth.clientSecret = fn(data.integrations.googleOAuth.clientSecret);
  if (data.integrations?.microsoftOAuth?.clientSecret) data.integrations.microsoftOAuth.clientSecret = fn(data.integrations.microsoftOAuth.clientSecret);
  if (data.melvinos?.webhookSecret) data.melvinos.webhookSecret = fn(data.melvinos.webhookSecret);
}

let cached: { data: PlatformSettingsData; at: number } | null = null;
const CACHE_MS = 5_000;

export async function getSettings(): Promise<PlatformSettingsData> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const row = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  const raw = row[0]?.data ?? {};
  const data = platformSettingsSchema.parse(raw);
  applyOnSecretPaths(data, decryptSecret);
  cached = { data, at: Date.now() };
  return data;
}

export async function saveSettings(partial: Partial<PlatformSettingsData>): Promise<PlatformSettingsData> {
  const current = await getSettings();
  const mergedClear = platformSettingsSchema.parse({ ...current, ...partial });
  const toStore = platformSettingsSchema.parse(JSON.parse(JSON.stringify(mergedClear)));
  applyOnSecretPaths(toStore, (v) => (v ? encryptSecret(v) : v));

  await db
    .insert(platformSettings)
    .values({ id: 1, data: toStore })
    .onConflictDoUpdate({ target: platformSettings.id, set: { data: toStore, updatedAt: new Date() } });
  cached = null;
  logger.info('platform settings updated');
  return mergedClear;
}
