import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { calendarAccounts, meetings } from '../../shared/schema';
import { listUpcomingEvents, ensureBotInvited } from '../integrations/google-calendar';
import { listUpcomingMicrosoftEvents } from '../integrations/microsoft-calendar';
import { launchBotForMeeting, isRunning } from '../bot/notetaker-bot';
import { recordError } from './error-log';
import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('calendar-poller');

export async function syncAllCalendars(): Promise<{ synced: number; eventsWithLinks: number; accounts: number }> {
  const accounts = await db.select().from(calendarAccounts).where(eq(calendarAccounts.status, 'connected'));
  // Read once: defense-in-depth check before any auto-invite. Both the email
  // setting AND the per-meeting toggle must be set; either being empty/false
  // skips the invite.
  const settings = await getSettings();
  const assistantEmail = settings.bot.assistantEmail?.trim();

  let total = 0;
  let eventsWithLinks = 0;
  for (const acc of accounts) {
    try {
      const events = acc.provider === 'microsoft'
        ? await listUpcomingMicrosoftEvents(acc.id)
        : await listUpcomingEvents(acc.id);

      eventsWithLinks += events.length;

      for (const ev of events) {
        if (!ev.meetingUrl || !ev.platform) continue;

        const existing = await db.select().from(meetings).where(
          and(eq(meetings.calendarAccountId, acc.id), eq(meetings.externalEventId, ev.externalId))
        ).limit(1);

        if (existing[0]) {
          await db.update(meetings).set({
            title: ev.title,
            startAt: ev.start,
            endAt: ev.end ?? null,
            attendees: ev.attendees,
            host: ev.host ?? null,
            updatedAt: new Date(),
          }).where(eq(meetings.id, existing[0].id));

          // Auto-invite path: ONLY when the per-meeting toggle is on AND a
          // global assistant email is configured AND we're on Google.
          // Both gates are defensive — no surprise invites.
          if (
            assistantEmail
            && existing[0].inviteBotAccount
            && acc.provider === 'google'
            && !ev.attendees.some(a => a.email.toLowerCase() === assistantEmail.toLowerCase())
          ) {
            try {
              const result = await ensureBotInvited(acc.id, ev.externalId, assistantEmail);
              log.info('bot invite result', { meetingId: existing[0].id, externalId: ev.externalId, result });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              log.warn('failed to invite bot to event', { meetingId: existing[0].id, externalId: ev.externalId, err: errMsg });
              await recordError({
                kind: 'calendar.invite-bot',
                meetingId: existing[0].id,
                userId: acc.userId,
                message: errMsg,
                context: { externalEventId: ev.externalId, botEmail: assistantEmail, accountEmail: acc.accountEmail },
              }).catch(() => {});
            }
          }
        } else {
          await db.insert(meetings).values({
            userId: acc.userId,
            calendarAccountId: acc.id,
            externalEventId: ev.externalId,
            title: ev.title,
            platform: ev.platform,
            meetingUrl: ev.meetingUrl,
            startAt: ev.start,
            endAt: ev.end ?? null,
            attendees: ev.attendees,
            host: ev.host ?? null,
            autoJoin: acc.autoJoin,
            status: 'scheduled',
          });
          total++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('sync failed for account', { accountId: acc.id, error: errMsg });
      // Surface invalid_grant and similar OAuth errors in the in-app Errors panel
      // so users can see "your Google connection expired — reconnect" without docker exec.
      await recordError({
        kind: 'calendar.sync',
        userId: acc.userId,
        message: errMsg,
        context: {
          provider: acc.provider,
          accountEmail: acc.accountEmail,
          accountId: acc.id,
          hint: errMsg.includes('invalid_grant')
            ? 'OAuth refresh token revoked — reconnect this calendar in Settings → Calendar accounts.'
            : undefined,
        },
      }).catch(() => {});
    }
  }
  log.info('calendar sync complete', { newMeetings: total, eventsWithLinks, accounts: accounts.length });
  return { synced: total, eventsWithLinks, accounts: accounts.length };
}

export async function checkAndLaunchDueBots(): Promise<void> {
  const now = new Date();
  const buffer = 5 * 60_000;
  const upper = new Date(now.getTime() + buffer);

  const due = await db.select().from(meetings).where(
    and(
      eq(meetings.status, 'scheduled'),
      eq(meetings.autoJoin, true),
      gte(meetings.startAt, new Date(now.getTime() - 60_000)),
      lte(meetings.startAt, upper),
    ),
  );

  for (const m of due) {
    if (isRunning(m.id)) continue;
    log.info('auto-joining meeting', { id: m.id, title: m.title, start: m.startAt });
    launchBotForMeeting(m.id).catch(err => log.error('auto-join failed', { id: m.id, err }));
  }
}
