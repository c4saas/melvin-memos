import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Sparkles, ListChecks, Calendar as CalendarIcon, BarChart3,
  Settings as SettingsIcon, BookOpen, Mic, FileText, CheckCircle2, Command,
  Zap,
} from 'lucide-react';
import { api, type Meeting } from '../lib/api';
import { formatDate, platformLabels, cn } from '../lib/utils';
import { markdownToText } from './MarkdownLite';

type Page = { kind: 'page'; icon: typeof Search; label: string; to: string; hint?: string };
type MeetingItem = { kind: 'meeting'; meeting: Meeting };
type ActionItem = { kind: 'action'; label: string; run: () => void; icon: typeof Search; hint?: string };
type SemanticHit = {
  kind: 'semantic';
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  source: 'summary' | 'transcript';
  snippet: string;
  score: number;
};
type Item = Page | MeetingItem | ActionItem | SemanticHit;

const PAGES: Page[] = [
  { kind: 'page', icon: Sparkles, label: 'My Feed', to: '/' },
  { kind: 'page', icon: ListChecks, label: 'Meetings', to: '/meetings' },
  { kind: 'page', icon: CheckCircle2, label: 'Action items', to: '/actions' },
  { kind: 'page', icon: CalendarIcon, label: 'Calendar', to: '/calendar' },
  { kind: 'page', icon: BarChart3, label: 'Analytics', to: '/analytics' },
  { kind: 'page', icon: Sparkles, label: 'Apps', to: '/apps' },
  { kind: 'page', icon: SettingsIcon, label: 'Settings', to: '/settings' },
  { kind: 'page', icon: BookOpen, label: 'Docs', to: '/docs' },
];

type Mode = 'nav' | 'semantic';

export function CommandPalette({
  open,
  onClose,
  onRecord,
}: {
  open: boolean;
  onClose: () => void;
  onRecord: () => void;
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('nav');
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings'],
    queryFn: api.listMeetings,
    enabled: open,
  });

  // Reset state each time the palette opens; focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMode('nav');
    setSemanticHits([]);
    setSemanticError(null);
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced semantic fetch
  useEffect(() => {
    if (mode !== 'semantic') return;
    const q = query.trim();
    if (!q) { setSemanticHits([]); return; }
    setSemanticLoading(true);
    setSemanticError(null);
    const t = setTimeout(async () => {
      try {
        const resp = await api.semanticSearch(q, 12);
        setSemanticHits(resp.hits.map(h => ({ kind: 'semantic' as const, ...h })));
      } catch (e) {
        setSemanticError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setSemanticLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  const navItems = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const base: Item[] = [];

    base.push({
      kind: 'action',
      label: 'Record voice note',
      icon: Mic,
      hint: 'Start a new recording',
      run: () => { onClose(); onRecord(); },
    });
    base.push({
      kind: 'action',
      label: 'Ask Memos (semantic search)',
      icon: Zap,
      hint: 'Search across transcripts + summaries',
      run: () => { setMode('semantic'); setQuery(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 0); },
    });

    base.push(...PAGES);
    base.push(...meetings.map(m => ({ kind: 'meeting' as const, meeting: m })));

    if (!q) return base.slice(0, 14);

    const score = (label: string, text: string) => {
      const l = label.toLowerCase();
      const t = text.toLowerCase();
      if (l.startsWith(q)) return 100;
      if (l.includes(q)) return 60;
      if (t.includes(q)) return 30;
      return 0;
    };

    return base
      .map(item => {
        if (item.kind === 'meeting') {
          const summary = markdownToText(item.meeting.summary ?? '').slice(0, 400);
          const s = score(item.meeting.title, summary + ' ' + (item.meeting.host ?? ''));
          return { item, s };
        }
        if (item.kind === 'action' || item.kind === 'page') {
          const s = score(item.label, (item as any).hint ?? '');
          return { item, s };
        }
        return { item, s: 0 };
      })
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map(x => x.item);
  }, [query, meetings, onClose, onRecord]);

  const items: Item[] = mode === 'semantic' ? semanticHits : navItems;
  const max = items.length;
  useEffect(() => { setIndex(0); }, [query, mode]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(max - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); execute(items[index]); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (mode === 'semantic') { setMode('nav'); setQuery(''); }
        else onClose();
      }
      else if (e.key === 'Tab') {
        e.preventDefault();
        setMode(m => (m === 'nav' ? 'semantic' : 'nav'));
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, index, max, items, mode]);

  function execute(item: Item | undefined) {
    if (!item) return;
    if (item.kind === 'page') {
      navigate(item.to);
      onClose();
    } else if (item.kind === 'meeting') {
      navigate(`/meetings/${item.meeting.id}`);
      onClose();
    } else if (item.kind === 'action') {
      item.run();
    } else if (item.kind === 'semantic') {
      navigate(`/meetings/${item.meetingId}`);
      onClose();
    }
  }

  if (!open) return null;

  const placeholder = mode === 'semantic'
    ? 'Ask: "what did we decide about pricing?"'
    : 'Search meetings, jump to a page, or run an action…';

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/55 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh] animate-in fade-in-50 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] os-panel overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        {/* Mode toggle header */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-0">
          <button
            onClick={() => { setMode('nav'); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}
            className={cn(
              'text-[11px] font-medium px-2 py-1 rounded-md transition-colors',
              mode === 'nav' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Navigate
          </button>
          <button
            onClick={() => { setMode('semantic'); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}
            className={cn(
              'text-[11px] font-medium px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1',
              mode === 'semantic' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Zap className="w-3 h-3" /> Ask Memos
          </button>
          <div className="ml-auto text-[10px] text-muted-foreground font-mono">
            <kbd className="px-1 py-0.5 rounded bg-input/50 border border-border">Tab</kbd> switch
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          {mode === 'semantic' ? (
            <Zap className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 border border-border rounded">
            esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {mode === 'semantic' && semanticLoading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground inline-flex items-center gap-2 justify-center w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Searching…
            </div>
          )}
          {mode === 'semantic' && semanticError && (
            <div className="px-4 py-4 text-sm text-destructive">
              {semanticError}
            </div>
          )}
          {mode === 'semantic' && !semanticLoading && query && items.length === 0 && !semanticError && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matching memories. Try a different phrasing.
            </div>
          )}
          {mode === 'semantic' && !query && !semanticLoading && (
            <div className="px-4 py-8 text-center">
              <Zap className="w-8 h-8 text-primary mx-auto mb-2 opacity-70" />
              <div className="text-sm font-medium mb-1">Ask a question</div>
              <div className="text-xs text-muted-foreground">
                Semantic search across every meeting's transcript + summary.<br />
                Try <i>"decisions on pricing"</i> or <i>"who owns the onboarding rewrite"</i>.
              </div>
            </div>
          )}
          {mode === 'nav' && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results.
            </div>
          )}
          {items.map((item, i) => (
            <CommandRow
              key={rowKey(item, i)}
              item={item}
              active={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => execute(item)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 text-[11px] text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd><Kbd>↓</Kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd> select
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Command className="w-3 h-3" /> <Kbd>K</Kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function rowKey(item: Item, i: number): string {
  if (item.kind === 'meeting') return `m-${item.meeting.id}`;
  if (item.kind === 'semantic') return `s-${item.meetingId}-${i}`;
  return `${item.kind}-${i}`;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] px-1 py-0.5 rounded border border-border bg-background font-mono text-[10px]">
      {children}
    </kbd>
  );
}

function CommandRow({
  item,
  active,
  onMouseEnter,
  onClick,
}: {
  item: Item;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (item.kind === 'semantic') {
    return (
      <button
        ref={rowRef}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors',
          active ? 'bg-primary/10' : 'hover:bg-accent/40',
        )}
      >
        <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{item.meetingTitle}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted/60">
              {item.source}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatDate(item.meetingDate)} · {Math.round(item.score * 100)}% match
          </div>
          <div className="text-[12px] text-foreground/80 mt-1.5 leading-snug line-clamp-2">
            {item.snippet}
          </div>
        </div>
      </button>
    );
  }

  if (item.kind === 'meeting') {
    const m = item.meeting;
    return (
      <button
        ref={rowRef}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
          active ? 'bg-primary/10' : 'hover:bg-accent/40',
        )}
      >
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{m.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {formatDate(m.startAt)} · {platformLabels[m.platform] ?? m.platform}
          </div>
        </div>
      </button>
    );
  }
  if (item.kind === 'action') {
    const Icon = item.icon;
    return (
      <button
        ref={rowRef}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
          active ? 'bg-primary/10' : 'hover:bg-accent/40',
        )}
      >
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{item.label}</div>
          {item.hint && <div className="text-[11px] text-muted-foreground">{item.hint}</div>}
        </div>
      </button>
    );
  }
  const Icon = item.icon;
  return (
    <button
      ref={rowRef}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-accent/40',
      )}
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{item.label}</div>
        <div className="text-[11px] text-muted-foreground">Jump to {item.to}</div>
      </div>
    </button>
  );
}
