import { Route, Switch, Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Settings as SettingsIcon, Mic, LogOut, BookOpen } from 'lucide-react';
import MeetingsPage from './pages/MeetingsPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DocsPage from './pages/DocsPage';
import { api } from './lib/api';
import { cn } from './lib/utils';
import { useBranding } from './hooks/useBranding';
import { ThemeToggle } from './components/ThemeToggle';

function Sidebar() {
  const [location] = useLocation();
  const qc = useQueryClient();
  const brand = useBranding();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });

  const nav = [
    { href: '/', icon: FileText, label: 'Meetings' },
    { href: '/settings', icon: SettingsIcon, label: 'Settings' },
    { href: '/docs', icon: BookOpen, label: 'Docs' },
  ];

  const logout = async () => {
    await api.logout().catch(() => {});
    qc.invalidateQueries({ queryKey: ['me'] });
    window.location.href = '/';
  };

  return (
    <aside className="w-[240px] min-w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} className="w-9 h-9 rounded-xl object-cover" />
        ) : (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, hsl(${brand.primaryHsl}), hsl(${brand.accentHsl}))` }}
          >
            <Mic className="w-5 h-5 text-background" strokeWidth={2.5} />
          </div>
        )}
        <div>
          <div className="font-display font-semibold text-base leading-tight">{brand.shortName}</div>
          <div className="text-xs text-muted-foreground leading-tight">{brand.tagline}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(item => {
          const active = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <ThemeToggle />
        {me?.user ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1 truncate">{me.user.email}</div>
            <button onClick={logout} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="memos-accent-dot animate-pulse-dot" />
            <span>Single-user mode</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function AppShell() {
  const brand = useBranding();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <Switch>
          <Route path="/" component={MeetingsPage} />
          <Route path="/meetings/:id" component={MeetingDetailPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/docs" component={DocsPage} />
        </Switch>
        {!brand.hidePoweredBy && brand.poweredBy && brand.name !== brand.poweredBy && (
          <div className="fixed bottom-3 right-4 text-[10px] text-muted-foreground/60 font-sans">
            Powered by{' '}
            {brand.productUrl ? (
              <a href={brand.productUrl} target="_blank" rel="noreferrer" className="hover:text-muted-foreground">{brand.poweredBy}</a>
            ) : brand.poweredBy}
          </div>
        )}
      </main>
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
