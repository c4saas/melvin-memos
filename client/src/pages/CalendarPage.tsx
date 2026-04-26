import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { Button } from '../components/Button';
import { cn, platformLabels } from '../lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const key = ymd(new Date(m.startAt));
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return map;
  }, [meetings]);

  const gridDays = useMemo(() => {
    const first = new Date(anchor);
    const offset = first.getDay(); // 0=Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [anchor]);

  const today = ymd(new Date());
  const monthLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const prev = () => setAnchor(a => new Date(a.getFullYear(), a.getMonth() - 1, 1));
  const next = () => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + 1, 1));
  const todayBtn = () => {
    const d = new Date();
    setAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[1400px] mx-auto pb-32 md:pb-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" /> Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your meetings by date.</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={prev} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-display font-semibold text-sm sm:text-base min-w-[120px] sm:min-w-[160px] text-center">{monthLabel}</div>
          <Button variant="ghost" size="sm" onClick={next} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={todayBtn}>Today</Button>
        </div>
      </header>

      <div className="surface-1 overflow-hidden">
        <div className="grid grid-cols-7 text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
          {DAYS.map(d => (
            <div key={d} className="px-1 sm:px-2 py-1.5 sm:py-2 text-center">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {gridDays.map((d, i) => {
            const key = ymd(d);
            const events = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === anchor.getMonth();
            const isToday = key === today;
            const visibleCount = 2; // shown per cell on all sizes; small enough to fit mobile
            return (
              <div
                key={i}
                className={cn(
                  'border-r border-b border-border/50 min-h-[64px] sm:min-h-[90px] p-1 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1 transition-colors overflow-hidden',
                  !inMonth && 'bg-muted/30 text-muted-foreground/60',
                  isToday && 'bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-[10px] sm:text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {events.length > visibleCount && (
                    <span className="text-[9px] sm:text-[10px] text-muted-foreground">+{events.length - visibleCount}</span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {events.slice(0, visibleCount).map(ev => (
                    <Link
                      key={ev.id}
                      href={`/meetings/${ev.id}`}
                      className="text-[9px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 truncate leading-tight"
                      title={`${ev.title} · ${platformLabels[ev.platform] ?? ev.platform}`}
                    >
                      {ev.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
