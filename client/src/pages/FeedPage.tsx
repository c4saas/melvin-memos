import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Mic, Calendar as CalendarIcon, ArrowRight, FileText,
  CheckCircle2, AlertCircle, Search, ChevronDown, ChevronUp,
  PartyPopper,
} from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { StatusPill } from '../components/StatusPill';
import { formatDate, formatDuration, platformLabels, cn } from '../lib/utils';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { Button } from '../components/Button';
import { MarkdownLite } from '../components/MarkdownLite';
import { AvatarStack } from '../components/AvatarStack';
import { FeedStats } from '../components/FeedStats';
import { FeedCardSkeleton } from '../components/Skeleton';
import { CardMenu } from '../components/CardMenu';
import { TagChips } from '../components/TagEditor';

// -----------------------------------------------------------------------------
// Predicates
// -----------------------------------------------------------------------------
function isPastOnFeed(m: Meeting): boolean {
  const now = Date.now();
  const start = new Date(m.startAt).getTime();
  if (start >= now) return false;
  if (m.status === 'scheduled') return false;
  if (['joining', 'in_call', 'recording'].includes(m.status)) return false;
  return true;
}

function isReallyFailed(m: Meeting): boolean {
  return m.status === 'failed' || m.status === 'cancelled';
}

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------
const PLATFORM_FILTERS: Array<{ id: 'all' | 'google_meet' | 'zoom' | 'teams' | 'voice'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'google_meet', label: 'Meet' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'teams', label: 'Teams' },
  { id: 'voice', label: 'Voice' },
];

// -----------------------------------------------------------------------------
// Cards
// -----------------------------------------------------------------------------
function FeedItem({ m }: { m: Meeting }) {
  const hasTranscript = Boolean(m.transcript?.trim().length);
  const transcriptWords = hasTranscript ? m.transcript!.trim().split(/\s+/).length : 0;
  const firstActions = (m.actionItems ?? []).slice(0, 2);

  return (
    <Link href={`/meetings/${m.id}`} className="block">
      <article className="os-panel feed-card p-5 sm:p-6 animate-in fade-in-50 duration-200">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-base sm:text-lg leading-snug tracking-tight break-words">
              {m.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-1 mt-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" /> {formatDate(m.startAt)}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>{platformLabels[m.platform] ?? m.platform}</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{formatDuration(m.durationSeconds)}</span>
              {hasTranscript && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {transcriptWords.toLocaleString()} words
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {m.attendees.length > 0 && <AvatarStack attendees={m.attendees} max={3} />}
            <StatusPill status={m.status} />
            <CardMenu meeting={m} />
          </div>
        </header>

        {/* Tags */}
        {(m as any).tags?.length > 0 && (
          <div className="mb-3">
            <TagChips tags={(m as any).tags} size="sm" />
          </div>
        )}

        {/* Summary */}
        {m.summary ? (
          <MarkdownLite source={m.summary} />
        ) : (
          <p className="text-sm text-muted-foreground italic">Summary unavailable.</p>
        )}

        {/* Inline action items preview — the money line */}
        {firstActions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              Next actions
            </div>
            <ul className="space-y-1.5">
              {firstActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[hsl(142_71%_45%)]" />
                  <span className="text-foreground/90 leading-snug">
                    {a.owner && <span className="attendee-chip mr-1.5">{a.owner}</span>}
                    {a.task}
                    {a.deadline && <span className="text-muted-foreground ml-1.5 text-xs">· {a.deadline}</span>}
                  </span>
                </li>
              ))}
              {(m.actionItems?.length ?? 0) > firstActions.length && (
                <li className="text-xs text-muted-foreground pl-[22px]">
                  +{m.actionItems!.length - firstActions.length} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {(m.actionItems?.length ?? 0)} action item{(m.actionItems?.length ?? 0) === 1 ? '' : 's'}
            {hasTranscript && ` · ${transcriptWords.toLocaleString()} words`}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </footer>
      </article>
    </Link>
  );
}

function FailedItem({ m }: { m: Meeting }) {
  return (
    <Link
      href={`/meetings/${m.id}`}
      className="block os-panel feed-card p-3.5 border-destructive/25 bg-destructive/[0.03]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertCircle className="w-4 h-4 text-destructive/70 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{m.title}</div>
            <div className="text-[11px] text-muted-foreground">
              {formatDate(m.startAt)} · {platformLabels[m.platform] ?? m.platform}
            </div>
          </div>
        </div>
        <span className="text-xs text-primary shrink-0">Retry →</span>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Group headers — friendly date labels
// -----------------------------------------------------------------------------
function formatDayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const sd = new Date(d); sd.setHours(0, 0, 0, 0);

  if (sd.getTime() === today.getTime()) return `Today · ${d.toLocaleDateString(undefined, { weekday: 'long' })}`;
  if (sd.getTime() === y.getTime()) return `Yesterday · ${d.toLocaleDateString(undefined, { weekday: 'long' })}`;

  const withinWeek = today.getTime() - sd.getTime() < 7 * 86400 * 1000;
  if (withinWeek) return d.toLocaleDateString(undefined, { weekday: 'long' });

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'long' });
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
export default function FeedPage() {
  const { data: allMeetings = [], isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
    refetchInterval: 10_000,
  });

  const [recorderOpen, setRecorderOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | 'google_meet' | 'zoom' | 'teams' | 'voice'>('all');
  const [failedExpanded, setFailedExpanded] = useState(false);

  const past = useMemo(() => allMeetings.filter(isPastOnFeed), [allMeetings]);

  // Separate failed meetings — they become a compact, dismissible strip.
  const { successes, failures } = useMemo(() => {
    const succ: Meeting[] = [];
    const fail: Meeting[] = [];
    for (const m of past) (isReallyFailed(m) ? fail : succ).push(m);
    return { successes: succ, failures: fail };
  }, [past]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return successes.filter(m => {
      if (platform !== 'all' && m.platform !== platform) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.summary ?? '').toLowerCase().includes(q) ||
        (m.host ?? '').toLowerCase().includes(q)
      );
    });
  }, [successes, query, platform]);

  // Group by day, newest first.
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: Meeting[] }>();
    for (const m of filtered) {
      const d = new Date(m.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] });
      map.get(key)!.items.push(m);
    }
    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filtered]);

  const isFirstMemo = past.length === 1 && past[0].status === 'completed';

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[760px] mx-auto pb-32 md:pb-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-7">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> My Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Past meetings with AI-generated summaries, action items, and transcripts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => setRecorderOpen(true)}>
            <Mic className="w-4 h-4" />
            <span className="hidden sm:inline">Record voice</span>
            <span className="sm:hidden">Record</span>
          </Button>
        </div>
      </header>

      {/* Stats strip */}
      {allMeetings.length > 0 && <FeedStats meetings={allMeetings} />}

      {/* Search + filter chips */}
      {past.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, summaries, hosts…"
              className="w-full bg-input/70 border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {PLATFORM_FILTERS.map(p => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  platform === p.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-input/40 text-muted-foreground hover:bg-input hover:text-foreground border border-border',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </div>
      )}

      {/* First-meeting celebration */}
      {!isLoading && isFirstMemo && (
        <div className="os-panel p-5 mb-5 border-primary/30 bg-primary/5 animate-in fade-in-50 slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <PartyPopper className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-semibold text-sm mb-1">Your first memo ✨</div>
              <p className="text-xs text-muted-foreground">
                Here's what Memos captured. From now on, every meeting you record or invite the bot to will
                show up here with a transcript, summary, and action items.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Failed strip */}
      {!isLoading && failures.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setFailedExpanded(e => !e)}
            className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.03] hover:bg-destructive/[0.06] transition-colors text-sm"
          >
            <span className="inline-flex items-center gap-2 text-destructive/80 font-medium">
              <AlertCircle className="w-4 h-4" />
              {failures.length} recording{failures.length === 1 ? '' : 's'} failed to process
            </span>
            {failedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {failedExpanded && (
            <div className="mt-2 space-y-2 animate-in fade-in-50 slide-in-from-top-1 duration-150">
              {failures.map(m => <FailedItem key={m.id} m={m} />)}
            </div>
          )}
        </div>
      )}

      {/* Empty states */}
      {!isLoading && past.length === 0 && (
        <div className="os-panel p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--ring) / 0.1))' }}>
            <Mic className="w-6 h-6 text-primary" />
          </div>
          <div className="font-display font-semibold text-base mb-1.5">Nothing captured yet</div>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto leading-relaxed">
            Record a voice note, invite the Memos bot to a meeting, or install the Chrome extension
            to capture what you're already in.
          </p>
          <Button variant="primary" onClick={() => setRecorderOpen(true)}>
            <Mic className="w-4 h-4" /> Record your first memo
          </Button>
        </div>
      )}

      {!isLoading && past.length > 0 && filtered.length === 0 && (query || platform !== 'all') && (
        <div className="os-panel p-8 text-center text-sm text-muted-foreground">
          No meetings match your filter.
        </div>
      )}

      {/* Grouped feed */}
      <div className="space-y-6">
        {groups.map((g, i) => (
          <section key={i}>
            <div className="feed-group-header">
              <span className="feed-group-title">{formatDayLabel(g.date)}</span>
              <span className="feed-group-sub">
                · {g.items.length} meeting{g.items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-4">
              {g.items.map(m => <FeedItem key={m.id} m={m} />)}
            </div>
          </section>
        ))}
      </div>

      {recorderOpen && (
        <VoiceRecorder
          onClose={() => setRecorderOpen(false)}
          onCreated={() => setRecorderOpen(false)}
        />
      )}
    </div>
  );
}
