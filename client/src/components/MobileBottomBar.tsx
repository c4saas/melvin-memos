import { Link, useLocation } from 'wouter';
import { Sparkles, ListChecks, Calendar as CalendarIcon, Menu, Mic } from 'lucide-react';
import { cn } from '../lib/utils';

export function MobileBottomBar({
  onOpenMenu,
  onRecord,
}: {
  onOpenMenu: () => void;
  onRecord: () => void;
}) {
  const [location] = useLocation();

  const items = [
    { href: '/', icon: Sparkles, label: 'Feed' },
    { href: '/meetings', icon: ListChecks, label: 'Meetings' },
  ];
  const trailing = [
    { href: '/calendar', icon: CalendarIcon, label: 'Calendar' },
  ];

  const isActive = (href: string) => location === href || (href !== '/' && location.startsWith(href));

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 safe-area-bottom bg-background/90 backdrop-blur border-t border-border"
    >
      <div className="relative flex items-stretch justify-between px-2">
        {items.map(it => {
          const a = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors',
                a ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <it.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{it.label}</span>
            </Link>
          );
        })}

        {/* Center mic button — elevated */}
        <div className="flex-1 relative flex items-start justify-center">
          <button
            onClick={onRecord}
            aria-label="Record voice"
            className={cn(
              'absolute -top-5 w-14 h-14 rounded-full flex items-center justify-center',
              'shadow-lg shadow-primary/30 ring-4 ring-background',
              'active:scale-95 transition-transform',
            )}
            style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--ring)))' }}
          >
            <Mic className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </button>
          <div className="pt-10 pb-2 text-[10px] font-medium text-muted-foreground">Record</div>
        </div>

        {trailing.map(it => {
          const a = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors',
                a ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <it.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{it.label}</span>
            </Link>
          );
        })}

        <button
          onClick={onOpenMenu}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-muted-foreground"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
