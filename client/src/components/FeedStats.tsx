import type { Meeting } from '../lib/api';
import { Clock, CheckCircle2, FileText } from 'lucide-react';
import { useMemo } from 'react';

function hoursLabel(sec: number): string {
  if (sec === 0) return '—';
  const h = sec / 3600;
  if (h < 1) return `${Math.round(sec / 60)}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export function FeedStats({ meetings }: { meetings: Meeting[] }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 86400 * 1000;
    const weekAgo = now - weekMs;
    let count = 0;
    let sec = 0;
    let actions = 0;
    for (const m of meetings) {
      if (m.status !== 'completed') continue;
      const t = new Date(m.startAt).getTime();
      if (t < weekAgo) continue;
      count++;
      sec += m.durationSeconds ?? 0;
      actions += m.actionItems?.length ?? 0;
    }
    return { count, hours: hoursLabel(sec), actions };
  }, [meetings]);

  if (stats.count === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
      <Stat icon={FileText} label="This week" value={String(stats.count)} sub="meetings" />
      <Stat icon={Clock} label="Captured" value={stats.hours} sub="in the last 7 days" />
      <Stat icon={CheckCircle2} label="Action items" value={String(stats.actions)} sub="extracted" />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="os-panel p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="font-display text-xl sm:text-2xl font-semibold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</div>
    </div>
  );
}
