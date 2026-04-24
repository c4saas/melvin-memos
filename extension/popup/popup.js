/**
 * Memos Recorder — Popup
 *
 * Responsibilities:
 *  - Detect the platform of the active tab (Meet / Zoom / Teams / unknown)
 *  - Check auth: do we have a memos.sid cookie on the configured endpoint?
 *  - Fire start/stop messages to the service worker
 *  - Show a live timer while recording
 */

const DEFAULT_ENDPOINT = 'https://memos.c4saas.com';

const root = document.getElementById('root');

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function detectPlatform(url) {
  if (!url) return { id: 'unknown', label: 'Unknown page' };
  if (/meet\.google\.com/.test(url)) return { id: 'google_meet', label: 'Google Meet' };
  if (/zoom\.us/.test(url)) return { id: 'zoom', label: 'Zoom' };
  if (/teams\.microsoft\.com|teams\.live\.com/.test(url)) return { id: 'teams', label: 'Microsoft Teams' };
  return { id: 'unknown', label: 'This tab' };
}

function defaultTitle(platformLabel) {
  const d = new Date();
  const timeStr = d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `${platformLabel} — ${timeStr}`;
}

function fmtTimer(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function getEndpoint() {
  const { endpoint } = await chrome.storage.sync.get('endpoint');
  return endpoint || DEFAULT_ENDPOINT;
}

async function checkAuth(endpoint) {
  const host = (() => { try { return new URL(endpoint).host; } catch { return 'memos'; } })();
  const base = endpoint.replace(/\/+$/, '');

  // 1. If we have a stored bearer token, validate it against the server before trusting it.
  const { extensionToken } = await chrome.storage.sync.get('extensionToken');
  if (extensionToken) {
    try {
      const ping = await fetch(`${base}/api/auth/ping`, {
        headers: { Authorization: `Bearer ${extensionToken}` },
      });
      if (ping.ok) return { ok: true, host, token: extensionToken };
    } catch {}
    // Token is stale — clear it and fall through to re-issue.
    await chrome.storage.sync.remove('extensionToken');
  }

  // 2. No valid stored token — try session cookie exchange.
  try {
    const cookie = await chrome.cookies.get({ url: endpoint, name: 'memos.sid' });
    if (!cookie?.value) return { ok: false, host };

    // 3. Exchange the session cookie for a long-lived bearer token.
    const resp = await fetch(`${base}/api/auth/issue-extension-token`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!resp.ok) return { ok: false, host };
    const data = await resp.json();
    if (!data?.token) return { ok: false, host };
    await chrome.storage.sync.set({ extensionToken: data.token });
    return { ok: true, host, token: data.token };
  } catch {
    return { ok: false, host };
  }
}

// ---------------------------------------------------------
// Render
// ---------------------------------------------------------
const state = {
  tab: null,
  platform: { id: 'unknown', label: 'Unknown page' },
  endpoint: DEFAULT_ENDPOINT,
  auth: { ok: false, host: '' },
  serverState: { recording: false, startedAt: null },
  title: '',
  includeMic: true,
  error: null,
  lastSuccess: null,
  lastUploadError: null,
  elapsed: 0,
};

let tickerHandle = null;

function BrandMark() {
  return h('div', { class: 'brand-tile' }, h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true', html: `
    <defs><linearGradient id="pg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#a78bfa"/>
    </linearGradient></defs>
    <rect x="9" y="3" width="6" height="11" rx="3" fill="url(#pg)"/>
    <path d="M6 11c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="url(#pg)" stroke-width="1.75" stroke-linecap="round" fill="none"/>
    <path d="M12 17v3" stroke="url(#pg)" stroke-width="1.75" stroke-linecap="round"/>
  ` }));
}

function renderIdle() {
  const recordable = state.auth.ok;

  const headerEls = [
    h('div', { class: 'brand' },
      BrandMark(),
      h('div', { class: 'brand-text' },
        h('div', { class: 'brand-name' }, 'Memos Recorder'),
        h('div', { class: 'brand-tag' }, state.endpoint.replace(/^https?:\/\//, '')),
      ),
    ),
    h('div', { class: `platform-pill ${state.platform.id}` }, state.platform.label),
  ];

  if (!state.auth.ok) {
    headerEls.push(h('div', { class: 'login-banner' },
      'Sign in to Memos first: ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); chrome.tabs.create({ url: state.endpoint }); } }, state.auth.host || 'Memos'),
    ));
  }

  root.replaceChildren(
    ...headerEls,
    h('div', { class: 'field' },
      h('label', { class: 'label', for: 'title' }, 'Title'),
      h('input', {
        type: 'text',
        id: 'title',
        value: state.title,
        placeholder: 'Team standup',
        oninput: (e) => { state.title = e.target.value; },
      }),
    ),
    h('label', { class: 'checkbox' },
      h('input', {
        type: 'checkbox',
        checked: state.includeMic ? 'checked' : false,
        onchange: (e) => { state.includeMic = e.target.checked; },
      }),
      'Also record my microphone',
    ),

    h('div', { class: 'timer-wrap' },
      h('div', { class: 'timer-state' }, h('span', { class: 'dot' }), 'Ready'),
      h('div', { class: 'timer-value' }, '00:00'),
      h('div', { class: 'timer-max' }, `Max 2h 00m`),
    ),

    h('div', { class: 'actions' },
      h('button', {
        class: 'btn btn-primary',
        disabled: !recordable || state.platform.id === 'unknown' ? 'disabled' : false,
        onclick: onStart,
      }, '● Start recording'),
    ),

    state.error ? h('div', { class: 'error' }, state.error) : null,
    state.lastUploadError ? h('div', { class: 'error' },
      `Last upload failed: ${state.lastUploadError} — check your connection and try again.`,
    ) : null,
    state.lastSuccess ? h('div', { class: 'success' }, state.lastSuccess) : null,

    h('div', { class: 'help' },
      state.platform.id === 'unknown'
        ? 'Open a Google Meet, Zoom, or Teams tab, then click the Memos icon.'
        : `Recording tab audio${state.includeMic ? ' + your mic' : ''} → Memos → auto-transcribe.`,
    ),
  );
}

function renderRecording() {
  root.replaceChildren(
    h('div', { class: 'brand' },
      BrandMark(),
      h('div', { class: 'brand-text' },
        h('div', { class: 'brand-name' }, 'Memos Recorder'),
        h('div', { class: 'brand-tag' }, state.serverState.title || 'Recording…'),
      ),
    ),
    h('div', { class: 'timer-wrap' },
      h('div', { class: 'timer-state recording' }, h('span', { class: 'dot' }), 'Recording'),
      h('div', { class: 'timer-value', id: 'tv' }, fmtTimer(state.elapsed)),
      h('div', { class: 'timer-max' }, 'Click Stop to upload & transcribe'),
    ),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-danger', onclick: onStop }, '■ Stop & upload'),
    ),
    h('div', { class: 'help' },
      'Keep this Chrome window open. Closing the Meet/Zoom/Teams tab will end the recording early.',
    ),
  );
}

function render() {
  if (state.serverState?.recording) renderRecording();
  else renderIdle();
}

function startTicker() {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    const startedAt = state.serverState?.startedAt;
    if (!startedAt) return;
    state.elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const tv = document.getElementById('tv');
    if (tv) tv.textContent = fmtTimer(state.elapsed);
  }, 500);
}

function stopTicker() {
  if (tickerHandle) { clearInterval(tickerHandle); tickerHandle = null; }
}

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------
async function onStart() {
  state.error = null;
  state.lastSuccess = null;
  try {
    const tab = state.tab;
    if (!tab?.id) throw new Error('No active tab');

    const title = state.title.trim() || defaultTitle(state.platform.label);
    const resp = await chrome.runtime.sendMessage({
      type: 'popup:start',
      payload: {
        tabId: tab.id,
        title,
        platform: state.platform.id,
        endpoint: state.endpoint,
        includeMic: state.includeMic,
        token: state.auth.token,
      },
    });
    if (!resp?.ok) throw new Error(resp?.error ?? 'Start failed');
    state.serverState = resp.state;
    state.elapsed = 0;
    render();
    startTicker();
  } catch (err) {
    state.error = err?.message ?? String(err);
    render();
  }
}

async function onStop() {
  state.error = null;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'popup:stop' });
    stopTicker();
    state.serverState = { recording: false, startedAt: null };
    state.lastSuccess = resp?.skipped ? null : 'Uploading — you can close this popup.';
    render();
  } catch (err) {
    state.error = err?.message ?? String(err);
    render();
  }
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'state') {
    state.serverState = msg.state;
    if (!msg.state?.recording) {
      stopTicker();
    }
    render();
  }
});

(async function init() {
  state.endpoint = await getEndpoint();
  state.auth = await checkAuth(state.endpoint);
  state.tab = await getActiveTab();
  state.platform = detectPlatform(state.tab?.url);
  state.title = defaultTitle(state.platform.label);

  const { state: serverState } = await chrome.runtime.sendMessage({ type: 'popup:get-state' });
  state.serverState = serverState ?? { recording: false, startedAt: null };
  if (state.serverState?.startedAt) {
    state.elapsed = Math.round((Date.now() - state.serverState.startedAt) / 1000);
    startTicker();
  }

  // Show a persistent error banner if the last upload failed (and it's recent).
  const { lastUpload } = await chrome.storage.session.get('lastUpload');
  if (lastUpload && !lastUpload.ok && Date.now() - lastUpload.at < 5 * 60_000) {
    state.lastUploadError = lastUpload.error ?? 'unknown error';
    await chrome.storage.session.remove('lastUpload');
  }

  render();
})();
