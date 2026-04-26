import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, Video, CheckCircle2, Users } from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { platformLabels } from '../lib/utils';

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="surface-1 p-3 sm:p-5 min-w-0">
      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-2 sm:mb-3">
        <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className="font-display text-lg sm:text-2xl font-semibold tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}

function hoursFromSeconds(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.round(seconds / 60)}m`;
  return `${h.toFixed(1)}h`;
}

export default function AnalyticsPage() {
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setMonth(now.getMonth() - 1);

    const thisWeek = meetings.filter(m => new Date(m.startAt) >= weekStart);
    const thisMonth = meetings.filter(m => new Date(m.startAt) >= monthStart);
    const totalSeconds = meetings.reduce((a, m) => a + (m.durationSeconds ?? 0), 0);
    const completed = meetings.filter(m => m.status === 'completed').length;
    const failed = meetings.filter(m => m.status === 'failed').length;
    const byPlatform = meetings.reduce<Record<string, number>>((acc, m) => {
      acc[m.platform] = (acc[m.platform] ?? 0) + 1;
      return acc;
    }, {});
    const hosts = meetings.reduce<Record<string, number>>((acc, m) => {
      if (m.host) acc[m.host] = (acc[m.host] ?? 0) + 1;
      return acc;
    }, {});
    const topHosts = Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const actionItems = meetings.reduce((a, m) => a + (m.actionItems?.length ?? 0), 0);

    return {
      total: meetings.length,
      thisWeek: thisWeek.length,
      thisMonth: thisMonth.length,
      totalHours: hoursFromSeconds(totalSeconds),
      completed,
      failed,
      byPlatform,
      topHosts,
      actionItems,
    };
  }, [meetings]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[1200px] mx-auto pb-32 md:pb-8">
      <header className="mb-6">
        <h1 className="font-display text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Usage and activity across all your meetings.</p>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6">
            <Stat icon={Video} label="Total meetings" value={stats.total} sub={`${stats.thisWeek} this week`} />
            <Stat icon={Clock} label="Total time" value={stats.totalHours} sub="captured & transcribed" />
            <Stat icon={CheckCircle2} label="Action items" value={stats.actionItems} sub="extracted" />
            <Stat
              icon={BarChart3}
              label="Success rate"
              value={stats.total === 0 ? '—' : `${Math.round((stats.completed / stats.total) * 100)}%`}
              sub={`${stats.completed} completed · ${stats.failed} failed`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <section className="surface-1 p-5">
              <h2 className="font-display font-semibold text-base mb-3">By platform</h2>
              {Object.keys(stats.byPlatform).length === 0 ? (
                <div className="text-sm text-muted-foreground">No meetings yet.</div>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(stats.byPlatform)
                    .sort((a, b) => b[1] - a[1])
                    .map(([p, n]) => (
                      <li key={p} className="flex items-center justify-between text-sm">
                        <span>{platformLabels[p] ?? p}</span>
                        <span className="tabular-nums text-muted-foreground">{n}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="surface-1 p-5">
              <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Top hosts
              </h2>
              {stats.topHosts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No host data yet.</div>
              ) : (
                <ul className="space-y-2">
                  {stats.topHosts.map(([host, n]) => (
                    <li key={host} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{host}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
