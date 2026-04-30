import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { meetings } from '../../shared/schema';
import { requireAuth, getUserId } from '../auth';
import { semanticSearch, indexMeeting } from '../services/embeddings';
import { createLogger } from '../logger';

export const searchRouter = Router();
searchRouter.use(requireAuth);

const log = createLogger('search');

searchRouter.post('/semantic', async (req, res) => {
  try {
    const userId = getUserId(req);
    const q = String(req.body?.query ?? '').trim();
    const limit = Math.min(Math.max(Number(req.body?.limit) || 12, 1), 50);
    if (!q) return res.json({ hits: [] });
    const hits = await semanticSearch(userId, q, limit);
    res.json({ hits });
  } catch (err) {
    log.error('semantic search failed', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Index-all — useful one-time after upgrading or configuring an embedding model.
 * Iterates all of the user's completed meetings and re-indexes.
 */
searchRouter.post('/reindex', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.userId, userId), eq(meetings.status, 'completed')));

  let indexed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try {
      const r = await indexMeeting(row.id);
      if (r.source === 'indexed') indexed++;
      else skipped++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  res.json({ ok: true, indexed, skipped, errors: errors.slice(0, 5) });
});
