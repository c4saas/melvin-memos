import type { Page, BrowserContext } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '../logger';

const log = createLogger('platform-driver');

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/data/recordings';

async function dumpDebug(page: Page, platform: string, label: string): Promise<string | null> {
  try {
    const dir = join(RECORDINGS_DIR, 'debug', platform);
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(dir, `${stamp}-${label}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    await writeFile(`${base}.html`, html);
    const buttons = await page.$$eval('button, [role="button"]', els =>
      els.slice(0, 80).map((e, i) => ({
        i,
        text: (e.textContent ?? '').trim().slice(0, 60),
        aria: e.getAttribute('aria-label') ?? undefined,
        jsname: e.getAttribute('jsname') ?? undefined,
        dataIdom: e.getAttribute('data-idom-class') ?? undefined,
      })),
    ).catch(() => []);
    await writeFile(`${base}-buttons.json`, JSON.stringify(buttons, null, 2));
    log.warn('dumped debug', { platform, label, base });
    return base;
  } catch (err) {
    log.warn('dumpDebug failed', { err: err instanceof Error ? err.message : err });
    return null;
  }
}

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

    // Wait for redirects to settle. Meet sometimes bounces to its marketing page
    // via client-side JS after the initial document loads.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const checkRedirect = async () => {
      const url = page.url();
      if (/workspace\.google\.com|support\.google\.com/.test(url)) {
        await dumpDebug(page, 'google_meet', 'redirected-to-marketing');
        throw new Error(
          `Meet redirected the bot to ${new URL(url).host}. ` +
          `This means the meeting requires participants to be signed into a Google account ` +
          `(typical for meetings hosted by personal Gmail accounts, or Workspace meetings with ` +
          `guests disabled). Sign the bot into a dedicated Google account — see Docs → Bot sign-in.`,
        );
      }
      if (/accounts\.google\.com/.test(url)) {
        await dumpDebug(page, 'google_meet', 'requires-signin');
        throw new Error(
          'Meet is asking the bot to sign into a Google account. ' +
          'This meeting does not allow anonymous/guest participants. ' +
          'Set up a signed-in bot session — see Docs → Bot sign-in.',
        );
      }
      if (!/meet\.google\.com/.test(url)) {
        await dumpDebug(page, 'google_meet', 'unexpected-redirect');
        throw new Error(`Meet navigated off the meeting URL to ${new URL(url).host} — unable to proceed.`);
      }
    };

    await checkRedirect();

    // Dismiss cookie / consent banners Google sometimes injects.
    await click(page, [
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button[aria-label*="Accept all" i]',
    ], 1500);

    await fillIfPresent(page, [
      'input[aria-label="Your name"]',
      'input[aria-label*="your name" i]',
      'input[placeholder*="Your name" i]',
      'input[placeholder*="your name" i]',
      'input[type="text"]',
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

    // Try DOM selectors first — broadened to cover Meet's current markup.
    let joined = await click(page, [
      'button:has-text("Ask to join")',
      'button:has-text("Join now")',
      'button:has-text("Join anyway")',
      'span:has-text("Ask to join")',
      'span:has-text("Join now")',
      'span:has-text("Join anyway")',
      'button[jsname][aria-label*="Join" i]',
      'button[aria-label*="Ask to join" i]',
      'button[aria-label*="Join now" i]',
      'div[role="button"]:has-text("Ask to join")',
      'div[role="button"]:has-text("Join now")',
    ], 10_000);

    // Fallback: locate by visible text on *any* button-ish element and click the first match.
    if (!joined) {
      joined = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
        const patterns = [/ask to join/i, /join now/i, /join anyway/i, /^join$/i];
        for (const el of candidates) {
          const text = (el.textContent ?? '').trim();
          const aria = el.getAttribute('aria-label') ?? '';
          if (patterns.some(p => p.test(text) || p.test(aria))) {
            el.click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
    }

    if (!joined) {
      // Re-check redirect — the bot may have been bounced while we waited for the button.
      await checkRedirect();
      const base = await dumpDebug(page, 'google_meet', 'no-join-button');
      const hint = base ? ` (debug: ${base}.png + -buttons.json)` : '';
      throw new Error(`Could not find join button on Google Meet${hint}`);
    }
    onStatus('waiting_admission');

    // Wait up to 4 minutes for the host to admit. Bumped from 2 min after
    // observing real meetings where the host joined late and admission was
    // missed. Also re-checks for redirects in case Meet bounces us mid-wait.
    const ADMIT_TIMEOUT_MS = 4 * 60_000;
    const admitted = await page.waitForSelector(
      'button[aria-label*="Leave call" i], button[aria-label*="leave call" i]',
      { timeout: ADMIT_TIMEOUT_MS },
    ).catch(() => null);

    if (!admitted) {
      await checkRedirect();
      await dumpDebug(page, 'google_meet', 'not-admitted');
      throw new Error(
        `Not admitted within ${Math.round(ADMIT_TIMEOUT_MS / 60_000)} minutes. ` +
        `The host needs to admit "${botName}" from the lobby. ` +
        `Either change the bot's display name to something the host recognizes (Settings → Recording & bot), ` +
        `or sign the bot into a Google account that's invited to the meeting.`,
      );
    }
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
