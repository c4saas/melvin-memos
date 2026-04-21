import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Unplug, RefreshCw, Check } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';

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
    onSuccess: (r) => toast.success(`Calendars synced${r?.synced != null ? ` · ${r.synced} new meetings` : ''}`),
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

  if (!settings) return <div className="px-8 py-7 text-muted-foreground">Loading…</div>;

  return (
    <div className="px-8 py-7 max-w-[900px] mx-auto">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure providers, calendars, and integrations.</p>
      </header>

      <section className="surface-1 p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold flex items-center gap-2"><Plug className="w-4 h-4" /> Calendar accounts</h2>
          <Button variant="ghost" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={'w-3.5 h-3.5 ' + (syncMut.isPending ? 'animate-spin' : '')} /> Sync now
          </Button>
        </div>

        {calendars.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-3 mb-2">
            No calendars connected yet. Connect one below to auto-join meetings.
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-1">
          <a href="/api/calendar/google/start">
            <Button variant="primary" size="md">
              <GoogleMark /> Sign in with Google
            </Button>
          </a>
          <a href="/api/calendar/microsoft/start">
            <Button variant="secondary" size="md">+ Microsoft / Outlook</Button>
          </a>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Read-only access to your calendar. Used only to detect upcoming meetings.
        </div>
        {calendars.map(c => (
          <div key={c.id} className="flex items-center justify-between py-3 border-t border-border first:border-t-0">
            <div>
              <div className="font-medium text-sm">{c.accountEmail}</div>
              <div className="text-xs text-muted-foreground">{c.provider} · auto-join {c.autoJoin ? 'on' : 'off'}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeCalMut.mutate(c.id)}>
              <Unplug className="w-3.5 h-3.5" /> Disconnect
            </Button>
          </div>
        ))}
      </section>

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Ollama (summaries)</h2>
        <Field label="Base URL">
          <Input value={form.providers?.ollama?.baseUrl ?? ''} onChange={e => set(['providers', 'ollama', 'baseUrl'], e.target.value)} />
        </Field>
        <Field label="Summary model" hint="e.g. llama3.1:8b, qwen2.5:7b, phi4:14b">
          <Input value={form.providers?.ollama?.summaryModel ?? ''} onChange={e => set(['providers', 'ollama', 'summaryModel'], e.target.value)} />
        </Field>
        <Button variant="primary" size="sm" onClick={save('providers')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save
        </Button>
      </section>

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Groq (transcription)</h2>
        <Field label="API Key" hint="Used for fast Whisper transcription">
          <Input type="password" placeholder={form.providers?.groq?.apiKey ?? 'gsk_...'} onChange={e => set(['providers', 'groq', 'apiKey'], e.target.value)} />
        </Field>
        <Field label="Whisper model">
          <Input value={form.providers?.groq?.whisperModel ?? ''} onChange={e => set(['providers', 'groq', 'whisperModel'], e.target.value)} />
        </Field>
        <Button variant="primary" size="sm" onClick={save('providers')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save
        </Button>
      </section>

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Notion</h2>
        <Field label="Integration Token" hint="Secret from notion.so/my-integrations">
          <Input type="password" placeholder={form.integrations?.notion?.apiKey ?? 'secret_...'} onChange={e => set(['integrations', 'notion', 'apiKey'], e.target.value)} />
        </Field>
        <Field label="Meetings Database ID" hint="Auto-populated when you provision from a parent page below">
          <Input value={form.integrations?.notion?.meetingsDatabaseId ?? ''} onChange={e => set(['integrations', 'notion', 'meetingsDatabaseId'], e.target.value)} />
        </Field>
        <Button variant="primary" size="sm" onClick={save('integrations')} disabled={saveMut.isPending}>
          <Check className="w-3.5 h-3.5" /> Save
        </Button>

        <div className="mt-5 pt-5 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2">Provision a new meetings database in Notion (like "Austin's Recall Meetings")</div>
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

      {!settings.platform?.googleOAuth?.managed && (
        <section className="surface-1 p-6 mb-5">
          <h2 className="font-display font-semibold mb-4">Google Calendar OAuth</h2>
          <div className="text-xs text-muted-foreground mb-4">
            Advanced: override the platform-provided OAuth credentials with your own.
          </div>
          <Field label="Client ID"><Input placeholder={form.integrations?.googleOAuth?.clientId ?? ''} onChange={e => set(['integrations', 'googleOAuth', 'clientId'], e.target.value)} /></Field>
          <Field label="Client Secret"><Input type="password" placeholder={form.integrations?.googleOAuth?.clientSecret ?? ''} onChange={e => set(['integrations', 'googleOAuth', 'clientSecret'], e.target.value)} /></Field>
          <Button variant="primary" size="sm" onClick={save('integrations')}><Check className="w-3.5 h-3.5" /> Save</Button>
        </section>
      )}

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Microsoft / Outlook OAuth</h2>
        <Field label="Client ID"><Input placeholder={form.integrations?.microsoftOAuth?.clientId ?? ''} onChange={e => set(['integrations', 'microsoftOAuth', 'clientId'], e.target.value)} /></Field>
        <Field label="Client Secret"><Input type="password" placeholder={form.integrations?.microsoftOAuth?.clientSecret ?? ''} onChange={e => set(['integrations', 'microsoftOAuth', 'clientSecret'], e.target.value)} /></Field>
        <Field label="Tenant ID"><Input value={form.integrations?.microsoftOAuth?.tenantId ?? ''} onChange={e => set(['integrations', 'microsoftOAuth', 'tenantId'], e.target.value)} /></Field>
        <Button variant="primary" size="sm" onClick={save('integrations')}><Check className="w-3.5 h-3.5" /> Save</Button>
      </section>

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Bot</h2>
        <Field label="Default bot name"><Input value={form.bot?.defaultName ?? ''} onChange={e => set(['bot', 'defaultName'], e.target.value)} /></Field>
        <Field label="Max meeting duration (minutes)"><Input type="number" value={form.bot?.maxDurationMinutes ?? 180} onChange={e => set(['bot', 'maxDurationMinutes'], Number(e.target.value))} /></Field>
        <Button variant="primary" size="sm" onClick={save('bot')}><Check className="w-3.5 h-3.5" /> Save</Button>
      </section>

      <section className="surface-1 p-6">
        <h2 className="font-display font-semibold mb-4">MelvinOS Integration</h2>
        <Field label="MelvinOS base URL" hint="e.g. http://melvinos_app:3001"><Input value={form.melvinos?.baseUrl ?? ''} onChange={e => set(['melvinos', 'baseUrl'], e.target.value)} /></Field>
        <Field label="Shared webhook secret"><Input type="password" placeholder={form.melvinos?.webhookSecret ?? ''} onChange={e => set(['melvinos', 'webhookSecret'], e.target.value)} /></Field>
        <Button variant="primary" size="sm" onClick={save('melvinos')}><Check className="w-3.5 h-3.5" /> Save</Button>
      </section>
    </div>
  );
}
