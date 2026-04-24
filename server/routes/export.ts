import { Router } from 'express';
import JSZip from 'jszip';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { meetings } from '../../shared/schema';
import { requireAuth, getUserId } from '../auth';

export const exportRouter = Router();
exportRouter.use(requireAuth);

function safeFilename(s: string): string {
  return s.replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'memo';
}

function meetingToMarkdown(m: typeof meetings.$inferSelect): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`);
  lines.push('');
  lines.push(`**Date:** ${new Date(m.startAt).toISOString()}`);
  if (m.host) lines.push(`**Host:** ${m.host}`);
  if (m.attendees?.length) lines.push(`**Attendees:** ${m.attendees.map(a => a.name ?? a.email).join(', ')}`);
  if (m.tags?.length) lines.push(`**Tags:** ${m.tags.join(', ')}`);
  lines.push(`**Platform:** ${m.platform}`);
  lines.push(`**Status:** ${m.status}`);
  lines.push('');
  if (m.summary) {
    lines.push(m.summary);
    lines.push('');
  }
  if (m.actionItems?.length) {
    lines.push('## Action Items');
    for (const a of m.actionItems) {
      const owner = a.owner ? `**${a.owner}:** ` : '';
      const deadline = a.deadline ? ` _(${a.deadline})_` : '';
      lines.push(`- [ ] ${owner}${a.task}${deadline}`);
    }
    lines.push('');
  }
  if (m.transcript) {
    lines.push('## Transcript');
    lines.push('');
    lines.push(m.transcript);
  }
  return lines.join('\n');
}

exportRouter.get('/zip', async (req, res) => {
  try {
    const userId = getUserId(req);
    const rows = await db.select().from(meetings)
      .where(eq(meetings.userId, userId))
      .orderBy(desc(meetings.startAt));

    const zip = new JSZip();
    const manifest: Array<{ id: string; title: string; date: string; file: string }> = [];

    for (const m of rows) {
      const date = new Date(m.startAt).toISOString().slice(0, 10);
      const file = `${date}_${safeFilename(m.title)}.md`;
      zip.file(file, meetingToMarkdown(m));
      manifest.push({ id: m.id, title: m.title, date, file });
    }

    zip.file('INDEX.md', [
      '# Memos Export',
      '',
      `Exported ${new Date().toISOString()} — ${rows.length} meeting${rows.length === 1 ? '' : 's'}`,
      '',
      '| Date | Title | File |',
      '|---|---|---|',
      ...manifest.map(e => `| ${e.date} | ${e.title.replace(/\|/g, '\\|')} | [${e.file}](./${e.file}) |`),
    ].join('\n'));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `memos-export-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

exportRouter.get('/count', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.userId, userId));
  res.json({ count: rows.length });
});
