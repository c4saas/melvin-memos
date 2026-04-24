import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Plus, Video, Mic, CalendarDays, Clock, PhoneCall, ExternalLink,
  CircleDot, Search,
} from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { PlatformIcon } from '../components/PlatformIcon';
import { AvatarStack } from '../components/AvatarStack';
import { CardMenu } from '../components/CardMenu';
import { FeedCardSkeleton } from '../components/Skeleton';
import { formatDuration, platformLabels, relativeTime, cn } from '../lib/utils';

// -----------------------------------------------------------------------------
// Dialog for sending the bot to a meeting URL
// -----------------------------------------------------------------------------
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in-50 duration-150" onClick={onClose}>
      <div
        className="os-panel w-full max-w-md p-6 animate-in zoom-in-95 slide-in-from-bottom-2 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <PhoneCall className="w-4 h-4 text-primary" />
          </div>
          <h2 className="font-display font-semibold text-lg">Send notetaker to a meeting</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Meeting title</label>
            <input
              className="w-full bg-input/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              placeholder="Weekly sync"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Meeting URL</label>
            <input
              className="w-full bg-input/60 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              value={url}
              onChange={e => setUrl(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Works with Google Meet, Zoom, or Microsoft Teams.
            </p>
          </div>
        </div>
        {error && <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!url || !title || submitting}>
            {submitting ? 'Sending…' : 'Send notetaker'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Upcoming row — time-sensitive card with big CTA
// -----------------------------------------------------------------------------
function UpcomingRow({ m }: { m: Meeting }) {
  const live = ['joining', 'in_call', 'recording'].includes(m.status);
  const startsSoon = !live && (new Date(m.startAt).getTime() - Date.now()) < 15 * 60 * 1000;

  return (
    <Link href={`/meetings/${m.id}`}>
      <article
        className={cn(
          'os-panel feed-card p-4 sm:p-5',
          live && 'border-primary/40 bg-primary/5',
          startsSoon && 'border-[hsl(32_95%_60%)]/40',
        )}
      >
        <div className="flex items-start gap-3">
          <PlatformIcon platform={m.platform} size={36} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-semibold text-sm sm:text-base leading-snug truncate">
                  {m.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  <span className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    live && 'text-primary',
                    startsSoon && 'text-[hsl(32_95%_60%)]',
                  )}>
                    {live && <CircleDot className="w-3 h-3 animate-pulse" />}
                    <Clock className="w-3 h-3" />
                    {live ? 'Live now' : relativeTime(m.startAt)}
                  </span>
                  {m.host && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="truncate">hosted by {m.host}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.attendees.length > 0 && <AvatarStack attendees={m.attendees} max={3} />}
                <StatusPill status={m.status} />
              </div>
            </div>

            {/* Action row */}
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className="flex items-center gap-2">
                {m.meetingUrl && m.meetingUrl.startsWith('http') && (
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Join {platformLabels[m.platform]}
                  </a>
                )}
                <span className="text-xs text-muted-foreground">
                  auto-join {m.autoJoin ? 'on' : 'off'}
                </span>
              </div>
              <CardMenu meeting={m} onClick={(e) => e.stopPropagation()} />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Past row — dense inbox-style row (1 line metadata + title)
// -----------------------------------------------------------------------------
function PastRow({ m }: { m: Meeting }) {
  const actionCount = m.actionItems?.length ?? 0;
  const hasSummary = Boolean(m.summary);
  const failed = m.status === 'failed' || m.status === 'cancelled';

  return (
    <Link href={`/meetings/${m.id}`}>
      <div
        className={cn(
          'group flex items-center gap-3 px-4 py-3 hover:bg-accent/25 transition-colors border-l-2 border-transparent',
          failed && 'border-l-destructive/40 bg-destructive/[0.02]',
          hasSummary && !failed && 'border-l-[hsl(142_71%_45%)]/30',
        )}
      >
        <PlatformIcon platform={m.platform} size={32} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{m.title}</span>
            {actionCount > 0 && (
              <span className="os-badge os-badge-blue shrink-0">
                {actionCount} action{actionCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            <span>{relativeTime(m.startAt)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{platformLabels[m.platform] ?? m.platform}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{formatDuration(m.durationSeconds)}</span>
          </div>
        </div>

        {m.attendees.length > 0 && (
          <div className="hidden sm:block">
            <AvatarStack attendees={m.attendees} max={3} />
          </div>
        )}
        <StatusPill status={m.status} />
        <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          <CardMenu meeting={m} />
        </div>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Section wrapper
// -----------------------------------------------------------------------------
function Section({
  icon: Icon,
  title,
  subtitle,
  count,
  children,
  footer,
}: {
  icon: typeof CalendarDays;
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3 px-1">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">{title}</h2>
        <span className="text-xs text-muted-foreground font-sans font-normal">{count}</span>
        {subtitle && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </>
        )}
      </div>
      {children}
      {footer && <div className="mt-3 px-1">{footer}</div>}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
function businessDaysAhead(days: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const PAST_LIMIT = 30;

export default function MeetingsPage() {
  const qc = useQueryClient();
  const { data: meetings = [], isLoading, refetch } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
    refetchInterval: 10_000,
  });

  const syncMut = useMutation({ mutationFn: api.syncCalendars, onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }) });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Split upcoming into "today" and "rest of week" so the default view stays quiet.
  const { today, later, past, hiddenUpcoming } = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    const horizon = businessDaysAhead(5);
    const liveStatuses = new Set(['joining', 'in_call', 'recording']);

    const todayArr: Meeting[] = [];
    const laterArr: Meeting[] = [];
    const pa: Meeting[] = [];
    let hidden = 0;

    for (const m of meetings) {
      const start = new Date(m.startAt).getTime();
      const isLive = liveStatuses.has(m.status);
      const isUpcoming = isLive || start >= now;

      if (isUpcoming) {
        if (isLive) {
          todayArr.push(m); continue;
        }
        if (start <= endOfToday.getTime()) {
          todayArr.push(m);
        } else if (start <= horizon) {
          laterArr.push(m);
        } else {
          hidden++;
        }
      } else {
        pa.push(m);
      }
    }

    todayArr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    laterArr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return { today: todayArr, later: laterArr, past: pa.slice(0, PAST_LIMIT), hiddenUpcoming: hidden };
  }, [meetings]);

  const [laterExpanded, setLaterExpanded] = useState(false);

  const q = query.trim().toLowerCase();
  const applyFilter = (list: Meeting[]) => {
    if (!q) return list;
    return list.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.host ?? '').toLowerCase().includes(q) ||
      m.attendees.some(a => (a.name ?? a.email ?? '').toLowerCase().includes(q)),
    );
  };

  const filteredToday = applyFilter(today);
  const filteredLater = applyFilter(later);
  const filteredPast = applyFilter(past);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[1000px] mx-auto pb-32 md:pb-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            📝 Meetings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Today's meetings and your recent history.{' '}
            <Link href="/calendar" className="text-primary hover:underline">Full calendar →</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={'w-3.5 h-3.5 ' + (syncMut.isPending ? 'animate-spin' : '')} />
            <span className="hidden sm:inline">Sync calendars</span>
            <span className="sm:hidden">Sync</span>
          </Button>
          <Button variant="secondary" onClick={() => setRecorderOpen(true)}>
            <Mic className="w-4 h-4" />
            <span>Record</span>
          </Button>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>Send notetaker</span>
          </Button>
        </div>
      </header>

      {/* Search */}
      {meetings.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, host, or attendee…"
            className="w-full bg-input/60 border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </div>
      )}

      {/* Empty — no meetings at all */}
      {!isLoading && meetings.length === 0 && (
        <div className="os-panel p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--ring) / 0.1))' }}>
            <Video className="w-6 h-6 text-primary" />
          </div>
          <div className="font-display font-semibold text-base mb-1.5">No meetings yet</div>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto leading-relaxed">
            Send the notetaker to a live meeting URL, record a voice note, or connect a calendar.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4" /> Send notetaker
            </Button>
            <Link href="/settings"><Button variant="ghost">Connect calendar</Button></Link>
          </div>
        </div>
      )}

      {/* Today */}
      {!isLoading && meetings.length > 0 && (
        <Section
          icon={CalendarDays}
          title="Today"
          subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          count={filteredToday.length}
        >
          {filteredToday.length === 0 ? (
            <div className="os-panel p-8 text-center text-sm text-muted-foreground">
              {q ? 'No meetings today match your search.' : 'Nothing scheduled for today.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredToday.map(m => <UpcomingRow key={m.id} m={m} />)}
            </div>
          )}
        </Section>
      )}

      {/* Rest of the week — collapsed by default */}
      {!isLoading && meetings.length > 0 && (later.length > 0 || hiddenUpcoming > 0) && (
        <section className="mb-6">
          <button
            onClick={() => setLaterExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 bg-input/30 hover:bg-input/50 transition-colors group"
            aria-expanded={laterExpanded}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <span className="font-display font-semibold text-sm">
                {laterExpanded ? 'Rest of the week' : 'Upcoming · rest of the week'}
              </span>
              <span className="text-xs text-muted-foreground">
                {filteredLater.length} meeting{filteredLater.length === 1 ? '' : 's'}
                {hiddenUpcoming > 0 && ` · +${hiddenUpcoming} further out`}
              </span>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors inline-flex items-center gap-1">
              {laterExpanded ? 'Hide' : 'Show'}
              {laterExpanded ? (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M3 7.5l3-3 3 3H3z"/></svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M3 4.5l3 3 3-3H3z"/></svg>
              )}
            </span>
          </button>
          {laterExpanded && (
            <div className="mt-3 space-y-2.5 animate-in fade-in-50 slide-in-from-top-1 duration-150">
              {filteredLater.length === 0 ? (
                <div className="os-panel p-8 text-center text-sm text-muted-foreground">
                  {q ? 'No meetings match your search.' : 'Nothing scheduled in the next 4 business days.'}
                </div>
              ) : (
                filteredLater.map(m => <UpcomingRow key={m.id} m={m} />)
              )}
              {hiddenUpcoming > 0 && !q && (
                <Link
                  href="/calendar"
                  className="block text-center text-xs text-primary hover:underline pt-2"
                >
                  +{hiddenUpcoming} more beyond this week · view in Calendar →
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* Past */}
      {!isLoading && meetings.length > 0 && (
        <Section
          icon={Clock}
          title="Past"
          subtitle={`Most recent ${Math.min(past.length, PAST_LIMIT)}`}
          count={filteredPast.length}
          footer={
            past.length >= PAST_LIMIT && !q ? (
              <Link
                href="/calendar"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                Older meetings · view in Calendar →
              </Link>
            ) : null
          }
        >
          {filteredPast.length === 0 ? (
            <div className="os-panel p-8 text-center text-sm text-muted-foreground">
              {q ? 'No past meetings match your search.' : 'No past meetings yet.'}
            </div>
          ) : (
            <div className="os-panel divide-y divide-border/60 overflow-hidden">
              {filteredPast.map(m => <PastRow key={m.id} m={m} />)}
            </div>
          )}
        </Section>
      )}

      {dialogOpen && (
        <NewMeetingDialog
          onClose={() => setDialogOpen(false)}
          onCreate={() => { setDialogOpen(false); refetch(); }}
        />
      )}
      {recorderOpen && (
        <VoiceRecorder
          onClose={() => setRecorderOpen(false)}
          onCreated={() => { setRecorderOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
