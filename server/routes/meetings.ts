import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { meetings, bots as botsTable } from '../../shared/schema';
import { launchBotForMeeting, stopBot } from '../bot/notetaker-bot';
import { processRecording } from '../services/pipeline';
import { requireAuth, getUserId } from '../auth';
import { detectPlatform } from '../bot/platform-drivers';

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

meetingsRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.select().from(meetings)
    .where(eq(meetings.userId, userId))
    .orderBy(desc(meetings.startAt))
    .limit(200);
  res.json(rows);
});

meetingsRouter.get('/:id', async (req, res) => {
  const [row] = await db.select().from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
  if (!row) return res.status(404).json({ error: 'not found' });
  const botRows = await db.select().from(botsTable).where(eq(botsTable.meetingId, row.id));
  res.json({ ...row, bots: botRows });
});

meetingsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const { title, meetingUrl, startAt, autoJoin = true } = req.body ?? {};
  if (!title || !meetingUrl || !startAt) {
    return res.status(400).json({ error: 'title, meetingUrl, and startAt are required' });
  }
  const platform = detectPlatform(meetingUrl);
  if (!platform) return res.status(400).json({ error: 'unrecognized meeting URL' });

  const [row] = await db.insert(meetings).values({
    userId,
    title,
    meetingUrl,
    platform,
    startAt: new Date(startAt),
    attendees: [],
    autoJoin,
    status: 'scheduled',
  }).returning();
  res.status(201).json(row);
});

meetingsRouter.post('/:id/join-now', async (req, res) => {
  try {
    const result = await launchBotForMeeting(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

meetingsRouter.post('/:id/stop', async (req, res) => {
  await stopBot(req.params.id, req.body?.reason ?? 'manual');
  res.json({ ok: true });
});

meetingsRouter.post('/:id/reprocess', async (req, res) => {
  processRecording(req.params.id).catch(() => {});
  res.json({ ok: true });
});

meetingsRouter.delete('/:id', async (req, res) => {
  await db.delete(meetings).where(eq(meetings.id, req.params.id));
  res.json({ ok: true });
});
