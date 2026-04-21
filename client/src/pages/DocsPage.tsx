import { useState } from 'react';
import {
  Rocket, Calendar, Cpu, Mic as MicIcon, FileText, Bot,
  Palette, Key, Package, ShieldCheck, HelpCircle,
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
              <li>Scopes: <Code>calendar.readonly</Code>, <Code>calendar.events.readonly</Code></li>
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
          <li>Go to Settings → Calendar accounts → <b>+ Google</b>, sign in, and grant read-only calendar access.</li>
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
          <li>Google Meet — auto-join, no login required for public links</li>
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
  const current = SECTIONS.find(s => s.id === active) ?? SECTIONS[0];

  return (
    <div className="flex h-full">
      <nav className="w-[220px] min-w-[220px] border-r border-border px-3 py-6 overflow-y-auto">
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
      <article className="flex-1 overflow-y-auto px-10 py-8 max-w-[820px]">
        {current.render(brand)}
      </article>
    </div>
  );
}
