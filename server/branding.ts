import { z } from 'zod';

export const BRANDING_DEFAULTS = {
  name: 'Memos',
  shortName: 'Memos',
  tagline: 'by MelvinOS',
  primaryHsl: '217 91% 60%',
  accentHsl: '262 83% 70%',
  supportEmail: 'support@c4saas.com',
  logoUrl: '',
  faviconUrl: '',
  productUrl: 'https://melvinos.com',
  poweredBy: 'MelvinOS',
  hidePoweredBy: false,
};

const brandingSchema = z.object({
  name: z.string().min(1).max(64),
  shortName: z.string().min(1).max(32),
  tagline: z.string().max(128),
  primaryHsl: z.string().regex(/^\d+ \d+% \d+%$/, 'HSL format: "H S% L%"'),
  accentHsl: z.string().regex(/^\d+ \d+% \d+%$/, 'HSL format: "H S% L%"'),
  supportEmail: z.string().email().or(z.literal('')),
  logoUrl: z.string().url().or(z.literal('')),
  faviconUrl: z.string().url().or(z.literal('')),
  productUrl: z.string().url().or(z.literal('')),
  poweredBy: z.string().max(64),
  hidePoweredBy: z.boolean(),
});

export type Branding = z.infer<typeof brandingSchema>;

function fromEnv(): Branding {
  const v = (key: string, fallback: string | boolean) => {
    const val = process.env[key];
    if (val === undefined || val === '') return fallback;
    if (typeof fallback === 'boolean') return val === '1' || val.toLowerCase() === 'true';
    return val;
  };

  const raw = {
    name:          v('BRAND_NAME',          BRANDING_DEFAULTS.name) as string,
    shortName:     v('BRAND_SHORT',         BRANDING_DEFAULTS.shortName) as string,
    tagline:       v('BRAND_TAGLINE',       BRANDING_DEFAULTS.tagline) as string,
    primaryHsl:    v('BRAND_PRIMARY_HSL',   BRANDING_DEFAULTS.primaryHsl) as string,
    accentHsl:     v('BRAND_ACCENT_HSL',    BRANDING_DEFAULTS.accentHsl) as string,
    supportEmail:  v('BRAND_SUPPORT_EMAIL', BRANDING_DEFAULTS.supportEmail) as string,
    logoUrl:       v('BRAND_LOGO_URL',      BRANDING_DEFAULTS.logoUrl) as string,
    faviconUrl:    v('BRAND_FAVICON_URL',   BRANDING_DEFAULTS.faviconUrl) as string,
    productUrl:    v('BRAND_PRODUCT_URL',   BRANDING_DEFAULTS.productUrl) as string,
    poweredBy:     v('BRAND_POWERED_BY',    BRANDING_DEFAULTS.poweredBy) as string,
    hidePoweredBy: v('BRAND_HIDE_POWERED_BY', BRANDING_DEFAULTS.hidePoweredBy) as boolean,
  };

  return brandingSchema.parse(raw);
}

let cached: Branding | null = null;
export function getBranding(): Branding {
  if (!cached) cached = fromEnv();
  return cached;
}
