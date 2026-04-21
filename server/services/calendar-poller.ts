import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { calendarAccounts, meetings } from '../../shared/schema';
import { listUpcomingEvents } from '../integrations/google-calendar';
import { listUpcomingMicrosoftEvents } from '../integrations/microsoft-calendar';
import { launchBotForMeeting, isRunning } from '../bot/notetaker-bot';
import { createLogger } from '../logger';

const log = createLogger('calendar-poller');

export async function syncAllCalendars(): Promise<{ synced: number }> {
  const accounts = await db.select().from(calendarAccounts).where(eq(calendarAccounts.status, 'connected'));
  let total = 0;
  for (const acc of accounts) {
    try {
      const events = acc.provider === 'microsoft'
        ? await listUpcomingMicrosoftEvents(acc.id)
        : await listUpcomingEvents(acc.id);

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
      log.error('sync failed for account', { accountId: acc.id, error: err instanceof Error ? err.message : err });
    }
  }
  log.info('calendar sync complete', { newMeetings: total });
  return { synced: total };
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
