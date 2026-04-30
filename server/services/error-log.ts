import { desc, lt, and, eq } from 'drizzle-orm';
import { db } from '../db';
import { errorEvents } from '../../shared/schema';
import { createLogger } from '../logger';

const log = createLogger('error-log');

interface RecordErrorInput {
  kind: string;
  meetingId?: string;
  userId?: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Persist an error event to the DB so users can see what failed without
 * docker exec into the container. Best-effort: never throws upward — the
 * caller is already in a failure path and we don't want to mask the original
 * error with an audit-write failure.
 */
export async function recordError(input: RecordErrorInput): Promise<void> {
  try {
    await db.insert(errorEvents).values({
      kind: input.kind,
      meetingId: input.meetingId ?? null,
      userId: input.userId ?? null,
      message: input.message.slice(0, 4000),
      context: input.context ?? {},
    });
  } catch (err) {
    log.warn('failed to persist error event', { err: err instanceof Error ? err.message : err });
  }
}

export async function listRecentErrors(limit = 50, kind?: string) {
  const q = db.select().from(errorEvents).orderBy(desc(errorEvents.createdAt)).limit(limit);
  if (kind) return q.where(eq(errorEvents.kind, kind));
  return q;
}

/**
 * Trim old error events. Keeps the table from growing without bound.
 */
export async function pruneOldErrors(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const result = await db.delete(errorEvents).where(lt(errorEvents.createdAt, cutoff));
  return (result as { rowCount?: number }).rowCount ?? 0;
}
