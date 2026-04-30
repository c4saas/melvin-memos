import { Router, raw } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import { meetings, bots as botsTable } from '../../shared/schema';
import { launchBotForMeeting, stopBot } from '../bot/notetaker-bot';
import { processRecording } from '../services/pipeline';
import { requireAuth, getUserId } from '../auth';
import { detectPlatform } from '../bot/platform-drivers';
import { createLogger } from '../logger';

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/data/recordings';
const log = createLogger('meetings-routes');

// Audio MIME → extension. Groq Whisper accepts mp3/mp4/mpeg/mpga/m4a/wav/webm/ogg/flac.
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

export const meetingsRouter = Router();

// CORS for chrome-extension origins — set headers before auth so even 401 responses
// carry Access-Control-Allow-Origin back to the extension.
meetingsRouter.use((req: any, res: any, next: any) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

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
  const userId = getUserId(req);
  const [row] = await db.select().from(meetings)
    .where(and(eq(meetings.id, req.params.id), eq(meetings.userId, userId)))
    .limit(1);
  if (!row) return res.status(404).json({ error: 'not found' });
  const botRows = await db.select().from(botsTable).where(eq(botsTable.meetingId, row.id));
  res.json({ ...row, bots: botRows });
});

const createMeetingBody = z.object({
  title: z.string().trim().min(1).max(200),
  meetingUrl: z.string().trim().min(1).max(2000),
  startAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  autoJoin: z.boolean().optional().default(true),
});

meetingsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const parsed = createMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') });
  }
  const { title, meetingUrl, startAt, autoJoin } = parsed.data;
  const platform = detectPlatform(meetingUrl);
  if (!platform) return res.status(400).json({ error: 'unrecognized meeting URL' });
  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) return res.status(400).json({ error: 'invalid startAt' });

  const [row] = await db.insert(meetings).values({
    userId,
    title,
    meetingUrl,
    platform,
    startAt: startDate,
    attendees: [],
    autoJoin,
    status: 'scheduled',
  }).returning();
  res.status(201).json(row);
});

// Voice recording upload — raw audio body (up to ~200MB, i.e. 2h @ 160kbps Opus).
// Content-Type MUST be one of: audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav.
// Title + duration passed via query params (body is the audio bytes).
// Auth: session cookie OR Authorization: Bearer mm_... (for Chrome extension).
meetingsRouter.post(
  '/voice-recording',
  raw({ type: (req) => Boolean(req.headers['content-type']?.startsWith('audio/')), limit: '200mb' }),
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const title = String(req.query.title ?? '').trim().slice(0, 200) || 'Voice recording';
      const rawDur = Number(req.query.durationSec ?? 0);
      const durationSec = Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur) : null;
      const source = String(req.query.source ?? 'web'); // 'web' | 'extension'
      const requestedPlatform = String(req.query.platform ?? 'voice');
      // Extensions tag the platform they captured from (google_meet / zoom / teams),
      // which makes the feed look right and is stored on the meeting row.
      const platform = ['google_meet', 'zoom', 'teams', 'voice'].includes(requestedPlatform)
        ? (requestedPlatform as 'google_meet' | 'zoom' | 'teams' | 'voice')
        : 'voice';
      const mime = String(req.headers['content-type'] ?? '').split(';')[0];
      const ext = MIME_TO_EXT[mime];
      if (!ext) return res.status(400).json({ error: `unsupported audio type: ${mime}` });
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'empty audio body' });
      }
      if (body.length > 200 * 1024 * 1024) {
        return res.status(413).json({ error: 'recording too large (>200MB)' });
      }

      if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });

      const [row] = await db.insert(meetings).values({
        userId,
        title,
        meetingUrl: source === 'extension' ? `extension://${platform}` : 'voice://local',
        platform,
        startAt: new Date(),
        attendees: [],
        autoJoin: false,
        status: 'processing',
        durationSeconds: durationSec,
      }).returning();

      const recordingPath = join(RECORDINGS_DIR, `${row.id}.${ext}`);
      writeFileSync(recordingPath, body);

      await db.update(meetings).set({ recordingPath, updatedAt: new Date() })
        .where(eq(meetings.id, row.id));

      log.info('voice recording uploaded', { id: row.id, bytes: body.length, ext });

      // Kick pipeline async — client returns immediately with the meeting row.
      processRecording(row.id).catch(err => log.error('voice pipeline failed', err));

      res.status(201).json({ ...row, recordingPath });
    } catch (err) {
      log.error('voice upload failed', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

/** Confirm the meeting belongs to the caller; returns true if ok, otherwise
 * writes a 404 response and returns false. */
async function assertMeetingOwned(req: any, res: any, id: string): Promise<boolean> {
  const userId = getUserId(req);
  const [row] = await db.select({ id: meetings.id }).from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: 'not found' }); return false; }
  return true;
}

meetingsRouter.post('/:id/join-now', async (req, res) => {
  if (!(await assertMeetingOwned(req, res, req.params.id))) return;
  try {
    const result = await launchBotForMeeting(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

meetingsRouter.post('/:id/stop', async (req, res) => {
  if (!(await assertMeetingOwned(req, res, req.params.id))) return;
  await stopBot(req.params.id, req.body?.reason ?? 'manual');
  res.json({ ok: true });
});

meetingsRouter.post('/:id/reprocess', async (req, res) => {
  if (!(await assertMeetingOwned(req, res, req.params.id))) return;
  processRecording(req.params.id).catch(() => {});
  res.json({ ok: true });
});

meetingsRouter.patch('/:id/tags', async (req, res) => {
  const userId = getUserId(req);
  const raw = Array.isArray(req.body?.tags) ? req.body.tags : [];
  const tags: string[] = Array.from(
    new Set<string>(
      raw
        .filter((t: unknown): t is string => typeof t === 'string')
        .map((t: string) => t.trim())
        .filter((t: string) => Boolean(t))
        .slice(0, 12),
    ),
  );
  const [row] = await db.update(meetings)
    .set({ tags, updatedAt: new Date() })
    .where(and(eq(meetings.id, req.params.id), eq(meetings.userId, userId)))
    .returning();
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, tags: row.tags });
});

meetingsRouter.patch('/:id/invite-bot', async (req, res) => {
  const userId = getUserId(req);
  const enable = Boolean(req.body?.enable);
  const [row] = await db.update(meetings)
    .set({ inviteBotAccount: enable, updatedAt: new Date() })
    .where(and(eq(meetings.id, req.params.id), eq(meetings.userId, userId)))
    .returning();
  if (!row) return res.status(404).json({ error: 'not found' });
  // Note: the actual Google Calendar patch happens on the next calendar-poller
  // sync (within a minute or two). We don't fire it inline so the UI toggle
  // stays snappy and the calendar API failure mode is centralized.
  res.json({ ok: true, inviteBotAccount: row.inviteBotAccount });
});

meetingsRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.delete(meetings)
    .where(and(eq(meetings.id, req.params.id), eq(meetings.userId, userId)))
    .returning({ id: meetings.id });
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});
