/**
 * Companion products ("Apps") — the sibling MelvinOS ecosystem.
 * Shows other products the user can enable, how they pair with Memos, and
 * one-click paths to launch or connect.
 */

import { Link } from 'wouter';
import {
  ArrowUpRight, CheckCircle2, Sparkles, Bot as BotIcon,
  Zap, Shield, ExternalLink,
} from 'lucide-react';
import { Button } from '../components/Button';
import { useBranding } from '../hooks/useBranding';
import { cn } from '../lib/utils';

interface Companion {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  url: string;
  status: 'live' | 'beta' | 'soon';
  icon: 'melvinos' | 'memos' | 'clause';
  pairing: string[];
  cta: { label: string; href: string };
}

const COMPANIONS: Companion[] = [
  {
    id: 'melvinos',
    name: 'MelvinOS',
    tagline: 'The AI operating system for your day',
    description:
      'The core product. A personal AI agent that orchestrates every other MelvinOS product — sends the Memos bot to your meetings, pulls summaries into your daily briefing, and takes action across your tools.',
    category: 'Core platform',
    url: 'https://melvin.c4saas.com',
    status: 'live',
    icon: 'melvinos',
    pairing: [
      'Sends the Memos bot to any Meet / Zoom / Teams URL',
      'Pulls recent meeting summaries into the MelvinOS chat context',
      'Receives Memos webhooks when meetings finish processing',
      'Extracts action items into your daily brief',
    ],
    cta: { label: 'Open MelvinOS', href: 'https://melvin.c4saas.com' },
  },
  {
    id: 'clause',
    name: 'Clause',
    tagline: 'Draft, review, and negotiate contracts with AI',
    description:
      'A MelvinOS companion for contract workflows — drafting, redlining, and tracking obligations. Will pair with Memos to auto-capture contract negotiations and surface redline decisions.',
    category: 'Coming soon',
    url: 'https://clause.melvinos.com',
    status: 'soon',
    icon: 'clause',
    pairing: [
      'Detects contract discussions in Memos transcripts',
      'Lifts obligations into a tracked contract record',
    ],
    cta: { label: 'Join the waitlist', href: 'mailto:hello@melvinos.com?subject=Clause%20waitlist' },
  },
];

function CompanionIcon({ id }: { id: Companion['icon'] }) {
  // All use the same tinted-tile pattern as the Memos brand mark.
  const map = {
    melvinos: { from: '#60a5fa', to: '#a78bfa', label: 'M' },
    memos:    { from: '#3b82f6', to: '#8b5cf6', label: 'm' },
    clause:   { from: '#f472b6', to: '#db2777', label: 'C' },
  }[id];
  return (
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-display font-semibold text-white text-lg"
      style={{
        background: `linear-gradient(135deg, ${map.from}, ${map.to})`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
      }}
    >
      {map.label}
    </div>
  );
}

function StatusBadge({ status }: { status: Companion['status'] }) {
  const cls = {
    live: 'os-badge-green',
    beta: 'os-badge-blue',
    soon: 'os-badge-amber',
  }[status];
  const label = { live: 'Live', beta: 'Beta', soon: 'Coming soon' }[status];
  return <span className={cn('os-badge', cls)}>{label}</span>;
}

function Card({ c }: { c: Companion }) {
  return (
    <div className="os-panel p-5 sm:p-6 animate-in fade-in-50 duration-200">
      <div className="flex items-start gap-4 mb-4">
        <CompanionIcon id={c.icon} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-lg tracking-tight">{c.name}</h3>
            <StatusBadge status={c.status} />
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">{c.tagline}</div>
        </div>
      </div>

      <p className="text-sm text-foreground/80 leading-relaxed mb-4">{c.description}</p>

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
          How it pairs with Memos
        </div>
        <ul className="space-y-1.5">
          {c.pairing.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/85 leading-snug">
              <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(142_71%_45%)] shrink-0 mt-0.5" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {c.status !== 'soon' ? (
          <a href={c.cta.href} target="_blank" rel="noreferrer">
            <Button variant="primary" size="md">
              <ArrowUpRight className="w-4 h-4" />
              {c.cta.label}
            </Button>
          </a>
        ) : (
          <a href={c.cta.href}>
            <Button variant="secondary" size="md">
              <ArrowUpRight className="w-4 h-4" />
              {c.cta.label}
            </Button>
          </a>
        )}
        {c.id === 'melvinos' && (
          <Link href="/settings?section=developer">
            <Button variant="ghost" size="md">
              <Zap className="w-4 h-4" />
              Connect to Memos
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function CompanionsPage() {
  const brand = useBranding();
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-7 max-w-[960px] mx-auto pb-32 md:pb-8">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Apps
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-[600px] leading-relaxed">
          Memos is part of the <strong>{brand.poweredBy ?? 'MelvinOS'}</strong> family — each
          product works on its own and with the others. Connect them here.
        </p>
      </header>

      {/* This product banner */}
      <section className="os-panel p-5 sm:p-6 mb-6 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-4">
          <CompanionIcon id="memos" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-semibold text-lg tracking-tight">Memos</h3>
              <span className="os-badge os-badge-blue">This product</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              AI notetaker for every meeting. Records, transcribes, summarizes, and extracts action items.
            </p>
          </div>
        </div>
      </section>

      {/* Companions grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {COMPANIONS.map(c => <Card key={c.id} c={c} />)}
      </div>

      {/* Developer footer */}
      <div className="os-panel p-5 sm:p-6 mt-6">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-semibold text-base mb-1">Build your own integration</div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Memos exposes a REST API at <code className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-input/60 border border-border">/api/v1/*</code> with
              Bearer-token auth, plus signed outbound webhooks for meeting events.
              Use these to connect Memos to Zapier, n8n, your CRM, or any sibling product.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings?section=developer">
                <Button variant="primary" size="sm">
                  <Zap className="w-3.5 h-3.5" /> API & webhooks
                </Button>
              </Link>
              <Link href="/docs">
                <Button variant="ghost" size="sm">
                  <ExternalLink className="w-3.5 h-3.5" /> Read docs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
