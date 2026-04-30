import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const platformLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  voice: 'Voice recording',
};

/**
 * Humanized "time until" / "time since" label.
 *   -  now          → "Live now"
 *   -  <60s away    → "Starts in 30s"
 *   -  <60m away    → "in 12m"
 *   -  <24h away    → "in 2h 15m"
 *   -  today        → "Today 3:45 PM"
 *   -  tomorrow     → "Tomorrow 10:00 AM"
 *   -  this week    → "Thu · 9:30 AM"
 *   -  further      → "Apr 28 · 2:00 PM"
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const deltaMs = then.getTime() - now.getTime();
  const absMin = Math.floor(Math.abs(deltaMs) / 60000);

  if (Math.abs(deltaMs) < 60_000) return 'Live now';
  if (deltaMs < 0) {
    if (absMin < 60) return `${absMin}m ago`;
    if (absMin < 24 * 60) return `${Math.floor(absMin / 60)}h ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (absMin < 60) return `in ${absMin}m`;
  if (absMin < 24 * 60) {
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const weekend = new Date(today); weekend.setDate(today.getDate() + 7);
  const thenDate = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const time = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (thenDate.getTime() === today.getTime()) return `Today · ${time}`;
  if (thenDate.getTime() === tomorrow.getTime()) return `Tomorrow · ${time}`;
  if (thenDate < weekend) return `${then.toLocaleDateString(undefined, { weekday: 'short' })} · ${time}`;
  return `${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}
