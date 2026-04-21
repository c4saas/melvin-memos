import { useEffect } from 'react';

export interface Branding {
  name: string;
  shortName: string;
  tagline: string;
  primaryHsl: string;
  accentHsl: string;
  supportEmail: string;
  logoUrl: string;
  faviconUrl: string;
  productUrl: string;
  poweredBy: string;
  hidePoweredBy: boolean;
}

declare global {
  interface Window { __BRANDING__?: Branding }
}

const FALLBACK: Branding = {
  name: 'Memos',
  shortName: 'Memos',
  tagline: 'by MelvinOS',
  primaryHsl: '217 91% 60%',
  accentHsl: '262 83% 70%',
  supportEmail: '',
  logoUrl: '',
  faviconUrl: '',
  productUrl: '',
  poweredBy: 'MelvinOS',
  hidePoweredBy: false,
};

export function useBranding(): Branding {
  const b = window.__BRANDING__ ?? FALLBACK;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', b.primaryHsl);
    root.style.setProperty('--ring', b.primaryHsl);
    root.style.setProperty('--sidebar-primary', b.primaryHsl);

    if (b.faviconUrl) {
      const link: HTMLLinkElement = document.querySelector('link[rel="icon"]') ?? document.createElement('link');
      link.rel = 'icon';
      link.href = b.faviconUrl;
      if (!link.parentElement) document.head.appendChild(link);
    }
  }, [b.primaryHsl, b.faviconUrl]);

  return b;
}
