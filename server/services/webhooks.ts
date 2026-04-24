/**
 * Outbound webhook delivery — fires on meeting events so sibling products
 * (MelvinOS, Zapier, etc.) can react to Memos activity.
 *
 * Payload shape:
 *   {
 *     event: 'meeting.completed' | 'meeting.failed',
 *     timestamp: ISO,
 *     meeting: { id, title, platform, startAt, duration, summary?, actionItems?, tags?, url? }
 *   }
 *
 * Auth: HMAC-SHA256(body) with per-webhook secret, sent as
 *   X-Memos-Signature: sha256=<hex>
 *   X-Memos-Event: meeting.completed
 *   X-Memos-Delivery: <uuid>
 */

import crypto from 'crypto';
import { promises as dns } from 'dns';
import net from 'net';
import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('webhooks');

/**
 * SSRF guard: reject URLs pointing at private / loopback / link-local addresses.
 * Allows `WEBHOOK_ALLOW_PRIVATE=1` for self-hosted / dev setups where the
 * target is intentionally on the same internal network.
 */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return false;
  return (
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] === 127 ||                                     // loopback
    (p[0] === 169 && p[1] === 254) ||                   // link-local
    p[0] === 0
  );
}
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fc') || lower.startsWith('fd') || // ULA
    lower.startsWith('fe80:') ||                         // link-local
    lower.startsWith('::ffff:') && isPrivateIPv4(lower.replace('::ffff:', ''))
  );
}

async function isSafeWebhookTarget(rawUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, reason: 'invalid url' }; }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, reason: 'protocol not allowed (http/https only)' };

  // Allow escape hatch for self-hosted MelvinOS-on-same-host deployments.
  if (process.env.WEBHOOK_ALLOW_PRIVATE === '1') return { ok: true };

  try {
    const addrs = await dns.lookup(url.hostname, { all: true });
    for (const a of addrs) {
      if (a.family === 4 && isPrivateIPv4(a.address)) {
        return { ok: false, reason: `${a.address} is a private IPv4 address` };
      }
      if (a.family === 6 && isPrivateIPv6(a.address)) {
        return { ok: false, reason: `${a.address} is a private IPv6 address` };
      }
    }
    // If hostname is literally an IP, double-check
    if (net.isIP(url.hostname)) {
      if (net.isIPv4(url.hostname) && isPrivateIPv4(url.hostname)) return { ok: false, reason: 'private IPv4 literal' };
      if (net.isIPv6(url.hostname) && isPrivateIPv6(url.hostname)) return { ok: false, reason: 'private IPv6 literal' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `dns lookup failed: ${err instanceof Error ? err.message : err}` };
  }
}

export type WebhookEvent = 'meeting.completed' | 'meeting.failed';

export interface MeetingEventPayload {
  id: string;
  title: string;
  platform: string;
  startAt: string;
  durationSeconds: number | null;
  summary: string | null;
  actionItems: unknown;
  tags: string[];
  url: string;
}

export async function fireMeetingEvent(event: WebhookEvent, meeting: MeetingEventPayload): Promise<void> {
  try {
    const settings = await getSettings();
    const hooks = (settings as any).webhooks?.outbound as Array<{
      id: string;
      name: string;
      url: string;
      secret: string | null;
      events: WebhookEvent[];
      enabled: boolean;
    }> | undefined;
    if (!hooks?.length) return;

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      meeting,
    });

    for (const hook of hooks) {
      if (!hook.enabled) continue;
      if (!hook.events?.includes(event)) continue;
      if (!hook.url) continue;

      // SSRF guard: don't let a misconfigured webhook hit internal infra.
      const safety = await isSafeWebhookTarget(hook.url);
      if (!safety.ok) {
        log.warn('webhook rejected (ssrf guard)', { hookId: hook.id, name: hook.name, reason: safety.reason });
        continue;
      }

      const deliveryId = crypto.randomUUID();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Memos-Webhook/1.0',
        'X-Memos-Event': event,
        'X-Memos-Delivery': deliveryId,
      };
      if (hook.secret) {
        const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
        headers['X-Memos-Signature'] = `sha256=${sig}`;
      }

      // Fire and log — don't block the pipeline on a slow/broken webhook.
      fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      }).then(async (r) => {
        if (r.ok) {
          log.info('webhook delivered', { hookId: hook.id, name: hook.name, event, deliveryId, status: r.status });
        } else {
          const txt = await r.text().catch(() => '');
          log.warn('webhook non-ok', { hookId: hook.id, name: hook.name, event, status: r.status, body: txt.slice(0, 200) });
        }
      }).catch((err) => {
        log.warn('webhook delivery failed', { hookId: hook.id, name: hook.name, event, err: err instanceof Error ? err.message : String(err) });
      });
    }
  } catch (err) {
    log.error('fireMeetingEvent error', err);
  }
}
