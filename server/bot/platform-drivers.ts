import type { Page, BrowserContext } from 'playwright';
import { createLogger } from '../logger';

const log = createLogger('platform-driver');

export interface JoinContext {
  page: Page;
  context: BrowserContext;
  meetingUrl: string;
  botName: string;
  onStatus: (code: string, detail?: string) => void;
}

export interface PlatformDriver {
  platform: string;
  matchUrl: (url: string) => boolean;
  join: (ctx: JoinContext) => Promise<void>;
  detectCallEnd: (ctx: JoinContext) => Promise<boolean>;
}

const click = async (page: Page, selectors: string[], timeoutMs = 6000): Promise<boolean> => {
  for (const s of selectors) {
    try {
      const el = await page.waitForSelector(s, { timeout: timeoutMs });
      if (el) {
        await el.click({ timeout: 2000 }).catch(() => {});
        return true;
      }
    } catch {}
  }
  return false;
};

const fillIfPresent = async (page: Page, selectors: string[], value: string): Promise<boolean> => {
  for (const s of selectors) {
    try {
      const el = await page.waitForSelector(s, { timeout: 4000 });
      if (el) {
        await el.fill(value).catch(() => {});
        return true;
      }
    } catch {}
  }
  return false;
};

export const googleMeetDriver: PlatformDriver = {
  platform: 'google_meet',
  matchUrl: (url) => /meet\.google\.com/.test(url),

  async join({ page, meetingUrl, botName, onStatus }) {
    onStatus('navigating', meetingUrl);
    await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForTimeout(4000);

    await fillIfPresent(page, [
      'input[aria-label="Your name"]',
      'input[placeholder*="Your name" i]',
    ], botName);

    await click(page, [
      'div[aria-label*="microphone" i][data-is-muted="false"]',
      'button[aria-label*="Turn off microphone" i]',
    ], 2500);

    await click(page, [
      'div[aria-label*="camera" i][data-is-muted="false"]',
      'button[aria-label*="Turn off camera" i]',
    ], 2500);

    onStatus('requesting_to_join');
    const joined = await click(page, [
      'button:has-text("Ask to join")',
      'button:has-text("Join now")',
      'button[jsname][aria-label*="Join" i]',
      'span:has-text("Ask to join")',
      'span:has-text("Join now")',
    ], 8000);

    if (!joined) throw new Error('Could not find join button on Google Meet');
    onStatus('waiting_admission');

    const admitted = await page.waitForSelector('button[aria-label*="Leave call" i], button[aria-label*="leave call" i]', {
      timeout: 120_000,
    }).catch(() => null);

    if (!admitted) throw new Error('Not admitted within 2 minutes');
    onStatus('in_call');
  },

  async detectCallEnd({ page }) {
    const leaveBtn = await page.$('button[aria-label*="Leave call" i]').catch(() => null);
    if (!leaveBtn) return true;
    const removed = await page.$('text="You\'ve been removed from the meeting"').catch(() => null);
    const ended = await page.$('text="The meeting has ended"').catch(() => null);
    return Boolean(removed || ended);
  },
};

export const zoomDriver: PlatformDriver = {
  platform: 'zoom',
  matchUrl: (url) => /zoom\.us\/(j|wc|my)/.test(url),

  async join({ page, meetingUrl, botName, onStatus }) {
    const webUrl = meetingUrl.replace('/j/', '/wc/join/');
    onStatus('navigating', webUrl);
    await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await fillIfPresent(page, [
      'input#input-for-name',
      'input[name="inputname"]',
      'input[placeholder*="name" i]',
    ], botName);

    await click(page, [
      'button:has-text("Join")',
      'button#joinBtn',
      'button:has-text("Join from your browser")',
    ], 6000);

    onStatus('waiting_admission');
    await page.waitForSelector('button[aria-label*="Leave" i], button:has-text("Leave")', {
      timeout: 120_000,
    }).catch(() => {
      throw new Error('Not admitted within 2 minutes');
    });

    onStatus('in_call');
  },

  async detectCallEnd({ page }) {
    const leaveBtn = await page.$('button[aria-label*="Leave" i]').catch(() => null);
    return !leaveBtn;
  },
};

export const teamsDriver: PlatformDriver = {
  platform: 'teams',
  matchUrl: (url) => /teams\.microsoft\.com|teams\.live\.com/.test(url),

  async join({ page, meetingUrl, botName, onStatus }) {
    onStatus('navigating', meetingUrl);
    await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(4000);

    await click(page, ['button:has-text("Continue on this browser")'], 4000);

    await fillIfPresent(page, [
      'input[data-tid="prejoin-display-name-input"]',
      'input[placeholder*="name" i]',
    ], botName);

    await click(page, [
      'button[data-tid="prejoin-join-button"]',
      'button:has-text("Join now")',
    ], 6000);

    onStatus('waiting_admission');
    await page.waitForSelector('button[data-tid="call-end"], button[aria-label*="Leave" i]', {
      timeout: 120_000,
    }).catch(() => {
      throw new Error('Not admitted within 2 minutes');
    });

    onStatus('in_call');
  },

  async detectCallEnd({ page }) {
    const leaveBtn = await page.$('button[data-tid="call-end"], button[aria-label*="Leave" i]').catch(() => null);
    return !leaveBtn;
  },
};

export const drivers: PlatformDriver[] = [googleMeetDriver, zoomDriver, teamsDriver];

export function driverFor(url: string): PlatformDriver | null {
  return drivers.find(d => d.matchUrl(url)) ?? null;
}

export function detectPlatform(url: string): string | null {
  return driverFor(url)?.platform ?? null;
}

log.debug('platform drivers loaded');
