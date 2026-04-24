/**
 * Stacked circular avatars with deterministic gradient colors based on email/name.
 * Shows the first N attendees + "+X" for the rest.
 */

type Attendee = { email: string; name?: string };

// 8 soft gradients. Picked by hashing the key so the same attendee always gets the same color.
const GRADS = [
  ['#60a5fa', '#3b82f6'], // blue
  ['#a78bfa', '#7c3aed'], // violet
  ['#f472b6', '#db2777'], // pink
  ['#fbbf24', '#d97706'], // amber
  ['#34d399', '#059669'], // emerald
  ['#f87171', '#dc2626'], // red
  ['#22d3ee', '#0891b2'], // cyan
  ['#818cf8', '#4f46e5'], // indigo
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(a: Attendee): string {
  const src = (a.name || a.email.split('@')[0] || '').replace(/[._-]+/g, ' ');
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarStack({ attendees, max = 4 }: { attendees: Attendee[]; max?: number }) {
  if (!attendees?.length) return null;
  const shown = attendees.slice(0, max);
  const rest = attendees.length - shown.length;
  return (
    <div className="inline-flex items-center" aria-label={`${attendees.length} attendees`}>
      {shown.map((a, i) => {
        const key = a.email || a.name || String(i);
        const [from, to] = GRADS[hash(key) % GRADS.length];
        return (
          <span
            key={key + i}
            className="avatar"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            title={a.name ?? a.email}
          >
            {initials(a)}
          </span>
        );
      })}
      {rest > 0 && <span className="avatar-rest">+{rest}</span>}
    </div>
  );
}
