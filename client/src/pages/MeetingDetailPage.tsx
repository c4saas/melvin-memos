import { Link, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, RotateCw, Trash2, Square } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { formatDate, formatDuration, platformLabels } from '../lib/utils';

export default function MeetingDetailPage() {
  const [, params] = useRoute('/meetings/:id');
  const id = params?.id ?? '';

  const { data: meeting, refetch, isLoading } = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => api.getMeeting(id),
    enabled: !!id,
    refetchInterval: 5_000,
  });

  const stopMut = useMutation({ mutationFn: () => api.stopMeeting(id), onSuccess: () => refetch() });
  const reprocessMut = useMutation({ mutationFn: () => api.reprocess(id), onSuccess: () => refetch() });
  const deleteMut = useMutation({ mutationFn: () => api.deleteMeeting(id) });

  if (isLoading || !meeting) {
    return <div className="px-8 py-7 text-muted-foreground">Loading…</div>;
  }

  const liveStatuses = ['joining', 'in_call', 'recording'];
  const isLive = liveStatuses.includes(meeting.status);

  return (
    <div className="px-8 py-7 max-w-[1100px] mx-auto">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to meetings
      </Link>

      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">{meeting.title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <StatusPill status={meeting.status} />
            <span>{platformLabels[meeting.platform] ?? meeting.platform}</span>
            <span>·</span>
            <span>{formatDate(meeting.startAt)}</span>
            <span>·</span>
            <span>{formatDuration(meeting.durationSeconds)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {isLive && (
            <Button variant="destructive" onClick={() => stopMut.mutate()}>
              <Square className="w-4 h-4" /> Leave call
            </Button>
          )}
          {meeting.recordingPath && meeting.status !== 'summarizing' && (
            <Button variant="secondary" onClick={() => reprocessMut.mutate()}>
              <RotateCw className="w-4 h-4" /> Reprocess
            </Button>
          )}
          {meeting.notionPageUrl && (
            <a href={meeting.notionPageUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <ExternalLink className="w-4 h-4" /> Open in Notion
              </Button>
            </a>
          )}
          <Button variant="ghost" onClick={() => { if (confirm('Delete this meeting?')) deleteMut.mutate(); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface-1 p-4">
          <div className="text-xs text-muted-foreground mb-1">Host</div>
          <div className="font-medium truncate">{meeting.host ?? '—'}</div>
        </div>
        <div className="surface-1 p-4">
          <div className="text-xs text-muted-foreground mb-1">Attendees</div>
          <div className="flex gap-1 flex-wrap">
            {meeting.attendees.length === 0 && <span className="text-muted-foreground">—</span>}
            {meeting.attendees.map((a, i) => <span key={i} className="attendee-chip">{a.name ?? a.email}</span>)}
          </div>
        </div>
        <div className="surface-1 p-4">
          <div className="text-xs text-muted-foreground mb-1">Action Items</div>
          <div className="font-medium">{meeting.actionItems?.length ?? 0}</div>
        </div>
      </div>

      {meeting.summary && (
        <section className="surface-1 p-6 mb-6">
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
            <span className="text-primary">📋</span> Summary
          </h2>
          <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-foreground/90">
            {meeting.summary}
          </div>
        </section>
      )}

      {meeting.actionItems && meeting.actionItems.length > 0 && (
        <section className="surface-1 p-6 mb-6">
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
            <span className="text-primary">✅</span> Action Items
          </h2>
          <ul className="space-y-2">
            {meeting.actionItems.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1 w-2 h-2 rounded-full bg-[hsl(142_71%_45%)] flex-shrink-0" />
                <div>
                  {a.owner && <span className="attendee-chip mr-2">{a.owner}</span>}
                  <span>{a.task}</span>
                  {a.deadline && <span className="text-muted-foreground ml-2 text-xs">· {a.deadline}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meeting.transcript && (
        <section className="surface-1 p-6">
          <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
            <span className="text-primary">🎙️</span> Transcript
          </h2>
          <pre className="font-sans text-sm whitespace-pre-wrap text-foreground/80 max-h-[500px] overflow-y-auto">
            {meeting.transcript}
          </pre>
        </section>
      )}

      {meeting.errorMessage && (
        <section className="surface-1 p-6 border-destructive/50 bg-destructive/5">
          <h2 className="font-display font-semibold mb-2 text-destructive">Error</h2>
          <p className="text-sm font-mono text-destructive/80">{meeting.errorMessage}</p>
        </section>
      )}
    </div>
  );
}
