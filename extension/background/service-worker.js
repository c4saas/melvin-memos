/**
 * Memos Recorder — Service Worker
 *
 * Responsibilities:
 *  - Handle popup → "start"/"stop" messages
 *  - Create/close offscreen document (the only place MediaRecorder can live in MV3)
 *  - Track recording state and broadcast to popup
 *  - Turn on a badge + pulsing icon while recording
 */

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const ICON_DEFAULT = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};
const ICON_RECORDING = {
  16: 'icons/icon-rec-16.png',
  32: 'icons/icon-rec-32.png',
  48: 'icons/icon-rec-48.png',
  128: 'icons/icon-rec-128.png',
};

let state = {
  recording: false,
  startedAt: null,
  tabId: null,
  title: null,
  platform: null,
  endpoint: null,
};

// ---------------------------------------------------------
// Offscreen management
// ---------------------------------------------------------
async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Record meeting audio with MediaRecorder; MV3 workers cannot hold MediaStream.',
  });
}

async function closeOffscreen() {
  if (!(await hasOffscreen())) return;
  await chrome.offscreen.closeDocument().catch(() => {});
}

// ---------------------------------------------------------
// UI feedback
// ---------------------------------------------------------
async function setBadge(recording) {
  try {
    if (recording) {
      await chrome.action.setIcon({ path: ICON_RECORDING }).catch(() => {});
      await chrome.action.setBadgeText({ text: 'REC' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      await chrome.action.setIcon({ path: ICON_DEFAULT }).catch(() => {});
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {}
}

function broadcast() {
  chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {});
}

// ---------------------------------------------------------
// Start / stop flow
// ---------------------------------------------------------
async function startRecording({ tabId, title, platform, endpoint, includeMic, token }) {
  if (state.recording) throw new Error('Already recording');

  // tabCapture needs a stream id obtained in the service worker using the user
  // gesture from the popup click.
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError || !id) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Could not capture tab audio'));
      } else resolve(id);
    });
  });

  await ensureOffscreen();

  const resp = await chrome.runtime.sendMessage({
    type: 'offscreen:start',
    streamId,
    title,
    platform,
    endpoint,
    includeMic,
    token,
  });

  if (!resp?.ok) {
    await closeOffscreen();
    throw new Error(resp?.error ?? 'Offscreen failed to start');
  }

  state = {
    recording: true,
    startedAt: Date.now(),
    tabId,
    title,
    platform,
    endpoint,
  };
  await chrome.storage.session.set({ state });
  await setBadge(true);
  broadcast();
}

async function stopRecording() {
  if (!state.recording) return { ok: true, skipped: true };

  const resp = await chrome.runtime.sendMessage({ type: 'offscreen:stop' });
  await closeOffscreen();

  state = { recording: false, startedAt: null, tabId: null, title: null, platform: null, endpoint: null };
  await chrome.storage.session.set({ state });
  await setBadge(false);
  broadcast();

  return resp ?? { ok: true };
}

// ---------------------------------------------------------
// Message routing
// ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'popup:get-state':
          sendResponse({ state });
          break;
        case 'popup:start':
          await startRecording(msg.payload);
          sendResponse({ ok: true, state });
          break;
        case 'popup:stop':
          sendResponse(await stopRecording());
          break;
        case 'offscreen:upload-done':
          // Persist result so the popup can show a persistent error banner.
          await chrome.storage.session.set({
            lastUpload: { ok: msg.ok, title: msg.title, error: msg.error ?? null, at: Date.now() },
          });
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: 'Memos',
            message: msg.ok
              ? `Uploaded "${msg.title}" — transcribing in the background`
              : `Upload failed: ${msg.error ?? 'unknown error'}`,
          }).catch(() => {});
          sendResponse({ ok: true });
          break;
        case 'offscreen:error':
          console.error('[memos] offscreen error', msg.error);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    }
  })();
  return true; // keep channel open for async response
});

// ---------------------------------------------------------
// Startup / lifecycle: recover state
// ---------------------------------------------------------
chrome.runtime.onStartup.addListener(async () => {
  const { state: saved } = await chrome.storage.session.get('state');
  if (saved?.recording) {
    // Browser was restarted mid-record — we can't recover the stream, clear state.
    state = { recording: false, startedAt: null, tabId: null, title: null, platform: null, endpoint: null };
    await chrome.storage.session.set({ state });
    await setBadge(false);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await setBadge(false);
});
