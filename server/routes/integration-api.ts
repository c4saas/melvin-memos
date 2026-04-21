import { Router } from 'express';
import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../db';
import { meetings } from '../../shared/schema';
import { launchBotForMeeting } from '../bot/notetaker-bot';
import { detectPlatform } from '../bot/platform-drivers';
import { requireAuth, getUserId } from '../auth';

export const integrationApiRouter = Router();
integrationApiRouter.use(requireAuth);

integrationApiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'melvin-memos', version: '0.1.0' });
});

integrationApiRouter.post('/bots', async (req, res) => {
  const userId = getUserId(req);
  const { meetingUrl, title, scheduledFor } = req.body ?? {};
  if (!meetingUrl) return res.status(400).json({ error: 'meetingUrl required' });
  const platform = detectPlatform(meetingUrl);
  if (!platform) return res.status(400).json({ error: 'unrecognized meeting URL' });

  const startAt = scheduledFor ? new Date(scheduledFor) : new Date();

  const [row] = await db.insert(meetings).values({
    userId,
    title: title ?? 'Ad-hoc meeting',
    meetingUrl,
    platform,
    startAt,
    attendees: [],
    autoJoin: false,
    status: 'scheduled',
  }).returning();

  if (!scheduledFor) {
    launchBotForMeeting(row.id).catch(err => {
      console.error('[integration-api] immediate launch failed:', err);
    });
  }

  res.status(201).json({ meetingId: row.id, status: row.status });
});

integrationApiRouter.get('/meetings/recent', async (req, res) => {
  const userId = getUserId(req);
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 7 * 86400_000);

  const rows = await db.select().from(meetings)
    .where(and(eq(meetings.userId, userId), gte(meetings.startAt, since)))
    .orderBy(desc(meetings.startAt))
    .limit(100);

  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    platform: r.platform,
    startAt: r.startAt,
    status: r.status,
    durationSeconds: r.durationSeconds,
    summary: r.summary,
    notionPageUrl: r.notionPageUrl,
  })));
});

integrationApiRouter.get('/meetings/:id/transcript', async (req, res) => {
  const [row] = await db.select().from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({
    id: row.id,
    title: row.title,
    transcript: row.transcript,
    summary: row.summary,
    actionItems: row.actionItems,
  });
});
