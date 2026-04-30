import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { highlights, meetings } from '../../shared/schema';
import { requireAuth, getUserId } from '../auth';

export const highlightsRouter = Router();
highlightsRouter.use(requireAuth);

// List highlights for a given meeting.
highlightsRouter.get('/meeting/:meetingId', async (req, res) => {
  const userId = getUserId(req);
  // Ensure the meeting belongs to the caller.
  const [m] = await db.select().from(meetings)
    .where(and(eq(meetings.id, req.params.meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!m) return res.status(404).json({ error: 'meeting not found' });

  const rows = await db.select().from(highlights)
    .where(eq(highlights.meetingId, req.params.meetingId))
    .orderBy(desc(highlights.createdAt));
  res.json(rows);
});

// Create a new highlight.
highlightsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const { meetingId, text, note, startSec, endSec, color } = req.body ?? {};
  if (!meetingId || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'meetingId and text required' });
  }
  const [m] = await db.select().from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)))
    .limit(1);
  if (!m) return res.status(404).json({ error: 'meeting not found' });

  const [row] = await db.insert(highlights).values({
    meetingId,
    userId,
    text: text.slice(0, 2000),
    note: note?.slice(0, 500) ?? null,
    startSec: typeof startSec === 'number' ? Math.round(startSec) : null,
    endSec: typeof endSec === 'number' ? Math.round(endSec) : null,
    color: typeof color === 'string' && color.length <= 16 ? color : 'yellow',
  }).returning();
  res.status(201).json(row);
});

// Update (edit note / color).
highlightsRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const set: Record<string, unknown> = {};
  if (typeof req.body?.note === 'string') set.note = req.body.note.slice(0, 500);
  if (typeof req.body?.color === 'string' && req.body.color.length <= 16) set.color = req.body.color;
  if (Object.keys(set).length === 0) return res.json({ ok: true });
  const [row] = await db.update(highlights).set(set)
    .where(and(eq(highlights.id, req.params.id), eq(highlights.userId, userId)))
    .returning();
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// Delete.
highlightsRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.delete(highlights)
    .where(and(eq(highlights.id, req.params.id), eq(highlights.userId, userId)))
    .returning();
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
