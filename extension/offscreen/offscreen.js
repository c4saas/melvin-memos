/**
 * Memos Recorder — Offscreen Document
 *
 * Captures:
 *  - Tab audio (via streamId from chrome.tabCapture in the worker)
 *  - Optional user microphone (getUserMedia)
 *
 * Mixes both through an AudioContext → MediaRecorder → WebM/Opus chunks.
 * On stop, concatenates chunks and POSTs the raw audio body to the Memos
 * voice-recording endpoint. Credentials: include, so the user's memos.sid
 * session cookie is sent.
 *
 * Design:
 *  - We always feed tab audio back to the speakers (via a separate AudioContext
 *    destination) so the user hears Zoom/Meet/Teams normally while we tap the stream.
 *  - Chunks are emitted every 5s so long meetings don't balloon RAM before stop.
 */

const MAX_SECONDS = 2 * 60 * 60; // safety cap

let recorder = null;
let chunks = [];
let startedAt = 0;
let tabCtx = null;
let playthroughCtx = null;
let micStream = null;
let tabStream = null;
let endpoint = null;
let token = null;
let title = 'Recorded meeting';
let platform = 'voice';
let hardStopTimer = null;

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function start({ streamId, title: t, platform: p, endpoint: e, includeMic, token: tk }) {
  if (recorder) throw new Error('already recording');

  title = t || title;
  platform = p || platform;
  endpoint = e;
  token = tk || null;
  chunks = [];

  // --- Tab audio ---
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Pipe tab back to speakers (otherwise capturing mutes it).
  playthroughCtx = new AudioContext();
  const playbackSrc = playthroughCtx.createMediaStreamSource(tabStream);
  playbackSrc.connect(playthroughCtx.destination);

  // --- Optional mic ---
  if (includeMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      console.warn('[memos-offscreen] mic unavailable', err);
      micStream = null;
    }
  }

  // --- Mix graph: tab + (optional) mic → single recordable stream ---
  tabCtx = new AudioContext();
  const dest = tabCtx.createMediaStreamDestination();

  const tabSrc = tabCtx.createMediaStreamSource(tabStream);
  const tabGain = tabCtx.createGain();
  tabGain.gain.value = 1.0;
  tabSrc.connect(tabGain).connect(dest);

  if (micStream) {
    const micSrc = tabCtx.createMediaStreamSource(micStream);
    const micGain = tabCtx.createGain();
    micGain.gain.value = 1.0;
    micSrc.connect(micGain).connect(dest);
  }

  const mixedStream = dest.stream;
  const mimeType = pickMimeType();
  recorder = mimeType ? new MediaRecorder(mixedStream, { mimeType, audioBitsPerSecond: 96_000 }) : new MediaRecorder(mixedStream);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onerror = (ev) => {
    chrome.runtime.sendMessage({ type: 'offscreen:error', error: ev?.error?.message ?? 'recorder error' }).catch(() => {});
  };
  recorder.onstop = async () => {
    try {
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      await upload(blob, durationSec);
    } catch (err) {
      chrome.runtime.sendMessage({
        type: 'offscreen:upload-done',
        ok: false,
        error: err?.message ?? String(err),
        title,
      }).catch(() => {});
    } finally {
      cleanup();
    }
  };

  recorder.start(5000); // emit a chunk every 5s
  startedAt = Date.now();

  hardStopTimer = setTimeout(() => stop(), MAX_SECONDS * 1000);
}

function stop() {
  if (!recorder) return;
  if (hardStopTimer) { clearTimeout(hardStopTimer); hardStopTimer = null; }
  if (recorder.state !== 'inactive') recorder.stop();
}

function cleanup() {
  tabStream?.getTracks().forEach(t => t.stop());
  micStream?.getTracks().forEach(t => t.stop());
  tabCtx?.close().catch(() => {});
  playthroughCtx?.close().catch(() => {});
  recorder = null;
  chunks = [];
  tabStream = null;
  micStream = null;
  tabCtx = null;
  playthroughCtx = null;
}

async function upload(blob, durationSec) {
  const url = `${endpoint.replace(/\/+$/, '')}/api/meetings/voice-recording?title=${encodeURIComponent(title)}&durationSec=${durationSec}&source=extension&platform=${encodeURIComponent(platform)}`;
  const mime = blob.type || 'audio/webm';

  const headers = { 'Content-Type': mime };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    credentials: token ? 'omit' : 'include', // prefer token if we have it
    body: blob,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${resp.status} ${text.slice(0, 200)}`);
  }

  const data = await resp.json().catch(() => ({}));
  chrome.runtime.sendMessage({
    type: 'offscreen:upload-done',
    ok: true,
    meetingId: data?.id,
    title,
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'offscreen:start') {
        await start(msg);
        sendResponse({ ok: true });
      } else if (msg?.type === 'offscreen:stop') {
        stop();
        sendResponse({ ok: true });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    }
  })();
  return true;
});
