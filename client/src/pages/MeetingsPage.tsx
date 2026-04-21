import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Plus, Video } from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { formatDate, formatDuration, platformLabels } from '../lib/utils';

function NewMeetingDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (m: Meeting) => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const startAt = new Date().toISOString();
      const m = await api.createMeeting({ title, meetingUrl: url, startAt, autoJoin: false });
      await api.joinNow(m.id);
      onCreate(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="surface-1 w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-display font-semibold text-lg mb-4">Send Notetaker to a meeting</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Meeting title</label>
            <input
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
              placeholder="Weekly sync"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Meeting URL</label>
            <input
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono"
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="mt-3 text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!url || !title || submitting}>
            {submitting ? 'Sending…' : 'Send Notetaker'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const qc = useQueryClient();
  const { data: meetings = [], isLoading, refetch } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
    refetchInterval: 10_000,
  });

  const syncMut = useMutation({ mutationFn: api.syncCalendars, onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }) });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="px-8 py-7 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-3">
            <span>📝 Meetings</span>
            <span className="text-xs text-muted-foreground font-sans font-normal">{meetings.length} total</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your notetaker meetings — transcripts, summaries, action items.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={'w-4 h-4 ' + (syncMut.isPending ? 'animate-spin' : '')} />
            Sync calendars
          </Button>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            New notetaker
          </Button>
        </div>
      </header>

      <div className="surface-1 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Platform</th>
              <th className="text-left px-4 py-3 font-medium">Attendees</th>
              <th className="text-left px-4 py-3 font-medium">Duration</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-12">Loading…</td></tr>
            )}
            {!isLoading && meetings.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-16">
                  <Video className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <div className="font-medium text-foreground">No meetings yet</div>
                  <div className="text-xs mt-1">Connect a calendar or send the notetaker to a live meeting.</div>
                </td>
              </tr>
            )}
            {meetings.map(m => (
              <tr key={m.id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/meetings/${m.id}`} className="font-medium hover:text-primary transition-colors">
                    {m.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(m.startAt)}</td>
                <td className="px-4 py-3 text-muted-foreground">{platformLabels[m.platform] ?? m.platform}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap max-w-[260px]">
                    {m.attendees.slice(0, 3).map((a, i) => (
                      <span key={i} className="attendee-chip">{a.name ?? a.email}</span>
                    ))}
                    {m.attendees.length > 3 && <span className="text-xs text-muted-foreground">+{m.attendees.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatDuration(m.durationSeconds)}</td>
                <td className="px-4 py-3"><StatusPill status={m.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/meetings/${m.id}`} className="text-xs text-primary hover:underline">Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialogOpen && (
        <NewMeetingDialog
          onClose={() => setDialogOpen(false)}
          onCreate={() => { setDialogOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
