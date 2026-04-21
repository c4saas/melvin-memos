import { eq } from 'drizzle-orm';
import { db } from '../db';
import { meetings } from '../../shared/schema';
import { transcribeFile } from './transcription';
import { summarizeTranscript } from './summarizer';
import { createMeetingPage } from './notion-sync';
import { createLogger } from '../logger';

const log = createLogger('pipeline');

export async function processRecording(meetingId: string): Promise<void> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting) {
    log.error('meeting not found', { meetingId });
    return;
  }
  if (!meeting.recordingPath) {
    log.warn('no recording path, skipping pipeline', { meetingId });
    await db.update(meetings).set({ status: 'failed', errorMessage: 'No recording captured', updatedAt: new Date() }).where(eq(meetings.id, meetingId));
    return;
  }

  try {
    await db.update(meetings).set({ status: 'transcribing', updatedAt: new Date() }).where(eq(meetings.id, meetingId));
    log.info('transcribing', { meetingId });
    const transcript = await transcribeFile(meeting.recordingPath);

    await db.update(meetings).set({
      status: 'summarizing',
      transcript: transcript.text,
      transcriptJson: transcript as any,
      speakers: transcript.speakers,
      durationSeconds: transcript.durationSec ?? meeting.durationSeconds ?? null,
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));

    log.info('summarizing', { meetingId });
    const dateStr = (meeting.startAt ?? new Date()).toISOString().slice(0, 10);
    const summary = await summarizeTranscript(transcript.text, {
      title: meeting.title,
      date: dateStr,
      durationSec: transcript.durationSec,
    });

    await db.update(meetings).set({
      summary: summary.fullMarkdown,
      actionItems: summary.actionItems,
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));

    log.info('syncing to notion', { meetingId });
    const notionRes = await createMeetingPage({
      summary,
      transcriptText: transcript.text,
      host: meeting.host ?? undefined,
      meetingUrl: meeting.meetingUrl,
    }).catch(err => {
      log.error('notion sync failed', err);
      return null;
    });

    await db.update(meetings).set({
      status: 'completed',
      notionPageId: notionRes?.pageId ?? null,
      notionPageUrl: notionRes?.url ?? null,
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));

    log.info('pipeline complete', { meetingId });
  } catch (err) {
    log.error('pipeline error', err);
    await db.update(meetings).set({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));
  }
}
