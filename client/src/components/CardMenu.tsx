import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Copy, FileDown, Share2, Link as LinkIcon, Printer } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from './Toast';
import type { Meeting } from '../lib/api';
import { formatDate } from '../lib/utils';
import { markdownToText } from './MarkdownLite';

function downloadBlob(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeFilename(s: string): string {
  return s.replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '-').slice(0, 64) || 'memo';
}

function buildMarkdown(m: Meeting): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`);
  lines.push('');
  lines.push(`**Date:** ${formatDate(m.startAt)}`);
  if (m.host) lines.push(`**Host:** ${m.host}`);
  if (m.attendees?.length) lines.push(`**Attendees:** ${m.attendees.map(a => a.name ?? a.email).join(', ')}`);
  lines.push('');
  if (m.summary) {
    lines.push(m.summary);
    lines.push('');
  }
  if (m.actionItems?.length) {
    lines.push('## Action Items');
    for (const a of m.actionItems) {
      const owner = a.owner ? `**${a.owner}:** ` : '';
      const deadline = a.deadline ? ` _(${a.deadline})_` : '';
      lines.push(`- [ ] ${owner}${a.task}${deadline}`);
    }
  }
  return lines.join('\n');
}

export function CardMenu({ meeting, onClick }: { meeting: Meeting; onClick?: (e: React.MouseEvent) => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const swallow = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
    setOpen(false);
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown(meeting));
      toast.success('Copied markdown summary');
    } catch {
      toast.error('Could not copy');
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(markdownToText(buildMarkdown(meeting)));
      toast.success('Copied plain-text summary');
    } catch {
      toast.error('Could not copy');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/meetings/${meeting.id}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const downloadMd = () => {
    downloadBlob(`${safeFilename(meeting.title)}.md`, buildMarkdown(meeting), 'text/markdown');
  };

  const downloadTxt = () => {
    downloadBlob(`${safeFilename(meeting.title)}.txt`, markdownToText(buildMarkdown(meeting)), 'text/plain');
  };

  const printPdf = () => {
    const url = `/meetings/${meeting.id}?print=1`;
    // If already on the detail page, just print; otherwise open it.
    if (window.location.pathname === `/meetings/${meeting.id}`) {
      window.print();
    } else {
      const w = window.open(url, '_blank');
      if (w) {
        w.addEventListener('load', () => setTimeout(() => w.print(), 500));
      }
    }
  };

  const systemShare = async () => {
    const summary = meeting.summary ?? '';
    const url = `${window.location.origin}/meetings/${meeting.id}`;
    const payload = `${meeting.title}\n${formatDate(meeting.startAt)}\n\n${summary}\n\n— ${url}`;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: meeting.title, text: payload, url });
      } else {
        await navigator.clipboard.writeText(payload);
        toast.success('Summary copied');
      }
    } catch {/* user cancelled */}
  };

  return (
    <div ref={rootRef} className="relative" onClick={onClick}>
      <button
        type="button"
        onClick={swallow(() => setOpen(v => !v))}
        aria-label="More options"
        aria-expanded={open}
        className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors',
          'hover:bg-accent/40',
          open && 'bg-accent/40 text-foreground',
        )}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[200px] os-panel py-1 shadow-lg animate-in fade-in-50 zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon={Share2} label="Share…" onClick={swallow(systemShare)} />
          <MenuDivider />
          <MenuItem icon={Copy} label="Copy summary (markdown)" onClick={swallow(copyMarkdown)} />
          <MenuItem icon={Copy} label="Copy summary (text)" onClick={swallow(copyText)} />
          <MenuItem icon={LinkIcon} label="Copy link" onClick={swallow(copyLink)} />
          <MenuDivider />
          <MenuItem icon={FileDown} label="Download as .md" onClick={swallow(downloadMd)} />
          <MenuItem icon={FileDown} label="Download as .txt" onClick={swallow(downloadTxt)} />
          <MenuItem icon={Printer} label="Print / Save as PDF" onClick={swallow(printPdf)} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left text-foreground/90 hover:bg-accent/60 transition-colors"
    >
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border/60" />;
}
