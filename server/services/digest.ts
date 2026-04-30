import { createTransport, type Transporter } from 'nodemailer';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db';
import { users, meetings } from '../../shared/schema';
import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('digest');

/**
 * Email digest — assembles and sends a daily/weekly recap to the user.
 * Sender is SMTP-configured in Settings. Recipient is the user's email on file.
 */

let cachedTransport: Transporter | null = null;
let cachedTransportKey: string | null = null;

async function getTransport(): Promise<Transporter | null> {
  const s = await getSettings();
  const e = (s as any).email ?? {};
  if (!e.smtpHost || !e.smtpUser || !e.smtpPassword) return null;

  const key = `${e.smtpHost}:${e.smtpPort}:${e.smtpUser}:${e.smtpSecure ? '1' : '0'}`;
  if (cachedTransport && cachedTransportKey === key) return cachedTransport;

  cachedTransport = createTransport({
    host: e.smtpHost,
    port: e.smtpPort ?? 587,
    secure: Boolean(e.smtpSecure),
    auth: { user: e.smtpUser, pass: e.smtpPassword },
  });
  cachedTransportKey = key;
  return cachedTransport;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function fromAddress(s: any): string {
  const fromConfigured = s?.email?.fromAddress?.trim();
  if (fromConfigured) return fromConfigured;
  const user = s?.email?.smtpUser?.trim();
  return user ? `Memos <${user}>` : 'Memos <noreply@localhost>';
}

function meetingLink(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/meetings/${id}`;
}

export interface DigestPreview {
  subject: string;
  html: string;
  text: string;
  meetingsCount: number;
  actionCount: number;
}

export async function buildDigest(
  userId: string,
  opts: { frequency: 'daily' | 'weekly'; baseUrl: string },
): Promise<DigestPreview | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const now = new Date();
  const lookback = opts.frequency === 'daily' ? 24 : 24 * 7;
  const since = new Date(now.getTime() - lookback * 3600 * 1000);

  const rows = await db.select().from(meetings)
    .where(and(eq(meetings.userId, userId), gte(meetings.startAt, since)))
    .orderBy(desc(meetings.startAt))
    .limit(30);

  const completed = rows.filter(r => r.status === 'completed');
  const actionItems: Array<{ meeting: typeof rows[number]; owner?: string; task: string; deadline?: string }> = [];
  for (const r of rows) {
    for (const a of r.actionItems ?? []) {
      actionItems.push({ meeting: r, ...a });
    }
  }

  if (completed.length === 0 && actionItems.length === 0) return null;

  const windowLabel = opts.frequency === 'daily' ? 'yesterday' : 'this past week';
  const subject = opts.frequency === 'daily'
    ? `Your Memos · ${completed.length} meeting${completed.length === 1 ? '' : 's'} ${windowLabel}`
    : `Weekly Memos recap · ${completed.length} meeting${completed.length === 1 ? '' : 's'}, ${actionItems.length} action item${actionItems.length === 1 ? '' : 's'}`;

  const htmlParts: string[] = [];
  htmlParts.push(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">`);
  htmlParts.push(`<div style="max-width:640px;margin:0 auto;padding:32px 24px;">`);
  htmlParts.push(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
    <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:inline-flex;align-items:center;justify-content:center;color:white;font-weight:700;">M</div>
    <div style="font-size:18px;font-weight:600;">Memos</div>
  </div>`);
  htmlParts.push(`<h1 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px;">Your ${opts.frequency} recap</h1>`);
  htmlParts.push(`<p style="color:#64748b;margin:0 0 28px;font-size:14px;">Hi ${escapeHtml(user.name ?? 'there')} — here's what happened ${windowLabel}.</p>`);

  // Stats row
  htmlParts.push(`<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:28px;"><tr>`);
  htmlParts.push(`<td style="width:33%;padding:0 6px 0 0;"><div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Meetings</div><div style="font-size:22px;font-weight:700;">${completed.length}</div></div></td>`);
  htmlParts.push(`<td style="width:34%;padding:0 3px;"><div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Action items</div><div style="font-size:22px;font-weight:700;">${actionItems.length}</div></div></td>`);
  htmlParts.push(`<td style="width:33%;padding:0 0 0 6px;"><div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Hours</div><div style="font-size:22px;font-weight:700;">${(completed.reduce((a, b) => a + (b.durationSeconds ?? 0), 0) / 3600).toFixed(1)}</div></div></td>`);
  htmlParts.push(`</tr></table>`);

  // Action items
  if (actionItems.length > 0) {
    htmlParts.push(`<h2 style="font-size:16px;font-weight:600;margin:28px 0 10px;">Open action items</h2>`);
    htmlParts.push(`<div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:4px 0;">`);
    for (const ai of actionItems.slice(0, 20)) {
      const ownerChip = ai.owner ? `<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:11px;padding:1px 7px;border-radius:999px;margin-right:6px;">${escapeHtml(ai.owner)}</span>` : '';
      const deadline = ai.deadline ? `<span style="color:#d97706;font-size:11px;margin-left:6px;">· ${escapeHtml(ai.deadline)}</span>` : '';
      htmlParts.push(`<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:14px;line-height:1.4;">${ownerChip}${escapeHtml(ai.task)}${deadline}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">
          <a href="${meetingLink(opts.baseUrl, ai.meeting.id)}" style="color:#3b82f6;text-decoration:none;">${escapeHtml(ai.meeting.title)}</a>
        </div>
      </div>`);
    }
    htmlParts.push(`</div>`);
    if (actionItems.length > 20) {
      htmlParts.push(`<p style="font-size:12px;color:#64748b;margin-top:6px;">+${actionItems.length - 20} more — <a href="${opts.baseUrl.replace(/\/+$/, '')}/actions" style="color:#3b82f6;">see all</a></p>`);
    }
  }

  // Meeting summaries
  if (completed.length > 0) {
    htmlParts.push(`<h2 style="font-size:16px;font-weight:600;margin:28px 0 10px;">Meeting summaries</h2>`);
    for (const m of completed.slice(0, 8)) {
      const when = new Date(m.startAt).toLocaleString();
      const summary = (m.summary ?? '').replace(/\s+/g, ' ').slice(0, 320);
      htmlParts.push(`<div style="background:white;border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:2px;">
          <a href="${meetingLink(opts.baseUrl, m.id)}" style="color:#0f172a;text-decoration:none;">${escapeHtml(m.title)}</a>
        </div>
        <div style="font-size:11px;color:#64748b;margin-bottom:8px;">${escapeHtml(when)}</div>
        <div style="font-size:13px;color:#334155;line-height:1.55;">${escapeHtml(summary)}${summary.length === 320 ? '…' : ''}</div>
      </div>`);
    }
    if (completed.length > 8) {
      htmlParts.push(`<p style="font-size:12px;color:#64748b;">+${completed.length - 8} more — <a href="${opts.baseUrl.replace(/\/+$/, '')}/" style="color:#3b82f6;">open Memos</a></p>`);
    }
  }

  htmlParts.push(`<p style="font-size:11px;color:#94a3b8;margin:32px 0 0;text-align:center;">
    Sent by Memos · <a href="${opts.baseUrl.replace(/\/+$/, '')}/settings" style="color:#94a3b8;">manage digest</a>
  </p>`);
  htmlParts.push(`</div></body></html>`);
  const html = htmlParts.join('');

  // Plain text fallback
  const textLines: string[] = [];
  textLines.push(`Your ${opts.frequency} Memos recap`);
  textLines.push(`${completed.length} meeting(s), ${actionItems.length} action item(s)`);
  textLines.push('');
  if (actionItems.length > 0) {
    textLines.push('ACTION ITEMS');
    for (const ai of actionItems.slice(0, 20)) {
      textLines.push(`  - ${ai.owner ? `[${ai.owner}] ` : ''}${ai.task}${ai.deadline ? ` (${ai.deadline})` : ''}`);
    }
    textLines.push('');
  }
  if (completed.length > 0) {
    textLines.push('MEETINGS');
    for (const m of completed.slice(0, 8)) {
      textLines.push(`  ${m.title}`);
      textLines.push(`    ${meetingLink(opts.baseUrl, m.id)}`);
    }
  }

  return {
    subject,
    html,
    text: textLines.join('\n'),
    meetingsCount: completed.length,
    actionCount: actionItems.length,
  };
}

export async function sendDigest(userId: string, opts?: { frequency?: 'daily' | 'weekly'; force?: boolean }): Promise<{ sent: boolean; reason?: string }> {
  const s = await getSettings();
  const d = (s as any).digest ?? {};
  const frequency = opts?.frequency ?? d.frequency ?? 'daily';

  if (!d.enabled && !opts?.force) return { sent: false, reason: 'digest disabled' };

  const transport = await getTransport();
  if (!transport) return { sent: false, reason: 'SMTP not configured' };

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { sent: false, reason: 'user not found' };

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3100';
  const digest = await buildDigest(userId, { frequency, baseUrl });
  if (!digest) return { sent: false, reason: 'nothing to send' };

  await transport.sendMail({
    from: fromAddress(s),
    to: user.email,
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
  });

  log.info('digest sent', { userId, email: user.email, frequency, meetings: digest.meetingsCount, actions: digest.actionCount });
  return { sent: true };
}

// -----------------------------------------------------------------------------
// Scheduler tick — called hourly by the existing scheduler.
// Sends digests for all users whose prefs match current hour/day.
// -----------------------------------------------------------------------------
/**
 * Returns hour (0-23) and weekday (0-6, Sun=0) in the given IANA tz.
 */
function localHourAndDay(now: Date, tz: string): { hour: number; day: number; dayKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit', hour12: false,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  const hour = Number(parts.hour);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[parts.weekday] ?? 0;
  const dayKey = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}`;
  return { hour, day, dayKey };
}

// Map of `${userId}:${dayKey}` → true, so we don't double-fire within the hour
// even across scheduler ticks. Cleared naturally as the dayKey changes.
const sentThisHour = new Map<string, boolean>();

export async function maybeSendScheduledDigests(now: Date = new Date()): Promise<void> {
  const s = await getSettings();
  const d = (s as any).digest ?? {};
  if (!d.enabled) return;

  const targetHour = d.hourOfDay ?? 8;
  const targetDayOfWeek = d.dayOfWeek ?? 1;

  const allUsers = await db.select({ id: users.id, timezone: users.timezone }).from(users);
  for (const u of allUsers) {
    const tz = u.timezone || 'UTC';
    const { hour, day, dayKey } = localHourAndDay(now, tz);
    if (hour !== targetHour) continue;
    if (d.frequency === 'weekly' && day !== targetDayOfWeek) continue;

    const key = `${u.id}:${dayKey}`;
    if (sentThisHour.has(key)) continue;
    sentThisHour.set(key, true);

    await sendDigest(u.id, { frequency: d.frequency }).catch(err =>
      log.error('scheduled digest failed', { userId: u.id, err: err instanceof Error ? err.message : err }),
    );
  }

  // Garbage-collect entries that aren't "today". Cheap enough at small N users.
  if (sentThisHour.size > 200) {
    const nowKeyPrefix = new Date().toISOString().slice(0, 10);
    for (const k of sentThisHour.keys()) {
      if (!k.includes(nowKeyPrefix)) sentThisHour.delete(k);
    }
  }
}
