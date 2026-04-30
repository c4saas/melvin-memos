import { useState } from 'react';
import {
  Rocket, Calendar, Cpu, Mic as MicIcon, FileText, Bot,
  Palette, Key, Package, ShieldCheck, HelpCircle, Chrome as ChromeIcon, Command, Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useBranding } from '../hooks/useBranding';

type Section = {
  id: string;
  label: string;
  icon: typeof Rocket;
  render: (brand: ReturnType<typeof useBranding>) => JSX.Element;
};

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="font-mono text-[12px] bg-input px-1.5 py-0.5 rounded border border-border">{children}</code>
);

const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre className="font-mono text-[12px] bg-input/60 border border-border rounded-md p-3 my-3 overflow-x-auto">
    {children}
  </pre>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-xl font-semibold mt-2 mb-3">{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-display text-base font-semibold mt-6 mb-2">{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>
);
const OL = ({ children }: { children: React.ReactNode }) => (
  <ol className="list-decimal list-outside pl-5 text-sm text-muted-foreground leading-relaxed space-y-2 mb-4">{children}</ol>
);
const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc list-outside pl-5 text-sm text-muted-foreground leading-relaxed space-y-1 mb-4">{children}</ul>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="border-l-2 border-primary/60 bg-primary/5 px-3 py-2 my-3 text-sm text-foreground/90 rounded-r">
    {children}
  </div>
);

const SECTIONS: Section[] = [
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    icon: Command,
    render: () => (
      <>
        <H2>Keyboard shortcuts</H2>
        <P>Power-user moves. These work globally — from any page.</P>
        <UL>
          <li><Code>⌘K</Code> / <Code>Ctrl+K</Code> — Open the command palette (search meetings, jump to any page)</li>
          <li><Code>⌘⇧R</Code> / <Code>Ctrl+Shift+R</Code> — Open the voice recorder</li>
          <li><Code>↑</Code> <Code>↓</Code> in the palette — navigate · <Code>↵</Code> select · <Code>Esc</Code> close</li>
        </UL>
        <H3>Command palette</H3>
        <P>
          The command palette is the fastest way to get around. Hit <Code>⌘K</Code> from anywhere and:
        </P>
        <UL>
          <li>Type a few letters of a meeting title to jump straight to it</li>
          <li>Search across summaries and hosts</li>
          <li>Jump to any page (Feed, Meetings, Actions, Calendar, Analytics, Settings, Docs)</li>
          <li>Start a new voice recording</li>
        </UL>
      </>
    ),
  },
  {
    id: 'getting-started',
    label: 'Getting started',
    icon: Rocket,
    render: (brand) => (
      <>
        <H2>Getting started</H2>
        <P>
          {brand.name} is a self-hosted notetaker. It listens to your calendar, joins your meetings,
          records audio, transcribes it, summarizes it, and (optionally) writes a structured page to Notion.
        </P>
        <H3>What you need before setup</H3>
        <UL>
          <li>A <b>Groq API key</b> (for Whisper transcription) — <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.groq.com</a></li>
          <li>At least one <b>Google</b> or <b>Microsoft</b> calendar account</li>
          <li>Optionally a <b>Notion integration</b> for auto-syncing meeting notes</li>
          <li>Optionally an <b>Anthropic API key</b> if you want richer summaries than local Ollama</li>
        </UL>
        <H3>First-time sign-in</H3>
        <OL>
          <li>Visit your instance URL (e.g. the one you're on now).</li>
          <li>You'll see the <b>"Welcome — let's get you set up"</b> screen. Pick your email and password.</li>
          <li>After signing in, visit <b>Settings</b> to connect providers and calendars.</li>
        </OL>
      </>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar setup',
    icon: Calendar,
    render: () => (
      <>
        <H2>Calendar setup</H2>
        <P>
          Calendars are the source of truth — {`${'Memos'}`} polls them every 5 minutes and auto-joins meetings you've marked for recording.
          Both Google Calendar and Microsoft 365 (Outlook) are supported.
        </P>

        <H3>Google Calendar</H3>
        <P>
          You'll need to create an OAuth client in Google Cloud Console and paste the credentials into <b>Settings → Providers → Google</b>.
        </P>
        <OL>
          <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">Google Cloud Console</a> and create (or select) a project.</li>
          <li>Enable the <b>Google Calendar API</b> under <i>APIs &amp; Services → Library</i>. Gmail and Drive are <b>not</b> required.</li>
          <li>Under <i>APIs &amp; Services → OAuth consent screen</i>, configure:
            <UL>
              <li>App name, support email, developer email</li>
              <li>Authorized domain: your instance domain (e.g. <Code>memos.c4saas.com</Code>)</li>
              <li>Scopes: <Code>calendar.readonly</Code>, <Code>calendar.events</Code> (the read-write scope is required so the optional per-meeting "Invite Memos bot" toggle can add the bot's Workspace email to event attendees)</li>
              <li>Add yourself as a test user while the app is in "Testing" mode</li>
            </UL>
          </li>
          <li>Under <i>APIs &amp; Services → Credentials</i>, create an <b>OAuth 2.0 Client ID</b> of type <b>Web application</b>:
            <UL>
              <li>Authorized JavaScript origin: <Code>https://your-domain</Code></li>
              <li>Authorized redirect URI: <Code>https://your-domain/api/calendar/google/callback</Code></li>
            </UL>
          </li>
          <li>Copy the <b>Client ID</b> and <b>Client secret</b> into Memos → Settings → Providers → Google.</li>
          <li>Go to Settings → Calendar accounts → <b>+ Google</b>, sign in, and grant calendar access. Existing users upgrading from a release before v0.1.11 must <b>disconnect and reconnect</b> Google to grant the new <Code>calendar.events</Code> scope — until they do, auto-invite is silently disabled.</li>
        </OL>

        <H3>Microsoft 365 (Outlook)</H3>
        <OL>
          <li>Register a new app in <a href="https://entra.microsoft.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">Microsoft Entra admin center</a>.</li>
          <li>Add redirect URI: <Code>https://your-domain/api/calendar/microsoft/callback</Code> (type: Web).</li>
          <li>Grant delegated permissions: <Code>Calendars.Read</Code>, <Code>User.Read</Code>, <Code>offline_access</Code>.</li>
          <li>Create a client secret; copy the value.</li>
          <li>Paste tenant ID, client ID, and secret into Memos → Settings → Providers → Microsoft.</li>
        </OL>

        <Note>
          Tokens are encrypted at rest using AES-256-GCM and the server's <Code>ENCRYPTION_KEY</Code>.
          If you rotate the encryption key you'll need to reconnect calendars.
        </Note>
      </>
    ),
  },
  {
    id: 'transcription',
    label: 'Transcription (Groq)',
    icon: MicIcon,
    render: () => (
      <>
        <H2>Transcription</H2>
        <P>
          Audio is transcribed by Groq's Whisper endpoint — fast, cheap, and near-realtime.
        </P>
        <OL>
          <li>Create an API key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.groq.com/keys</a>.</li>
          <li>Paste it into <b>Settings → Providers → Groq</b>. It's stored encrypted at rest.</li>
          <li>The default model is <Code>whisper-large-v3</Code>; you can override in settings.</li>
        </OL>
        <P>
          If a meeting fails transcription, open it and click <b>Reprocess</b> to re-run the pipeline
          without re-recording.
        </P>
      </>
    ),
  },
  {
    id: 'summaries',
    label: 'Summaries (Ollama)',
    icon: Cpu,
    render: () => (
      <>
        <H2>Summaries</H2>
        <P>
          Summaries are generated by a local Ollama container — no data leaves your server.
          The default model is <Code>llama3.1:8b</Code>; you can switch to anything Ollama supports
          (e.g. <Code>qwen2.5:7b</Code>, <Code>phi4:14b</Code>).
        </P>
        <H3>Pulling a model</H3>
        <Pre>{`docker exec <project>_ollama ollama pull llama3.1:8b`}</Pre>
        <P>
          Replace <Code>&lt;project&gt;</Code> with your Compose project name (e.g. <Code>memos</Code>).
          Models persist on the <Code>memos_ollama</Code> Docker volume across restarts.
        </P>
        <H3>Switching models</H3>
        <OL>
          <li>Pull the model with the command above.</li>
          <li>Open Settings → Providers → Ollama and change the summary model.</li>
          <li>Click Save. Future meetings will use the new model; existing ones keep their original summaries.</li>
        </OL>
      </>
    ),
  },
  {
    id: 'notion',
    label: 'Notion sync',
    icon: FileText,
    render: () => (
      <>
        <H2>Notion sync</H2>
        <P>
          When Notion is configured, each completed meeting is written as a page with Title, Date, Host,
          Attendees, Meeting Summary, and Transcript.
        </P>
        <OL>
          <li>Create a new <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline">Notion integration</a> (internal).</li>
          <li>Copy the integration secret. Paste it into Settings → Providers → Notion.</li>
          <li>In Notion, open the parent page where meeting notes should live and share it with your integration (<i>Connections → Connect to</i>).</li>
          <li>In Memos Settings → Notion, click <b>Provision database</b> and paste the parent page ID.</li>
        </OL>
        <Note>
          The database schema is fixed (Title, Date, Host, Attendees, Meeting Summary, Transcript).
          If you customize it in Notion, don't rename the properties — Memos writes by name.
        </Note>
      </>
    ),
  },
  {
    id: 'bot',
    label: 'How the bot works',
    icon: Bot,
    render: () => (
      <>
        <H2>How the bot works</H2>
        <P>
          The notetaker runs inside the same container as the app — a headless Chromium driven by Playwright,
          with PulseAudio capturing tab audio and ffmpeg writing the recording to disk.
        </P>
        <H3>Lifecycle</H3>
        <OL>
          <li>The scheduler polls calendars every 5 minutes.</li>
          <li>One minute before an auto-join meeting, Memos launches Chromium and joins the URL.</li>
          <li>Audio is captured to <Code>/data/recordings</Code> (persisted on a volume).</li>
          <li>When the meeting ends (or you click <b>Stop</b>), ffmpeg finalizes the file and the pipeline runs: transcribe → summarize → Notion sync.</li>
        </OL>
        <H3>Supported platforms</H3>
        <UL>
          <li>Google Meet — auto-join, guest or signed-in (see Bot sign-in)</li>
          <li>Zoom — web-client join, best-effort with the per-platform selectors</li>
          <li>Microsoft Teams — web-client join</li>
        </UL>
        <Note>
          The join selectors live in <Code>server/bot/platform-drivers.ts</Code>. Meet/Zoom/Teams change their
          DOM regularly; if joins start failing, that's the file to update.
        </Note>
      </>
    ),
  },
  {
    id: 'extension',
    label: 'Chrome extension',
    icon: ChromeIcon,
    render: () => (
      <>
        <H2>Chrome extension</H2>
        <P>
          The fastest way to record a meeting you're already in. One click on the Memos
          toolbar icon captures the current tab's audio (Google Meet, Zoom, or Teams) plus
          your microphone, uploads it to your instance, and generates a transcript + summary.
        </P>
        <P>
          No bot account. No OAuth. No signed-in session to manage. Works regardless of whether
          the meeting host allows guests, because the extension records what you can already hear.
        </P>

        <H3>Install</H3>
        <OL>
          <li>Open Memos → <b>Settings</b> → <b>Chrome extension</b>.</li>
          <li>Click <b>Download extension</b>. Unzip the file.</li>
          <li>In Chrome: open <Code>chrome://extensions</Code>.</li>
          <li>Toggle <b>Developer mode</b> on (top-right).</li>
          <li>Click <b>Load unpacked</b>, pick the unzipped folder.</li>
          <li>Pin the Memos icon in the toolbar so it's one click away.</li>
        </OL>

        <H3>Usage — record from your own browser</H3>
        <OL>
          <li>Open a Meet / Zoom / Teams meeting in Chrome.</li>
          <li>Click the Memos icon. Confirm or edit the title.</li>
          <li>Click <b>Start recording</b>. The icon badge goes red and a timer runs.</li>
          <li>When the meeting ends, click <b>Stop &amp; upload</b>. A toast confirms the upload.</li>
          <li>The recording appears in <b>My Feed</b> within ~30 seconds with transcript + summary.</li>
        </OL>

        <P>
          Tab-recording is the most reliable path for Workspace meetings the headless bot can't
          enter. If a scheduled meeting fails with a redirect or admission error, the meeting
          page shows a fallback CTA pointing here.
        </P>

        <H3>Bot session auto-sync</H3>
        <P>
          The popup also keeps the headless bot's Google session fresh. The first time you open
          the popup (and any time the saved session is older than 24 hours), the extension reads
          your current Google cookies via <Code>chrome.cookies.getAll</Code> and uploads them to
          your Memos server as Playwright <Code>storageState</Code>. No button to click — the
          status row at the bottom of the popup shows when the session was last refreshed.
        </P>

        <H3>How it authenticates</H3>
        <P>
          First time you open the popup, the extension checks for your Memos session cookie.
          If you're signed in on the web app, it silently mints a long-lived bearer token and
          stores it in Chrome sync storage. From then on, uploads go directly to your instance
          with that token — no cookie gymnastics.
        </P>

        <H3>Scope</H3>
        <UL>
          <li><b>Tab audio</b> — whatever the active tab is playing.</li>
          <li><b>Your microphone</b> — mixed in so your voice is captured.</li>
          <li>Both merged into one WebM/Opus stream, uploaded at stop.</li>
          <li>Max duration: 2 hours per recording.</li>
        </UL>

        <Note>
          The extension only records the tab that's active when you press Start. If you
          switch tabs during the call it keeps capturing the original Meet/Zoom/Teams tab.
          Closing that tab will end the recording early.
        </Note>

        <H3>When to use which</H3>
        <UL>
          <li><b>Extension</b> — you're at your laptop, in the meeting yourself. Preferred.</li>
          <li><b>Voice recorder</b> (in-app) — ad-hoc voice memos, phone calls on speaker, in-person conversations.</li>
          <li><b>Notetaker bot</b> — scheduled meetings where you want a bot to join without you present. (Requires bot sign-in for Meet.)</li>
        </UL>
      </>
    ),
  },
  {
    id: 'bot-signin',
    label: 'Bot sign-in (Google)',
    icon: Key,
    render: () => (
      <>
        <H2>Bot sign-in — joining Meet reliably</H2>
        <P>
          Google Meet has two participant models: <b>guest</b> and <b>signed-in</b>. Which one works depends on
          who hosts the meeting. Getting this right is the #1 cause of "bot can't join" issues.
        </P>

        <H3>Guest join (no setup)</H3>
        <P>
          Works for Workspace meetings where the admin has enabled <i>"Allow users to join who aren't signed in
          with a Google account"</i>. The bot navigates anonymously, types its name, and clicks <i>Ask to join</i>.
          Someone already in the call admits it. <b>Fails</b> for personal-Gmail-hosted meetings and many
          Workspace meetings (you'll see <Code>Meet redirected the bot to workspace.google.com</Code>).
        </P>

        <H3>Signed-in bot via Chrome extension auto-sync (recommended)</H3>
        <P>
          The Memos Chrome extension reads the Google cookies of whichever account is signed in to your
          browser and uploads them to your server as the bot's session. Auto-fires on every popup open if
          the saved session is missing or older than 24 hours — no button to click.
        </P>
        <OL>
          <li>Install the Memos extension (see <a href="#chrome-extension" className="text-primary hover:underline">Chrome extension</a> section).</li>
          <li>Sign into the Google account you want the bot to use in that Chrome profile. (For a single user, this can just be your own account.)</li>
          <li>Open the extension popup. The "Bot session" status row turns green. Done.</li>
        </OL>
        <P>
          The session auto-refreshes every time you open the popup (24h+ old triggers a silent re-upload),
          so cookies stay fresh without you remembering to do anything.
        </P>

        <H3>Dedicated Workspace bot account + auto-invite (most reliable)</H3>
        <P>
          For Workspace meetings the bot still gets kicked out of, run the bot under its own Workspace identity
          and have Memos add it as a guest on each meeting via the Calendar API. The bot then joins as a real
          signed-in attendee — no more <Code>workspace.google.com</Code> redirect.
        </P>
        <OL>
          <li>Create a dedicated Workspace user, e.g. <Code>memos-bot@yourdomain.com</Code> (one paid seat).</li>
          <li>In a separate Chrome profile signed into <Code>memos-bot@yourdomain.com</Code>, install the Memos extension and open the popup once. Auto-sync uploads the bot's cookies as the session.</li>
          <li>In Memos, go to <b>Settings → Recording &amp; bot</b> and put <Code>memos-bot@yourdomain.com</Code> in the <i>Bot Workspace email (auto-invite)</i> field.</li>
          <li>If you upgraded from a release before v0.1.11, <b>disconnect and reconnect</b> Google in <i>Settings → Calendar accounts</i> so Memos gets the new <Code>calendar.events</Code> scope.</li>
          <li>For each meeting the bot has trouble with, open the meeting page and flip <i>Invite Memos bot to this meeting</i>. On the next calendar sync (~1 minute), Memos patches the event to add the bot — using <Code>sendUpdates: 'none'</Code> so other attendees don't get email churn.</li>
        </OL>
        <P>
          Auto-invite is two-step opt-in: <b>nothing</b> happens until both an email is configured AND the
          per-meeting toggle is flipped. There's no "auto-invite everywhere" mode by design.
        </P>

        <H3>Manual session upload (fallback)</H3>
        <P>
          If you can't or don't want to use the extension, generate <Code>google.json</Code> with Playwright and
          upload it manually:
        </P>
        <Pre>{`npx playwright codegen --save-storage=google.json https://accounts.google.com
# sign in through the opened window, then:
curl -X POST https://your-memos-host/api/settings/bot-session/google \\
  -H 'Content-Type: application/json' \\
  --cookie 'memos.sid=YOUR_SESSION_COOKIE' \\
  --data @google.json`}</Pre>

        <H3>Removing / rotating the session</H3>
        <Pre>{`curl -X DELETE https://your-memos-host/api/settings/bot-session/google \\
  --cookie 'memos.sid=YOUR_SESSION_COOKIE'`}</Pre>
        <P>
          Google sessions typically last many months but can be invalidated if Google detects suspicious activity
          (e.g. a Linux server login from an unusual IP). If joins suddenly start failing with a sign-in error,
          open the extension popup once — the auto-sync will re-upload fresh cookies.
        </P>

        <H3>Tab-recording fallback (when no path works)</H3>
        <P>
          For meetings the headless bot can't get into no matter what (locked-down Workspace policies,
          lobby-only events, etc.), use the extension to record the tab from your own Chrome — see the
          Chrome extension page. The failed-meeting page also surfaces this CTA inline.
        </P>

        <Note>
          The bot session is <b>not OAuth</b> — it's a browser cookie jar. The auto-invite feature, in
          contrast, IS OAuth (Google Calendar API). The two paths are independent.
        </Note>
      </>
    ),
  },
  {
    id: 'branding',
    label: 'Branding & whitelabel',
    icon: Palette,
    render: (brand) => (
      <>
        <H2>Branding &amp; whitelabel</H2>
        <P>
          {brand.name} is env-driven for branding — no code changes or rebuilds needed. Set these in your
          <Code>.env</Code>, recreate the container, and the login screen, document title, colors, and logo
          all update.
        </P>
        <Pre>{`BRAND_NAME=Acme Notes
BRAND_SHORT=Acme
BRAND_TAGLINE=by Acme Corp
BRAND_PRIMARY_HSL=217 91% 60%
BRAND_ACCENT_HSL=262 83% 70%
BRAND_LOGO_URL=https://cdn.acme.com/logo.png
BRAND_FAVICON_URL=https://cdn.acme.com/favicon.ico
BRAND_PRODUCT_URL=https://acme.com
BRAND_SUPPORT_EMAIL=support@acme.com
BRAND_POWERED_BY=MelvinOS       # optional attribution
BRAND_HIDE_POWERED_BY=1         # 1 to hide the attribution footer`}</Pre>
        <P>
          Colors are HSL triplets without the hsl() wrapper. Use any HSL picker; the leading number is hue,
          then saturation%, then lightness%.
        </P>
      </>
    ),
  },
  {
    id: 'melvinos',
    label: 'Connect to MelvinOS',
    icon: Zap,
    render: () => (
      <>
        <H2>Connect Memos to MelvinOS</H2>
        <P>
          Memos is a MelvinOS companion product. A 3-step setup gives your MelvinOS agent
          three new skills: send a notetaker bot to a meeting, list recent meetings, and
          fetch the transcript / summary for any meeting by ID.
        </P>

        <H3>Step 1 — Generate a Memos API key</H3>
        <OL>
          <li>Open <Code>Settings → API &amp; webhooks</Code>.</li>
          <li>Type a name (e.g. <Code>MelvinOS</Code>) and click <b>Generate key</b>.</li>
          <li>Copy the <Code>mm_…</Code> token — it's only shown once.</li>
        </OL>

        <H3>Step 2 — Paste into MelvinOS</H3>
        <OL>
          <li>Open MelvinOS → <Code>Settings → Integrations</Code>.</li>
          <li>Find the <b>Melvin Memos</b> card and toggle it on.</li>
          <li>Fill in:
            <UL>
              <li><b>Base URL:</b> <Code>https://memos.c4saas.com</Code> (or your deployment URL)</li>
              <li><b>API Key:</b> paste the <Code>mm_…</Code> token</li>
            </UL>
          </li>
          <li>Click <b>Test connection</b>. You should see a green check.</li>
        </OL>

        <H3>Step 3 (optional) — Push events back to MelvinOS</H3>
        <P>
          Configure an outbound webhook in Memos so MelvinOS hears about meetings as they complete.
        </P>
        <OL>
          <li>In Memos, go to <Code>Settings → API &amp; webhooks → Outbound webhooks</Code>.</li>
          <li>Click <b>+ Add webhook</b>. Fill in:
            <UL>
              <li><b>Name:</b> <Code>MelvinOS</Code></li>
              <li><b>Endpoint URL:</b> <Code>https://melvin.c4saas.com/api/hooks/memos</Code> (the slug you chose in MelvinOS inbound webhooks)</li>
              <li><b>Signing secret:</b> matches the <Code>authSecret</Code> you set for that webhook in MelvinOS</li>
            </UL>
          </li>
          <li>Click <b>Save webhooks</b>.</li>
        </OL>

        <H3>What your MelvinOS agent can now do</H3>
        <UL>
          <li><Code>memos_send_bot</Code> — dispatch a notetaker bot to a Meet / Zoom / Teams URL</li>
          <li><Code>memos_list_recent</Code> — list meetings from the last N days</li>
          <li><Code>memos_get_transcript</Code> — pull a specific meeting's transcript + summary + action items</li>
        </UL>
        <Note>
          API keys are scoped to the account that created them. Revoke a key any time from
          the same page — any app using it stops working immediately.
        </Note>
      </>
    ),
  },
  {
    id: 'api',
    label: 'Integration API',
    icon: Key,
    render: () => (
      <>
        <H2>Integration API</H2>
        <P>
          {`Memos`} exposes a small REST API for other tools (e.g. MelvinOS) to schedule bots and pull meeting data.
          All endpoints require a <Code>Authorization: Bearer mm_…</Code> header.
        </P>
        <H3>Endpoints</H3>
        <UL>
          <li><Code>POST /api/v1/bots</Code> — send a notetaker to a URL right now</li>
          <li><Code>GET /api/v1/meetings/recent</Code> — list recent meetings with summaries</li>
          <li><Code>GET /api/v1/meetings/:id/transcript</Code> — full transcript + action items</li>
        </UL>
        <H3>Creating an API key</H3>
        <P>
          API keys are stored hashed (SHA-256) so they can't be recovered after creation. Generate one from
          Settings → API keys, copy it immediately, and store it in your vault.
        </P>
      </>
    ),
  },
  {
    id: 'release',
    label: 'Upgrades & releases',
    icon: Package,
    render: () => (
      <>
        <H2>Upgrades &amp; releases</H2>
        <P>
          Memos ships as a versioned Docker image at <Code>ghcr.io/c4saas/melvin-memos:VERSION</Code>.
          Customer and partner deployments pin a version in their compose file and pull on upgrade.
        </P>
        <Pre>{`# In your deployment's .env:
APP_VERSION=0.2.0

# Then:
docker compose pull
docker compose up -d`}</Pre>
        <P>
          Database migrations run automatically at container start. Downgrades are not supported.
        </P>
      </>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldCheck,
    render: () => (
      <>
        <H2>Security</H2>
        <UL>
          <li>Passwords hashed with bcrypt (cost 12).</li>
          <li>Sessions stored in Postgres (not memory), HTTP-only cookies, secure in production.</li>
          <li>Login rate-limited to 20 attempts per 15 minutes; setup limited to 10/hour.</li>
          <li>All OAuth tokens and API secrets encrypted at rest (AES-256-GCM) using the server <Code>ENCRYPTION_KEY</Code>.</li>
          <li>Meeting audio stored on a server-local volume; you control retention.</li>
        </UL>
        <Note>
          The <Code>ENCRYPTION_KEY</Code> must be stable and backed up. If it's lost, all encrypted secrets
          (Groq key, Notion token, OAuth tokens) become unrecoverable and you'll need to reconnect providers.
        </Note>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    icon: HelpCircle,
    render: () => (
      <>
        <H2>Troubleshooting</H2>
        <H3>Login says "invalid credentials" after setup</H3>
        <P>
          Usually means a prior deployment seeded a password via <Code>MEMOS_DEMO_PASSWORD</Code>. Remove that env
          var, clear <Code>password_hash</Code> for your user in the <Code>users</Code> table, and restart —
          the setup flow will re-trigger.
        </P>
        <H3>"Too many login attempts"</H3>
        <P>
          Rate-limited for 15 minutes. Restart the app container to clear the in-memory counter, or wait.
        </P>
        <H3>Bot fails to join a meeting</H3>
        <P>
          Check <Code>docker logs &lt;project&gt;_app</Code> for Playwright selector errors. Platforms
          (Meet/Zoom/Teams) update their DOM regularly; <Code>server/bot/platform-drivers.ts</Code> is where
          the selectors live.
        </P>
        <H3>Summaries are empty or weird</H3>
        <P>
          Confirm the Ollama model was actually pulled and that <Code>ollama</Code> is reachable from the app
          container. Switch to a larger model if summaries look shallow.
        </P>
      </>
    ),
  },
];

export default function DocsPage() {
  const brand = useBranding();
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  const pick = (id: string) => {
    setActive(id);
    setMobileOpen(false);
    // Scroll article back to top on section change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="md:flex md:h-full">
      {/* Mobile section picker */}
      <div className="md:hidden sticky z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-2.5 flex items-center gap-2" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="flex items-center gap-2 text-sm font-medium w-full justify-between px-3 py-2 rounded-md border border-border bg-input/60"
        >
          <span className="flex items-center gap-2 truncate">
            <current.icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{current.label}</span>
          </span>
          <span className="text-muted-foreground text-xs">{mobileOpen ? 'Close' : 'Sections'}</span>
        </button>
      </div>
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden fixed left-0 right-0 z-30 mx-4 surface-1 p-2 max-h-[70vh] overflow-y-auto animate-in fade-in-50 slide-in-from-top-2 duration-150" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 116px)' }}>
            <ul className="space-y-0.5">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => pick(s.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 rounded text-sm text-left transition-colors',
                      active === s.id
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <s.icon className="w-4 h-4 shrink-0" />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Desktop left nav */}
      <nav className="hidden md:block w-[220px] min-w-[220px] border-r border-border px-3 py-6 overflow-y-auto">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Docs</div>
        <ul className="space-y-0.5">
          {SECTIONS.map(s => (
            <li key={s.id}>
              <button
                onClick={() => setActive(s.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors',
                  active === s.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex-1 overflow-y-auto px-4 sm:px-10 py-6 sm:py-8 max-w-[820px] pb-32 md:pb-8">
        {current.render(brand)}
      </article>
    </div>
  );
}
