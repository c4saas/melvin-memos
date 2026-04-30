import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowLeft, X, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { useIsMobile } from '../hooks/useIsMobile';

type Step = {
  target: string | null;           // data-tour selector value; null = centered modal
  title: string;
  body: string;
  needsMobileSidebar?: boolean;    // Fire open-drawer event if mobile
  placement?: 'auto' | 'center';
};

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to Memos 👋',
    body: `Capture meetings three ways: hit record for a voice note, paste a Meet/Zoom/Teams URL, or connect a calendar. Transcripts + summaries appear automatically. Let's take a 60-second tour.`,
    placement: 'center',
  },
  {
    target: 'feed-nav',
    title: 'My Feed',
    body: 'Your home screen — recent meetings with AI-generated summaries, grouped by today / week / earlier.',
    needsMobileSidebar: true,
  },
  {
    target: 'meetings-nav',
    title: 'Meetings',
    body: 'The full table view — every meeting with attendees, status, and quick actions. Open one to see the transcript and action items.',
    needsMobileSidebar: true,
  },
  {
    target: 'calendar-nav',
    title: 'Calendar',
    body: 'Month view of all your meetings. Useful for spotting upcoming recordings and seeing your week at a glance.',
    needsMobileSidebar: true,
  },
  {
    target: 'analytics-nav',
    title: 'Analytics',
    body: 'Usage stats — hours captured, action items extracted, top hosts, and success rate.',
    needsMobileSidebar: true,
  },
  {
    target: 'settings-nav',
    title: 'Settings',
    body: 'Connect your Google / Outlook calendar, set up Groq (transcription), Notion (sync), and the signed-in bot session for Meet.',
    needsMobileSidebar: true,
  },
  {
    target: 'docs-nav',
    title: 'Docs',
    body: `Everything you need — OAuth setup, Groq, Notion, whitelabeling, the integration API. You're done!`,
    needsMobileSidebar: true,
  },
];

const STORAGE_KEY = 'memos.tour.completed';
const PENDING_KEY = 'memos.tour.pending';

type Rect = { top: number; left: number; width: number; height: number };

function getRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function SpotlightTour({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const frameRef = useRef<number | null>(null);

  // Start tour if pending flag set, or if never completed (first real visit).
  useEffect(() => {
    let shouldStart = false;
    try {
      if (localStorage.getItem(PENDING_KEY) === '1') {
        localStorage.removeItem(PENDING_KEY);
        shouldStart = true;
      } else if (!localStorage.getItem(STORAGE_KEY)) {
        shouldStart = true;
      }
    } catch {}
    if (shouldStart) {
      const t = setTimeout(() => setActive(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  // Allow external trigger: window.dispatchEvent(new Event('memos:start-tour'))
  useEffect(() => {
    const h = () => { setIndex(0); setActive(true); };
    window.addEventListener('memos:start-tour', h);
    return () => window.removeEventListener('memos:start-tour', h);
  }, []);

  // When step needs sidebar on mobile, open it.
  useEffect(() => {
    if (!active) return;
    const step = STEPS[index];
    if (isMobile && step?.needsMobileSidebar) onOpenMobileMenu();
  }, [active, index, isMobile, onOpenMobileMenu]);

  // Track target element's rect on every frame while active.
  useLayoutEffect(() => {
    if (!active) return;
    const step = STEPS[index];
    if (!step?.target) {
      setRect(null);
      return;
    }
    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      setRect(getRect(el));
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [active, index]);

  if (!active) return null;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    setActive(false);
  };

  const next = () => (last ? finish() : setIndex(i => i + 1));
  const prev = () => setIndex(i => Math.max(0, i - 1));

  // Compute tooltip position.
  let tooltipStyle: React.CSSProperties = {};
  if (step.placement === 'center' || !rect) {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const pad = 12;
    const below = rect.top + rect.height + pad;
    const aboveRoom = rect.top - pad;
    const w = Math.min(360, window.innerWidth - 32);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(16, Math.min(window.innerWidth - w - 16, left));
    if (below + 240 < window.innerHeight) {
      tooltipStyle = { top: below, left, width: w };
    } else if (aboveRoom > 240) {
      tooltipStyle = { top: aboveRoom - 220, left, width: w };
    } else {
      tooltipStyle = { top: window.innerHeight - 260, left, width: w };
    }
  }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Dim overlay with cutout for target */}
      <div
        className="absolute inset-0 bg-black/70 pointer-events-auto transition-opacity duration-200"
        onClick={finish}
        style={
          rect
            ? {
                clipPath: `polygon(
                  0 0,
                  100% 0,
                  100% 100%,
                  0 100%,
                  0 ${rect.top - 6}px,
                  ${rect.left - 6}px ${rect.top - 6}px,
                  ${rect.left - 6}px ${rect.top + rect.height + 6}px,
                  ${rect.left + rect.width + 6}px ${rect.top + rect.height + 6}px,
                  ${rect.left + rect.width + 6}px ${rect.top - 6}px,
                  0 ${rect.top - 6}px
                )`,
              }
            : undefined
        }
      />

      {/* Spotlight ring around target */}
      {rect && (
        <div
          className="absolute rounded-lg pointer-events-none ring-2 ring-primary/70 shadow-[0_0_0_6px_hsl(var(--primary)/0.25)] animate-pulse"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className={cn(
          'absolute pointer-events-auto surface-1 p-5 shadow-2xl',
          'animate-in fade-in-50 zoom-in-95 duration-200',
        )}
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--ring)))' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div className="font-display font-semibold text-sm truncate">{step.title}</div>
          </div>
          <button
            onClick={finish}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground font-mono">
            {index + 1} / {STEPS.length}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <button
              onClick={finish}
              className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={next}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {last ? 'Get started' : 'Next'}
              {!last && <ArrowRight className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
