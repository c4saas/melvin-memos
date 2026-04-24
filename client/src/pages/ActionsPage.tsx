import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, ArrowRight, Filter, Zap } from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import { useToast } from '../components/Toast';

type Row = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  actionIndex: number;
  owner?: string;
  task: string;
  deadline?: string;
};

const OWNER_ALL = '__all__';

export default function ActionsPage() {
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
    refetchInterval: 30_000,
  });

  const [completed, setCompleted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('memos.actions.completed') ?? '[]')); }
    catch { return new Set(); }
  });
  const [ownerFilter, setOwnerFilter] = useState<string>(OWNER_ALL);

  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];
    for (const m of meetings) {
      for (let i = 0; i < (m.actionItems?.length ?? 0); i++) {
        const a = m.actionItems![i];
        rows.push({
          id: `${m.id}:${i}`,
          meetingId: m.id,
          meetingTitle: m.title,
          meetingDate: m.startAt,
          actionIndex: i,
          owner: a.owner,
          task: a.task,
          deadline: a.deadline,
        });
      }
    }
    return rows;
  }, [meetings]);

  const owners = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.owner) s.add(r.owner);
    return Array.from(s).sort();
  }, [allRows]);

  const filtered = useMemo(() => {
    return allRows.filter(r => ownerFilter === OWNER_ALL || r.owner === ownerFilter);
  }, [allRows, ownerFilter]);

  const open = filtered.filter(r => !completed.has(r.id));
  const done = filtered.filter(r => completed.has(r.id));

  const toggle = (id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('memos.actions.completed', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[900px] mx-auto pb-32 md:pb-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-7">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Action items
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every task extracted across your meetings — in one inbox.
          </p>
        </div>
        {owners.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            <button
              onClick={() => setOwnerFilter(OWNER_ALL)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                ownerFilter === OWNER_ALL ? 'bg-primary text-primary-foreground' : 'bg-input/40 text-muted-foreground hover:bg-input border border-border',
              )}
            >
              Everyone
            </button>
            {owners.slice(0, 6).map(o => (
              <button
                key={o}
                onClick={() => setOwnerFilter(o)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  ownerFilter === o ? 'bg-primary text-primary-foreground' : 'bg-input/40 text-muted-foreground hover:bg-input border border-border',
                )}
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <Stat value={String(open.length)} label="Open" tone="primary" />
        <Stat value={String(done.length)} label="Completed" tone="success" />
        <Stat value={String(allRows.length)} label="Total extracted" tone="muted" />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!isLoading && allRows.length === 0 && (
        <div className="os-panel p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center bg-primary/10">
            <CheckCircle2 className="w-6 h-6 text-primary" />
          </div>
          <div className="font-display font-semibold text-base mb-1">No action items yet</div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Action items appear here automatically after each meeting is summarized.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Open · {open.length}
          </h2>
          <div className="os-panel divide-y divide-border/60">
            {open.map(r => <ActionRow key={r.id} row={r} done={false} onToggle={() => toggle(r.id)} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Completed · {done.length}
          </h2>
          <div className="os-panel divide-y divide-border/60 opacity-70">
            {done.map(r => <ActionRow key={r.id} row={r} done onToggle={() => toggle(r.id)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: 'primary' | 'success' | 'muted' }) {
  const toneClass = tone === 'primary'
    ? 'text-primary'
    : tone === 'success'
      ? 'text-[hsl(142_71%_45%)]'
      : 'text-foreground';
  return (
    <div className="os-panel p-3 sm:p-4">
      <div className={cn('font-display text-xl sm:text-2xl font-semibold tabular-nums leading-none', toneClass)}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ActionRow({ row, done, onToggle }: { row: Row; done: boolean; onToggle: () => void }) {
  const toast = useToast();
  const sendToLinear = useMutation({
    mutationFn: () => api.linearCreateIssue({ meetingId: row.meetingId, actionIndex: row.actionIndex }),
    onSuccess: (r) => {
      toast.success(`Created ${r.identifier} in Linear`);
      window.open(r.url, '_blank');
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Linear failed'),
  });

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors group">
      <button
        onClick={onToggle}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        className="mt-0.5 shrink-0"
      >
        {done
          ? <CheckCircle2 className="w-4 h-4 text-[hsl(142_71%_45%)]" />
          : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm leading-snug', done && 'line-through text-muted-foreground')}>
          {row.owner && <span className="attendee-chip mr-2">{row.owner}</span>}
          {row.task}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <Link href={`/meetings/${row.meetingId}`} className="hover:text-primary inline-flex items-center gap-1 truncate">
            <span className="truncate max-w-[200px]">{row.meetingTitle}</span>
            <ArrowRight className="w-3 h-3 shrink-0" />
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatDate(row.meetingDate)}</span>
          {row.deadline && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1 text-[hsl(32_95%_60%)]">
                <Clock className="w-3 h-3" /> {row.deadline}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={() => sendToLinear.mutate()}
        disabled={sendToLinear.isPending}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-border"
        title="Send to Linear"
      >
        <Zap className="w-3 h-3" />
        {sendToLinear.isPending ? 'Sending…' : 'Linear'}
      </button>
    </div>
  );
}
