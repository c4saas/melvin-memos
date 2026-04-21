import { Client as NotionClient } from '@notionhq/client';
import { getSettings } from '../settings';
import { createLogger } from '../logger';
import type { MeetingSummary } from './summarizer';

const log = createLogger('notion-sync');

export const MEMOS_TEMPLATE = {
  title: "Austin's Recall Meetings",
  properties: {
    Title:           { title: {} },
    Date:            { date: {} },
    Host:            { rich_text: {} },
    Attendees:       { multi_select: { options: [] } },
    'Meeting Summary': { rich_text: {} },
    Transcript:      { url: {} },
  },
} as const;

export async function getNotionClient(): Promise<NotionClient | null> {
  const s = await getSettings();
  const apiKey = s.integrations.notion.apiKey;
  if (!apiKey) return null;
  return new NotionClient({ auth: apiKey });
}

export async function provisionMeetingsDatabase(parentPageId: string, title?: string): Promise<string> {
  const notion = await getNotionClient();
  if (!notion) throw new Error('Notion not configured — add apiKey in settings');

  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title ?? MEMOS_TEMPLATE.title } }],
    properties: MEMOS_TEMPLATE.properties,
  } as any);

  log.info('created meetings database', { id: db.id });
  return db.id;
}

function chunkRichText(text: string): Array<{ type: 'text'; text: { content: string } }> {
  const chunks: Array<{ type: 'text'; text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  }
  return chunks;
}

export async function createMeetingPage(params: {
  summary: MeetingSummary;
  transcriptText: string;
  host?: string;
  meetingUrl?: string;
  recordingUrl?: string;
}): Promise<{ pageId: string; url: string } | null> {
  const settings = await getSettings();
  const dbId = settings.integrations.notion.meetingsDatabaseId;
  const notion = await getNotionClient();
  if (!notion || !dbId) {
    log.warn('skipping notion sync — no client or db id');
    return null;
  }

  const { summary, transcriptText, host, recordingUrl } = params;

  const richText = (t: string) => [{ type: 'text' as const, text: { content: t.slice(0, 2000) } }];

  const properties: Record<string, unknown> = {
    Title: { title: [{ text: { content: summary.title } }] },
    Date: { date: { start: summary.date } },
    'Meeting Summary': { rich_text: richText(summary.executiveSummary) },
  };

  if (host) properties.Host = { rich_text: richText(host) };

  if (summary.attendees.length > 0) {
    properties.Attendees = {
      multi_select: summary.attendees.slice(0, 10).map(name => ({ name: name.slice(0, 100) })),
    };
  }

  if (recordingUrl) properties.Transcript = { url: recordingUrl };

  const blocks: any[] = [];

  for (const chunk of chunkRichText(summary.fullMarkdown)) {
    blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [chunk] } });
  }

  if (transcriptText) {
    blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'Full Transcript' } }] } });
    for (const chunk of chunkRichText(transcriptText)) {
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [chunk] } });
    }
  }

  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties: properties as any,
    children: blocks.slice(0, 100),
  });

  log.info('created notion page', { id: page.id });
  return { pageId: page.id, url: (page as any).url ?? '' };
}
