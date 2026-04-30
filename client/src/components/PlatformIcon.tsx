import { Mic, Video } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Small platform glyph used in meetings lists.
 * Uses brand colors (not trademarked logos — keeps us safe).
 */
export function PlatformIcon({
  platform,
  size = 28,
  className,
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  const s = size;
  const common = 'flex items-center justify-center rounded-lg shrink-0 font-display font-semibold';

  if (platform === 'google_meet') {
    return (
      <div
        className={cn(common, className)}
        style={{
          width: s, height: s,
          background: 'linear-gradient(135deg, hsl(142 71% 45% / 0.14), hsl(142 71% 45% / 0.06))',
          border: '1px solid hsl(142 71% 45% / 0.3)',
        }}
        title="Google Meet"
      >
        <svg viewBox="0 0 24 24" width={Math.round(s * 0.55)} height={Math.round(s * 0.55)} aria-hidden="true">
          <path fill="hsl(142 71% 45%)" d="M4 7h12v10H4z"/>
          <path fill="hsl(142 40% 30%)" d="M16 10l4-2v8l-4-2z"/>
        </svg>
      </div>
    );
  }

  if (platform === 'zoom') {
    return (
      <div
        className={cn(common, className)}
        style={{
          width: s, height: s,
          background: 'linear-gradient(135deg, hsl(217 91% 60% / 0.14), hsl(217 91% 60% / 0.06))',
          border: '1px solid hsl(217 91% 60% / 0.3)',
        }}
        title="Zoom"
      >
        <Video className="text-[hsl(217_91%_60%)]" style={{ width: s * 0.52, height: s * 0.52 }} strokeWidth={2.2} />
      </div>
    );
  }

  if (platform === 'teams') {
    return (
      <div
        className={cn(common, className)}
        style={{
          width: s, height: s,
          background: 'linear-gradient(135deg, hsl(262 83% 70% / 0.14), hsl(262 83% 70% / 0.06))',
          border: '1px solid hsl(262 83% 70% / 0.3)',
          color: 'hsl(262 83% 70%)',
          fontSize: Math.round(s * 0.4),
        }}
        title="Microsoft Teams"
      >
        T
      </div>
    );
  }

  if (platform === 'voice') {
    return (
      <div
        className={cn(common, className)}
        style={{
          width: s, height: s,
          background: 'linear-gradient(135deg, hsl(32 95% 60% / 0.14), hsl(32 95% 60% / 0.06))',
          border: '1px solid hsl(32 95% 60% / 0.3)',
        }}
        title="Voice recording"
      >
        <Mic className="text-[hsl(32_95%_60%)]" style={{ width: s * 0.5, height: s * 0.5 }} strokeWidth={2.2} />
      </div>
    );
  }

  return (
    <div
      className={cn(common, className)}
      style={{
        width: s, height: s,
        background: 'hsl(var(--muted) / 0.5)',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <Video className="text-muted-foreground" style={{ width: s * 0.5, height: s * 0.5 }} />
    </div>
  );
}
