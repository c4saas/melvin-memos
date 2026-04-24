import { cn } from '../lib/utils';
import { useBranding } from '../hooks/useBranding';

/**
 * MelvinOS-style brand mark — rounded tile with a tinted ring + inline SVG glyph.
 * If custom logoUrl is set in branding, that image is used instead.
 */
export function BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const brand = useBranding();
  const radius = Math.round(size * 0.25);

  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={brand.name}
        className={cn('object-cover shrink-0', className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  const gradId = 'memos-brand-grad';
  return (
    <div
      className={cn('relative shrink-0 flex items-center justify-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, hsl(${brand.primaryHsl} / 0.15), hsl(${brand.accentHsl} / 0.12))`,
        border: `1px solid hsl(${brand.primaryHsl} / 0.3)`,
        boxShadow: `inset 0 1px 0 hsl(${brand.primaryHsl} / 0.15), 0 1px 2px hsl(${brand.primaryHsl} / 0.08)`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={`hsl(${brand.primaryHsl})`} />
            <stop offset="1" stopColor={`hsl(${brand.accentHsl})`} />
          </linearGradient>
        </defs>
        {/* Mic capsule */}
        <rect x="9" y="3" width="6" height="11" rx="3" fill={`url(#${gradId})`} />
        {/* U-shape stand */}
        <path
          d="M6 11c0 3.3 2.7 6 6 6s6-2.7 6-6"
          stroke={`url(#${gradId})`}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        {/* Stand stem */}
        <path
          d="M12 17v3"
          stroke={`url(#${gradId})`}
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </div>
  );
}
