import { useEffect, useState } from 'react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, ListChecks, Calendar as CalendarIcon, BarChart3,
  Settings as SettingsIcon, LogOut, BookOpen, Menu, X, CheckCircle2, Grid3x3,
} from 'lucide-react';
import MeetingsPage from './pages/MeetingsPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DocsPage from './pages/DocsPage';
import FeedPage from './pages/FeedPage';
import CalendarPage from './pages/CalendarPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ActionsPage from './pages/ActionsPage';
import CompanionsPage from './pages/CompanionsPage';
import { api } from './lib/api';
import { cn } from './lib/utils';
import { useBranding } from './hooks/useBranding';
import { useIsMobile } from './hooks/useIsMobile';
import { ThemeToggle } from './components/ThemeToggle';
import { SpotlightTour } from './components/SpotlightTour';
import { MobileBottomBar } from './components/MobileBottomBar';
import { VoiceRecorder } from './components/VoiceRecorder';
import { BrandMark } from './components/BrandMark';
import { CommandPalette } from './components/CommandPalette';

const NAV_ITEMS = [
  { href: '/', icon: Sparkles, label: 'My Feed', tour: 'feed-nav' },
  { href: '/meetings', icon: ListChecks, label: 'Meetings', tour: 'meetings-nav' },
  { href: '/actions', icon: CheckCircle2, label: 'Action items', tour: 'actions-nav' },
  { href: '/calendar', icon: CalendarIcon, label: 'Calendar', tour: 'calendar-nav' },
  { href: '/analytics', icon: BarChart3, label: 'Analytics', tour: 'analytics-nav' },
  { href: '/apps', icon: Grid3x3, label: 'Apps', tour: 'apps-nav' },
  { href: '/settings', icon: SettingsIcon, label: 'Settings', tour: 'settings-nav' },
  { href: '/docs', icon: BookOpen, label: 'Docs', tour: 'docs-nav' },
];

function isActive(path: string, href: string) {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(href + '/');
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const qc = useQueryClient();
  const brand = useBranding();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });

  const logout = async () => {
    await api.logout().catch(() => {});
    qc.invalidateQueries({ queryKey: ['me'] });
    window.location.href = '/';
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <BrandMark size={36} />
        <div className="min-w-0">
          <div className="font-display font-semibold text-base leading-tight truncate">{brand.shortName}</div>
          <div className="text-xs text-muted-foreground leading-tight truncate">{brand.tagline}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = isActive(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-tour={item.tour}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all min-h-[40px]',
                active
                  ? 'bg-accent text-accent-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-0.5',
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-3">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('memos:open-palette'))}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          title="Quick search"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-3 h-3" /> Quick search
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono">
            <kbd className="px-1 py-0.5 rounded bg-input/70 border border-border">⌘</kbd>
            <kbd className="px-1 py-0.5 rounded bg-input/70 border border-border">K</kbd>
          </span>
        </button>
        <ThemeToggle />
        {me?.user ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1 truncate" title={me.user.email}>{me.user.email}</div>
            <button onClick={logout} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="memos-accent-dot animate-pulse-dot" />
            <span>Signed out</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileHeader({ onMenu }: { onMenu: () => void }) {
  const brand = useBranding();
  const [location] = useLocation();
  const current = NAV_ITEMS.find(n => isActive(location, n.href));
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-background/85 backdrop-blur border-b border-border">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        data-tour="mobile-menu"
        className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 active:scale-95 transition-all"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <BrandMark size={26} />
        <div className="font-display font-semibold text-sm truncate">
          {current?.label ?? brand.shortName}
        </div>
      </div>
    </header>
  );
}

function AppShell() {
  const brand = useBranding();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => { setDrawerOpen(false); }, [location]);

  useEffect(() => {
    if (!drawerOpen) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawerOpen]);

  // Global keyboard shortcuts: Cmd/Ctrl+K opens palette, Cmd+Shift+R opens recorder.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setRecorderOpen(true);
      }
    };
    const openPalette = () => setPaletteOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('memos:open-palette', openPalette);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('memos:open-palette', openPalette);
    };
  }, []);

  return (
    <div className="h-[100dvh] flex bg-background overflow-hidden">
      {/* Desktop static sidebar */}
      <aside className="hidden md:flex w-[240px] min-w-[240px] border-r border-border">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {isMobile && (
        <>
          <div
            className={cn(
              'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200',
              drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              'fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85vw] border-r border-border',
              'transition-transform duration-[220ms] ease-out will-change-transform',
              drawerOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent/50 active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isMobile && <MobileHeader onMenu={() => setDrawerOpen(true)} />}
        <main key={location} className="flex-1 overflow-y-auto relative animate-in fade-in-50 slide-in-from-bottom-1 duration-200">
          <Switch>
            <Route path="/" component={FeedPage} />
            <Route path="/meetings" component={MeetingsPage} />
            <Route path="/meetings/:id" component={MeetingDetailPage} />
            <Route path="/actions" component={ActionsPage} />
            <Route path="/calendar" component={CalendarPage} />
            <Route path="/analytics" component={AnalyticsPage} />
            <Route path="/apps" component={CompanionsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/docs" component={DocsPage} />
          </Switch>
          {!brand.hidePoweredBy && brand.poweredBy && brand.name !== brand.poweredBy && (
            <div className="hidden md:block fixed bottom-3 right-4 text-[10px] text-muted-foreground/60 font-sans">
              Powered by{' '}
              {brand.productUrl ? (
                <a href={brand.productUrl} target="_blank" rel="noreferrer" className="hover:text-muted-foreground">{brand.poweredBy}</a>
              ) : brand.poweredBy}
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom bar (Fireflies-style) */}
      {isMobile && (
        <MobileBottomBar
          onOpenMenu={() => setDrawerOpen(true)}
          onRecord={() => setRecorderOpen(true)}
        />
      )}

      {recorderOpen && (
        <VoiceRecorder
          onClose={() => setRecorderOpen(false)}
          onCreated={() => setRecorderOpen(false)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRecord={() => setRecorderOpen(true)}
      />

      <SpotlightTour onOpenMobileMenu={() => setDrawerOpen(true)} />
    </div>
  );
}

export default function App() {
  const qc = useQueryClient();
  useBranding();
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const { data: setup } = useQuery({
    queryKey: ['setup-status'],
    queryFn: api.setupStatus,
    enabled: Boolean(me?.needsSetup),
  });

  // If ANY authed request returns 401, re-check /me so we render the login
  // screen instead of exploding toasts.
  useEffect(() => {
    const h = () => {
      qc.invalidateQueries({ queryKey: ['me'] });
    };
    window.addEventListener('memos:session-expired', h);
    return () => window.removeEventListener('memos:session-expired', h);
  }, [qc]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (me?.needsSetup) {
    return (
      <SetupPage
        defaultEmail={setup?.defaultEmail}
        defaultName={setup?.defaultName}
        onComplete={() => {
          try { localStorage.setItem('memos.tour.pending', '1'); } catch {}
          qc.invalidateQueries({ queryKey: ['me'] });
          qc.invalidateQueries({ queryKey: ['setup-status'] });
        }}
      />
    );
  }

  if (me?.loginRequired) {
    return <LoginPage onLoggedIn={() => qc.invalidateQueries({ queryKey: ['me'] })} />;
  }

  return <AppShell />;
}
