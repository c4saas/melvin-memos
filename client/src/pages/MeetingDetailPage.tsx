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

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  const stopMut = useMutation({
    mutationFn: () => api.stopMeeting(id),
    onSuccess: () => refetch(),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Stop failed'),
  });
  const inviteBotMut = useMutation({
    mutationFn: (enable: boolean) => api.setInviteBot(id, enable),
    onSuccess: (r) => {
      refetch();
      toast.success(r.inviteBotAccount
        ? 'Bot will be invited on next calendar sync (~1 min)'
        : 'Bot invite turned off');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Toggle failed'),
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
        <div className="flex flex-wrap gap-2 shrink-0">
          {isLive && (
            <Button variant="destructive" size="sm" onClick={() => stopMut.mutate()}>
              <Square className="w-4 h-4" /> <span className="hidden sm:inline">Leave call</span><span className="sm:hidden">Leave</span>
            </Button>
          )}
          {meeting.recordingPath && meeting.status !== 'summarizing' && (
            <Button variant="secondary" size="sm" onClick={() => reprocessMut.mutate()}>
              <RotateCw className="w-4 h-4" /> Reprocess
            </Button>
          )}
          {meeting.notionPageUrl && (
            <a href={meeting.notionPageUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Open in Notion</span><span className="sm:hidden">Notion</span>
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={() => { if (confirm('Delete this meeting?')) deleteMut.mutate(); }} aria-label="Delete">
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

      {/* Per-meeting "Invite Memos bot" toggle — visible only for scheduled
          Google Meet events when a bot Workspace email is configured. Flipping
          it adds the bot email to attendees on the next calendar sync. */}
      {meeting.platform === 'google_meet'
        && meeting.status === 'scheduled'
        && settings?.bot?.assistantEmail && (
        <div className="os-panel p-4 mb-5 flex items-start sm:items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium mb-1">Invite Memos bot to this meeting</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Adds <span className="font-mono">{settings.bot.assistantEmail}</span> as a guest on this calendar event so the bot joins as a real Workspace participant — not a guest browser. Use this for meetings the bot keeps getting kicked out of.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={meeting.inviteBotAccount}
            disabled={inviteBotMut.isPending}
            onClick={() => inviteBotMut.mutate(!meeting.inviteBotAccount)}
            className={
              'relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors '
              + (meeting.inviteBotAccount ? 'bg-primary' : 'bg-muted')
            }
          >
            <span
              className={
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform '
                + (meeting.inviteBotAccount ? 'translate-x-6' : 'translate-x-1')
              }
            />
          </button>
        </div>
      )}

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
                <div className="min-w-0 flex-1 break-words">
                  {a.owner && <span className="attendee-chip mr-2 align-middle">{a.owner}</span>}
                  <span className="break-words">{a.task}</span>
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
          {(() => {
            // Surface a tab-recording fallback CTA when the failure is the kind
            // a guest browser bot can never solve (Workspace gated, lobby-only).
            const msg = meeting.errorMessage ?? '';
            const isBotJoinFailure = /workspace\.google\.com|admitted within|sign into a Google account/i.test(msg);
            if (!isBotJoinFailure) return null;
            return (
              <div className="mt-4 p-4 rounded-md bg-background/40 border border-destructive/30 text-sm">
                <p className="font-medium mb-1.5">Tip — record yourself with the Chrome extension</p>
                <p className="text-muted-foreground leading-relaxed">
                  Workspace meetings often refuse our headless bot. Install the Memos extension,
                  open the Meet/Zoom/Teams tab, click the icon, and hit <strong>● Start recording</strong> —
                  it captures the tab audio from <em>your</em> signed-in Chrome and uploads here automatically.
                  No bot session needed.
                </p>
                <a href="/api/extension" className="text-primary hover:underline text-xs mt-2 inline-block">
                  Get the extension →
                </a>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
