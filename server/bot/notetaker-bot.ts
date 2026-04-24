import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { eq } from 'drizzle-orm';
import { join } from 'path';
import { existsSync } from 'fs';
import { db } from '../db';
import { meetings, bots as botsTable } from '../../shared/schema';
import { AudioCapture } from './audio-capture';
import { driverFor } from './platform-drivers';
import { createLogger } from '../logger';
import { getSettings } from '../settings';
import { processRecording } from '../services/pipeline';

const log = createLogger('notetaker-bot');
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/data/recordings';
const BOT_SESSION_DIR = process.env.BOT_SESSION_DIR ?? '/data/bot-session';
const GOOGLE_SESSION_PATH = join(BOT_SESSION_DIR, 'google.json');

function sessionPathFor(platform: string): string | undefined {
  if (platform === 'google_meet' && existsSync(GOOGLE_SESSION_PATH)) return GOOGLE_SESSION_PATH;
  return undefined;
}

interface RunningBot {
  meetingId: string;
  botDbId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  audio: AudioCapture;
  stopRequested: boolean;
  endCheckInterval?: NodeJS.Timeout;
  maxDurationTimeout?: NodeJS.Timeout;
}

const running = new Map<string, RunningBot>();

async function appendStatus(botDbId: string, code: string, detail?: string) {
  const [row] = await db.select().from(botsTable).where(eq(botsTable.id, botDbId)).limit(1);
  const history = row?.statusHistory ?? [];
  history.push({ code, at: new Date().toISOString(), detail });
  await db.update(botsTable).set({ status: code, statusHistory: history }).where(eq(botsTable.id, botDbId));
}

export async function launchBotForMeeting(meetingId: string): Promise<{ botId: string }> {
  if (running.has(meetingId)) {
    throw new Error(`bot already running for meeting ${meetingId}`);
  }

  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting) throw new Error(`meeting ${meetingId} not found`);

  const driver = driverFor(meeting.meetingUrl);
  if (!driver) throw new Error(`no driver for url: ${meeting.meetingUrl}`);

  const settings = await getSettings();
  const botName = settings.bot.defaultName;

  const [bot] = await db.insert(botsTable).values({
    meetingId,
    botName,
    status: 'launching',
    statusHistory: [{ code: 'launching', at: new Date().toISOString() }],
  }).returning();

  await db.update(meetings).set({ status: 'joining', botId: bot.id, updatedAt: new Date() }).where(eq(meetings.id, meetingId));

  const recordingPath = join(RECORDINGS_DIR, `${meetingId}.mp3`);
  const audio = new AudioCapture(recordingPath);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const storageState = sessionPathFor(driver.platform);
    if (storageState) {
      log.info('using saved session', { platform: driver.platform, path: storageState });
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      permissions: ['microphone', 'camera'],
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      ...(storageState ? { storageState } : {}),
    });

    const page = await context.newPage();

    await audio.start();
    await appendStatus(bot.id, 'audio_started');

    await driver.join({
      page,
      context,
      meetingUrl: meeting.meetingUrl,
      botName,
      onStatus: (code, detail) => {
        appendStatus(bot.id, code, detail).catch(e => log.error('status update failed', e));
      },
    });

    await db.update(meetings).set({ status: 'recording', updatedAt: new Date() }).where(eq(meetings.id, meetingId));
    await db.update(botsTable).set({ joinedAt: new Date(), status: 'in_call' }).where(eq(botsTable.id, bot.id));

    const run: RunningBot = {
      meetingId,
      botDbId: bot.id,
      browser,
      context,
      page,
      audio,
      stopRequested: false,
    };
    running.set(meetingId, run);

    run.endCheckInterval = setInterval(async () => {
      if (run.stopRequested) return;
      try {
        const ended = await driver.detectCallEnd({ page, context, meetingUrl: meeting.meetingUrl, botName, onStatus: () => {} });
        if (ended) {
          log.info('call end detected', { meetingId });
          await stopBot(meetingId, 'call_ended');
        }
      } catch (e) {
        log.warn('end-check error', e);
      }
    }, 10_000);

    const maxMs = settings.bot.maxDurationMinutes * 60_000;
    run.maxDurationTimeout = setTimeout(() => {
      log.warn('max duration reached, stopping bot', { meetingId });
      stopBot(meetingId, 'max_duration').catch(e => log.error('max-duration stop failed', e));
    }, maxMs);

    return { botId: bot.id };
  } catch (err) {
    log.error('bot launch failed', err);
    await appendStatus(bot.id, 'error', err instanceof Error ? err.message : String(err));
    await db.update(meetings).set({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      updatedAt: new Date(),
    }).where(eq(meetings.id, meetingId));
    await audio.stop().catch(() => {});
    await browser?.close().catch(() => {});
    throw err;
  }
}

export async function stopBot(meetingId: string, reason: string = 'manual'): Promise<void> {
  const run = running.get(meetingId);
  if (!run) {
    log.warn('stopBot: no running bot for meeting', { meetingId });
    return;
  }
  if (run.stopRequested) return;
  run.stopRequested = true;

  clearInterval(run.endCheckInterval);
  clearTimeout(run.maxDurationTimeout);

  await appendStatus(run.botDbId, 'leaving', reason);

  try {
    await run.page.click('button[aria-label*="Leave" i], button[data-tid="call-end"]', { timeout: 3000 }).catch(() => {});
  } catch {}

  const audioResult = await run.audio.stop().catch(() => null);
  await run.browser.close().catch(() => {});

  await db.update(botsTable).set({ leftAt: new Date(), status: 'done' }).where(eq(botsTable.id, run.botDbId));
  await appendStatus(run.botDbId, 'done', reason);

  await db.update(meetings).set({
    status: 'processing',
    recordingPath: audioResult?.path ?? null,
    durationSeconds: audioResult?.durationSec ?? null,
    updatedAt: new Date(),
  }).where(eq(meetings.id, meetingId));

  running.delete(meetingId);
  log.info('bot stopped', { meetingId, reason });

  processRecording(meetingId).catch(err => {
    log.error('pipeline failed', err);
  });
}

export function isRunning(meetingId: string): boolean {
  return running.has(meetingId);
}

export function listRunningMeetingIds(): string[] {
  return Array.from(running.keys());
}
