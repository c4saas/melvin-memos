import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { meetings } from '../../shared/schema';
import { requireAuth, getUserId } from '../auth';
import { listTeams, createIssue } from '../services/linear';
import { createLogger } from '../logger';

export const linearRouter = Router();
linearRouter.use(requireAuth);

const log = createLogger('linear-route');

linearRouter.get('/teams', async (_req, res) => {
  try {
    const teams = await listTeams();
    res.json({ teams });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

linearRouter.post('/issue', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { meetingId, actionIndex, title, description, priority } = req.body ?? {};

    // If caller supplies meetingId+actionIndex, we build title/description from the action item.
    let issueTitle = title;
    let issueDesc = description;
    let meetingTitle: string | undefined;
    let meetingUrl: string | undefined;

    if (meetingId) {
      const [m] = await db.select().from(meetings).where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId))).limit(1);
      if (!m) return res.status(404).json({ error: 'meeting not found' });
      meetingTitle = m.title;
      const baseUrl = process.env.APP_BASE_URL ?? '';
      meetingUrl = `${baseUrl.replace(/\/+$/, '')}/meetings/${m.id}`;
      if (typeof actionIndex === 'number' && m.actionItems?.[actionIndex]) {
        const a = m.actionItems[actionIndex];
        issueTitle = issueTitle || a.task;
        const parts: string[] = [];
        if (a.owner) parts.push(`**Owner:** ${a.owner}`);
        if (a.deadline) parts.push(`**Deadline:** ${a.deadline}`);
        parts.push('');
        parts.push(`From meeting: [${m.title}](${meetingUrl}) · ${m.startAt.toISOString().slice(0, 10)}`);
        issueDesc = issueDesc || parts.join('\n');
      } else if (!issueDesc) {
        issueDesc = `From meeting: [${m.title}](${meetingUrl}) · ${m.startAt.toISOString().slice(0, 10)}`;
      }
    }

    if (!issueTitle) return res.status(400).json({ error: 'title required' });

    const r = await createIssue({ title: issueTitle, description: issueDesc, priority });
    log.info('issue created from meeting', { userId, meetingId, identifier: r.identifier });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
