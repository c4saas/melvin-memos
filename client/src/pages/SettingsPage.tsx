import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plug, Unplug, RefreshCw, Check, Bot, Upload, Trash2,
  Chrome as ChromeIcon, Download, Cpu, Mic as MicIcon, FileText,
  Calendar as CalendarIcon, Building2, Send, Brain, Cog, Zap, Shield, Menu, X,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { cn } from '../lib/utils';

type SectionId =
  | 'calendar' | 'recording' | 'ai' | 'transcription' | 'integrations'
  | 'email' | 'apps' | 'developer' | 'data' | 'account' | 'errors';

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  group: string;
  icon: typeof CalendarIcon;
}> = [
  { id: 'calendar',      label: 'Calendar accounts', group: 'Sources',      icon: CalendarIcon },
  { id: 'recording',     label: 'Recording & bot',   group: 'Sources',      icon: MicIcon },
  { id: 'ai',            label: 'AI & summaries',    group: 'Intelligence', icon: Brain },
  { id: 'transcription', label: 'Transcription',     group: 'Intelligence', icon: FileText },
  { id: 'integrations',  label: 'Integrations',      group: 'Connections',  icon: Zap },
  { id: 'email',         label: 'Email & digest',    group: 'Connections',  icon: Send },
  { id: 'developer',     label: 'API & webhooks',    group: 'Connections',  icon: Building2 },
  { id: 'apps',          label: 'Apps & extensions', group: 'Platform',     icon: ChromeIcon },
  { id: 'data',          label: 'Data & export',     group: 'Platform',     icon: Shield },
  { id: 'errors',        label: 'Error log',         group: 'Platform',     icon: AlertTriangle },
  { id: 'account',       label: 'Account',           group: 'Platform',     icon: Cog },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={'w-full bg-input border border-border rounded-md px-3 py-2 text-sm ' + (props.className ?? '')} />;
}

function ChromeExtensionSection() {
  const { data: info } = useQuery({ queryKey: ['extension'], queryFn: api.getExtensionInfo });
  return (
    <section className="os-panel p-6 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <ChromeIcon className="w-4 h-4" /> Chrome extension
        </h2>
        {info?.version && (
          <span className="os-badge os-badge-blue">v{info.version}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        One-click recording for meetings you're already in — Google Meet, Zoom web client,
        or Teams. Captures the tab's audio plus your mic, then uploads to your Memos instance
        for transcription and summary. No bot account, no OAuth.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <a href={info?.downloadUrl ?? '/extension.zip'} download>
          <Button variant="primary" size="md">
            <Download className="w-4 h-4" /> Download extension
          </Button>
        </a>
        <a
          href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked"
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="ghost" size="md">How to install</Button>
        </a>
      </div>

      <ol className="text-xs text-muted-foreground space-y-1.5 pl-5 list-decimal">
        <li>Click <b>Download extension</b> above, then unzip the file.</li>
        <li>Open <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-input/60 border border-border">chrome://extensions</code> in Chrome.</li>
        <li>Toggle <b>Developer mode</b> (top right), click <b>Load unpacked</b>, choose the unzipped folder.</li>
        <li>Pin the Memos icon. Open any Meet / Zoom / Teams tab and click it to record.</li>
      </ol>
    </section>
  );
}

function ApiKeysSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: keys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [name, setName] = useState('');
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null);

  const createMut = useMutation({
    mutationFn: () => api.createApiKey(name.trim() || 'Untitled key'),
    onSuccess: (r) => {
      setCreatedToken({ name: r.name, token: r.token });
      setName('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create key'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.info('Key revoked');
    },
  });

  const copyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      toast.success('Token copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <section className="os-panel p-6 mb-5">
      <h2 className="font-display font-semibold mb-2">API keys</h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Generate a key to connect MelvinOS, Zapier, or your own scripts to this Memos account.
        Keys are tied to your account and have access to all your meetings.
      </p>

      {/* Create */}
      <div className="flex gap-2 mb-5">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder='Name (e.g. "MelvinOS")'
          className="flex-1 bg-input/60 border border-border rounded-md px-3 py-2 text-sm"
        />
        <Button variant="primary" size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          {createMut.isPending ? 'Creating…' : 'Generate key'}
        </Button>
      </div>

      {/* One-time token reveal */}
      {createdToken && (
        <div className="os-panel p-4 mb-5 border-[hsl(142_71%_45%)]/40 bg-[hsl(142_71%_45%)]/5 animate-in fade-in-50 slide-in-from-top-1 duration-200">
          <div className="text-xs font-medium text-[hsl(142_71%_45%)] mb-1.5">
            ✓ Copy this token now — it won't be shown again
          </div>
          <div className="font-mono text-xs bg-background border border-border rounded px-3 py-2 break-all mb-2.5">
            {createdToken.token}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={copyToken}>Copy token</Button>
            <Button variant="ghost" size="sm" onClick={() => setCreatedToken(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* List */}
      {keys.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No keys yet.</div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-border bg-input/30">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{k.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {k.prefix}•••• · created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                if (confirm(`Revoke "${k.name}"? Any app using this key will stop working.`)) deleteMut.mutate(k.id);
              }}>
                <Trash2 className="w-3.5 h-3.5" /> Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WebhooksSection({
  form, set, save, saveMut, toast,
}: {
  form: any;
  set: (path: string[], value: any) => void;
  save: (section: string) => () => void;
  saveMut: { isPending: boolean };
  toast: ReturnType<typeof useToast>;
}) {
  const hooks: Array<any> = form.webhooks?.outbound ?? [];
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; status?: number; body?: string; error?: string } | 'pending'>>({});

  const addHook = () => {
    const next = [
      ...hooks,
      {
        id: `wh_${Date.now()}`,
        name: 'MelvinOS',
        url: '',
        secret: '',
        events: ['meeting.completed'],
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ];
    set(['webhooks', 'outbound'], next);
  };

  const updateHook = (index: number, patch: Record<string, any>) => {
    const next = hooks.map((h, i) => i === index ? { ...h, ...patch } : h);
    set(['webhooks', 'outbound'], next);
  };

  const removeHook = (index: number) => {
    const next = hooks.filter((_, i) => i !== index);
    set(['webhooks', 'outbound'], next);
  };

  return (
    <section className="os-panel p-6">
      <h2 className="font-display font-semibold mb-2">Outbound webhooks</h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Notify another system (like MelvinOS) whenever a meeting finishes processing.
        Memos signs every request with <code className="font-mono text-[11px] px-1.5 py-0.5 bg-input/60 border border-border rounded">HMAC-SHA256</code> using your shared secret.
      </p>

      {hooks.length === 0 && (
        <div className="text-xs text-muted-foreground italic mb-4">
          No webhooks configured.
        </div>
      )}

      <div className="space-y-3 mb-4">
        {hooks.map((hook: any, i: number) => (
          <div key={hook.id ?? i} className="p-4 rounded-lg border border-border bg-input/30 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={hook.name ?? ''}
                onChange={e => updateHook(i, { name: e.target.value })}
                placeholder="Name"
                className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 text-sm font-medium"
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={hook.enabled !== false}
                  onChange={e => updateHook(i, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <Button variant="ghost" size="sm" onClick={() => removeHook(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Endpoint URL</div>
              <input
                type="text"
                value={hook.url ?? ''}
                onChange={e => updateHook(i, { url: e.target.value })}
                placeholder="https://melvinos.c4saas.com/api/hooks/memos"
                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm font-mono"
              />
            </div>

            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Signing secret {hook.secret && typeof hook.secret === 'string' && hook.secret.includes('••••') && <span className="normal-case tracking-normal text-muted-foreground/80">· (saved)</span>}
              </div>
              <input
                type="password"
                value={hook.secret && hook.secret.includes('••••') ? '' : (hook.secret ?? '')}
                onChange={e => updateHook(i, { secret: e.target.value })}
                placeholder={hook.secret && hook.secret.includes('••••') ? '•••••••• (keep as-is)' : 'Shared with the receiving system'}
                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm font-mono"
              />
            </div>

            <div className="text-[11px] text-muted-foreground">
              Events: <code className="font-mono">meeting.completed</code>, <code className="font-mono">meeting.failed</code>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={!hook.url || testResults[hook.id] === 'pending'}
                onClick={async () => {
                  setTestResults(r => ({ ...r, [hook.id]: 'pending' }));
                  try {
                    const result = await api.testWebhook(hook.id);
                    setTestResults(r => ({ ...r, [hook.id]: result }));
                  } catch (err: any) {
                    setTestResults(r => ({ ...r, [hook.id]: { ok: false, error: err?.message ?? 'Request failed' } }));
                  }
                }}
              >
                <Send className="w-3 h-3" />
                {testResults[hook.id] === 'pending' ? 'Sending…' : 'Send test payload'}
              </Button>
              {testResults[hook.id] && testResults[hook.id] !== 'pending' && (() => {
                const r = testResults[hook.id] as { ok: boolean; status?: number; error?: string };
                return (
                  <span className={`text-[11px] font-mono ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.ok ? `✓ ${r.status} OK` : `✗ ${r.status ? `${r.status} ` : ''}${r.error ?? 'failed'}`}
                  </span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={addHook}>
          + Add webhook
        </Button>
        <Button variant="primary" size="sm" onClick={save('webhooks')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save webhooks
        </Button>
      </div>

      <div className="mt-5 pt-5 border-t border-border text-[11px] text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">Payload format</div>
        <pre className="font-mono bg-input/40 border border-border rounded p-2.5 text-[10px] overflow-x-auto">{`{
  "event": "meeting.completed",
  "timestamp": "2026-04-23T...",
  "meeting": {
    "id": "uuid", "title": "...", "platform": "google_meet",
    "startAt": "...", "durationSeconds": 1234,
    "summary": "...", "actionItems": [...], "tags": [...],
    "url": "https://memos.c4saas.com/meetings/..."
  }
}`}</pre>
        <div>Headers: <code className="font-mono">X-Memos-Event</code>, <code className="font-mono">X-Memos-Signature: sha256=&lt;hex&gt;</code>, <code className="font-mono">X-Memos-Delivery</code></div>
      </div>
    </section>
  );
}

function ExportSection() {
  const { data } = useQuery({ queryKey: ['export-count'], queryFn: api.exportCount });
  const count = data?.count ?? 0;
  return (
    <section className="os-panel p-6 mb-5">
      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
        <Download className="w-4 h-4" /> Export everything
      </h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Download every meeting as a ZIP of markdown files — one per memo, with an INDEX.md.
        Good for backups or handoff to another tool.
      </p>
      <a href="/api/export/zip" download className="inline-block">
        <Button variant="primary" size="md">
          <Download className="w-4 h-4" />
          Download ZIP{count > 0 ? ` · ${count} meeting${count === 1 ? '' : 's'}` : ''}
        </Button>
      </a>
    </section>
  );
}

function ErrorLogSection() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['errors'],
    queryFn: () => api.listErrors(),
    refetchInterval: 15_000,
  });
  const errors = data?.errors ?? [];

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
    } catch { return iso; }
  };

  const kindLabel = (k: string) => {
    if (k === 'bot.join') return 'Bot join';
    if (k.startsWith('summarizer.')) return `Summary (${k.split('.')[1]})`;
    if (k === 'pipeline') return 'Pipeline';
    return k;
  };

  return (
    <section className="os-panel p-6 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Error log
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['errors'] }); }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Recent server-side failures — bot join attempts, summarizer errors, pipeline crashes. Newest first; auto-refreshes every 15 seconds.
      </p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : errors.length === 0 ? (
        <div className="text-sm text-muted-foreground">No errors recorded — quiet skies.</div>
      ) : (
        <ul className="space-y-2">
          {errors.map((e: any) => (
            <li key={e.id} className="border border-border rounded-md p-3 text-sm">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium">{kindLabel(e.kind)}</span>
                <span className="text-xs text-muted-foreground">{fmtTime(e.createdAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground break-words mb-1">{e.message}</div>
              {e.meetingId && (
                <a className="text-xs text-primary hover:underline" href={`/meetings/${e.meetingId}`}>
                  View meeting →
                </a>
              )}
              {e.context && Object.keys(e.context).length > 0 && (
                <details className="mt-1.5">
                  <summary className="text-xs text-muted-foreground cursor-pointer">context</summary>
                  <pre className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{JSON.stringify(e.context, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BotSessionSection({ settings, toast, qc }: { settings: any; toast: ReturnType<typeof useToast>; qc: ReturnType<typeof useQueryClient> }) {
  const session = settings.platform?.googleBotSession;
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = useMutation({
    mutationFn: (storageState: object) => api.uploadGoogleBotSession(storageState),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Bot session uploaded · ${r.cookies} cookies`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Upload failed'),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteGoogleBotSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.info('Bot session removed');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  });

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.cookies)) {
        toast.error('File is not a valid Playwright storageState JSON');
        return;
      }
      uploadMut.mutate(parsed);
    } catch {
      toast.error('Could not parse JSON file');
    }
  };

  return (
    <section className="surface-1 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Bot className="w-4 h-4" /> Bot sign-in (Google)
        </h2>
        {session?.present ? (
          <span className="text-xs px-2 py-0.5 rounded-full border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
            Active
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            Guest mode
          </span>
        )}
      </div>

      <div className="text-sm text-muted-foreground mb-3 leading-relaxed">
        {session?.present ? (
          <>
            Signed-in bot session is active — uploaded{' '}
            {session.uploadedAt ? new Date(session.uploadedAt).toLocaleString() : 'recently'}. The bot will
            use this session to join Meet rooms that require participants to be signed in.{' '}
            The Memos Chrome extension auto-refreshes this every time you open the popup; no manual action needed.
          </>
        ) : (
          <>
            No signed-in session — the bot joins as a guest, which only works for Workspace meetings where
            guests are allowed. Personal-Gmail-hosted meetings will reject the bot.{' '}
            <strong>Easiest fix:</strong> install the Memos Chrome extension and just open the popup once —
            it auto-uploads your Google cookies on first open. No clicks needed.
            Or upload a session JSON file manually below.
          </>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-3 p-3 rounded-md bg-background/40 border border-border">
        <strong>Fallback:</strong> if the bot still can't get into a meeting (e.g. lobby-only events,
        unusual Workspace policies), open the meeting tab in your own Chrome and use the extension's{' '}
        <em>● Start recording</em> button. It captures the tab audio from <em>your</em> session and uploads
        the same way. No bot session involved.
      </div>

      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
          <Upload className="w-3.5 h-3.5" /> {session?.present ? 'Replace session' : 'Upload session JSON'}
        </Button>
        {session?.present && (
          <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </Button>
        )}
      </div>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

function OutlookMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
      <path fill="#0364B8" d="M28 13h14v22a2 2 0 0 1-2 2H28V13z"/>
      <path fill="#0078D4" d="M28 13h14v11H28z"/>
      <path fill="#28A8EA" d="M6 11h22v26H6z"/>
      <path fill="#0358A7" d="M28 24h14v11H28z"/>
      <path fill="#fff" d="M17 16.5c-3.6 0-6.5 3.4-6.5 7.5s2.9 7.5 6.5 7.5 6.5-3.4 6.5-7.5-2.9-7.5-6.5-7.5zm0 12c-2.2 0-4-2-4-4.5s1.8-4.5 4-4.5 4 2 4 4.5-1.8 4.5-4 4.5z"/>
    </svg>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: calendars = [] } = useQuery({ queryKey: ['calendars'], queryFn: api.listCalendars });

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const saveMut = useMutation({
    mutationFn: (body: any) => api.saveSettings(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    },
  });

  const syncMut = useMutation({
    mutationFn: api.syncCalendars,
    onSuccess: (r) => {
      if (!r) return toast.success('Calendars synced');
      if (r.accounts === 0) return toast.info('No calendars connected yet');
      if (r.synced > 0) return toast.success(`Synced ${r.synced} new meeting${r.synced === 1 ? '' : 's'}`);
      if (r.eventsWithLinks > 0) return toast.info(`${r.eventsWithLinks} meeting${r.eventsWithLinks === 1 ? '' : 's'} already up to date`);
      return toast.info('No upcoming meetings with video links in the next 14 days');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Sync failed'),
  });
  const removeCalMut = useMutation({
    mutationFn: (id: string) => api.deleteCalendar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendars'] });
      toast.info('Calendar disconnected');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to disconnect'),
  });

  const set = (path: string[], value: any) => {
    const copy = structuredClone(form);
    let cur = copy;
    for (let i = 0; i < path.length - 1; i++) { cur[path[i]] = cur[path[i]] ?? {}; cur = cur[path[i]]; }
    cur[path[path.length - 1]] = value;
    setForm(copy);
  };

  const save = (section: string) => () => saveMut.mutate({ [section]: form[section] });

  // ------- Section nav (defined before any early return so hook order is stable) -------
  const [active, setActive] = useState<SectionId>('calendar');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      const s = new URLSearchParams(window.location.search).get('section') as SectionId | null;
      if (s && SECTIONS.some(x => x.id === s)) setActive(s);
    } catch {}
  }, []);

  if (!settings) return <div className="px-8 py-7 text-muted-foreground">Loading…</div>;

  const restartTour = () => {
    try { localStorage.removeItem('memos.tour.completed'); } catch {}
    window.dispatchEvent(new Event('memos:start-tour'));
  };

  // Group sections by group for the nav rail
  const navGroups = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});
  const activeMeta = SECTIONS.find(s => s.id === active)!;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-7 max-w-[1200px] mx-auto pb-32 md:pb-8">
      {/* Page header */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure integrations, providers, and account preferences.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={restartTour}>Restart tour</Button>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start">
        {/* Desktop nav rail */}
        <nav className="hidden md:block w-[240px] shrink-0 sticky top-4">
          <SectionNav
            groups={navGroups}
            active={active}
            onSelect={setActive}
          />
        </nav>

        {/* Mobile section switcher (collapsible) */}
        <div className="md:hidden w-full mb-4">
          <button
            onClick={() => setMobileNavOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-input/40"
          >
            <span className="inline-flex items-center gap-2 font-medium text-sm">
              <activeMeta.icon className="w-4 h-4 text-primary" />
              {activeMeta.label}
            </span>
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {mobileNavOpen && (
            <div className="mt-2 animate-in fade-in-50 slide-in-from-top-1 duration-150">
              <SectionNav
                groups={navGroups}
                active={active}
                onSelect={(id) => { setActive(id); setMobileNavOpen(false); }}
              />
            </div>
          )}
        </div>

        {/* Content pane */}
        <div className="flex-1 min-w-0 space-y-5">
          {active === 'calendar' && (
            <CalendarAccountsSection
              calendars={calendars}
              syncMut={syncMut}
              removeCalMut={removeCalMut}
              settings={settings}
            />
          )}

          {active === 'recording' && (
            <>
              <section className="os-panel p-6">
                <h2 className="font-display font-semibold mb-2">Bot</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  How the Memos notetaker behaves when joining your meetings.
                </p>
                <Field label="Default bot name"><Input value={form.bot?.defaultName ?? ''} onChange={e => set(['bot', 'defaultName'], e.target.value)} /></Field>
                <Field label="Max meeting duration (minutes)"><Input type="number" value={form.bot?.maxDurationMinutes ?? 180} onChange={e => set(['bot', 'maxDurationMinutes'], Number(e.target.value))} /></Field>
                <Field
                  label="Bot Workspace email (auto-invite)"
                  hint="Optional. The email of a dedicated Workspace account you've set up for the bot (e.g. memos-bot@yourdomain.com). When set, you can flip 'Invite Memos bot' on individual meetings — the calendar poller will add this email as an attendee, so the bot joins as a real signed-in participant. Leave empty to disable auto-invite entirely."
                >
                  <Input
                    type="email"
                    placeholder="memos-bot@yourdomain.com"
                    value={form.bot?.assistantEmail ?? ''}
                    onChange={e => set(['bot', 'assistantEmail'], e.target.value || null)}
                  />
                </Field>
                <Button variant="primary" size="sm" onClick={save('bot')}><Check className="w-3.5 h-3.5" /> Save</Button>
              </section>
              <BotSessionSection settings={settings} toast={toast} qc={qc} />
            </>
          )}

          {active === 'ai' && (
            <section className="os-panel p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold">Ollama (summaries)</h2>
                <span className={cn('os-badge', /ollama\.com/i.test(form.providers?.ollama?.baseUrl ?? '') ? 'os-badge-purple' : 'os-badge-gray')}>
                  {/ollama\.com/i.test(form.providers?.ollama?.baseUrl ?? '') ? 'Cloud' : 'Local'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                The model that writes your meeting summaries, extracts action items, and powers
                semantic search.
              </p>
              <Field label="Base URL" hint="Local: http://ollama:11434 · Cloud: https://ollama.com">
                <Input value={form.providers?.ollama?.baseUrl ?? ''} onChange={e => set(['providers', 'ollama', 'baseUrl'], e.target.value)} />
              </Field>
              <Field label="API key" hint={form.providers?.ollama?.apiKey ? 'A key is saved. Enter a new one to replace it.' : 'Required only for Ollama Cloud. Leave blank when running locally.'}>
                <Input
                  type="password"
                  placeholder={form.providers?.ollama?.apiKey ? '••••••••  (saved)' : 'paste your key'}
                  onChange={e => set(['providers', 'ollama', 'apiKey'], e.target.value)}
                />
              </Field>
              <Field label="Summary model" hint="Local: llama3.1:8b, qwen2.5:7b · Cloud: gpt-oss:120b-cloud, qwen3-coder:480b-cloud, llama3.1:70b">
                <Input value={form.providers?.ollama?.summaryModel ?? ''} onChange={e => set(['providers', 'ollama', 'summaryModel'], e.target.value)} />
              </Field>
              <div className="flex items-center gap-3">
                <Button variant="primary" size="sm" onClick={save('providers')} disabled={saveMut.isPending}>
                  <Check className="w-3.5 h-3.5" /> Save
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Get a key at <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">ollama.com/settings/keys</a>.
                </span>
              </div>
            </section>
          )}

          {active === 'transcription' && (
            <section className="os-panel p-6">
              <h2 className="font-display font-semibold mb-2">Groq (Whisper transcription)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Groq's Whisper endpoint powers fast, accurate transcription of every recording.
              </p>
              <Field label="API Key" hint="Create one at console.groq.com">
                <Input type="password" placeholder={form.providers?.groq?.apiKey ? '••••••••  (saved)' : 'gsk_...'} onChange={e => set(['providers', 'groq', 'apiKey'], e.target.value)} />
              </Field>
              <Field label="Whisper model">
                <Input value={form.providers?.groq?.whisperModel ?? ''} onChange={e => set(['providers', 'groq', 'whisperModel'], e.target.value)} />
              </Field>
              <Button variant="primary" size="sm" onClick={save('providers')} disabled={saveMut.isPending}>
                <Check className="w-3.5 h-3.5" /> Save
              </Button>
            </section>
          )}

          {active === 'integrations' && (
            <>
              <section className="os-panel p-6">
                <h2 className="font-display font-semibold mb-2">Notion</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Sync every meeting summary to a Notion database.
                </p>
                <Field label="Integration Token" hint="Secret from notion.so/my-integrations">
                  <Input type="password" placeholder={form.integrations?.notion?.apiKey ? '••••••••  (saved)' : 'secret_...'} onChange={e => set(['integrations', 'notion', 'apiKey'], e.target.value)} />
                </Field>
                <Field label="Meetings Database ID" hint="Auto-populated when you provision from a parent page below">
                  <Input value={form.integrations?.notion?.meetingsDatabaseId ?? ''} onChange={e => set(['integrations', 'notion', 'meetingsDatabaseId'], e.target.value)} />
                </Field>
                <Button variant="primary" size="sm" onClick={save('integrations')} disabled={saveMut.isPending}>
                  <Check className="w-3.5 h-3.5" /> Save
                </Button>
                <div className="mt-5 pt-5 border-t border-border">
                  <div className="text-xs text-muted-foreground mb-2">Provision a new meetings database in Notion</div>
                  <div className="flex gap-2">
                    <Input id="notion-parent" placeholder="Parent Page ID (32 chars)" />
                    <Button variant="secondary" size="sm" onClick={async () => {
                      const parentId = (document.getElementById('notion-parent') as HTMLInputElement).value;
                      if (!parentId) return;
                      try {
                        const r = await api.provisionNotionDb(parentId, 'Memos Meetings');
                        toast.success('Database created · ' + r.databaseId.slice(0, 8));
                        qc.invalidateQueries({ queryKey: ['settings'] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed to provision database');
                      }
                    }}>
                      Provision
                    </Button>
                  </div>
                </div>
              </section>

              <LinearSection form={form} set={set} save={save} saveMut={saveMut} toast={toast} />

              {!settings.platform?.googleOAuth?.managed && (
                <section className="os-panel p-6">
                  <h2 className="font-display font-semibold mb-2">Google Calendar OAuth</h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    Advanced: override the platform-provided OAuth credentials with your own.
                  </p>
                  <Field label="Client ID"><Input placeholder={form.integrations?.googleOAuth?.clientId ?? ''} onChange={e => set(['integrations', 'googleOAuth', 'clientId'], e.target.value)} /></Field>
                  <Field label="Client Secret"><Input type="password" placeholder={form.integrations?.googleOAuth?.clientSecret ? '••••••••  (saved)' : ''} onChange={e => set(['integrations', 'googleOAuth', 'clientSecret'], e.target.value)} /></Field>
                  <Button variant="primary" size="sm" onClick={save('integrations')}><Check className="w-3.5 h-3.5" /> Save</Button>
                </section>
              )}

              <section className="os-panel p-6">
                <h2 className="font-display font-semibold mb-2">Microsoft / Outlook OAuth</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Override the platform-provided Microsoft credentials.
                </p>
                <Field label="Client ID"><Input placeholder={form.integrations?.microsoftOAuth?.clientId ?? ''} onChange={e => set(['integrations', 'microsoftOAuth', 'clientId'], e.target.value)} /></Field>
                <Field label="Client Secret"><Input type="password" placeholder={form.integrations?.microsoftOAuth?.clientSecret ? '••••••••  (saved)' : ''} onChange={e => set(['integrations', 'microsoftOAuth', 'clientSecret'], e.target.value)} /></Field>
                <Field label="Tenant ID"><Input value={form.integrations?.microsoftOAuth?.tenantId ?? ''} onChange={e => set(['integrations', 'microsoftOAuth', 'tenantId'], e.target.value)} /></Field>
                <Button variant="primary" size="sm" onClick={save('integrations')}><Check className="w-3.5 h-3.5" /> Save</Button>
              </section>
            </>
          )}

          {active === 'email' && (
            <DigestSection form={form} set={set} save={save} saveMut={saveMut} toast={toast} />
          )}

          {active === 'developer' && (
            <>
              <ApiKeysSection />
              <WebhooksSection form={form} set={set} save={save} saveMut={saveMut} toast={toast} />
            </>
          )}

          {active === 'apps' && (
            <>
              <ChromeExtensionSection />
            </>
          )}

          {active === 'data' && (
            <ExportSection />
          )}

          {active === 'errors' && (
            <ErrorLogSection />
          )}

          {active === 'account' && (
            <section className="os-panel p-6">
              <h2 className="font-display font-semibold mb-2">MelvinOS Integration</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect Memos back to MelvinOS so agents can send notetakers and read transcripts via API.
              </p>
              <Field label="MelvinOS base URL" hint="e.g. http://melvinos_app:3001"><Input value={form.melvinos?.baseUrl ?? ''} onChange={e => set(['melvinos', 'baseUrl'], e.target.value)} /></Field>
              <Field label="Shared webhook secret"><Input type="password" placeholder={form.melvinos?.webhookSecret ? '••••••••  (saved)' : ''} onChange={e => set(['melvinos', 'webhookSecret'], e.target.value)} /></Field>
              <Button variant="primary" size="sm" onClick={save('melvinos')}><Check className="w-3.5 h-3.5" /> Save</Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionNav({
  groups, active, onSelect,
}: {
  groups: Record<string, Array<{ id: any; label: string; icon: typeof CalendarIcon }>>;
  active: string;
  onSelect: (id: any) => void;
}) {
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-2.5 mb-2">
            {group}
          </div>
          <ul className="space-y-0.5">
            {items.map(item => {
              const isActive = item.id === active;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium shadow-[inset_2px_0_0_hsl(var(--primary))]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 hover:translate-x-0.5',
                    )}
                  >
                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CalendarAccountsSection({
  calendars, syncMut, removeCalMut, settings,
}: {
  calendars: any[];
  syncMut: { mutate: () => void; isPending: boolean };
  removeCalMut: { mutate: (id: string) => void };
  settings: any;
}) {
  return (
    <section className="os-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Plug className="w-4 h-4" /> Calendar accounts
          {calendars.length > 0 && (
            <span className="text-xs font-sans font-normal text-muted-foreground">
              {calendars.length} connected
            </span>
          )}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          <RefreshCw className={'w-3.5 h-3.5 ' + (syncMut.isPending ? 'animate-spin' : '')} /> Sync now
        </Button>
      </div>

      {calendars.length > 0 && (
        <div className="space-y-2 mb-5">
          {calendars.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-border bg-input/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                {c.provider === 'google' ? <GoogleMark /> : <OutlookMark />}
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{c.accountEmail}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="capitalize">{c.provider}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className={cn('os-badge', c.status === 'connected' ? 'os-badge-green' : 'os-badge-amber')}>
                      {c.status}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>auto-join {c.autoJoin ? 'on' : 'off'}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeCalMut.mutate(c.id)}>
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </Button>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          {calendars.length === 0 ? 'Connect a calendar' : 'Add another account'}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/calendar/google/start">
            <Button variant="primary" size="md">
              <GoogleMark /> {calendars.length === 0 ? 'Sign in with Google' : '+ Google account'}
            </Button>
          </a>
          <a href="/api/calendar/microsoft/start">
            <Button variant="secondary" size="md">
              <OutlookMark /> {calendars.length === 0 ? 'Microsoft / Outlook' : '+ Microsoft account'}
            </Button>
          </a>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Connect multiple accounts to pull meetings from work and personal calendars into the same feed.
          Read-only — Memos only sees upcoming events.
        </div>
      </div>
    </section>
  );
}

function LinearSection({
  form, set, save, saveMut, toast,
}: {
  form: any;
  set: (path: string[], value: any) => void;
  save: (section: string) => () => void;
  saveMut: { isPending: boolean };
  toast: ReturnType<typeof useToast>;
}) {
  const [teams, setTeams] = useState<Array<{ id: string; name: string; key: string }>>([]);
  const [testing, setTesting] = useState(false);
  const apiKey = form.integrations?.linear?.apiKey;
  const teamId = form.integrations?.linear?.teamId;

  const testConnection = async () => {
    setTesting(true);
    try {
      const r = await api.linearTeams();
      setTeams(r.teams);
      toast.success(`Connected — ${r.teams.length} team${r.teams.length === 1 ? '' : 's'} available`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Linear connection failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="os-panel p-6 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold">Linear integration</h2>
        <span className={cn('os-badge', apiKey && teamId ? 'os-badge-purple' : 'os-badge-gray')}>
          {apiKey && teamId ? 'Connected' : 'Off'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Push any action item from a Memos meeting straight into Linear as an issue. The
        issue links back to the meeting for full context.
      </p>
      <Field label="Linear API key" hint="Create one at linear.app/settings/api">
        <Input type="password" placeholder={apiKey ?? 'lin_api_...'} onChange={e => set(['integrations', 'linear', 'apiKey'], e.target.value)} />
      </Field>
      <Field label="Default team ID" hint="Click Test connection below to see your team IDs.">
        <Input value={teamId ?? ''} onChange={e => set(['integrations', 'linear', 'teamId'], e.target.value)} placeholder="team_..." />
      </Field>

      {teams.length > 0 && (
        <div className="mb-4 text-xs">
          <div className="text-muted-foreground mb-1.5">Your teams:</div>
          <div className="flex flex-wrap gap-1.5">
            {teams.map(t => (
              <button
                key={t.id}
                onClick={() => set(['integrations', 'linear', 'teamId'], t.id)}
                className={cn(
                  'os-badge',
                  teamId === t.id ? 'os-badge-purple' : 'os-badge-gray',
                  'hover:opacity-80',
                )}
              >
                {t.key} · {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={save('integrations')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save
        </Button>
        <Button variant="ghost" size="sm" onClick={testConnection} disabled={testing || !apiKey}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
      </div>
    </section>
  );
}

function DigestSection({
  form, set, save, saveMut, toast,
}: {
  form: any;
  set: (path: string[], value: any) => void;
  save: (section: string) => () => void;
  saveMut: { isPending: boolean };
  toast: ReturnType<typeof useToast>;
}) {
  const [sendingNow, setSendingNow] = useState(false);

  const sendNow = async () => {
    setSendingNow(true);
    try {
      const freq = (form.digest?.frequency ?? 'daily') as 'daily' | 'weekly';
      const r = await api.sendDigestNow(freq);
      if (r.sent) toast.success(`${freq === 'daily' ? 'Daily' : 'Weekly'} digest sent`);
      else toast.error(r.reason ?? 'Could not send');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSendingNow(false);
    }
  };

  const digestEnabled = Boolean(form.digest?.enabled);
  const smtpConfigured = Boolean(form.email?.smtpHost && form.email?.smtpUser);

  return (
    <section className="os-panel p-6 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold">Email &amp; digest</h2>
        <span className={cn('os-badge', digestEnabled && smtpConfigured ? 'os-badge-green' : 'os-badge-gray')}>
          {digestEnabled && smtpConfigured ? 'Active' : 'Off'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Get an emailed recap of your meetings and open action items — daily or weekly.
        Great for starting the day with a single, scannable inbox.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <Field label="SMTP host" hint="e.g. smtp.gmail.com">
          <Input value={form.email?.smtpHost ?? ''} onChange={e => set(['email', 'smtpHost'], e.target.value)} placeholder="smtp.gmail.com" />
        </Field>
        <Field label="Port">
          <Input type="number" value={form.email?.smtpPort ?? 587} onChange={e => set(['email', 'smtpPort'], Number(e.target.value))} />
        </Field>
        <Field label="SMTP username">
          <Input value={form.email?.smtpUser ?? ''} onChange={e => set(['email', 'smtpUser'], e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="SMTP password" hint="Gmail: create an app password">
          <Input type="password" placeholder={form.email?.smtpPassword ?? ''} onChange={e => set(['email', 'smtpPassword'], e.target.value)} />
        </Field>
      </div>
      <Field label="From address" hint='e.g. "Memos <noreply@melvinos.com>"'>
        <Input value={form.email?.fromAddress ?? ''} onChange={e => set(['email', 'fromAddress'], e.target.value)} />
      </Field>
      <label className="checkbox inline-flex items-center gap-2 text-xs text-muted-foreground mb-4">
        <input
          type="checkbox"
          checked={Boolean(form.email?.smtpSecure)}
          onChange={e => set(['email', 'smtpSecure'], e.target.checked)}
        />
        Use SSL (port 465) — uncheck for STARTTLS on 587
      </label>

      <div className="flex items-center gap-2 mb-5">
        <Button variant="primary" size="sm" onClick={save('email')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save SMTP
        </Button>
      </div>

      <div className="border-t border-border/60 pt-5">
        <label className="checkbox inline-flex items-center gap-2 text-sm mb-3">
          <input
            type="checkbox"
            checked={digestEnabled}
            onChange={e => set(['digest', 'enabled'], e.target.checked)}
          />
          <span>Send me a digest email</span>
        </label>

        {digestEnabled && (
          <div className="space-y-3 pl-6 border-l border-border/50">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Frequency">
                <select
                  value={form.digest?.frequency ?? 'daily'}
                  onChange={e => set(['digest', 'frequency'], e.target.value)}
                  className="w-full bg-input/60 border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </Field>
              <Field label="Send at (hour)">
                <Input type="number" min={0} max={23} value={form.digest?.hourOfDay ?? 8} onChange={e => set(['digest', 'hourOfDay'], Number(e.target.value))} />
              </Field>
              {form.digest?.frequency === 'weekly' && (
                <Field label="Day of week (0=Sun)">
                  <Input type="number" min={0} max={6} value={form.digest?.dayOfWeek ?? 1} onChange={e => set(['digest', 'dayOfWeek'], Number(e.target.value))} />
                </Field>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Button variant="primary" size="sm" onClick={save('digest')} disabled={saveMut.isPending}>
            <Check className="w-3.5 h-3.5" /> Save digest
          </Button>
          <Button variant="ghost" size="sm" onClick={sendNow} disabled={sendingNow || !smtpConfigured}>
            {sendingNow ? 'Sending…' : 'Send preview now'}
          </Button>
        </div>
        {!smtpConfigured && (
          <div className="text-[11px] text-muted-foreground mt-2">
            Configure SMTP above to enable sending.
          </div>
        )}
      </div>
    </section>
  );
}
