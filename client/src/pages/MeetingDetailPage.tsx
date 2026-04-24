import { useEffect, useRef, useState } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, RotateCw, Trash2, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { MarkdownLite } from '../components/MarkdownLite';
import { TagEditor } from '../components/TagEditor';
import { HighlightsPanel } from '../components/HighlightsPanel';
import { useToast } from '../components/Toast';
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

  const toast = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const stopMut = useMutation({
    mutationFn: () => api.stopMeeting(id),
    onSuccess: () => refetch(),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Stop failed'),
  });
  const reprocessMut = useMutation({
    mutationFn: () => api.reprocess(id),
    onSuccess: () => { refetch(); toast.success('Reprocessing queued'); },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Reprocess failed'),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteMeeting(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.removeQueries({ queryKey: ['meeting', id] });
      toast.info('Meeting deleted');
      navigate('/');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  });
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  const { data: allMeetings = [] } = useQuery({ queryKey: ['meetings'], queryFn: api.listMeetings });
  const tagSuggestions = Array.from(new Set(allMeetings.flatMap(m => (m as any).tags ?? []))) as string[];
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-trigger print when ?print=1 is in the URL (used by the "Print/PDF" card menu action).
  useEffect(() => {
    if (!meeting) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('print') === '1') {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [meeting]);

  if (isLoading || !meeting) {
    return <div className="px-4 sm:px-8 py-6 sm:py-7 text-muted-foreground">Loading…</div>;
  }

  const liveStatuses = ['joining', 'in_call', 'recording'];
  const isLive = liveStatuses.includes(meeting.status);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[1100px] mx-auto pb-32 md:pb-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 sm:mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to meetings
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-semibold break-words">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted-foreground">
            <StatusPill status={meeting.status} />
            <span>{platformLabels[meeting.platform] ?? meeting.platform}</span>
            <span className="hidden sm:inline">·</span>
            <span>{formatDate(meeting.startAt)}</span>
            <span className="hidden sm:inline">·</span>
            <span>{formatDuration(meeting.durationSeconds)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <div className="mb-5">
        <TagEditor
          meetingId={meeting.id}
          tags={(meeting as any).tags ?? []}
          suggestions={tagSuggestions}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="os-panel p-4">
          <div className="text-xs text-muted-foreground mb-1">Host</div>
          <div className="font-medium truncate">{meeting.host ?? '—'}</div>
        </div>
        <div className="os-panel p-4">
          <div className="text-xs text-muted-foreground mb-1">Attendees</div>
          <div className="flex gap-1 flex-wrap">
            {meeting.attendees.length === 0 && <span className="text-muted-foreground">—</span>}
            {meeting.attendees.map((a, i) => <span key={i} className="attendee-chip">{a.name ?? a.email}</span>)}
          </div>
        </div>
        <div className="os-panel p-4">
          <div className="text-xs text-muted-foreground mb-1">Action Items</div>
          <div className="font-medium">{meeting.actionItems?.length ?? 0}</div>
        </div>
      </div>

      {meeting.summary && (
        <section className="os-panel p-5 sm:p-6 mb-5">
          <h2 className="font-display font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
            <span className="text-primary">📋</span> Summary
          </h2>
          <MarkdownLite source={meeting.summary} />
        </section>
      )}

      {meeting.actionItems && meeting.actionItems.length > 0 && (
        <section className="os-panel p-5 sm:p-6 mb-5">
          <h2 className="font-display font-semibold text-base sm:text-lg mb-4 flex items-center gap-2">
            <span className="text-primary">✅</span> Action Items
          </h2>
          <ul className="space-y-2.5">
            {meeting.actionItems.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-[hsl(142_71%_45%)] flex-shrink-0" />
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
        <HighlightsPanel meetingId={meeting.id} transcriptRef={transcriptRef} />
      )}

      {meeting.transcript && (() => {
        const wordCount = meeting.transcript.trim().split(/\s+/).length;
        return (
          <section className="os-panel p-5 sm:p-6 mb-5">
            <button
              onClick={() => setTranscriptExpanded(e => !e)}
              className="w-full flex items-center justify-between gap-3 mb-3 -m-1 p-1 rounded-md hover:bg-accent/40 transition-colors"
              aria-expanded={transcriptExpanded}
            >
              <h2 className="font-display font-semibold text-base sm:text-lg flex items-center gap-2">
                <span className="text-primary">🎙️</span> Transcript
                <span className="text-xs font-sans font-normal text-muted-foreground">
                  · {wordCount.toLocaleString()} words
                </span>
              </h2>
              {transcriptExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {transcriptExpanded ? (
              <div
                ref={transcriptRef}
                className="text-sm whitespace-pre-wrap text-foreground/85 max-h-[500px] overflow-y-auto leading-relaxed select-text"
              >
                {meeting.transcript}
              </div>
            ) : (
              <div
                ref={transcriptRef}
                className="text-sm text-muted-foreground/80 line-clamp-3 leading-relaxed select-text"
              >
                {meeting.transcript}
              </div>
            )}
            {!transcriptExpanded && (
              <button
                onClick={() => setTranscriptExpanded(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Show full transcript
              </button>
            )}
          </section>
        );
      })()}

      {meeting.errorMessage && (
        <section className="os-panel p-5 sm:p-6 border-destructive/50 bg-destructive/5">
          <h2 className="font-display font-semibold mb-2 text-destructive">Error</h2>
          <p className="text-sm font-mono text-destructive/80">{meeting.errorMessage}</p>
        </section>
      )}
    </div>
  );
}
