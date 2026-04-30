import { eq } from 'drizzle-orm';
import { db } from './db';
import { platformSettings, platformSettingsSchema, type PlatformSettingsData } from '../shared/schema';
import { logger } from './logger';
import { encryptSecret, decryptSecret } from './crypto';

const SECRET_PATHS: Array<(s: PlatformSettingsData) => void> = [];
function applyOnSecretPaths(data: PlatformSettingsData, fn: (val: string | null) => string | null): void {
  if (data.providers?.groq?.apiKey) data.providers.groq.apiKey = fn(data.providers.groq.apiKey);
  if (data.providers?.anthropic?.apiKey) data.providers.anthropic.apiKey = fn(data.providers.anthropic.apiKey);
  if (data.providers?.ollama?.apiKey) data.providers.ollama.apiKey = fn(data.providers.ollama.apiKey);
  if (data.integrations?.notion?.apiKey) data.integrations.notion.apiKey = fn(data.integrations.notion.apiKey);
  if (data.integrations?.googleOAuth?.clientSecret) data.integrations.googleOAuth.clientSecret = fn(data.integrations.googleOAuth.clientSecret);
  if (data.integrations?.microsoftOAuth?.clientSecret) data.integrations.microsoftOAuth.clientSecret = fn(data.integrations.microsoftOAuth.clientSecret);
  if ((data as any).integrations?.linear?.apiKey) (data as any).integrations.linear.apiKey = fn((data as any).integrations.linear.apiKey);
  if (data.melvinos?.webhookSecret) data.melvinos.webhookSecret = fn(data.melvinos.webhookSecret);
  if ((data as any).email?.smtpPassword) (data as any).email.smtpPassword = fn((data as any).email.smtpPassword);
  const outbound = (data as any).webhooks?.outbound;
  if (Array.isArray(outbound)) {
    for (const w of outbound) {
      if (w?.secret) w.secret = fn(w.secret);
    }
  }
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

/**
 * Masked secrets from GET /api/settings get re-submitted when the user saves
 * without retyping. Treat any value that looks like a mask (contains ••••) as
 * "don't change" and fall back to the existing plaintext.
 */
function isMaskedSecret(v: unknown): boolean {
  return typeof v === 'string' && v.includes('••••');
}

function restoreMaskedSecrets(
  incoming: PlatformSettingsData,
  current: PlatformSettingsData,
): void {
  const pairs: Array<[any, any]> = [
    [incoming.providers?.groq, current.providers?.groq],
    [incoming.providers?.anthropic, current.providers?.anthropic],
    [incoming.providers?.ollama, current.providers?.ollama],
    [incoming.integrations?.notion, current.integrations?.notion],
    [incoming.integrations?.googleOAuth, current.integrations?.googleOAuth],
    [incoming.integrations?.microsoftOAuth, current.integrations?.microsoftOAuth],
    [(incoming as any).integrations?.linear, (current as any).integrations?.linear],
    [incoming.melvinos, current.melvinos],
    [(incoming as any).email, (current as any).email],
  ];
  const fields = ['apiKey', 'clientSecret', 'webhookSecret', 'smtpPassword'];
  for (const [inc, cur] of pairs) {
    if (!inc || !cur) continue;
    for (const f of fields) {
      if (f in inc && isMaskedSecret(inc[f])) {
        inc[f] = cur[f] ?? null;
      }
    }
  }

  // Outbound webhooks — array of { id, secret, ... } — restore masked secrets
  // by looking up the matching id in the current saved list.
  const incOut = (incoming as any).webhooks?.outbound;
  const curOut = (current as any).webhooks?.outbound;
  if (Array.isArray(incOut) && Array.isArray(curOut)) {
    const byId = new Map(curOut.map((w: any) => [w.id, w]));
    for (const hook of incOut) {
      if (!hook || !hook.id) continue;
      if (isMaskedSecret(hook.secret)) {
        const prev = byId.get(hook.id) as any;
        hook.secret = prev?.secret ?? null;
      }
    }
  }
}

/**
 * Recursively merge `src` into `dst`. Arrays are replaced wholesale (needed
 * for things like `webhooks.outbound`). Scalars replace. Objects deep-merge.
 */
function deepMerge<T>(dst: T, src: any): T {
  if (src == null || typeof src !== 'object' || Array.isArray(src)) return src ?? dst;
  const out: any = { ...(dst as any) };
  for (const k of Object.keys(src)) {
    const sv = src[k];
    const dv = out[k];
    if (sv != null && typeof sv === 'object' && !Array.isArray(sv) && typeof dv === 'object' && !Array.isArray(dv)) {
      out[k] = deepMerge(dv, sv);
    } else {
      out[k] = sv;
    }
  }
  return out as T;
}

export async function saveSettings(partial: Partial<PlatformSettingsData>): Promise<PlatformSettingsData> {
  const current = await getSettings();
  // Deep-merge so PATCHing e.g. { integrations: { linear: {...} } } doesn't wipe
  // sibling integrations like notion/googleOAuth.
  const merged = deepMerge(current, partial);
  const mergedClear = platformSettingsSchema.parse(merged);

  // Restore any secret that the client accidentally sent as a mask (••••).
  restoreMaskedSecrets(mergedClear, current);

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
