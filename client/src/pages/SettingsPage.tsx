import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Unplug, RefreshCw, Check } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';

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

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: calendars = [] } = useQuery({ queryKey: ['calendars'], queryFn: api.listCalendars });

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const saveMut = useMutation({
    mutationFn: (body: any) => api.saveSettings(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
  });

  const syncMut = useMutation({ mutationFn: api.syncCalendars });
  const removeCalMut = useMutation({
    mutationFn: (id: string) => api.deleteCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendars'] }),
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
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              <RefreshCw className={'w-3.5 h-3.5 ' + (syncMut.isPending ? 'animate-spin' : '')} /> Sync now
            </Button>
            <a href="/api/calendar/google/start"><Button variant="secondary" size="sm">+ Google</Button></a>
            <a href="/api/calendar/microsoft/start"><Button variant="secondary" size="sm">+ Outlook</Button></a>
          </div>
        </div>
        {calendars.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">
            No calendars connected. Add Google or Outlook to auto-join meetings.
          </div>
        )}
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
                alert('Database created: ' + r.databaseId);
                qc.invalidateQueries({ queryKey: ['settings'] });
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Failed');
              }
            }}>
              Provision
            </Button>
          </div>
        </div>
      </section>

      <section className="surface-1 p-6 mb-5">
        <h2 className="font-display font-semibold mb-4">Google Calendar OAuth</h2>
        <Field label="Client ID"><Input placeholder={form.integrations?.googleOAuth?.clientId ?? ''} onChange={e => set(['integrations', 'googleOAuth', 'clientId'], e.target.value)} /></Field>
        <Field label="Client Secret"><Input type="password" placeholder={form.integrations?.googleOAuth?.clientSecret ?? ''} onChange={e => set(['integrations', 'googleOAuth', 'clientSecret'], e.target.value)} /></Field>
        <Button variant="primary" size="sm" onClick={save('integrations')}><Check className="w-3.5 h-3.5" /> Save</Button>
      </section>

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
